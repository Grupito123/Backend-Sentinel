import {
  addDoc,
  arrayUnion,
  deleteDoc,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { COLLECTIONS, NEWS_TYPES, collectionRef, documentRef, toTimestamp, withoutUndefined } from './helpers';

const COLECCION = COLLECTIONS.NEWS;
const ref = () => collectionRef(COLECCION);

export const crearNovedad = async ({
  titulo,
  contenido,
  tipo = NEWS_TYPES.INSTITUCIONAL,
  autorId,
  cursoId = null,
  materiaId = null,
  publicados = true,
  requiereConfirmacion = false,
  fechaVigencia = null,
}) => {
  const documento = await addDoc(ref(), {
    titulo,
    contenido,
    tipo,
    autorId,
    cursoId,
    materiaId,
    publicados,
    requiereConfirmacion,
    confirmadaPor: [],
    fechaVigencia: toTimestamp(fechaVigencia),
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerNovedades = async ({ cursoId, tipo, limite = 30, soloVigentes = true } = {}) => {
  const filtros = [];
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (tipo) filtros.push(where('tipo', '==', tipo));

  const consulta = query(ref(), ...filtros, orderBy('creadoEn', 'desc'), limitQuery(limite));
  const snapshot = await getDocs(consulta);
  const ahora = new Date();

  const novedades = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  if (!soloVigentes) return novedades;

  return novedades.filter((novedad) => {
    const vigencia = novedad.fechaVigencia?.toDate?.();
    return !vigencia || vigencia >= ahora;
  });
};

export const actualizarNovedad = (novedadId, cambios) =>
  updateDoc(documentRef(COLECCION, novedadId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const eliminarNovedad = (novedadId) => deleteDoc(documentRef(COLECCION, novedadId));

export const confirmarNovedad = async (novedadId, usuarioId) => {
  await updateDoc(documentRef(COLECCION, novedadId), {
    confirmadaPor: arrayUnion(usuarioId),
    actualizadoEn: serverTimestamp(),
  });
  return novedadId;
};

export const marcarNovedadLeida = (novedadId, usuarioId) =>
  updateDoc(documentRef(COLECCION, novedadId), { leidaPor: arrayUnion(usuarioId) });
