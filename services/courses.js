import { addDoc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS, collectionRef, documentRef, withoutUndefined } from './helpers';

const ref = () => collectionRef(COLLECTIONS.COURSES);

export const crearCurso = async ({
  nombre,
  anio,
  division,
  turno,
  orientacion = '',
  activo = true,
  preceptorIds = [],
  docenteIds = [],
  materiaIds = [],
}) => {
  const documento = await addDoc(ref(), {
    nombre,
    anio,
    division,
    turno,
    orientacion,
    activo,
    preceptorIds: [...new Set(preceptorIds)],
    docenteIds: [...new Set(docenteIds)],
    materiaIds: [...new Set(materiaIds)],
    creadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerCurso = async (cursoId) => {
  if (!cursoId) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.COURSES, cursoId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerCursos = async ({ activo = true, turno } = {}) => {
  const filtros = [];
  if (activo !== undefined) filtros.push(where('activo', '==', activo));
  if (turno) filtros.push(where('turno', '==', turno));

  const consulta = filtros.length
    ? query(ref(), ...filtros, orderBy('anio', 'desc'))
    : query(ref(), orderBy('anio', 'desc'));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const actualizarCurso = (cursoId, cambios) =>
  updateDoc(documentRef(COLLECTIONS.COURSES, cursoId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const desactivarCurso = (cursoId) => actualizarCurso(cursoId, { activo: false });

export const obtenerMapaCursos = async (cursoIds = []) => {
  const ids = [...new Set(cursoIds.filter(Boolean))];
  const pares = await Promise.all(ids.map((id) => obtenerCurso(id)));
  return Object.fromEntries(
    pares.filter(Boolean).map((curso) => [curso.id, { id: curso.id, nombre: curso.nombre }])
  );
};

export const asignarPreceptoresAlCurso = (cursoId, preceptorIds) =>
  updateDoc(documentRef(COLLECTIONS.COURSES, cursoId), {
    preceptorIds: [...new Set(preceptorIds ?? [])],
    scopeActualizadoEn: serverTimestamp(),
  });

export const sincronizarDocentesDelCurso = async (cursoId) => {
  const materias = await getDocs(query(ref(), where('cursoId', '==', cursoId), where('activo', '==', true)));
  const docenteIds = [...new Set(materias.docs.map((item) => item.data().docenteId).filter(Boolean))];

  await updateDoc(documentRef(COLLECTIONS.COURSES, cursoId), {
    docenteIds,
    materiaIds: materias.docs.map((item) => item.id),
    scopeActualizadoEn: serverTimestamp(),
  });

  return docenteIds;
};

export const obtenerCursosDePreceptor = (preceptorId) => getCourses({ preceptorId });

export const obtenerCursosDeDocente = (docenteId) => getCourses({ docenteId });

const getCourses = async ({ preceptorId, docenteId }) => {
  const snapshot = await getDocs(query(ref(), where('activo', '==', true)));
  const cursos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  return cursos.filter((curso) => {
    if (preceptorId) return (curso.preceptorIds ?? []).includes(preceptorId);
    if (docenteId) return (curso.docenteIds ?? []).includes(docenteId);
    return true;
  });
};
