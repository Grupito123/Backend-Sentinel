import { Timestamp, collection, doc } from 'firebase/firestore';
import { db } from '../../firebase';

export const COLLECTIONS = {
  USERS: 'usuarios',
  STUDENTS: 'alumnos',
  PADRES: 'padres',
  COURSES: 'cursos',
  SUBJECTS: 'materias',
  ENROLLMENTS: 'inscripciones',
  SCHEDULES: 'horarios',
  ATTENDANCE: 'asistencias',
  QR_SESSIONS: 'sesionesQR',
  JUSTIFICATIONS: 'justificaciones',
  NOTIFICATIONS: 'notificaciones',
  AUDIT: 'auditoria',
  GRADES: 'notas',
  EXAMS: 'examenes',
  ASSIGNMENTS: 'trabajosPracticos',
  SUBMISSIONS: 'entregasTP',
  NEWS: 'novedades',
};

export const ROLES = {
  ADMIN: 'administrador',
  DIRECTIVO: 'directivo',
  PRECEPTOR: 'preceptor',
  PROFESOR: 'profesor',
  ALUMNO: 'alumno',
  PADRE: 'padre',
};

export const ROLES_LIST = Object.values(ROLES);

export const ATTENDANCE_STATUS = {
  PRESENTE: 'presente',
  AUSENTE: 'ausente',
  TARDE: 'tarde',
  JUSTIFICADO: 'justificado',
};

export const ATTENDANCE_METHOD = {
  QR: 'qr',
  MANUAL: 'manual',
};

export const JUSTIFICATION_STATUS = {
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
};

export const NOTIFICATION_TYPES = {
  INASISTENCIA: 'inasistencia',
  LLEGADA_TARDE: 'llegada_tarde',
  JUSTIFICACION: 'justificacion',
  SISTEMA: 'sistema',
};

export const GRADE_TYPES = {
  EVALUACION: 'evaluacion',
  TRABAJO_PRACTICO: 'trabajoPractico',
  EXAMEN: 'examen',
  PARTICIPACION: 'participacion',
};

export const PERIODS = {
  PRIMER_TRIMESTRE: 'Primer trimestre',
  SEGUNDO_TRIMESTRE: 'Segundo trimestre',
  TERCER_TRIMESTRE: 'Tercer trimestre',
};

export const SUBMISSION_STATUS = {
  PENDIENTE: 'pendiente',
  ENTREGADO: 'entregado',
  TARDE: 'tarde',
  CORREGIDO: 'corregido',
  RECHAZADO: 'rechazado',
};

export const NEWS_TYPES = {
  INSTITUCIONAL: 'institucional',
  MATERIA: 'materia',
  EXAMEN: 'examen',
  EVENTO: 'evento',
  URGENTE: 'urgente',
};

export const DAYS_OF_WEEK = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
  7: 'Domingo',
};

export const collectionRef = (name) => collection(db, name);
export const documentRef = (name, id) => doc(db, name, id);

export const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
};

export const toDateKey = (value) => {
  const date = toDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const todayKey = () => toDateKey(new Date());

export const startOfDay = (value) => {
  const date = toDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
};

export const endOfDay = (value) => {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
};

export const toTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const date = toDate(value);
  return date ? Timestamp.fromDate(date) : null;
};

export const dayRange = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
};

export const formatTime = (value) => {
  const date = toDate(value);
  if (!date) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatDateKey = (dateKey) => {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

export const withoutUndefined = (data) =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

export const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

export const idFromDocs = (snapshot) => snapshot.docs.map((item) => item.id);

export const randomCode = (length = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};
