import { doc, getDoc, serverTimestamp, setDoc, updateDoc, type Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { COLLECTIONS } from "../collections";

/**
 * Documento `padres/{padreId}`.
 * El ID del documento debe coincidir con el `uid` de Firebase Authentication.
 */
export interface Padre {
  /** UID de Firebase Authentication (coincide con ID del documento). */
  padreId: string;
  /** Relación con Authentication. */
  usuarioId: string;
  nombre: string;
  apellido: string;
  email: string;
  dni: string;
  telefono: string;
  /** DNI del hijo (dato inicial para vinculación). No se usa para auto-asignar permisos. */
  dniHijo: string;
  /** Vínculo resuelto a ficha de alumno. Solo lo modifica administración. */
  hijoAlumnoId: string | null;
  activo: boolean;
  fechaCreacion: Timestamp;
  updatedAt: Timestamp;
}

export interface CrearPadrePublicoInput {
  uid: string;
  nombre: string;
  apellido: string;
  email: string;
  dni?: string;
  telefono?: string;
  dniHijo?: string;
}

/**
 * Alta pública de padre/madre.
 * Crea `padres/{uid}` con `usuarioId = uid` y `hijoAlumnoId = null`.
 * No crea usuarios/{uid}. No implementa auto-vinculación.
 */
export async function crearPadrePublico(input: CrearPadrePublicoInput): Promise<void> {
  const ts = serverTimestamp();
  await setDoc(
    doc(db, COLLECTIONS.PARENTS, input.uid),
    {
      usuarioId: input.uid,
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      email: input.email.trim(),
      dni: input.dni?.trim() ?? "",
      telefono: input.telefono?.trim() ?? "",
      dniHijo: input.dniHijo?.trim() ?? "",
      hijoAlumnoId: null,
      activo: true,
      fechaCreacion: ts,
      updatedAt: ts,
    },
    { merge: true },
  );
}

export async function obtenerPadre(uid: string): Promise<Padre | null> {
  if (!uid) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.PARENTS, uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Padre;
  return {
    ...data,
    padreId: data.padreId ?? uid,
    usuarioId: data.usuarioId ?? uid,
  };
}

export interface EditarPadreInput {
  nombre?: string;
  apellido?: string;
  telefono?: string;
  dni?: string;
  dniHijo?: string;
}

export async function editarPadre(uid: string, cambios: EditarPadreInput): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (cambios.nombre !== undefined) payload.nombre = cambios.nombre.trim();
  if (cambios.apellido !== undefined) payload.apellido = cambios.apellido.trim();
  if (cambios.telefono !== undefined) payload.telefono = cambios.telefono.trim();
  if (cambios.dni !== undefined) payload.dni = cambios.dni.trim();
  if (cambios.dniHijo !== undefined) payload.dniHijo = cambios.dniHijo.trim();
  await updateDoc(doc(db, COLLECTIONS.PARENTS, uid), payload);
}