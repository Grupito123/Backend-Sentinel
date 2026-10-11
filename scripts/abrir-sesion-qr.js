'use strict';

// Abre (o consulta) una SESION QR de curso en Firestore.
//
// La sesión es el permiso de escritura que las reglas exigen al alumno: sin
// ella, el CREATE de `asistencias` por QR se rechaza. Las reglas validan que
//   · la sesión exista y esté `activo == true`
//   · sea del MISMO curso que el alumno y de la MISMA fechaKey
//   · el reloj del servidor caiga dentro de [horaInicio, horaFin]
// Por eso hay que abrirla ANTES de que el curso empiece a escanear (la abre
// administración, el preceptor o el docente del curso; acá lo hacemos con la
// service account).
//
// Por defecto es DRY-RUN: solo imprime el plan. Con --apply escribe.
//
// Uso:
//   node abrir-sesion-qr.js --credential <ruta al JSON> --curso 3°1 [--apply]
//       [--desde HH:MM] [--hasta HH:MM | --minutos 120] [--codigo SENTINEL]
//       [--por usr_admin]
//   node abrir-sesion-qr.js --credential <ruta al JSON> --listar
//   node abrir-sesion-qr.js --credential <ruta al JSON> --cerrar <sesionId> [--apply]
//
// Ejemplos:
//   # sesión de 3°1 desde ahora hasta fin de día (la común para probar)
//   node abrir-sesion-qr.js --credential ~/secrets/centinela-sa.json --curso 3°1 --apply
//   # ventana acotada: 07:20 a 09:00
//   node abrir-sesion-qr.js --credential ~/secrets/centinela-sa.json \
//     --curso 3°1 --desde 07:20 --hasta 09:00 --apply

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const credPath = valor('--credential') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const APPLY = has('--apply');
const LISTAR = has('--listar');
const CERRAR = valor('--cerrar');

