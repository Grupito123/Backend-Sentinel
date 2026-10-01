'use strict';

const path = require('path');
const fs = require('fs');

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'firebase.config.json'), 'utf8')
);

const PROJECT_ID = firebaseConfig.projectId;
const CLOUD_FIRESTORE_HOST = 'firestore.googleapis.com';
const REPO_ROOT = path.resolve(__dirname, '..');

class TargetError extends Error {}

const abort = (message) => {
  throw new TargetError(message);
};

const estaDentroDelRepo = (ruta) => {
  const relativa = path.relative(REPO_ROOT, path.resolve(ruta));
  return relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa));
};

const sugerirRutaFuera = () => {
  const home = process.env.USERPROFILE || process.env.HOME || '<tu-carpeta-de-usuario>';
  return path.join(home, '.secrets', `${PROJECT_ID}-sa.json`);
};

const leerCredencial = (ruta) => {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (error) {
    abort(`No se pudo leer la credencial como JSON (${ruta}):\n  ${error.message}`);
  }
};

const detectarEmulador = () => {
  const señales = [];

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    señales.push(`FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
  if (process.env.FIREBASE_EMULATOR_HUB) {
    señales.push(`FIREBASE_EMULATOR_HUB=${process.env.FIREBASE_EMULATOR_HUB}`);
  }
  if (process.env.FUNCTIONS_EMULATOR) {
    señales.push(`FUNCTIONS_EMULATOR=${process.env.FUNCTIONS_EMULATOR}`);
  }
  if (process.env.GCLOUD_EMULATOR_HOST) {
    señales.push(`GCLOUD_EMULATOR_HOST=${process.env.GCLOUD_EMULATOR_HOST}`);
  }

  return señales;
};

const verificarNoEmulador = () => {
  const señales = detectarEmulador();

  if (señales.length) {
    abort(
      'Se detectaron variables de emulador de Firebase. Este script solo escribe en Cloud Firestore.\n' +
        `  ${señales.join('\n  ')}\n` +
        'Quitá esas variables y volvé a ejecutar.'
    );
  }

  return true;
};

const verificarProyecto = (projectId) => {
  if (!projectId) {
    abort('No se pudo resolver el projectId desde las credenciales.');
  }

  if (projectId !== PROJECT_ID) {
    abort(
      `El projectId de las credenciales (${projectId}) no coincide con src/firebase.config.json (${PROJECT_ID}).\n` +
        'Abortando para no escribir en el proyecto equivocado.'
    );
  }

  return projectId;
};

const verificarCredencial = (rutaExplicita) => {
  if (rutaExplicita && !fs.existsSync(rutaExplicita)) {
    abort(`--credential apunta a un archivo inexistente:\n  ${rutaExplicita}`);
  }

  const rutaEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!rutaExplicita && rutaEnv && !fs.existsSync(rutaEnv)) {
    abort(`GOOGLE_APPLICATION_CREDENTIALS apunta a un archivo inexistente:\n  ${rutaEnv}`);
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  const rutaAdc = home
    ? path.join(home, '.config', 'gcloud', 'application_default_credentials.json')
    : null;

  const elegida = rutaExplicita
    ? { metodo: 'Service account (--credential)', ruta: rutaExplicita }
    : rutaEnv
      ? { metodo: 'Service account (GOOGLE_APPLICATION_CREDENTIALS)', ruta: rutaEnv }
      : rutaAdc && fs.existsSync(rutaAdc)
        ? { metodo: 'Application Default Credentials', ruta: rutaAdc }
        : null;

  if (!elegida) {
    abort(
      'No hay credenciales de Google disponibles.\n' +
        'Opcion A (service account, no requiere Google Cloud CLI):\n' +
        '  1. Firebase Console -> Configuracion del proyecto -> Cuentas de servicio\n' +
        '  2. Generar nueva clave privada (JSON) y guardarla FUERA del repositorio\n' +
        `     Sugerido: ${sugerirRutaFuera()}\n` +
        '  3. Ejecutar:\n' +
        '       npm run seed -- --credential "<ruta al JSON>"\n' +
        '     o definir la variable de entorno GOOGLE_APPLICATION_CREDENTIALS.\n' +
        'Opcion B (Application Default Credentials):\n' +
        '  gcloud auth application-default login'
    );
  }

  const absoluta = path.resolve(elegida.ruta);

  if (estaDentroDelRepo(absoluta)) {
    abort(
      'La credencial esta dentro del repositorio y podria subirse a Git:\n' +
        `  ${absoluta}\n` +
        `Movela fuera de ${REPO_ROOT} y volve a intentar.\n` +
        `Sugerido: ${sugerirRutaFuera()}`
    );
  }

  const datos = leerCredencial(absoluta);
  const tipo = datos.type || 'desconocido';
  let clientEmail = null;
  let projectIdCredencial = null;

  if (tipo === 'service_account') {
    clientEmail = datos.client_email || null;
    projectIdCredencial = datos.project_id || null;

    if (!projectIdCredencial) {
      abort('La service account no declara project_id; no se puede verificar el destino.');
    }

    if (projectIdCredencial !== PROJECT_ID) {
      abort(
        `La service account pertenece al proyecto ${projectIdCredencial}, no a ${PROJECT_ID}.\n` +
          'Abortando para no escribir en el proyecto equivocado.'
      );
    }
  }

  return { metodo: elegida.metodo, ruta: absoluta, tipo, clientEmail, projectIdCredencial };
};

const verificarEscrituraReal = async (db, app) => {
  const probePath = '_seed/verificacion';
  const marca = `verificado-${Date.now()}`;

  await db.doc(probePath).set({ marca, proyecto: app.options.projectId, en: new Date() });
  const snapshot = await db.doc(probePath).get();

  if (!snapshot.exists) {
    abort('La escritura de prueba no se pudo leer de vuelta.');
  }

  const leido = snapshot.data();
  await db.doc(probePath).delete();

  return {
    documento: probePath,
    proyecto: leido.proyecto,
    endpoint: `https://${CLOUD_FIRESTORE_HOST}`,
    emulatorDetected: detectarEmulador().length > 0,
  };
};

module.exports = {
  PROJECT_ID,
  CLOUD_FIRESTORE_HOST,
  REPO_ROOT,
  TargetError,
  verificarNoEmulador,
  verificarProyecto,
  verificarCredencial,
  verificarEscrituraReal,
  firebaseConfig,
};
