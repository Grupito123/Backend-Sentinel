'use strict';

const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');

const {
  PROJECT_ID,
  TargetError,
  verificarNoEmulador,
  verificarProyecto,
  verificarCredencial,
  verificarEscrituraReal,
} = require('./target');

const {
  construirUsuarios,
  construirCursos,
  construirMaterias,
  construirAlumnos,
  construirInscripciones,
  construirHorarios,
  PRECEPTORES_POR_CURSO,
  ANIO_LECTIVO,
} = require('./seedData');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;

const leerArgumento = (nombre) => {
  const prefijo = `${nombre}=`;
  const conIgual = process.argv.find((arg) => arg.startsWith(prefijo));
  if (conIgual) {
    return conIgual.slice(prefijo.length);
  }
  const indice = process.argv.indexOf(nombre);
  return indice !== -1 ? process.argv[indice + 1] : null;
};

const RUTA_CREDENCIAL = leerArgumento('--credential');

const COL = {
  USUARIOS: 'usuarios',
  ALUMNOS: 'alumnos',
  CURSOS: 'cursos',
  MATERIAS: 'materias',
  INSCRIPCIONES: 'inscripciones',
  HORARIOS: 'horarios',
  ASISTENCIAS: 'asistencias',
  SESIONES_QR: 'sesionesQR',
  JUSTIFICACIONES: 'justificaciones',
  NOTAS: 'notas',
  EXAMENES: 'examenes',
  TRABAJOS: 'trabajosPracticos',
  ENTREGAS: 'entregasTP',
  NOVEDADES: 'novedades',
  NOTIFICACIONES: 'notificaciones',
  AUDITORIA: 'auditoria',
};

const log = (...args) => console.log(...args);
const paso = (mensaje) => log(`\n> ${mensaje}`);
const ok = (mensaje) => log(`  [ok] ${mensaje}`);
const info = (mensaje) => log(`  [..] ${mensaje}`);
const fallo = (mensaje) => log(`  [!!] ${mensaje}`);

