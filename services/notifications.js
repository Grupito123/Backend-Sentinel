import { addDoc, getDocs, limit as limitQuery, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { COLLECTIONS, NOTIFICATION_TYPES, collectionRef, documentRef } from './helpers';

const COLECCION = COLLECTIONS.NOTIFICATIONS;
const ref = () => collectionRef(COLECCION);

export const crearNotificacion = async ({
  usuarioId,
  titulo,
  mensaje,
  tipo = NOTIFICATION_TYPES.SISTEMA,
  leida = false,
}) => {
  const documento = await addDoc(ref(), {
    usuarioId,
    titulo,
    mensaje,
    tipo,
    leida,
    creadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const crearNotificaciones = async (usuariosIds, { titulo, mensaje, tipo }) => {
  const batch = writeBatch(db);

  [...new Set(usuariosIds.filter(Boolean))].forEach((usuarioId) => {
    batch.add(ref(), {
      usuarioId,
      titulo,
      mensaje,
      tipo: tipo ?? NOTIFICATION_TYPES.SISTEMA,
      leida: false,
      creadoEn: serverTimestamp(),
    });
  });

  await batch.commit();
};

export const obtenerNotificaciones = async (usuarioId, { soloNoLeidas = false, limite = 30 } = {}) => {
  const filtros = [where('usuarioId', '==', usuarioId)];
  if (soloNoLeidas) filtros.push(where('leida', '==', false));

  const consulta = query(ref(), ...filtros, orderBy('creadoEn', 'desc'), limitQuery(limite));
  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const contarNoLeidas = async (usuarioId) => {
  const registros = await obtenerNotificaciones(usuarioId, { soloNoLeidas: true, limite: 100 });
  return registros.length;
};

export const marcarLeida = (notificacionId) =>
  updateDoc(documentRef(COLECCION, notificacionId), { leida: true, leidaEn: serverTimestamp() });

export const marcarTodasLeidas = async (usuarioId) => {
  const registros = await obtenerNotificaciones(usuarioId, { soloNoLeidas: true, limite: 100 });
  if (!registros.length) return 0;

  const batch = writeBatch(db);
  registros.forEach((registro) => batch.update(documentRef(COLECCION, registro.id), { leida: true }));
  await batch.commit();

  return registros.length;
};