if (!credPath) {
  console.error('Falta la credencial: node abrir-sesion-qr.js --credential <ruta al JSON>');
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const p2 = (n) => String(n).padStart(2, '0');
const claveDe = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** '07:20' → Date de HOY a esa hora (hora local). */
const horaDeHoy = (hhmm, defecto) => {
  if (!hhmm) return defecto;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    console.error(`Hora inválida: ${hhmm} (esperado HH:MM)`);
    process.exit(1);
  }
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

/** Código de 8 caracteres: el allowlist de reglas exige size() == 8. */
const codigo8 = (sugerido) => {
  if (sugerido) {
    if (sugerido.length !== 8) {
      console.error(`--codigo debe tener EXACTAMENTE 8 caracteres (tiene ${sugerido.length})`);
      process.exit(1);
    }
    return sugerido.toUpperCase();
  }
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join('');
};

const ventana = () => {
  const ahora = new Date();
  const desde = horaDeHoy(valor('--desde'), ahora);
  const hasta = valor('--hasta')
    ? horaDeHoy(valor('--hasta'))
    : valor('--minutos')
      ? new Date(desde.getTime() + Number(valor('--minutos')) * 60000)
      : (() => {
          // por defecto: hasta el final del día
          const fin = new Date(desde);
          fin.setHours(23, 59, 59, 0);
          return fin;
        })();

  if (hasta <= desde) {
    console.error('--hasta debe ser posterior a --desde');
    process.exit(1);
  }
  return { desde, hasta };
};

const cursosSolicitados = () => {
  const crudo = valor('--curso');
  if (!crudo) return [];
  return crudo.split(',').map((c) => c.trim()).filter(Boolean);
};

(async () => {
  // ---- listar: sesiones de hoy ----
  if (LISTAR) {
    const hoy = claveDe(new Date());
    const snap = await db.collection('sesionesQR').where('fechaKey', '==', hoy).get();
    if (snap.empty) {
      console.log(`No hay sesiones QR para ${hoy}.`);
      return;
    }
    const ahora = Date.now();
    console.log(`Sesiones QR de ${hoy}:`);
    snap.forEach((d) => {
      const x = d.data();
      const ini = x.horaInicio?.toDate?.();
      const fin = x.horaFin?.toDate?.();
      const vigente = x.activo && ini && fin && ini.getTime() <= ahora && ahora <= fin.getTime();
      console.log(
        `  ${d.id}  curso ${x.cursoId}  ${ini ? ini.toTimeString().slice(0, 5) : '?'}–${
          fin ? fin.toTimeString().slice(0, 5) : '?'
        }  activo=${!!x.activo}  código=${x.codigo}  ${vigente ? '● VIGENTE' : '○ fuera de ventana'}`
      );
    });
    return;
  }

  // ---- cerrar una sesión ----
  if (CERRAR) {
    const ref = db.collection('sesionesQR').doc(CERRAR);
    const snap = await ref.get();
    if (!snap.exists) {
      console.error(`No existe la sesión ${CERRAR}`);
      process.exit(1);
    }
    if (!APPLY) {
      console.log(`DRY-RUN: se pondría activo=false en sesionesQR/${CERRAR}`);
      return;
    }
    await ref.update({ activo: false, actualizadoEn: FieldValue.serverTimestamp() });
    console.log(`Sesión ${CERRAR} cerrada (activo=false).`);
    return;
  }

  // ---- abrir ----
  const cursos = cursosSolicitados();
  if (!cursos.length) {
    console.error('Falta --curso (ej: --curso 3°1 o --curso 3°1,4°2)');
    process.exit(1);
  }

  const { desde, hasta } = ventana();
  const creadoPor = valor('--por') || 'usr_admin';
  const clave = claveDe(desde);

  console.log(
    `${APPLY ? 'APLICANDO' : 'DRY-RUN (sin escribir)'} — ${cursos.length} sesión(es) · ventana ` +
      `${desde.toTimeString().slice(0, 5)}–${hasta.toTimeString().slice(0, 5)} · ${clave}\n`
  );

  for (const cursoId of cursos) {
    const curso = await db.collection('cursos').doc(cursoId).get();
    if (!curso.exists) {
      console.log(`✗ ${cursoId}: NO existe el curso en la BD (revisá el id, ej: "4°2")`);
      continue;
    }

    // Una sola sesión activa por curso y fecha: si ya hay, no duplicamos.
    const previa = await db
      .collection('sesionesQR')
      .where('cursoId', '==', cursoId)
      .where('fechaKey', '==', clave)
      .where('activo', '==', true)
      .limit(1)
      .get();

    if (!previa.empty) {
      const s = previa.docs[0];
      const x = s.data();
      console.log(
        `• ${cursoId}: ya tiene sesión activa ${s.id} ` +
          `(${x.horaInicio?.toTime?.() ? new Date(x.horaInicio.seconds * 1000).toTimeString().slice(0, 5) : '?'}` +
          `–${x.horaFin ? new Date(x.horaFin.seconds * 1000).toTimeString().slice(0, 5) : '?'}) — se omite`
      );
      continue;
    }

    const codigo = codigo8(valor('--codigo'));
    const id = `ses_${cursoId.replace(/[^0-9a-zA-Z]/g, '')}_${clave.replace(/-/g, '')}_${codigo
      .toLowerCase()
      .slice(0, 4)}`;

    const datos = {
      cursoId,
      materiaId: null,
      creadoPor,
      fecha: Timestamp.fromDate(desde),
      fechaKey: clave,
      horaInicio: desde,
      horaFin: hasta,
      codigo,
      activo: true,
      ubicacion: null,
      creadoEn: FieldValue.serverTimestamp(),
    };

    if (!APPLY) {
      console.log(`  ✎ ${cursoId} → sesionesQR/${id}`);
      console.log(`      código ${codigo} · ventana ${desde.toTimeString().slice(0, 5)}–${hasta.toTimeString().slice(0, 5)}`);
      continue;
    }

    await db.collection('sesionesQR').doc(id).set(datos);
    console.log(`✓ ${cursoId} → sesionesQR/${id}  código ${codigo}`);
  }

  if (!APPLY) {
    console.log('\nCon --apply se escriben las sesiones.');
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
