'use strict';

// Crea la estructura REAL de la tecnica en Firestore:
//
//   ciclo basico (1°-3°): 5 divisiones por año   → 1°1..1°5, 2°1..2°5, 3°1..3°5
//   ciclo superior: 4°→4 · 5°→3 · 6°→2 · 7°→2    → 4°1..4°4, 5°1..5°3, 6°1..6°2, 7°1..7°2
//   = 26 cursos, con id "4°2" (año + ° + división): EXACTAMENTE el formato que
//   usan horarios.js / malla.etiquetaCurso / el QR dinámico y el que arma la
//   app en el registro (`cursoId` del alumno, `cursosDeclarados` del staff).
//
// Por curso crea ademas sus 5 materias (mat_4°2_prog…) para que
// confirmar-asignaciones.js pueda confirmar declaraciones de cualquier curso.
//
// Por defecto es DRY-RUN: solo imprime el plan. Con --apply escribe.
// Con --migrar ademas migra los 6 cursos demo del seed y sus datos:
//   3A→3°1 · 3B→3°2 · 4A→4°1 · 4B→4°2 · 5A→5°1 · 5B→5°2
//   · campos cursoId/materiaId en TODAS las colecciones (alumnos,
//     inscripciones, horarios, asistencias, notas, …)
//   · preceptorIds de los cursos nuevos (los mismos del seed, traducidos)
//   · ids de documento que contengan una materia vieja (ej. asistencias
//     alu_xxx_mat_3a_prog) se recrean con el id nuevo
//   · al final borra los cursos y materias viejos
//   (las materias viejas se borran SIEMPRE con --migrar porque su id
//    `mat_3a_prog` ya no coincide con el curso nuevo `mat_3°1_prog`)
//
// Uso: node crear-cursos-tecnica.js --credential <ruta al JSON> [--apply] [--migrar]

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  PRECEPTORES_POR_CURSO,
  construirCursos: construirCursosSeed,
  construirMaterias: construirMateriasSeed,
} = require('./seedData');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const credIdx = args.indexOf('--credential');
const credPath = credIdx >= 0 ? args[credIdx + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
const APPLY = has('--apply');
const MIGRAR = has('--migrar');

if (!credPath) {
  console.error('Falta la credencial: node crear-cursos-tecnica.js --credential <ruta al JSON>');
  process.exit(1);
}

process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

// Cursos demo del seed (año + letra) → equivalente real (la 1era división era
// "A", la 2da era "B").
const MAPA_VIEJOS = {
  '3A': '3°1',
  '3B': '3°2',
  '4A': '4°1',
  '4B': '4°2',
  '5A': '5°1',
  '5B': '5°2',
};

const idMateria = (cursoId, codigo) => `mat_${cursoId}_${codigo}`.toLowerCase();

// Los 26 cursos y sus materias salen del MISMO seedData que usa seed.js
// (fuente única de la estructura); acá se completan preceptores, docentes y
// materias igual que hace seed.js (construirSeed).
const construirCursos = (materiasNuevas) =>
  construirCursosSeed().map((curso) => {
    const delCurso = materiasNuevas.filter((m) => m.cursoId === curso.id);
    return {
      ...curso,
      preceptorIds: PRECEPTORES_POR_CURSO[curso.id] || [],
      docenteIds: [...new Set(delCurso.map((m) => m.docenteId))],
      materiaIds: delCurso.map((m) => m.id),
    };
  });

(async () => {
  const materiasNuevas = construirMateriasSeed(construirCursosSeed());
  const cursosNuevos = construirCursos(materiasNuevas);
  const viejos = Object.keys(MAPA_VIEJOS);

  console.log(
    `${APPLY ? 'APLICANDO' : 'DRY-RUN (sin escribir)'} — ${cursosNuevos.length} cursos + ` +
      `${materiasNuevas.length} materias${MIGRAR ? ' · con migración de los cursos demo viejos' : ''}\n`
  );

  // ── 1) mapa de materias viejas → nuevas (id de doc antiguo → nuevo) ──
  const mapaMaterias = {}; // 'mat_3a_prog' → 'mat_3°1_prog'
  let materiasViejas = [];
  if (MIGRAR) {
    const snap = await db.collection('materias').where('cursoId', 'in', viejos).get();
    materiasViejas = snap.docs;
    snap.docs.forEach((doc) => {
      const cursoViejo = doc.data().cursoId;
      // 'mat_3a_prog' → sufijo 'prog' (el id va en minúsculas)
      const sufijo = doc.id.split('_').slice(2).join('_');
      mapaMaterias[doc.id] = idMateria(MAPA_VIEJOS[cursoViejo], sufijo);
    });
    console.log(`Materias viejas a migrar/borrar: ${materiasViejas.length}`);
  }

  // ── 2) alta de cursos y materias nuevas (idempotente: solo faltantes) ──
  const cursosFaltantes = [];
  for (const curso of cursosNuevos) {
    const snap = await db.doc(`cursos/${curso.id}`).get();
    if (!snap.exists) cursosFaltantes.push(curso);
  }
  const materiasFaltantes = [];
  for (const materia of materiasNuevas) {
    const snap = await db.doc(`materias/${materia.id}`).get();
    if (!snap.exists) materiasFaltantes.push(materia);
  }
  console.log(`Cursos a crear: ${cursosFaltantes.length} de ${cursosNuevos.length}`);
  console.log(`Materias a crear: ${materiasFaltantes.length} de ${materiasNuevas.length}`);
  cursosFaltantes.forEach((c) => console.log(`  → cursos/${c.id} (${c.nombre}${c.preceptorIds.length ? `, preceptor: ${c.preceptorIds.join(',')}` : ''})`));

  // ── 3) migración de referencias (solo con --migrar) ──
  let refsActualizadas = 0;
  let docsRecreados = 0;
  let declaraciones = 0;
  if (MIGRAR) {
    const colecciones = await db.listCollections();
    for (const col of colecciones) {
      const colId = col.id;
      if (colId === 'cursos' || colId === 'materias') continue; // se manejan aparte
      const snap = await db.collection(colId).where('cursoId', 'in', viejos).get();
      if (snap.empty) continue;
      let deEsta = 0;
      for (const doc of snap.docs) {
        const data = doc.data();
        const cambios = {};
        if (MAPA_VIEJOS[data.cursoId]) cambios.cursoId = MAPA_VIEJOS[data.cursoId];
        if (data.materiaId && mapaMaterias[data.materiaId]) {
          cambios.materiaId = mapaMaterias[data.materiaId];
        }

        // ¿El ID del doc contiene una materia vieja? (ej. asistencias
        // alu_xxx_2026-10-07_mat_3a_prog) → hay que recrearlo con el id nuevo.
        let refNueva = doc.ref;
        let borrarRef = null;
        let nuevoId = doc.id;
        for (const [vieja, nueva] of Object.entries(mapaMaterias)) {
          if (nuevoId.includes(vieja)) {
            nuevoId = nuevoId.split(vieja).join(nueva);
            borrarRef = doc.ref;
          }
        }
        if (nuevoId !== doc.id) refNueva = db.collection(colId).doc(nuevoId);

        console.log(
          `  · ${colId}/${doc.id}` +
            (Object.keys(cambios).length
              ? ` → ${Object.entries(cambios).map(([k, v]) => `${k}=${v}`).join(', ')}`
              : '') +
            (borrarRef ? ` (id recreado como ${nuevoId})` : '')
        );
        deEsta += 1;
        refsActualizadas += Object.keys(cambios).length ? 1 : 0;
        docsRecreados += borrarRef ? 1 : 0;

        if (APPLY) {
          if (Object.keys(cambios).length) await refNueva.set(cambios, { merge: true });
          if (borrarRef) {
            if (!Object.keys(cambios).length) await refNueva.set({}, { merge: true });
            await borrarRef.delete();
          }
        }
      }
      console.log(`${APPLY ? '  [ok]' : '  (dry-run)'} ${colId}: ${deEsta} doc(s) con cursoId viejo`);
    }

    // declaraciones pendientes del staff (array cursosDeclarados)
    const snapU = await db
      .collection('usuarios')
      .where('cursosDeclarados', 'array-contains-any', viejos)
      .get();
    for (const doc of snapU.docs) {
      const actual = doc.data().cursosDeclarados || [];
      const nuevo = actual.map((c) => MAPA_VIEJOS[c] || c);
      declaraciones += 1;
      console.log(`  · usuarios/${doc.id}: cursosDeclarados [${actual.join(', ')}] → [${nuevo.join(', ')}]`);
      if (APPLY) await doc.ref.update({ cursosDeclarados: nuevo });
    }
  }

  // ── 4) borrar lo viejo (solo con --migrar; al final, para no dejar refs colgando) ──
  if (MIGRAR) {
    console.log(`\nBorrados (solo con --migrar${APPLY ? '' : ', dry-run'}): ${materiasViejas.length} materias + ${viejos.length} cursos demo`);
    viejos.forEach((v) => console.log(`  → borrar cursos/${v} y materias mat_${v.toLowerCase()}_*`));

    if (APPLY) {
      for (const doc of materiasViejas) await doc.ref.delete();
      for (const v of viejos) await db.doc(`cursos/${v}`).delete();
      console.log('[ok] viejos eliminados');
    }
  }

  // ── 5) escrituras de alta ──
  if (APPLY) {
    for (const curso of cursosFaltantes) await db.doc(`cursos/${curso.id}`).set(curso);
    for (const materia of materiasFaltantes) await db.doc(`materias/${materia.id}`).set(materia);
    console.log(`\n[ok] ${cursosFaltantes.length} cursos y ${materiasFaltantes.length} materias creados`);
  } else {
    console.log(
      `\n(dry-run: nada escrito — repetir con --apply${MIGRAR ? ' --migrar' : ''} para escribir)` +
        (!MIGRAR ? '\nNota: los 6 cursos demo (3A/3B/4A/4B/5A/5B) quedan intactos; usá --migrar para reemplazarlos.' : '')
    );
  }

  console.log(
    `Resumen${APPLY ? '' : ' (plan)'}: refs cursoId/materiaId=${refsActualizadas}, ids recreados=${docsRecreados}, declaraciones=${declaraciones}`
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
