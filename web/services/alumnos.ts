/**
 * Alumnos — espejo web de `src/services/firestore/students.js` de App-Sentinela,
 * mas la operación de VINCULACIÓN del DISEÑO A.
 *
 * Modelo de vinculación (decidido, ver `firestore.rules`):
 *
 *   REGISTRO   →  usuarios/{uid}  { rol: "alumno", alumnoId: null }
 *   ADMIN      →  usuarios/{uid}.alumnoId        = alumnoId
 *                 alumnos/{alumnoId}.usuarioId   = uid
 *
 * `usuarios.alumnoId` es la referencia principal y `alumnos.usuarioId` la
 * inversa. Ningún alumno se autocvincula: las reglas no tienen ninguna rama que
 * se lo permita.
 *
 * `cursoId` NUNCA se recibe desde esta capa. Se lee siempre de
 * `alumnos/{alumnoId}` y se devuelve al llamador, porque es la única fuente
 * confiable: la interfaz no puede elegir el curso de un alumno.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { COLLECTIONS } from "../collections";
import { ROLES } from "../roles";

/** Documento `alumnos/{alumnoId}` tal como lo escribe App-Sentinela. */
export interface Alumno {
  id: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  dni: string;
  legajo: string;
  email: string;
  telefono: string;
  cursoId: string | null;
  activo: boolean;
  /** Referencia inversa de la vinculación; `null` si la ficha está libre. */
  usuarioId: string | null;
}

function mapAlumno(id: string, data: Record<string, unknown>): Alumno {
  const nombre = String(data.nombre ?? "");
  const apellido = String(data.apellido ?? "");
  return {
    id,
    nombre,
    apellido,
    nombreCompleto: `${nombre} ${apellido}`.trim() || id,
    dni: String(data.dni ?? ""),
    legajo: String(data.legajo ?? ""),
    email: String(data.email ?? ""),
    telefono: String(data.telefono ?? ""),
    cursoId: typeof data.cursoId === "string" && data.cursoId ? data.cursoId : null,
    activo: data.activo !== false,
    usuarioId: typeof data.usuarioId === "string" && data.usuarioId ? data.usuarioId : null,
  };
}

/** Resultado de `vincularAlumnoCuenta`, para que la UI pueda confirmar el curso. */
export interface Vinculacion {
  uid: string;
  alumnoId: string;
  /** Leído desde `alumnos/{alumnoId}`; nunca Proveniente de la interfaz. */
  cursoId: string;
}

/**
 * Alumnos sin cuenta vinculada (`alumnos.usuarioId` ausente), ordenados por
 * apellido. Es la lista de fichas "disponibles" para vincular.
 */
export async function obtenerAlumnosDisponibles(): Promise<Alumno[]> {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.STUDENTS), where("activo", "==", true)),
  );
  return snapshot.docs
    .map((item) => mapAlumno(item.id, item.data()))
    .filter((alumno) => alumno.usuarioId === null);
}

export async function obtenerAlumno(alumnoId: string): Promise<Alumno | null> {
  if (!alumnoId) return null;
  const snapshot = await getDoc(doc(db, COLLECTIONS.STUDENTS, alumnoId));
  return snapshot.exists() ? mapAlumno(snapshot.id, snapshot.data()) : null;
}

/**
 * Alta pública de alumno.
 * Crea `alumnos/{uid}` con `usuarioId = uid`, `cursoId = null`, `legajo = ""`.
 * No permite elegir curso, legajo o usuarioId diferente.
 * No crea `usuarios/{uid}`.
 */
export interface CrearAlumnoPublicoInput {
  uid: string;
  nombre: string;
  apellido: string;
  dni?: string;
  email: string;
  telefono?: string;
}

export async function crearAlumnoPublico(input: CrearAlumnoPublicoInput): Promise<void> {
  const ts = serverTimestamp();
  await setDoc(
    doc(db, COLLECTIONS.STUDENTS, input.uid),
    {
      nombre: input.nombre.trim(),
      apellido: input.apellido.trim(),
      dni: input.dni?.trim() ?? "",
      legajo: "",
      email: input.email.trim(),
      telefono: input.telefono?.trim() ?? "",
      cursoId: null,
      activo: true,
      usuarioId: input.uid,
      creadoEn: ts,
      actualizadoEn: ts,
    },
    { merge: true },
  );
}

/**
 * Busca alumnos ya vinculados por nombre, DNI o legajo.
 * Se usa para revisar el estado de las vinculaciones existentes.
 */