const fechaClave = (fecha) => {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const ts = (fecha) => Timestamp.fromDate(fecha);
const inicioDelDia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

const MATERIA_PROG_3A = 'mat_3a_prog';

const escribirLote = async (db, etiqueta, documentos) => {
  if (!documentos.length) {
    ok(`${etiqueta}: sin documentos`);
    return 0;
  }

  if (DRY_RUN) {
    info(`${etiqueta}: ${documentos.length} documentos (dry-run, NO escritos)`);
    return documentos.length;
  }

  let escritos = 0;

  for (let i = 0; i < documentos.length; i += BATCH_SIZE) {
    const lote = db.batch();
    const chunk = documentos.slice(i, i + BATCH_SIZE);

    chunk.forEach(({ ruta, datos }) => lote.set(db.doc(ruta), datos));
    await lote.commit();

    escritos += chunk.length;
    process.stdout.write(`\r  [..] ${etiqueta}: ${escritos}/${documentos.length}   `);
  }

  process.stdout.write('\r');
  ok(`${etiqueta}: ${escritos} documentos`);
  return escritos;
};

const construirSeed = () => {
  const usuarios = construirUsuarios();
  const cursosBase = construirCursos();
  const cursos = cursosBase.map((curso) => ({
    ...curso,
    preceptorIds: PRECEPTORES_POR_CURSO[curso.id] ?? [],
  }));

  const materias = construirMaterias(cursos);
  const alumnos = construirAlumnos(cursos, ANIO_LECTIVO);
  const inscripciones = construirInscripciones(alumnos, ANIO_LECTIVO);
  const horarios = construirHorarios(cursos, materias);

  const cursosConScope = cursos.map((curso) => {
    const delCurso = materias.filter((m) => m.cursoId === curso.id);
    return {
      ...curso,
      docenteIds: [...new Set(delCurso.map((m) => m.docenteId))],
      materiaIds: delCurso.map((m) => m.id),
    };
  });

  const ahora = new Date();
  const hoy = inicioDelDia(ahora);
  const claveHoy = fechaClave(ahora);
  const preceptorDe = (cursoId) => (PRECEPTORES_POR_CURSO[cursoId] ?? [])[0] ?? 'usr_admin';

  const patrons = ['presente', 'presente', 'presente', 'tarde', 'presente', 'ausente'];

  const asistencias = alumnos.map((alumno, i) => {
    const estado = patrons[i % patrons.length];
    const llegada = new Date(hoy);
    llegada.setHours(7, 15 + ((i * 7) % 50));

    return {
      ruta: `${COL.ASISTENCIAS}/${alumno.id}_${claveHoy}_general`,
      datos: {
        alumnoId: alumno.id,
        cursoId: alumno.cursoId,
        materiaId: null,
        horarioId: null,
        fecha: ts(hoy),
        fechaKey: claveHoy,
        hora: estado === 'ausente' ? null : ts(llegada),
        estado,
        observaciones: estado === 'tarde' ? 'Llegó fuera de horario' : '',
        registradoPor: preceptorDe(alumno.cursoId),
        metodoRegistro: i % 3 === 0 ? 'qr' : 'manual',
        sesionQRId: i % 3 === 0 ? 'ses_qr_hoy' : null,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      },
    };
  });

  const inicioSesion = new Date(hoy);
  inicioSesion.setHours(7, 20, 0, 0);
  const finSesion = new Date(hoy);
  finSesion.setHours(9, 0, 0, 0);

  const sesionesQR = [
    {
      ruta: `${COL.SESIONES_QR}/ses_qr_hoy`,
      datos: {
        cursoId: '3A',
        materiaId: MATERIA_PROG_3A,
        creadoPor: 'usr_preceptor_3a',
        fecha: ts(hoy),
        fechaKey: claveHoy,
        horaInicio: ts(inicioSesion),
        horaFin: ts(finSesion),
        codigo: 'SENTINELA3A',
        activo: true,
        ubicacion: { aula: 'Laboratorio 2', lat: -34.6037, lng: -58.3816, radio: 120 },
        creadoEn: FieldValue.serverTimestamp(),
      },
    },
  ];

  const ausentes = asistencias.filter((a) => a.datos.estado === 'ausente').slice(0, 2);

  const justificaciones = ausentes.map((asistencia, i) => ({
    ruta: `${COL.JUSTIFICACIONES}/jus_${i + 1}`,
    datos: {
      alumnoId: asistencia.datos.alumnoId,
      asistenciaId: asistencia.ruta.split('/')[1],
      fecha: ts(hoy),
      fechaKey: claveHoy,
      motivo: i === 0 ? 'Turno médico' : 'Problemas de transporte',
      estado: i === 0 ? 'aprobada' : 'pendiente',
      observaciones: i === 0 ? 'Presentó certificado' : '',
      presentadaPor: asistencia.datos.alumnoId,
      revisadaPor: i === 0 ? 'usr_preceptor_3a' : null,
      fechaRevision: i === 0 ? ts(hoy) : null,
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    },
  }));

  const notas = alumnos.slice(0, 12).map((alumno, i) => ({
    ruta: `${COL.NOTAS}/nota_${alumno.id}_prog`,
    datos: {
      alumnoId: alumno.id,
      materiaId: `mat_${alumno.cursoId}_prog`.toLowerCase(),
      cursoId: alumno.cursoId,
      profesorId: 'usr_profesor_prog',
      tipo: 'evaluacion',
      descripcion: 'Trabajo práctico 1',
      nota: 6 + (i % 5),
      fecha: ts(hoy),
      periodo: 'Primer trimestre',
      observaciones: '',
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    },
  }));

  const proximoExamen = new Date(hoy);
  proximoExamen.setDate(proximoExamen.getDate() + 7);

  const examenes = [
    {
      ruta: `${COL.EXAMENES}/ex_prog_3a`,
      datos: {
        materiaId: MATERIA_PROG_3A,
        cursoId: '3A',
        profesorId: 'usr_profesor_prog',
        titulo: 'Primer parcial de Programación',
        descripcion: 'Unidades 1 y 2',
        fecha: ts(proximoExamen),
        fechaKey: fechaClave(proximoExamen),
        hora: '09:00',
        aula: 'Aula 101',
        tipo: 'parcial',
        notificado: true,
        publicado: true,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      },
    },
  ];

  const entrega = new Date(hoy);
  entrega.setDate(entrega.getDate() + 3);

  const trabajos = [
    {
      ruta: `${COL.TRABAJOS}/tp_prog_3a`,
      datos: {
        materiaId: MATERIA_PROG_3A,
        cursoId: '3A',
        profesorId: 'usr_profesor_prog',
        titulo: 'TP 2 - Estructuras de control',
        descripcion: 'Consola interactiva en JavaScript',
        fechaPublicacion: ts(hoy),
        fechaEntrega: ts(entrega),
        fechaEntregaKey: fechaClave(entrega),
        publicado: true,
        permiteSubirArchivos: true,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      },
    },
  ];

  const entregas = alumnos.slice(0, 8).map((alumno, i) => ({
    ruta: `${COL.ENTREGAS}/tp_prog_3a_${alumno.id}`,
    datos: {
      tpId: 'tp_prog_3a',
      alumnoId: alumno.id,
      fechaEntrega: ts(hoy),
      estado: i < 6 ? 'corregido' : 'pendiente',
      archivoUrl: i < 6 ? `https://example.test/entregas/${alumno.id}.zip` : '',
      comentario: '',
      calificado: i < 6,
      calificacion: i < 6 ? 7 + (i % 4) : null,
      observaciones: '',
      entregadoPor: alumno.id,
      actualizadoEn: FieldValue.serverTimestamp(),
    },
  }));

  const novedades = [
    {
      ruta: `${COL.NOVEDADES}/nov_actos`,
      datos: {
        titulo: 'Acto academico: 1er trimestre',
        contenido: 'Se informan las fechas de actos. Los alumnos con 3 inasistencias deben presentar justificacion.',
        tipo: 'institucional',
        autorId: 'usr_directivo',
        cursoId: null,
        materiaId: null,
        publicados: true,
        requiereConfirmacion: true,
        confirmadaPor: [],
        fechaVigencia: null,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      },
    },
  ];

  const notificaciones = usuarios.map((usuario) => ({
    ruta: `${COL.NOTIFICACIONES}/ntf_${usuario.id}`,
    datos: {
      usuarioId: usuario.id,
      titulo: 'Carga de asistencia',
      mensaje: 'Se registro la asistencia del dia en los cursos 3, 4 y 5.',
      tipo: 'sistema',
      leida: false,
      creadoEn: FieldValue.serverTimestamp(),
    },
  }));

  const auditoria = [
    {
      ruta: `${COL.AUDITORIA}/aud_seed`,
      datos: {
        usuarioId: 'usr_admin',
        accion: 'CREAR',
        coleccion: COL.ASISTENCIAS,
        documentoId: 'seed',
        descripcion: 'Carga inicial de datos de Sentinela',
        datosAnteriores: null,
        datosNuevos: { origen: 'scripts/seed.js' },
        fecha: FieldValue.serverTimestamp(),
      },
    },
  ];

  const documentos = {
    usuarios: usuarios.map((u) => ({ ruta: `${COL.USUARIOS}/${u.id}`, datos: { ...u, fechaCreacion: ts(hoy) } })),
    cursos: cursosConScope.map((c) => ({ ruta: `${COL.CURSOS}/${c.id}`, datos: { ...c, creadoEn: ts(hoy) } })),
    materias: materias.map((m) => ({ ruta: `${COL.MATERIAS}/${m.id}`, datos: { ...m, creadoEn: ts(hoy) } })),
    alumnos: alumnos.map((a) => ({ ruta: `${COL.ALUMNOS}/${a.id}`, datos: { ...a, creadoEn: ts(hoy) } })),
    inscripciones: inscripciones.map((i) => ({
      ruta: `${COL.INSCRIPCIONES}/${i.id}`,
      datos: { ...i, creadoEn: ts(hoy) },
    })),
    horarios: horarios.map((h) => ({ ruta: `${COL.HORARIOS}/${h.id}`, datos: { ...h, creadoEn: ts(hoy) } })),
  };

  return {
    documentos,
    sueltas: {
      asistencias,
      sesionesQR,
      justificaciones,
      notas,
      examenes,
      trabajosPracticos: trabajos,
      entregasTP: entregas,
      novedades,
      notificaciones,
      auditoria,
    },
    claveHoy,
    totalAlumnos: alumnos.length,
  };
};

const idsDe = (documentos) => new Set(documentos.map((d) => d.ruta.split('/').pop()));

const validarReferencias = (seed) => {
  const d = seed.documentos;
  const ids = {
    usuarios: idsDe(d.usuarios),
    alumnos: idsDe(d.alumnos),
    cursos: idsDe(d.cursos),
    materias: idsDe(d.materias),
    horarios: idsDe(d.horarios),
  };

  const errores = [];
  const revisar = (etiqueta, campo, valor, conjunto) => {
    if (valor !== null && valor !== undefined && valor !== '' && !conjunto.has(valor)) {
      errores.push(`${etiqueta}.${campo} -> "${valor}" no existe`);
    }
  };

  d.cursos.forEach(({ datos }) => {
    (datos.docenteIds ?? []).forEach((id) => revisar('cursos.docenteIds', 'docenteIds', id, ids.usuarios));
    (datos.preceptorIds ?? []).forEach((id) => revisar('cursos.preceptorIds', 'preceptorIds', id, ids.usuarios));
    (datos.materiaIds ?? []).forEach((id) => revisar('cursos.materiaIds', 'materiaIds', id, ids.materias));
  });

  d.materias.forEach(({ datos }) => {
    revisar('materias', 'cursoId', datos.cursoId, ids.cursos);
    revisar('materias', 'docenteId', datos.docenteId, ids.usuarios);
  });

  d.alumnos.forEach(({ datos }) => revisar('alumnos', 'cursoId', datos.cursoId, ids.cursos));

  d.inscripciones.forEach(({ datos }) => {
    revisar('inscripciones', 'alumnoId', datos.alumnoId, ids.alumnos);
    revisar('inscripciones', 'cursoId', datos.cursoId, ids.cursos);
  });

  d.horarios.forEach(({ datos }) => {
    revisar('horarios', 'cursoId', datos.cursoId, ids.cursos);
    revisar('horarios', 'materiaId', datos.materiaId, ids.materias);
    revisar('horarios', 'docenteId', datos.docenteId, ids.usuarios);
  });

  const asistencias = new Set(seed.sueltas.asistencias.map((a) => a.ruta.split('/').pop()));

  seed.sueltas.asistencias.forEach(({ datos }) => {
    revisar('asistencias', 'alumnoId', datos.alumnoId, ids.alumnos);
    revisar('asistencias', 'cursoId', datos.cursoId, ids.cursos);
    revisar('asistencias', 'registradoPor', datos.registradoPor, ids.usuarios);
  });

  seed.sueltas.sesionesQR.forEach(({ datos }) => {
    revisar('sesionesQR', 'cursoId', datos.cursoId, ids.cursos);
    revisar('sesionesQR', 'materiaId', datos.materiaId, ids.materias);
    revisar('sesionesQR', 'creadoPor', datos.creadoPor, ids.usuarios);
  });

  seed.sueltas.justificaciones.forEach(({ datos }) => {
    revisar('justificaciones', 'alumnoId', datos.alumnoId, ids.alumnos);
    revisar('justificaciones', 'asistenciaId', datos.asistenciaId, asistencias);
  });

  seed.sueltas.notas.forEach(({ datos }) => {
    revisar('notas', 'alumnoId', datos.alumnoId, ids.alumnos);
    revisar('notas', 'materiaId', datos.materiaId, ids.materias);
    revisar('notas', 'profesorId', datos.profesorId, ids.usuarios);
  });

  seed.sueltas.examenes.forEach(({ datos }) => {
    revisar('examenes', 'materiaId', datos.materiaId, ids.materias);
    revisar('examenes', 'cursoId', datos.cursoId, ids.cursos);
  });

  const tps = new Set(seed.sueltas.trabajosPracticos.map((t) => t.ruta.split('/').pop()));

  seed.sueltas.trabajosPracticos.forEach(({ datos }) => {
    revisar('trabajosPracticos', 'materiaId', datos.materiaId, ids.materias);
    revisar('trabajosPracticos', 'cursoId', datos.cursoId, ids.cursos);
  });

  seed.sueltas.entregasTP.forEach(({ datos }) => {
    revisar('entregasTP', 'tpId', datos.tpId, tps);
    revisar('entregasTP', 'alumnoId', datos.alumnoId, ids.alumnos);
  });

  seed.sueltas.novedades.forEach(({ datos }) => revisar('novedades', 'autorId', datos.autorId, ids.usuarios));

  seed.sueltas.notificaciones.forEach(({ datos }) =>
    revisar('notificaciones', 'usuarioId', datos.usuarioId, ids.usuarios)
  );

  seed.sueltas.auditoria.forEach(({ datos }) => revisar('auditoria', 'usuarioId', datos.usuarioId, ids.usuarios));

  if (errores.length) {
    const detalle = errores.slice(0, 15).map((e) => `    - ${e}`).join('\n');
    const extra = errores.length > 15 ? `\n    ... y ${errores.length - 15} mas` : '';
    throw new TargetError(`Integridad referencial rota (${errores.length}):\n${detalle}${extra}`);
  }

  return true;
};

const escribirTodo = async (db, seed) => {
  paso('Escribiendo colecciones');

  for (const [nombre, documentos] of Object.entries(seed.documentos)) {
    await escribirLote(db, nombre, documentos);
  }

  for (const [nombre, documentos] of Object.entries(seed.sueltas)) {
    await escribirLote(db, nombre, documentos);
  }
};

const verificarLectura = async (db, seed) => {
  paso('Verificando lectura desde Cloud Firestore');

  const conteos = {};
  const colecciones = [
    ...Object.keys(seed.documentos),
    'asistencias',
    'sesionesQR',
    'justificaciones',
    'notas',
  ];

  for (const nombre of colecciones) {
    const snapshot = await db.collection(nombre).limit(1000).get();
    conteos[nombre] = snapshot.size;
  }

  Object.entries(conteos).forEach(([nombre, total]) => {
    log(`  ${nombre.padEnd(18)} ${String(total).padStart(5)} documentos`);
  });

  const muestra = await db.collection('alumnos').limit(1).get();
  if (!muestra.empty) {
    const d = muestra.docs[0].data();
    paso('Documento de muestra leido del servidor');
    log(`  alumnos/${muestra.docs[0].id}`);
    log(`  ${d.nombre} ${d.apellido} · legajo ${d.legajo} · curso ${d.cursoId}`);
  }
};

const main = async () => {
  log('');
  log('===========================================================');
  log('  SENTINELA - carga inicial en Cloud Firestore');
  log('===========================================================');

  paso('Verificando destino');
  verificarNoEmulador();
  ok('Sin variables de emulador');
  ok(`Proyecto esperado: ${PROJECT_ID} (desde src/firebase.config.json)`);

  const seed = construirSeed();

  paso('Validando integridad referencial');
  validarReferencias(seed);
  ok('Todas las referencias (IDs) apuntan a documentos existentes');

  if (DRY_RUN) {
    paso('MODO DRY-RUN - no se escribe nada, no se requieren credenciales');
    await escribirTodo(null, seed);
    paso('Resumen (dry-run)');
    info(`${seed.totalAlumnos} alumnos · fecha ${seed.claveHoy}`);
    info('Para escribir de verdad: npm run seed');
    log('');
    return;
  }

  const credencial = verificarCredencial(RUTA_CREDENCIAL);
  ok(`Credencial: ${credencial.metodo}`);
  info(`Archivo: ${credencial.ruta}`);

  if (credencial.clientEmail) {
    info(`Service account: ${credencial.clientEmail}`);
  }

  if (RUTA_CREDENCIAL) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credencial.ruta;
  }

  const projectId = process.env.FIRESTORE_PROJECT_ID || PROJECT_ID;
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: applicationDefault(), projectId });

  verificarProyecto(app.options.projectId);
  ok(`Proyecto: ${app.options.projectId}`);

  const db = getFirestore(app);

  paso('Prueba de escritura real');
  const prueba = await verificarEscrituraReal(db, app);
  ok(`Endpoint: ${prueba.endpoint}`);
  ok(`Proyecto confirmado por el servidor: ${prueba.proyecto}`);
  ok('Emulador detectado: no');

  await escribirTodo(db, seed);
  await verificarLectura(db, seed);

  paso('Listo');
  ok(`Consola: https://console.firebase.google.com/project/${app.options.projectId}/firestore/data`);
  ok('Las reglas siguen cerradas: el seed uso firebase-admin (omite reglas).');
  log('');
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    log('');
    if (error instanceof TargetError) {
      fallo(error.message);
      process.exit(2);
    }
    fallo(error.stack || error.message);
    process.exit(1);
  });
