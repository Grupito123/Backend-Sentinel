import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth } from '../../firebase';
import { COLLECTIONS, documentRef, withoutUndefined } from './helpers';

/**
 * Documento `padres/{uid}` (Opcion B). El ID del documento ES el uid de
 * Firebase Authentication; `usuarioId` se apunta a si mismo.
 *
 * No se escribe nada en `usuarios/`: el rol del padre se deduce de esta
 * coleccion. `hijoAlumnoId` nace null: la vinculacion con la ficha del hijo la
 * resuelve la administracion despues (el alta nunca auto-vincula).
 */
export const crearPadrePublico = async ({
  email,
  password,
  nombre,
  apellido,
  dni = '',
  telefono = '',
  dniHijo = '',
}) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  await updateProfile(credential.user, { displayName: `${nombre} ${apellido}`.trim() });

  await setDoc(
    documentRef(COLLECTIONS.PADRES, uid),
    {
      usuarioId: uid,
      nombre,
      apellido,
      email,
      dni,
      telefono,
      dniHijo,
      hijoAlumnoId: null,
      activo: true,
      fechaCreacion: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return uid;
};

export const obtenerPadre = async (uid) => {
  if (!uid) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.PADRES, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const actualizarPadre = (uid, cambios) =>
  updateDoc(documentRef(COLLECTIONS.PADRES, uid), {
    ...withoutUndefined(cambios),
    updatedAt: serverTimestamp(),
  });
