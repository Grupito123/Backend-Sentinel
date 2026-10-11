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
// Con --crear-materias crea las materias que el docente declara y todavia no
// existen en la base (el registro de la app ofrece las materias REALES de la
// malla, asi que puede declarar "Bases de Datos" en 4°2 y la base aun no la
// tenga): se crean con el mismo convenio mat_<curso>_<codigo>.
//
// Uso: node confirmar-asignaciones.js --credential <ruta al JSON> [--apply] [--overwrite] [--crear-materias]

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const credIdx = args.indexOf('--credential');
const credPath = credIdx >= 0 ? args[credIdx + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
const APPLY = has('--apply');
const OVERWRITE = has('--overwrite');
const CREAR_MATERIAS = has('--crear-materias');

if (!credPath) {
  console.error('Falta la credencial: node confirmar-asignaciones.js --credential <ruta al JSON>');
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const idMateria = (cursoId, codigo) => `mat_${cursoId}_${codigo}`.toLowerCase();

// Nombre de cada materia de la malla segun su codigo de declaracion (espejo
// de CODIGOS_POR_MATERIA en src/utils/colegio.js de la app). Se usa solo con
// --crear-materias, para darle nombre a la materia que se esta creando.
const NOMBRE_POR_CODIGO = {
  PROG: 'Programación',
  MATE: 'Matemática',
  LENG: 'Lengua y Literatura',
  FIS: 'Física',
  QUIM: 'Química',
  HIST: 'Historia',
  GEOG: 'Geografía',
  CNAT: 'Ciencias Naturales',
  INGLES: 'Inglés',
  EDFIS: 'Educación Física',
  ARTES: 'Artes',
  BDATOS: 'Bases de Datos',
  SISOPS: 'Sistemas Operativos',
  REDESC: 'Redes de Computadoras',
  REDSEG: 'Redes y Seguridad',
  REDES: 'Redes',
  INGSOF: 'Ingeniería de Software',
  ADMIBD: 'Administración de BD',
  EMPREN: 'Emprendimiento Productivo',
  MODSIS: 'Modelos y Sistemas',
  MECGEN: 'Mecánica General',
  DIBTEC: 'Dibujo Técnico',
  ELECTR: 'Electricidad y Electrónica',
  MAQEL: 'Máquinas Eléctricas',
  TERMOD: 'Termodinámica',
  ELECAPP: 'Electrónica Aplicada',
  PROCMAN: 'Procesos de Manufactura',
  IMCR: 'IMCR',
  PROYFIN: 'Proyecto Final',
  PP: 'PP',
  PDISC: 'Pdisc',
  EVALPROY: 'Evaluación de Proyecto',
};

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
            const nombre =
              NOMBRE_POR_CODIGO[String(codigo).toUpperCase()] || String(codigo);
            if (!CREAR_MATERIAS) {
              console.log(
                `    [!!] materia inexistente: ${idMateria(cursoId, codigo)} ("${nombre}") — repetir con --crear-materias para crearla (se omite)`
              );
              continue;
            }
            writes.push({
              descripcion: `materias/${idMateria(cursoId, codigo)} ← se crea "${nombre}" con docente ${uid}`,
              ref: materiaRef,
              data: {
                nombre,
                codigo: `${String(codigo).toUpperCase()}-${cursoId}`,
                cursoId,
                docenteId: uid,
                activo: true,
                orden: 99,
                creadoEn: FieldValue.serverTimestamp(),
                actualizadoEn: FieldValue.serverTimestamp(),
              },
            });
            writes.push({
              descripcion: `cursos/${cursoId}.materiaIds += ${idMateria(cursoId, codigo)}`,
              ref: cursoRef,
              data: { materiaIds: FieldValue.arrayUnion(idMateria(cursoId, codigo)) },
            });
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
