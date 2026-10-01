import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  ATTENDANCE_METHOD,
  ATTENDANCE_STATUS,
  COLLECTIONS,
  collectionRef,
  dayRange,
  documentRef,
  formatTime,
  startOfDay,
  toDateKey,
  toTimestamp,
  withoutUndefined,
} from './helpers';

const COLECCION = COLLECTIONS.ATTENDANCE;
const ref = () => collectionRef(COLECCION);

const timestampDesdeClave = (claveFecha) => {
  const [year, month, day] = String(claveFecha).split('-').map(Number);
  return toTimestamp(new Date(year, month - 1, day));
};

export const asistenciaDocId = ({ alumnoId, fecha, materiaId = null }) => {
  const claveFecha = toDateKey(fecha) ?? toDateKey(new Date());
  return `${alumnoId}_${claveFecha}_${materiaId ?? 'general'}`;
};

const construirPayload = (datos) => {
  const claveFecha = toDateKey(datos.fecha) ?? toDateKey(new Date());
  const estado = datos.estado ?? ATTENDANCE_STATUS.PRESENTE;

  return withoutUndefined({
    alumnoId: datos.alumnoId,
    cursoId: datos.cursoId ?? '',
    materiaId: datos.materiaId ?? null,
    horarioId: datos.horarioId ?? null,
    fecha: timestampDesdeClave(claveFecha),
    fechaKey: claveFecha,
    hora: estado === ATTENDANCE_STATUS.AUSENTE ? null : toTimestamp(datos.hora ?? new Date()),
    estado,
    observaciones: datos.observaciones ?? '',
    registradoPor: datos.registradoPor ?? '',
    metodoRegistro: datos.metodoRegistro ?? ATTENDANCE_METHOD.MANUAL,
    sesionQRId: datos.sesionQRId ?? null,
    actualizadoEn: serverTimestamp(),
  });
};

export const registrarAsistencia = async (datos) => {
  const claveFecha = toDateKey(datos.fecha) ?? toDateKey(new Date());
  const id = asistenciaDocId({ ...datos, fecha: claveFecha });

  await setDoc(
    documentRef(COLECCION, id),
    { ...construirPayload({ ...datos, fecha: claveFecha }), creadoEn: serverTimestamp() },
    { merge: true }
  );

  return id;
};

// ===== Dos caminos de escritura para el QR del alumno =====
// 1) CREATE (primera vez): registrarAsistencia -> incluye creadoEn.
// 2) UPDATE (reescaneo): actualizarAsistenciaPorQr -> NO reescribe creadoEn y
//    solo toca hora/estado/actualizadoEn. El resto de campos queda inmutable.
export const actualizarAsistenciaPorQr = (asistenciaId, { hora, estado }) =>
  updateDoc(documentRef(COLECCION, asistenciaId), {
    hora: toTimestamp(hora ?? new Date()),
    estado,
    actualizadoEn: serverTimestamp(),
  });

export const registrarOActualizarAsistenciaQr = async (datos) => {
  const claveFecha = toDateKey(datos.fecha) ?? toDateKey(new Date());
  const id = asistenciaDocId({ ...datos, fecha: claveFecha });
  const existente = await getDoc(documentRef(COLECCION, id));

  if (existente.exists()) {
    await actualizarAsistenciaPorQr(id, { hora: datos.hora, estado: datos.estado });
    return id;
  }

  await setDoc(documentRef(COLECCION, id), {
    ...construirPayload({ ...datos, fecha: claveFecha }),
    creadoEn: serverTimestamp(),
  });

  return id;
};

export const registrarAsistencias = async (lista) => {
  if (!lista?.length) return [];

  const batch = writeBatch(db);
  const ids = [];

  lista.forEach((datos) => {
    const claveFecha = toDateKey(datos.fecha) ?? toDateKey(new Date());
    const id = asistenciaDocId({ ...datos, fecha: claveFecha });
    ids.push(id);

    batch.set(
      documentRef(COLECCION, id),
      { ...construirPayload({ ...datos, fecha: claveFecha }), creadoEn: serverTimestamp() },
      { merge: true }
    );
  });

  await batch.commit();
  return ids;
};

export const marcarTodosAusentes = ({
  ids = [],
  cursoId,
  fecha,
  registradoPor,
  materiaId = null,
  horarioId = null,
  sesionQRId = null,
}) =>
  registrarAsistencias(
    ids.map((alumnoId) => ({
      alumnoId,
      cursoId,
      materiaId,
      horarioId,
      sesionQRId,
      fecha,
      estado: ATTENDANCE_STATUS.AUSENTE,
      hora: null,
      registradoPor,
      metodoRegistro: ATTENDANCE_METHOD.MANUAL,
    }))
  );

const mapDoc = (item) => {
  const data = item.data();
  return {
    id: item.id,
    ...data,
    hora: data.hora ?? null,
    horaTexto: formatTime(data.hora) ?? '-',
  };
};

const mapDocs = (snapshot) => snapshot.docs.map(mapDoc);

