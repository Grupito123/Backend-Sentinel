import { addDoc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS, collectionRef, documentRef, withoutUndefined } from './helpers';

const ref = () => collectionRef(COLLECTIONS.SUBJECTS);

export const crearMateria = async ({ nombre, codigo, cursoId, docenteId, activo = true }) => {
  const documento = await addDoc(ref(), {
    nombre,
    codigo,
    cursoId,
    docenteId,
    activo,
    creadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const obtenerMateria = async (materiaId) => {
  if (!materiaId) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.SUBJECTS, materiaId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerMaterias = async ({ cursoId, docenteId, activo = true } = {}) => {
  const filtros = [];
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (docenteId) filtros.push(where('docenteId', '==', docenteId));
  if (activo !== undefined) filtros.push(where('activo', '==', activo));

  let consulta = query(ref(), ...filtros);
  if (!docenteId) consulta = query(consulta, orderBy('nombre', 'asc'));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerMateriasDeDocente = (docenteId, opciones) =>
  obtenerMaterias({ ...opciones, docenteId });

export const actualizarMateria = (materiaId, cambios) =>
  updateDoc(documentRef(COLLECTIONS.SUBJECTS, materiaId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const asignarDocente = (materiaId, docenteId) => actualizarMateria(materiaId, { docenteId });

export const obtenerMapaMaterias = async (materiaIds = []) => {
  const ids = [...new Set(materiaIds.filter(Boolean))];
  const pares = await Promise.all(ids.map((id) => obtenerMateria(id)));
  return Object.fromEntries(
    pares.filter(Boolean).map((materia) => [materia.id, { id: materia.id, nombre: materia.nombre }])
  );
};
