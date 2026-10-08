'use strict';

// Confirma las declaraciones que el staff deja al registrarse en la app:
//
//   docente (rol 'profesor'):
//     · materias/{mat_<cursoId>_<codigo>}.docenteId = uid   (poder de notas)
//     · cursos/{cursoId}.docenteIds += uid
//   preceptor:
//     · cursos/{cursoId}.preceptorIds += uid                (acceso a asistencia)
//
// y despues limpia `cursosDeclarados` / `materiasDeclaradas` del perfil
// (dejan de estar "pendientes").
//
// Por defecto es DRY-RUN: solo imprime el plan. Con --apply escribe.
// Con --overwrite permite pisar una materia que ya tiene otro docente
// (sin eso, las materias tomadas quedan marcadas como CONFLICTO y se saltean).
//
// Uso: node confirmar-asignaciones.js --credential <ruta al JSON> [--apply] [--overwrite]

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const credIdx = args.indexOf('--credential');
const credPath = credIdx >= 0 ? args[credIdx + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
const APPLY = has('--apply');
const OVERWRITE = has('--overwrite');

if (!credPath) {
  console.error('Falta la credencial: node confirmar-asignaciones.js --credential <ruta al JSON>');
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const idMateria = (cursoId, codigo) => `mat_${cursoId}_${codigo}`.toLowerCase();

(async () => {
  const snapshot = await db.collection('usuarios').get();
  const pendientes = snapshot.docs.filter((doc) => {
    const data = doc.data();
    return (Array.isArray(data.cursosDeclarados) && data.cursosDeclarados.length)
      || (Array.isArray(data.materiasDeclaradas) && data.materiasDeclaradas.length);
  });

  if (!pendientes.length) {
    console.log('No hay declaraciones pendientes.');
    return;
  }

  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN (sin escribir)'} — ${pendientes.length} cuenta(s) con declaraciones\n`);

  for (const doc of pendientes) {
    const uid = doc.id;
    const data = doc.data();
    const nombre = `${data.nombre || ''} ${data.apellido || ''}`.trim() || uid;
    const rol = data.rol || '?';
    console.log(`• ${nombre} (${rol}, ${uid})`);
    if (data.email) console.log(`    email: ${data.email}`);

    const updatesUsuario = {};
    const writes = []; // { descripcion, ref, data }

    if (rol === 'profesor') {
      const bloques = Array.isArray(data.materiasDeclaradas) ? data.materiasDeclaradas : [];
      for (const bloque of bloques) {
        const cursoId = bloque.cursoId;
        const cursoRef = db.doc(`cursos/${cursoId}`);
        writes.push({
          descripcion: `cursos/${cursoId}.docenteIds += ${uid}`,
          ref: cursoRef,
          data: { docenteIds: FieldValue.arrayUnion(uid) },
        });

        for (const codigo of bloque.materias || []) {
          const materiaRef = db.doc(`materias/${idMateria(cursoId, codigo)}`);
          const materiaSnap = await materiaRef.get();
          if (!materiaSnap.exists) {
            console.log(`    [!!] materia inexistente: ${idMateria(cursoId, codigo)} (se omite)`);
            continue;
          }
          const actual = materiaSnap.data().docenteId;
          if (actual && actual !== uid && !OVERWRITE) {
            console.log(`    [!!] CONFLICTO ${idMateria(cursoId, codigo)}: ya la dicta ${actual} (repetir con --overwrite para pisarla)`);
            continue;
          }
          writes.push({
            descripcion: `materias/${idMateria(cursoId, codigo)}.docenteId = ${uid}${actual && actual !== uid ? ` (pisaba a ${actual})` : ''}`,
            ref: materiaRef,
            data: { docenteId: uid, updatedAt: FieldValue.serverTimestamp() },
          });
        }
      }
      if (!(Array.isArray(data.cursosDeclarados) && data.cursosDeclarados.length)) {
        console.log('    [!!] sin cursosDeclarados (igual se confirman los cursos de materiasDeclaradas)');
      }
    } else if (rol === 'preceptor') {
      for (const cursoId of data.cursosDeclarados || []) {
        writes.push({
          descripcion: `cursos/${cursoId}.preceptorIds += ${uid}`,
          ref: db.doc(`cursos/${cursoId}`),
          data: { preceptorIds: FieldValue.arrayUnion(uid) },
        });
      }
    } else {
      console.log(`    [!!] rol '${rol}' no usa declaraciones — se limpian igual`);
    }

    for (const w of writes) console.log(`    → ${w.descripcion}`);
    updatesUsuario.cursosDeclarados = FieldValue.delete();
    updatesUsuario.materiasDeclaradas = FieldValue.delete();
    console.log('    → se limpian cursosDeclarados/materiasDeclaradas del perfil');

    if (APPLY) {
      // Escrituras de materias/cursos primero; el perfil (inbox) al final,
      // para que un fallo intermedio deje la declaracion pendiente.
      for (const w of writes) await w.ref.set(w.data, { merge: true });
      await doc.ref.update(updatesUsuario);
      console.log('    [ok] aplicado\n');
    } else {
      console.log('    (dry-run: nada escrito)\n');
    }
  }

  if (!APPLY) console.log('Repetir con --apply para escribir los cambios.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
