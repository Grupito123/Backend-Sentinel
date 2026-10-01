import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { COLLECTIONS } from "../collections";
import { ROLES, type Rol } from "../roles";
import type { UsuarioPerfil } from "../../Context/AuthContext";

/**
 * Datos de alta de un usuario desde la web.
 * La forma del documento resultante es idéntica a la de App-Sentinela
 * (`crearUsuario` en `src/services/firestore/users.js`).
 */
export interface CrearUsuarioInput {
  /** uid de Firebase Authentication; también será el ID del documento. */
  uid: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: Rol;
  dni?: string;
  telefono?: string;
  activo?: boolean;
  alumnoId?: string | null;
  /** DNI del hijo cuando el registro es de un padre/madre. */
  dniVinculado?: string | null;
}

/**
 * Crea `usuarios/{uid}` con la misma estructura que usa la app móvil.
 * Nunca se guarda la contraseña: vive únicamente en Firebase Authentication.
 */
export async function crearUsuario(input: CrearUsuarioInput): Promise<void> {
  await setDoc(
    doc(db, COLLECTIONS.USERS, input.uid),
    {
      uid: input.uid,
      nombre: input.nombre,
      apellido: input.apellido,
      email: input.email,
      dni: input.dni ?? "",
      rol: input.rol,
      telefono: input.telefono ?? "",
      activo: input.activo ?? true,
      alumnoId: input.alumnoId ?? null,
      dniVinculado: input.dniVinculado ?? null,
      fechaCreacion: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Lee el perfil `usuarios/{uid}` de la base compartida con App-Sentinela.
 *
 * Las reglas permiten leer el propio perfil a cualquier cuenta autenticada
 * (`allow read: if (autenticado() && request.auth.uid == usuarioId) || esAdmin()`),
 * así que esta llamada funciona para el usuario logueado. Para leer OTROS
 * perfiles hace falta rol administrador.
 */
export async function obtenerPerfil(uid: string): Promise<UsuarioPerfil | null> {
  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    return {
      uid: data.uid ?? uid,
      nombre: data.nombre ?? "",
      apellido: data.apellido ?? "",
      email: data.email ?? "",
      dni: data.dni ?? "",
      rol: data.rol ?? "",
      telefono: data.telefono ?? "",
      activo: data.activo ?? true,
      alumnoId: data.alumnoId ?? null,
      dniVinculado: data.dniVinculado ?? null,
      hijoAlumnoId: data.hijoAlumnoId ?? null,
    };
  } catch {
    return null;
  }
}

/** Cuenta con rol alumno tal como la escribe `crearUsuario`. */
export interface UsuarioAlumno {
  uid: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  email: string;
  dni: string;
  /** `null` mientras el administrador no lo vincule a una ficha. */
  alumnoId: string | null;
}

function mapUsuarioAlumno(id: string, data: Record<string, unknown>): UsuarioAlumno {
  const nombre = String(data.nombre ?? "");
  const apellido = String(data.apellido ?? "");
  return {
    uid: id,
    nombre,
    apellido,
    nombreCompleto: `${nombre} ${apellido}`.trim() || String(data.email ?? "") || id,
    email: String(data.email ?? ""),
    dni: String(data.dni ?? ""),
    alumnoId: typeof data.alumnoId === "string" && data.alumnoId ? data.alumnoId : null,
  };
}

/**
 * Cuentas con rol `alumno` todavía SIN vincular, para el flujo de vinculación.
 *
 * Solo el administrador puede leer otros perfiles: las reglas lo restringen con
 * `esAdmin()`. El filtro por `alumnoId` se hace en el cliente a propósito, porque
 * `where('alumnoId', '==', null)` en Firestore no trae los documentos donde el
 * campo directamente no existe, y el registro lo escribe siempre en `null`.
 */
export async function obtenerAlumnosSinVincular(): Promise<UsuarioAlumno[]> {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.USERS), where("rol", "==", ROLES.ALUMNO)),
  );

  return snapshot.docs
    .map((item) => mapUsuarioAlumno(item.id, item.data()))
    .filter((cuenta) => cuenta.alumnoId === null);
}

/** Todas las cuentas con rol `alumno`, vinculadas o no. */
export async function obtenerCuentasAlumno(): Promise<UsuarioAlumno[]> {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.USERS), where("rol", "==", ROLES.ALUMNO)),
  );
  return snapshot.docs.map((item) => mapUsuarioAlumno(item.id, item.data()));
}