export async function buscarAlumnosVinculados(texto: string, limite = 20): Promise<Alumno[]> {
  const term = texto.trim().toLowerCase();
  if (!term) return [];

  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.STUDENTS), where("activo", "==", true)),
  );

  return snapshot.docs
    .map((item) => mapAlumno(item.id, item.data()))
    .filter((alumno) => alumno.usuarioId !== null)
    .filter((alumno) =>
      [alumno.nombre, alumno.apellido, alumno.dni, alumno.legajo]
        .join(" ")
        .toLowerCase()
        .includes(term),
    )
    .slice(0, limite);
}

/**
 * VINCULACIÓN (DISEÑO A) — escribe los dos lados en una sola operación atómica.
 *
 *   1. usuarios/{uid}.alumnoId      = alumnoId
 *   2. alumnos/{alumnoId}.usuarioId = uid
 *
 * Pre-chequeos obligatorios, todos leídos de la base y ninguno tomado de la
 * interfaz:
 *  - el usuario existe;
 *  - el usuario tiene rol `alumno`;
 *  - la ficha de alumno existe y está activa;
 *  - el alumno no está vinculado a otra cuenta;
 *  - el usuario no está vinculado previamente a otro alumno;
 *  - la ficha tiene `cursoId` (es la única fuente del curso).
 *
 * `cursoId` no se escribe en ningún documento: se devuelve para que la UI lo
 * muestre. La interfaz no puede elegirlo.
 *
 * Nota importante sobre las reglas: dentro de un `writeBatch`, `get()` ve el
 * estado PREVIO a la escritura, así que las reglas no pueden comprobar que los
 * dos documentos quedaron consistentes entre sí. Esa garantía vive acá, en los
 * pre-chequeos. Lo que sí garantizan las reglas es que **solo el administrador**
 * pueda ejecutar esto, y que ningún alumno pueda tocar `alumnoId` ni
 * `alumnos.usuarioId`.
 *
 * @throws {Error} con mensaje en español ante cualquier pre-chequeo fallido.
 */
export async function vincularAlumnoCuenta(uid: string, alumnoId: string): Promise<Vinculacion> {
  if (!uid) throw new Error("No se indicó la cuenta de usuario.");
  if (!alumnoId) throw new Error("No se indicó la ficha de alumno.");

  const usuarioRef = doc(db, COLLECTIONS.USERS, uid);
  const alumnoRef = doc(db, COLLECTIONS.STUDENTS, alumnoId);

  const [usuarioSnap, alumnoSnap] = await Promise.all([
    getDoc(usuarioRef),
    getDoc(alumnoRef),
  ]);

  if (!usuarioSnap.exists()) throw new Error("La cuenta de usuario no existe.");
  if (!alumnoSnap.exists()) throw new Error("La ficha de alumno no existe.");

  const usuario = usuarioSnap.data();
  const alumno = alumnoSnap.data();

  if (usuario.rol !== ROLES.ALUMNO) {
    throw new Error(
      `La cuenta tiene rol "${String(usuario.rol)}": solo se vinculan cuentas con rol alumno.`,
    );
  }

  const usuarioActual = typeof usuario.alumnoId === "string" && usuario.alumnoId ? usuario.alumnoId : null;
  const usuarioAlumno = typeof alumno.usuarioId === "string" && alumno.usuarioId ? alumno.usuarioId : null;

  if (usuarioActual === alumnoId) {
    throw new Error("Esta cuenta ya está vinculada a esa ficha.");
  }
  if (usuarioActual) {
    throw new Error("Esta cuenta ya está vinculada a otra ficha de alumno. Desvincularla primero.");
  }
  if (usuarioAlumno === uid) {
    throw new Error("Esa ficha ya está vinculada a esta cuenta.");
  }
  if (usuarioAlumno) {
    throw new Error("Esa ficha de alumno ya está vinculada a otra cuenta.");
  }
  if (alumno.activo === false) {
    throw new Error("La ficha de alumno está inactiva: no se puede vincular.");
  }

  const cursoId = typeof alumno.cursoId === "string" ? alumno.cursoId : "";
  if (!cursoId) {
    throw new Error("La ficha de alumno no tiene curso asignado: asignale un curso antes de vincular.");
  }

  const batch = writeBatch(db);
  batch.update(usuarioRef, { alumnoId, updatedAt: serverTimestamp() });
  batch.update(alumnoRef, { usuarioId: uid, actualizadoEn: serverTimestamp() });
  await batch.commit();

  return { uid, alumnoId, cursoId };
}
