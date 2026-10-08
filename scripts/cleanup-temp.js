'use strict';

// Limpieza única de los docs temporales que dejó el E2E de reglas
// (las cuentas Auth ya se borraron en su momento). Dry-run por defecto.
//
// Uso: node cleanup-temp.js --credential <ruta al JSON> [--apply] [--docs a/b,c/d]
// Sin --docs borra la lista de abajo (los del E2E de reglas); con --docs
// borra la lista que se pase (sirve para limpiar los E2E que se corran).

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const credIdx = args.indexOf('--credential');
const credPath = credIdx >= 0 ? args[credIdx + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
const docsIdx = args.indexOf('--docs');
const emailIdx = args.indexOf('--email');
const APPLY = has('--apply');

if (!credPath) {
  console.error('Falta la credencial: node cleanup-temp.js --credential <ruta al JSON>');
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const PREDETERMINADOS = [
  'alumnos/sbyjepL0xjaXTJsMsGLhlChtjdt1',
  'usuarios/914IkqkiZsUOv6sMLwuqLGJmGJJ3',
  'usuarios/jU6zoczZoXZILKZrxfXCTs6Oq2I3',
];

const PENDIENTES = docsIdx >= 0 && args[docsIdx + 1] ? args[docsIdx + 1].split(',') : PREDETERMINADOS;

(async () => {
  // Modo --email: borra la cuenta Auth (si existe) y sus docs en
  // alumnos/usuarios por email — para E2E interrumpidos.
  const EMAIL = emailIdx >= 0 ? args[emailIdx + 1] : null;
  if (EMAIL) {
    console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN (sin escribir)'} — email ${EMAIL}`);
    try {
      const user = await getAuth().getUserByEmail(EMAIL);
      console.log(`  · auth/${user.uid} → ${APPLY ? 'borrada' : 'se borraría'}`);
      if (APPLY) await getAuth().deleteUser(user.uid);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      console.log('  · auth: sin cuenta para ese email');
    }
    for (const col of ['alumnos', 'usuarios']) {
      const snap = await db.collection(col).where('email', '==', EMAIL).get();
      for (const d of snap.docs) {
        console.log(`  · ${col}/${d.id} → ${APPLY ? 'borrado' : 'se borraría'}`);
        if (APPLY) await d.ref.delete();
      }
    }
    if (!APPLY) console.log('Repetir con --apply para borrar.');
    return;
  }

  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN (sin escribir)'} — ${PENDIENTES.length} doc(s) temporal(es)`);
  for (const ruta of PENDIENTES) {
    const ref = db.doc(ruta);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  · ${ruta}: no existe (ya limpio)`);
      continue;
    }
    const d = snap.data();
    console.log(`  · ${ruta} → borrar (${d.email || d.nombre || ''}${d.rol ? `, ${d.rol}` : ''})`);
    if (APPLY) {
      await ref.delete();
      console.log('      [ok] borrado');
    }
  }
  if (!APPLY) console.log('Repetir con --apply para borrar.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
