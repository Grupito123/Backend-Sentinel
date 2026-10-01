import { addDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS, collectionRef, documentRef, toTimestamp, withoutUndefined } from './helpers';

const ref = () => collectionRef(COLLECTIONS.ENROLLMENTS);

export const crearInscripcion = async ({ alumnoId, cursoId, anioLectivo, fechaInicio, fechaFin = null, activo = true }) => {
  const documento = await addDoc(ref(), {
    alumnoId,
    cursoId,
    anioLectivo: Number(anioLectivo),
    fechaInicio: toTimestamp(fechaInicio) ?? serverTimestamp(),
    fechaFin: toTimestamp(fechaFin),
    activo,
    creadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerInscripciones = async ({ alumnoId, cursoId, anioLectivo, activo = true } = {}) => {
  const filtros = [];
  if (alumnoId) filtros.push(where('alumnoId', '==', alumnoId));
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (anioLectivo) filtros.push(where('anioLectivo', '==', Number(anioLectivo)));
  if (activo !== undefined) filtros.push(where('activo', '==', activo));

  const consulta = filtros.length
    ? query(ref(), ...filtros, orderBy('fechaInicio', 'desc'))
    : query(ref(), orderBy('fechaInicio', 'desc'));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerInscripcionActual = (alumnoId, anioLectivo) =>
  obtenerInscripciones({ alumnoId, anioLectivo, activo: true }).then((items) => items[0] ?? null);

export const actualizarInscripcion = (inscripcionId, cambios) =>
  updateDoc(documentRef(COLLECTIONS.ENROLLMENTS, inscripcionId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const cerrarInscripcion = (inscripcionId, fechaFin) =>
  actualizarInscripcion(inscripcionId, { activo: false, fechaFin: toTimestamp(fechaFin) });
