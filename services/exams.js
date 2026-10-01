import { addDoc, deleteDoc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS, collectionRef, documentRef, toTimestamp, toDateKey, withoutUndefined } from './helpers';

const COLECCION = COLLECTIONS.EXAMS;
const ref = () => collectionRef(COLECCION);

export const crearExamen = async ({
  materiaId,
  cursoId,
  profesorId,
  titulo,
  descripcion = '',
  fecha,
  hora = '',
  aula = '',
  tipo = 'parcial',
  notificado = false,
  publicado = true,
}) => {
  const documento = await addDoc(ref(), {
    materiaId,
    cursoId,
    profesorId,
    titulo,
    descripcion,
    fecha: toTimestamp(fecha) ?? serverTimestamp(),
    fechaKey: toDateKey(fecha),
    hora,
    aula,
    tipo,
    notificado,
    publicado,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerExamen = async (examenId) => {
  if (!examenId) return null;
  const snapshot = await getDoc(documentRef(COLECCION, examenId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerExamenes = async ({ materiaId, cursoId, desde, hasta, publicado = true } = {}) => {
  const filtros = [];
  if (materiaId) filtros.push(where('materiaId', '==', materiaId));
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (publicado !== undefined) filtros.push(where('publicado', '==', publicado));
  if (desde) filtros.push(where('fecha', '>=', toTimestamp(desde)));
  if (hasta) filtros.push(where('fecha', '<=', toTimestamp(hasta)));

  const snapshot = await getDocs(query(ref(), ...filtros, orderBy('fecha', 'asc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const proximosExamenes = async (cursoId, limite) => obtenerExamenes({ cursoId });

export const actualizarExamen = (examenId, cambios) =>
  updateDoc(documentRef(COLECCION, examenId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const marcarNotificado = (examenId) => actualizarExamen(examenId, { notificado: true });

export const eliminarExamen = (examenId) => deleteDoc(documentRef(COLECCION, examenId));
