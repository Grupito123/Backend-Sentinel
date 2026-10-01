import { addDoc, getDoc, getDocs, limit as limitQuery, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import {
  ATTENDANCE_STATUS,
  COLLECTIONS,
  JUSTIFICATION_STATUS,
  collectionRef,
  documentRef,
  toDateKey,
  toTimestamp,
} from './helpers';

const COLECCION = COLLECTIONS.JUSTIFICATIONS;
const ref = () => collectionRef(COLECCION);

export const crearJustificacion = async ({
  alumnoId,
  asistenciaId = null,
  fecha,
  motivo,
  estado = JUSTIFICATION_STATUS.PENDIENTE,
  observaciones = '',
  presentadaPor,
}) => {
  const claveFecha = toDateKey(fecha) ?? toDateKey(new Date());

  const documento = await addDoc(ref(), {
    alumnoId,
    asistenciaId,
    fecha: toTimestamp(fecha) ?? toTimestamp(new Date()),
    fechaKey: claveFecha,
    motivo,
    estado,
    observaciones,
    presentadaPor,
    revisadaPor: null,
    fechaRevision: null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerJustificacion = async (justificacionId) => {
  if (!justificacionId) return null;
  const snapshot = await getDoc(documentRef(COLECCION, justificacionId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerJustificaciones = async ({ alumnoId, estado, limite } = {}) => {
  const filtros = [];
  if (alumnoId) filtros.push(where('alumnoId', '==', alumnoId));
  if (estado) filtros.push(where('estado', '==', estado));

  let consulta = query(ref(), ...filtros, orderBy('fecha', 'desc'));
  if (limite) consulta = query(consulta, limitQuery(limite));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerJustificacionesPendientes = (opciones) =>
  obtenerJustificaciones({ ...opciones, estado: JUSTIFICATION_STATUS.PENDIENTE });

export const revisarJustificacion = async (justificacionId, { estado, revisadaPor, observaciones }) => {
  await updateDoc(documentRef(COLECCION, justificacionId), {
    estado,
    revisadaPor,
    observaciones: observaciones ?? '',
    fechaRevision: toTimestamp(new Date()),
    actualizadoEn: serverTimestamp(),
  });

  const justificacion = await obtenerJustificacion(justificacionId);

  if (justificacion?.asistenciaId && estado === JUSTIFICATION_STATUS.APROBADA) {
    await updateDoc(documentRef(COLLECTIONS.ATTENDANCE, justificacion.asistenciaId), {
      estado: ATTENDANCE_STATUS.JUSTIFICADO,
      actualizadoEn: serverTimestamp(),
    });
  }

  return justificacion;
};
