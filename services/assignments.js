import {
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  COLLECTIONS,
  SUBMISSION_STATUS,
  collectionRef,
  documentRef,
  toDateKey,
  toTimestamp,
  withoutUndefined,
} from './helpers';

const TPs = () => collectionRef(COLLECTIONS.ASSIGNMENTS);
const entregas = () => collectionRef(COLLECTIONS.SUBMISSIONS);

export const crearTrabajoPractico = async ({
  materiaId,
  cursoId,
  profesorId,
  titulo,
  descripcion = '',
  fechaPublicacion,
  fechaEntrega,
  publicado = true,
  permiteSubirArchivos = true,
}) => {
  const documento = await addDoc(TPs(), {
    materiaId,
    cursoId,
    profesorId,
    titulo,
    descripcion,
    fechaPublicacion: toTimestamp(fechaPublicacion) ?? serverTimestamp(),
    fechaEntrega: toTimestamp(fechaEntrega),
    fechaEntregaKey: toDateKey(fechaEntrega),
    publicado,
    permiteSubirArchivos,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerTrabajoPractico = async (tpId) => {
  if (!tpId) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.ASSIGNMENTS, tpId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerTrabajosPracticos = async ({ materiaId, cursoId, publicado = true } = {}) => {
  const filtros = [];
  if (materiaId) filtros.push(where('materiaId', '==', materiaId));
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (publicado !== undefined) filtros.push(where('publicado', '==', publicado));

  const consulta = filtros.length
    ? query(TPs(), ...filtros, orderBy('fechaEntrega', 'asc'))
    : query(TPs(), orderBy('fechaEntrega', 'asc'));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const actualizarTrabajoPractico = (tpId, cambios) =>
  updateDoc(documentRef(COLLECTIONS.ASSIGNMENTS, tpId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const extenderFechaEntrega = (tpId, fechaEntrega) =>
  actualizarTrabajoPractico(tpId, {
    fechaEntrega: toTimestamp(fechaEntrega),
    fechaEntregaKey: toDateKey(fechaEntrega),
  });

export const eliminarTrabajoPractico = (tpId) => deleteDoc(documentRef(COLLECTIONS.ASSIGNMENTS, tpId));

export const entregaDocId = (tpId, alumnoId) => `${tpId}_${alumnoId}`;

export const entregarTrabajoPractico = async ({
  tpId,
  alumnoId,
  archivoUrl = '',
  comentario = '',
  fechaEntrega = new Date(),
  usuarioId,
}) => {
  const id = entregaDocId(tpId, alumnoId);

  await setDoc(
    documentRef(COLLECTIONS.SUBMISSIONS, id),
    {
      tpId,
      alumnoId,
      fechaEntrega: toTimestamp(fechaEntrega) ?? serverTimestamp(),
      estado: SUBMISSION_STATUS.ENTREGADO,
      archivoUrl,
      comentario,
      calificado: false,
      calificacion: null,
      observaciones: '',
      entregadoPor: usuarioId ?? alumnoId,
      actualizadoEn: serverTimestamp(),
    },
    { merge: true }
  );

  return id;
};

export const obtenerEntrega = async (tpId, alumnoId) => {
  const snapshot = await getDoc(documentRef(COLLECTIONS.SUBMISSIONS, entregaDocId(tpId, alumnoId)));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerEntregasDeTp = async (tpId) => {
  const snapshot = await getDocs(query(entregas(), where('tpId', '==', tpId), orderBy('fechaEntrega', 'asc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerEntregasDeAlumno = async (alumnoId) => {
  const snapshot = await getDocs(query(entregas(), where('alumnoId', '==', alumnoId)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const calificarTrabajoPractico = (entregaId, { calificacion, observaciones = '' }) =>
  updateDoc(documentRef(COLLECTIONS.SUBMISSIONS, entregaId), {
    calificacion,
    observaciones,
    calificado: true,
    estado: SUBMISSION_STATUS.CORREGIDO,
    actualizadoEn: serverTimestamp(),
  });
