import { addDoc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS, collectionRef, documentRef, startOfDay, toTimestamp, withoutUndefined } from './helpers';

const ref = () => collectionRef(COLLECTIONS.SCHEDULES);

export const crearHorario = async ({ cursoId, materiaId, docenteId, diaSemana, horaInicio, horaFin, aula = '', activo = true }) => {
  const documento = await addDoc(ref(), {
    cursoId,
    materiaId,
    docenteId,
    diaSemana: Number(diaSemana),
    horaInicio,
    horaFin,
    aula,
    activo,
    creadoEn: serverTimestamp(),
  });

  return documento.id;
};

export const crearHorariosSemanales = ({ dias = [], ...datos }) =>
  Promise.all(dias.map((diaSemana) => crearHorario({ ...datos, diaSemana })));

export const obtenerHorario = async (horarioId) => {
  if (!horarioId) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.SCHEDULES, horarioId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerHorarios = async ({ cursoId, docenteId, diaSemana, activo = true } = {}) => {
  const filtros = [];
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (docenteId) filtros.push(where('docenteId', '==', docenteId));
  if (diaSemana) filtros.push(where('diaSemana', '==', Number(diaSemana)));
  if (activo !== undefined) filtros.push(where('activo', '==', activo));

  let consulta = query(ref(), ...filtros);
  if (!docenteId) consulta = query(consulta, orderBy('horaInicio', 'asc'));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerHorariosDeDocente = (docenteId, opciones) => obtenerHorarios({ ...opciones, docenteId });

export const actualizarHorario = (horarioId, cambios) =>
  updateDoc(documentRef(COLLECTIONS.SCHEDULES, horarioId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const desactivarHorario = (horarioId) => actualizarHorario(horarioId, { activo: false });

export const horarioEnCurso = async (horarioId, cursoId) => {
  const horario = await obtenerHorario(horarioId);
  return Boolean(horario) && horario.cursoId === cursoId;
};

export const ensureHorarioDelDia = async ({ cursoId, materiaId, docenteId, aula }) => {
  const horarioId = `${cursoId}_${materiaId}_${new Date().getDay() || 7}`;
  await setDoc(
    documentRef(COLLECTIONS.SCHEDULES, horarioId),
    {
      cursoId,
      materiaId,
      docenteId,
      diaSemana: new Date().getDay() || 7,
      aula: aula ?? '',
      activo: true,
      generadoAutomaticamente: true,
      fechaGeneracion: toTimestamp(startOfDay(new Date())),
      creadoEn: serverTimestamp(),
    },
    { merge: true }
  );
  return horarioId;
};