/**
 * Cuenta completa tal como la escribe el alta y el panel de administración.
 * `rol` es la clasificación; `alumnoId` es solo la relación opcional con una
 * ficha de `alumnos/{alumnoId}` y NO participa de la clasificación.
 */
export interface UsuarioCuenta extends UsuarioAlumno {
  rol: Rol;
  telefono: string;
  activo: boolean;
  /** DNI del hijo, informativo, en cuentas con rol `padre`. */
  dniVinculado: string | null;
  /**
   * Ficha del hijo en `alumnos`, en cuentas con rol `padre`.
   *
   * Es el campo que autoriza a un padre a leer las asistencias de su hijo
   * (`esMiHijo` en `firestore.rules`). Solo lo escribe el administrador: el
   * alta publica lo exige en `null`, porque las reglas no pueden resolver un DNI
   * a un alumnoId (el ID del documento nunca es el DNI).
   */
  hijoAlumnoId: string | null;
  fechaCreacion: unknown;
}

/**
 * Lee todas las cuentas de `usuarios`, agrupadas por `usuarios/{uid}.rol`.
 *
 * Es la fuente del listado administrativo: cada categoría es exactamente
 * "documentos cuyo campo `rol` vale ese valor". No se infiere el rol por la
 * existencia de una ficha en `alumnos/`, y una cuenta con rol `alumno` y
 * `alumnoId: null` aparece igual en su categoría.
 *
 * Solo el administrador puede leer otros perfiles (`allow read: if
 * (autenticado() && request.auth.uid == usuarioId) || esAdmin()` en
 * `firestore.rules`), por eso la pantalla que la usa está restringida a admin.
 */
export async function obtenerCuentas(): Promise<UsuarioCuenta[]> {
  const snapshot = await getDocs(query(collection(db, COLLECTIONS.USERS)));
  return snapshot.docs
    .map((item) => {
      const data = item.data();
      const base = mapUsuarioAlumno(item.id, data);
      return {
        ...base,
        nombre: base.nombre,
        apellido: base.apellido,
        rol: String(data.rol ?? "") as Rol,
        telefono: String(data.telefono ?? ""),
        activo: data.activo !== false,
        dniVinculado:
          typeof data.dniVinculado === "string" && data.dniVinculado ? data.dniVinculado : null,
        hijoAlumnoId:
          typeof data.hijoAlumnoId === "string" && data.hijoAlumnoId ? data.hijoAlumnoId : null,
        fechaCreacion: data.fechaCreacion ?? null,
      };
    })
    .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"));
}

/* -------------------------------------------------------------------------- */
/* Administration CRUD                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Edicion de una cuenta por parte del administrador.
 *
 * `uid` y `email` NO son editables: el email es la identidad real en Firebase
 * Authentication y cambiarlo solo en Firestore desincroniza ambos sistemas.
 * Para cambiarlo habria que operar sobre la cuenta en Authentication.
 *
 * Los campos se escriben con `updateDoc` y una lista explicita: no se reescribe
 * el documento entero, asi que un campo que no se envia conserva su valor.
 */
export interface EditarCuentaInput {
  nombre?: string;
  apellido?: string;
  telefono?: string;
  dni?: string;
  rol?: Rol;
  activo?: boolean;
  /** Ficha de `alumnos` para cuentas rol alumno. */
  alumnoId?: string | null;
  /** DNI del hijo, informativo, en cuentas rol padre. */
  dniVinculado?: string | null;
  /** Ficha de `alumnos` del hijo. Es lo que autoriza al padre a leer la asistencia. */
  hijoAlumnoId?: string | null;
}

export async function editarCuenta(uid: string, cambios: EditarCuentaInput): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre.trim();
  if (cambios.apellido !== undefined) payload.apellido = cambios.apellido.trim();
  if (cambios.telefono !== undefined) payload.telefono = cambios.telefono.trim();
  if (cambios.dni !== undefined) payload.dni = cambios.dni.trim();
  if (cambios.rol !== undefined) payload.rol = cambios.rol;
  if (cambios.activo !== undefined) payload.activo = cambios.activo;
  if (cambios.alumnoId !== undefined) payload.alumnoId = cambios.alumnoId || null;
  if (cambios.dniVinculado !== undefined) payload.dniVinculado = cambios.dniVinculado || null;
  if (cambios.hijoAlumnoId !== undefined) payload.hijoAlumnoId = cambios.hijoAlumnoId || null;

  await updateDoc(doc(db, COLLECTIONS.USERS, uid), payload);
}

