'use strict';

// Crea (o verifica) las cuentas de Firebase Authentication para los usuarios
// que ya existen en Firestore. El seed solo escribe documentos: sin este paso
// no se puede iniciar sesión con esos correos.
//
// Uso:  node create-auth-users.js --credential <ruta al JSON de service account>
//       (también acepta GOOGLE_APPLICATION_CREDENTIALS)
//
// Password de prueba: 123456  (se puede cambiar con SIA_TEST_PASSWORD=... )

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PASSWORD = process.env.SIA_TEST_PASSWORD || '123456';

const argIdx = process.argv.indexOf('--credential');
const credPath = argIdx >= 0 ? process.argv[argIdx + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('Falta la credencial: node create-auth-users.js --credential <ruta al JSON>');
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

async function asegurar(uid, email, displayName) {
  try {
    const user = await auth.getUser(uid);
    if (user.email === email) {
      console.log(`  [ok] ya existe: ${email}`);
      return 'existe';
    }
    console.log(`  [!!] uid ${uid} existe con otro email (${user.email}) - se omite`);
    return 'omitido';
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.log(`  [!!] ${uid}: ${e.message}`);
      return 'error';
    }
  }

  try {
    await auth.createUser({ uid, email, password: PASSWORD, displayName, emailVerified: false });
    console.log(`  [++] creado: ${email}  (uid ${uid})`);
    return 'creado';
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      console.log(`  [!!] ${email} ya pertenece a otra cuenta (uid distinto) - se omite`);
      return 'omitido';
    }
    console.log(`  [!!] ${email}: ${e.message}`);
    return 'error';
  }
}

(async () => {
  const res = { creado: 0, existe: 0, omitido: 0, error: 0 };
  const cuenta = (k) => { res[k] += 1; return k; };

  console.log('> usuarios (staff) con id usr_*');
  const usuarios = await db.collection('usuarios').get();
  for (const d of usuarios.docs) {
    const u = d.data();
    if (!d.id.startsWith('usr_') || !u.email) continue;
    const nombre = [u.nombre, u.apellido].filter(Boolean).join(' ') || u.email;
    cuenta(await asegurar(d.id, u.email, nombre));
  }

  console.log('> alumnos con id alu_*');
  const alumnos = await db.collection('alumnos').get();
  for (const d of alumnos.docs) {
    const a = d.data();
    if (!d.id.startsWith('alu_') || !a.email) continue;
    const nombre = [a.nombre, a.apellido].filter(Boolean).join(' ') || a.email;
    cuenta(await asegurar(d.id, a.email, nombre));
  }

  console.log(`\nResumen: ${res.creado} creados · ${res.existe} ya existian · ${res.omitido} omitidos · ${res.error} errores`);
  console.log(`Password de prueba: ${PASSWORD}`);
  process.exit(res.error > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Fallo general:', e.message);
  process.exit(1);
});
