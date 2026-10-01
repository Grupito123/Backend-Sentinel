/**
 * Roles del proyecto, espejo de `ROLES` en App-Sentinela
 * (`src/services/firestore/helpers.js`).
 *
 * Única fuente de verdad de la clasificación de cuentas. El valor que se
 * guarda en `usuarios/{uid}.rol` es exactamente la clave de este objeto: los
 * listados del panel de administración se separan por rol, no por la existencia
 * de una ficha en `alumnos/`.
 *
 * El alta pública solo puede elegir entre los roles de `ROLES_REGISTRO_PUBLICO`
 * (alumno, padre y profesor). Los roles de gestión (`preceptor`, `directivo`,
 * `administrador`) NO se pueden auto-asignar: los crea un administrador, y
 * `firestore.rules` lo impide aunque alguien manipule el formulario.
 *
 * Un rol que no esté en esta lista no coincide con ningún `es*()` de las reglas
 * y la cuenta se queda sin permisos: es un fallo cerrado, no una escalada.
 */
export const ROLES = {
  ADMIN: 'administrador',
  DIRECTIVO: 'directivo',
  PRECEPTOR: 'preceptor',
  /** El rol docente canónico es `profesor`; la interfaz lo muestra como "Maestro". */
  PROFESOR: 'profesor',
  ALUMNO: 'alumno',
  PADRE: 'padre',
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

export const ROLES_LIST: Rol[] = Object.values(ROLES);

/**
 * Roles que el formulario de alta pública puede escribir. Es la misma lista que
 * acepta `allow create` de `match /usuarios` en `firestore.rules`.
 */
export const ROLES_REGISTRO_PUBLICO: Rol[] = [ROLES.ALUMNO, ROLES.PADRE, ROLES.PROFESOR];

/** Etiquetas para la interfaz. El valor almacenado nunca cambia. */
export const ETIQUETAS_ROL: Record<Rol, string> = {
  [ROLES.ADMIN]: 'Administradores',
  [ROLES.DIRECTIVO]: 'Directivos',
  [ROLES.PRECEPTOR]: 'Preceptores',
  [ROLES.PROFESOR]: 'Maestros / Profesores',
  [ROLES.ALUMNO]: 'Alumnos',
  [ROLES.PADRE]: 'Padres',
};

/**
 * Categorías del listado administrativo, en el orden en que se muestran.
 * Cada categoría es exactamente "cuentas con `usuarios/{uid}.rol === <rol>`".
 */
export const CATEGORIAS_CUENTAS: Rol[] = [
  ROLES.ALUMNO,
  ROLES.PADRE,
  ROLES.PROFESOR,
  ROLES.PRECEPTOR,
  ROLES.DIRECTIVO,
  ROLES.ADMIN,
];

export default ROLES;
