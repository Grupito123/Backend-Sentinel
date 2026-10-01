/**
 * Nombres de las colecciones de Firestore.
 *
 * Deben coincidir exactamente con los que usa la aplicación móvil (App-Sentinela)
 * para que ambas apis apunten a la misma instancia de Firestore del proyecto
 * `centinela-2b390`. Cualquier cambio acá debe replicarse también en la app móvil.
 */
export const COLLECTIONS = {
  USERS: 'usuarios',
  STUDENTS: 'alumnos',
  PARENTS: 'padres',
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
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export default COLLECTIONS;