const resumirRegistros = (registros) => {
  const resumen = {
    presentes: 0,
    ausentes: 0,
    tarde: 0,
    justificado: 0,
    total: registros.length,
  };

  registros.forEach((registro) => {
    if (registro.estado === ATTENDANCE_STATUS.PRESENTE) resumen.presentes += 1;
    if (registro.estado === ATTENDANCE_STATUS.AUSENTE) resumen.ausentes += 1;
    if (registro.estado === ATTENDANCE_STATUS.TARDE) resumen.tarde += 1;
    if (registro.estado === ATTENDANCE_STATUS.JUSTIFICADO) resumen.justificado += 1;
  });

  return resumen;
};

const consultaPorFecha = (fechaKey, { cursoId, materiaId, estado, limite } = {}) => {
  const { start, end } = dayRange(fechaKey);
  const filtros = [where('fecha', '>=', start), where('fecha', '<', end)];

  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (materiaId) filtros.push(where('materiaId', '==', materiaId));
  if (estado) filtros.push(where('estado', '==', estado));

  let consulta = query(ref(), ...filtros, orderBy('fecha', 'desc'));
  if (limite) consulta = query(consulta, limitQuery(limite));

  return consulta;
};

export const obtenerAsistenciasPorFecha = async (fechaKey, opciones) =>
  mapDocs(await getDocs(consultaPorFecha(fechaKey, opciones)));

export const obtenerAsistenciasPorAlumno = async (alumnoId, { desde, limite = 50 } = {}) => {
  const filtros = [where('alumnoId', '==', alumnoId)];
  if (desde) filtros.push(where('fecha', '>=', dayRange(desde).start));

  const consulta = query(ref(), ...filtros, orderBy('fecha', 'desc'));
  const snapshot = await getDocs(limite ? query(consulta, limitQuery(limite)) : consulta);
  return mapDocs(snapshot);
};

export const obtenerAsistenciasPorCurso = async (cursoId, { fecha, estado, limite } = {}) => {
  const filtros = [where('cursoId', '==', cursoId)];

  if (fecha) {
    const { start, end } = dayRange(fecha);
    filtros.push(where('fecha', '>=', start), where('fecha', '<', end));
  }
  if (estado) filtros.push(where('estado', '==', estado));

  let consulta = query(ref(), ...filtros, orderBy('fecha', 'desc'));
  if (limite) consulta = query(consulta, limitQuery(limite));

  return mapDocs(await getDocs(consulta));
};

export const obtenerUltimasAsistencias = async ({ limite = 10, cursoId } = {}) => {
  const filtros = cursoId ? [where('cursoId', '==', cursoId)] : [];
  const snapshot = await getDocs(query(ref(), ...filtros, orderBy('creadoEn', 'desc'), limitQuery(limite)));
  return mapDocs(snapshot);
};

export const obtenerResumenDiario = async (fechaKey, { cursoId } = {}) =>
  resumirRegistros(await obtenerAsistenciasPorFecha(fechaKey, { cursoId }));

export const obtenerAsistencia = async (asistenciaId) => {
  if (!asistenciaId) return null;
  const snapshot = await getDoc(documentRef(COLECCION, asistenciaId));
  return snapshot.exists() ? mapDoc(snapshot) : null;
};

export const actualizarAsistencia = (asistenciaId, cambios) =>
  updateDoc(documentRef(COLECCION, asistenciaId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const cambiarEstado = (asistenciaId, estado, { observaciones, usuarioId } = {}) =>
  actualizarAsistencia(asistenciaId, {
    estado,
    ...withoutUndefined({ observaciones }),
    registradoPor: usuarioId,
  });

export const eliminarAsistencia = (asistenciaId) => deleteDoc(documentRef(COLECCION, asistenciaId));

export const eliminarAsistenciasDelCurso = async (cursoId, fechaKey) => {
  const registros = await obtenerAsistenciasPorFecha(fechaKey, { cursoId });
  if (!registros.length) return 0;

  const batch = writeBatch(db);
  registros.forEach((registro) => batch.delete(doc(db, COLECCION, registro.id)));
  await batch.commit();

  return registros.length;
};

export const observarAsistenciasPorFecha = (fechaKey, opciones, callback, onError) =>
  onSnapshot(consultaPorFecha(fechaKey, opciones), (snapshot) => callback(mapDocs(snapshot)), onError);

export const observarResumenDiario = (fechaKey, { cursoId } = {}, callback) =>
  observarAsistenciasPorFecha(fechaKey, { cursoId }, (registros) => callback(resumirRegistros(registros)));

export const registrarDesdeAlumno = async ({ alumnoId, cursoId, sesionQRId, estado, usuarioId }) => {
  const ahora = new Date();
  const elegido = estado ?? (ahora.getHours() >= 8 ? ATTENDANCE_STATUS.PRESENTE : ATTENDANCE_STATUS.TARDE);

  return registrarAsistencia({
    alumnoId,
    cursoId,
    sesionQRId,
    fecha: startOfDay(ahora),
    hora: ahora,
    estado: elegido,
    registradoPor: usuarioId ?? alumnoId,
    metodoRegistro: ATTENDANCE_METHOD.QR,
  });
};
