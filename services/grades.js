import {
  addDoc,
  deleteDoc,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { COLLECTIONS, collectionRef, documentRef, toTimestamp, withoutUndefined } from './helpers';

const COLECCION = COLLECTIONS.GRADES;
const ref = () => collectionRef(COLECCION);

export const crearNota = async ({
  alumnoId,
  materiaId,
  cursoId,
  profesorId,
  tipo,
  descripcion = '',
  nota = null,
  fecha,
  periodo = '',
  observaciones = '',
}) => {
  const documento = await addDoc(ref(), {
    alumnoId,
    materiaId,
    cursoId,
    profesorId,
    tipo,
    descripcion,
    nota,
    fecha: toTimestamp(fecha) ?? serverTimestamp(),
    periodo,
    observaciones,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const cargarNotas = async (notas) => {
  const ids = [];
  for (const nota of notas ?? []) {
    ids.push(await crearNota(nota));
  }
  return ids;
};

export const obtenerNotas = async ({ alumnoId, materiaId, cursoId, periodo, limite } = {}) => {
  const filtros = [];
  if (alumnoId) filtros.push(where('alumnoId', '==', alumnoId));
  if (materiaId) filtros.push(where('materiaId', '==', materiaId));
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (periodo) filtros.push(where('periodo', '==', periodo));

  let consulta = query(ref(), ...filtros, orderBy('fecha', 'desc'));
  if (limite) consulta = query(consulta, limitQuery(limite));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerNotasDeAlumno = (alumnoId, opciones) => obtenerNotas({ ...opciones, alumnoId });

export const obtenerBoletin = async (alumnoId, { periodo } = {}) => {
  const notas = await obtenerNotasDeAlumno(alumnoId, { periodo });
  const porMateria = {};

  notas.forEach((nota) => {
    if (nota.nota === null || nota.nota === undefined) return;
    if (!porMateria[nota.materiaId]) porMateria[nota.materiaId] = { notas: [], suma: 0, cantidad: 0 };
    porMateria[nota.materiaId].notas.push(nota);
    porMateria[nota.materiaId].suma += Number(nota.nota);
    porMateria[nota.materiaId].cantidad += 1;
  });

  return Object.entries(porMateria).map(([materiaId, datos]) => ({
    materiaId,
    cantidad: datos.cantidad,
    promedio: datos.cantidad ? datos.suma / datos.cantidad : 0,
    notas: datos.notas,
  }));
};

export const actualizarNota = (notaId, cambios) =>
  updateDoc(documentRef(COLECCION, notaId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const eliminarNota = (notaId) => deleteDoc(documentRef(COLECCION, notaId));