/** Activa o desactiva una cuenta. `rol()` en las reglas exige `activo == true`. */
export async function cambiarEstadoCuenta(uid: string, activo: boolean): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
    activo,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Elimina el PERFIL de Firestore de una cuenta.
 *
 * LIMITACION REAL: el SDK de cliente no puede borrar la cuenta de Firebase
 * Authentication de otro usuario (`deleteUser` solo borra a uno mismo, y hace
 * falta el Admin SDK o una Cloud Function para el resto). Por eso esto borra
 * solo `usuarios/{uid}`.
 *
 * La cuenta de Authentication queda huerfana, pero es inocua: todas las reglas
 * exigen un perfil con `activo == true` y un `rol` reconocido, asi que sin
 * documento la persona no accede a nada (fallo cerrado). Para borrarla de verdad
 * hay que hacerlo desde la consola de Firebase o con el Admin SDK.
 */
export async function eliminarPerfil(uid: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.USERS, uid));
}

/** Alta de una cuenta hecha por el administrador (no es auto-registro). */
export interface CrearCuentaAdminInput {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  rol: Rol;
  dni?: string;
  telefono?: string;
  /** El administrador si decide la vinculacion en el mismo paso. */
  alumnoId?: string | null;
  hijoAlumnoId?: string | null;
}

interface IdentityToolkitError {
  error?: { message?: string };
}

const ERRORES_ALTA: Record<string, string> = {
  EMAIL_EXISTS: "Ya existe una cuenta con ese correo.",
  INVALID_EMAIL: "El correo no tiene un formato válido.",
  WEAK_PASSWORD: "La contraseña es demasiado débil: usá al menos 6 caracteres.",
  INVALID_PASSWORD: "La contraseña no es válida.",
  MISSING_PASSWORD: "Falta la contraseña.",
  OPERATION_NOT_ALLOWED: "El registro por correo está deshabilitado en Authentication.",
};

/**
 * Crea la cuenta en Firebase Authentication y su perfil en `usuarios`.
 *
 * Se usa el endpoint REST `accounts:signUp` y NO
 * `createUserWithEmailAndPassword` del SDK a propósito: el método del SDK deja
 * como usuario actual a la cuenta recién creada, lo que expulsaría al
 * administrador de su propia sesión a mitad de la edición. Llamando al REST con
 * `fetch` se obtiene el `localId` (el uid) sin tocar el estado de autenticacion
 * del cliente.
 *
 * La contraseña nunca se escribe en Firestore: vive solo en Authentication.
 */
export async function crearCuentaAdmin(input: CrearCuentaAdminInput): Promise<string> {
  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email.trim(),
        password: input.password,
        displayName: `${input.nombre.trim()} ${input.apellido.trim()}`.trim(),
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    const cuerpo = (await response.json().catch(() => ({}))) as IdentityToolkitError;
    const codigo = cuerpo.error?.message ?? "";
    const mensaje = ERRORES_ALTA[codigo] ?? `No se pudo crear la cuenta (${codigo || response.status}).`;
    throw new Error(mensaje);
  }

  const auth = (await response.json()) as { localId?: string };
  const uid = auth.localId;
  if (!uid) throw new Error("Authentication no devolvió el uid de la cuenta creada.");

  // Si el administrador paso el alumno, la ficha guarda tambien la referencia
  // inversa, igual que hace el flujo de vinculacion.
  if (input.alumnoId) {
    await writeBatch(db)
      .set(doc(db, COLLECTIONS.USERS, uid), {
        uid,
        nombre: input.nombre.trim(),
        apellido: input.apellido.trim(),
        email: input.email.trim(),
        dni: input.dni?.trim() ?? "",
        rol: input.rol,
        telefono: input.telefono?.trim() ?? "",
        activo: true,
        alumnoId: input.alumnoId,
        dniVinculado: null,
        hijoAlumnoId: input.hijoAlumnoId ?? null,
        fechaCreacion: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      .set(doc(db, COLLECTIONS.STUDENTS, input.alumnoId), { usuarioId: uid }, { merge: true })
      .commit();
    return uid;
  }

  await setDoc(
    doc(db, COLLECTIONS.USERS, uid),
    {
      uid,
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      email: input.email.trim(),
      dni: input.dni?.trim() ?? "",
      rol: input.rol,
      telefono: input.telefono?.trim() ?? "",
      activo: true,
      alumnoId: null,
      dniVinculado: null,
      hijoAlumnoId: input.hijoAlumnoId ?? null,
      fechaCreacion: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return uid;
}
