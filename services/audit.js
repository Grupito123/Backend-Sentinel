import { addDoc, getDocs, limit as limitQuery, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { COLLECTIONS, collectionRef } from './helpers';

const COLECCION = COLLECTIONS.AUDIT;
const ref = () => collectionRef(COLECCION);

export const AUDIT_ACTIONS = {
  CREAR: 'CREAR',
  MODIFICAR: 'MODIFICAR',
  ELIMINAR: 'ELIMINAR',
  LOGIN: 'LOGIN',
  CREAR_ASISTENCIA: 'CREAR_ASISTENCIA',
  MODIFICAR_ASISTENCIA: 'MODIFICAR_ASISTENCIA',
  CREAR_SESION_QR: 'CREAR_SESION_QR',
  CERRAR_SESION_QR: 'CERRAR_SESION_QR',
  REVISAR_JUSTIFICACION: 'REVISAR_JUSTIFICACION',
};

export const registrarAuditoria = async ({
  usuarioId,
  accion,
  coleccion,
  documentoId = null,
  descripcion = '',
  datosAnteriores = null,
  datosNuevos = null,
}) =>
  addDoc(ref(), {
    usuarioId,
    accion,
    coleccion,
    documentoId,
    descripcion,
    datosAnteriores,
    datosNuevos,
    fecha: serverTimestamp(),
  });

export const obtenerAuditoria = async ({ usuarioId, coleccion, documentoId, limite = 50 } = {}) => {
  const filtros = [];
  if (usuarioId) filtros.push(where('usuarioId', '==', usuarioId));
  if (coleccion) filtros.push(where('coleccion', '==', coleccion));
  if (documentoId) filtros.push(where('documentoId', '==', documentoId));

  let consulta = query(ref(), ...filtros, orderBy('fecha', 'desc'));
  if (limite) consulta = query(consulta, limitQuery(limite));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const auditarCambioAsistencia = async ({ usuarioId, asistencia, datosAnteriores, descripcion }) => {
  const { id, ...estadoActual } = asistencia;
  const cambios = Object.keys(estadoActual).filter(
    (campo) => datosAnteriores?.[campo] !== undefined && datosAnteriores[campo] !== estadoActual[campo]
  );

  if (!cambios.length) return null;

  const soloCambios = Object.fromEntries(cambios.map((campo) => [campo, estadoActual[campo]]));
  const previos = Object.fromEntries(cambios.map((campo) => [campo, datosAnteriores[campo]]));

  return registrarAuditoria({
    usuarioId,
    accion: AUDIT_ACTIONS.MODIFICAR_ASISTENCIA,
    coleccion: COLLECTIONS.ATTENDANCE,
    documentoId: id,
    descripcion: descripcion ?? `Cambios: ${cambios.join(', ')}`,
    datosAnteriores: previos,
    datosNuevos: soloCambios,
  });
};

export const auditarDesdeDoc = ({ usuarioId, accion, snapshot }) => {
  if (!snapshot?.exists) return Promise.resolve(null);

  return registrarAuditoria({
    usuarioId,
    accion,
    coleccion: snapshot.ref.parent.id ?? '',
    documentoId: snapshot.id,
    descripcion: accion,
    datosNuevos: snapshot.data(),
  });
};
