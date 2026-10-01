import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { COLLECTIONS, ROLES, collectionRef, documentRef, withoutUndefined } from './helpers';

const ref = () => collectionRef(COLLECTIONS.USERS);

/**
 * DISEÑO A: el alta NUNCA vincula.
 *
 * Crea `usuarios/{uid}` con `alumnoId: null`. La ficha de alumno y su curso los
 * asigna la institucion mas tarde, con `vincularAlumnoCuenta` (solo admin).
 * No se escribe `alumnos/{alumnoId}.usuarioId` desde aca: una escritura suelta
 * dejaria los dos lados de la vinculacion inconsistentes.
 */
export const crearUsuario = async ({
  email,
  password,
  nombre,
  apellido,
  dni = '',
  rol = ROLES.ALUMNO,
  telefono = '',
  activo = true,
}) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  await updateProfile(credential.user, { displayName: `${nombre} ${apellido}`.trim() });

  await setDoc(
    documentRef(COLLECTIONS.USERS, uid),
    {
      uid,
      nombre,
      apellido,
      email,
      dni,
      rol,
      telefono,
      activo,
      alumnoId: null,
      fechaCreacion: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return uid;
};

export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

export const logout = () => signOut(auth);

export const recuperarPassword = (email) => sendPasswordResetEmail(auth, email);

export const obtenerUsuario = async (uid) => {
  if (!uid) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.USERS, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const listarUsuarios = async ({ rol, activo } = {}) => {
  const filtros = [];
  if (rol) filtros.push(where('rol', '==', rol));
  if (activo !== undefined) filtros.push(where('activo', '==', activo));

  const consulta = filtros.length
    ? query(ref(), ...filtros, orderBy('apellido', 'asc'))
    : query(ref(), orderBy('apellido', 'asc'));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const actualizarUsuario = (uid, cambios) =>
  updateDoc(documentRef(COLLECTIONS.USERS, uid), {
    ...withoutUndefined(cambios),
    updatedAt: serverTimestamp(),
  });

export const desactivarUsuario = (uid) =>
  updateDoc(documentRef(COLLECTIONS.USERS, uid), { activo: false, updatedAt: serverTimestamp() });

/**
 * DISEÑO A: vinculacion usuario <-> alumno, exclusiva del administrador.
 *
 * Escribe los DOS lados en una sola operacion atomica (`writeBatch`):
 *   1. usuarios/{uid}.alumnoId   = alumnoId
 *   2. alumnos/{alumnoId}.usuarioId = uid
 *
 * Las reglas garantizan que solo `esAdmin()` puede hacer esto (el alumno no
 * tiene rama de auto-reclamacion y `alumnos.usuarioId` queda fuera del
 * alcance de todo otro rol), pero los pre-chequeos de abajo son necesarios:
 * son la garantia de que la vinculacion sea coherente y no una carrera.
 *
 * Nota sobre las reglas: `get()` devuelve el estado previo al batch, asi que
 * NO pueden validar que los dos lados quedaron consistentes. Eso se resuelve
 * aca, leyendo antes de escribir.
 *
 * `cursoId` NO se escribe ni se acepta: sale siempre de alumnos/{alumnoId}.
 *
 * @throws {Error} con un mensaje legible si falla cualquier pre-chequeo.
 */
export const vincularAlumnoCuenta = async (uid, alumnoId) => {
  if (!uid) throw new Error('Falta el uid del usuario.');
  if (!alumnoId) throw new Error('Falta el alumnoId.');

  const usuarioRef = documentRef(COLLECTIONS.USERS, uid);
  const alumnoRef = documentRef(COLLECTIONS.STUDENTS, alumnoId);

  const [usuarioSnap, alumnoSnap] = await Promise.all([
    getDoc(usuarioRef),
    getDoc(alumnoRef),
  ]);

  if (!usuarioSnap.exists()) throw new Error('El usuario no existe.');
  if (!alumnoSnap.exists()) throw new Error('La ficha de alumno no existe.');

  const usuario = usuarioSnap.data();
  const alumno = alumnoSnap.data();

  if (usuario.rol !== ROLES.ALUMNO) {
    throw new Error('La cuenta no tiene rol alumno: no se puede vincular.');
  }
  if (usuario.alumnoId) {
    throw new Error(
      usuario.alumnoId === alumnoId
        ? 'La cuenta ya esta vinculada a ese alumno.'
        : 'La cuenta ya esta vinculada a otra ficha de alumno.'
    );
  }
  if (alumno.usuarioId) {
    throw new Error(
      alumno.usuarioId === uid
        ? 'Esa ficha ya esta vinculada a esta cuenta.'
        : 'Esa ficha de alumno ya esta vinculada a otra cuenta.'
    );
  }
  if (alumno.activo === false) {
    throw new Error('La ficha de alumno esta inactiva: no se puede vincular.');
  }
  if (!alumno.cursoId) {
    throw new Error('La ficha de alumno no tiene curso asignado.');
  }

  const batch = writeBatch(db);
  batch.update(usuarioRef, { alumnoId, updatedAt: serverTimestamp() });
  batch.update(alumnoRef, { usuarioId: uid, actualizadoEn: serverTimestamp() });
  await batch.commit();

  return { uid, alumnoId, cursoId: alumno.cursoId };
};

export const perfilActual = () => obtenerUsuario(auth.currentUser?.uid);

export const tieneRol = (usuario, ...roles) => Boolean(usuario?.rol) && roles.includes(usuario.rol);
