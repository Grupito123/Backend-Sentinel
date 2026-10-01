import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { COLLECTIONS, collectionRef, documentRef, normalizeText, withoutUndefined } from './helpers';

const ref = () => collectionRef(COLLECTIONS.STUDENTS);

/**
 * Alta de ficha de alumno por parte de la institucion (admin/directivo).
 *
 * No escribe `usuarioId`: la vinculacion con la cuenta la hace el
 * administrador despues, en forma atomica, con
 * `users.vincularAlumnoCuenta`. Dejar ambos pasos separados evita estados
 * intermedios donde un lado dice una cosa y el otro otra.
 */
export const crearAlumno = async ({
  nombre,
  apellido,
  dni = '',
  legajo = '',
  fechaNacimiento = null,
  email = '',
  telefono = '',
  cursoId = '',
  activo = true,
}) => {
  const documento = await addDoc(ref(), {
    nombre,
    apellido,
    dni,
    legajo,
    fechaNacimiento,
    email,
    telefono,
    cursoId,
    activo,
    fechaIngreso: serverTimestamp(),
    creadoPor: auth.currentUser?.uid ?? null,
  });

  return documento.id;
};

/**
 * Alta publica de alumno (Opcion B): crea la cuenta de Authentication y el
 * perfil en `alumnos/{uid}` (el ID del documento ES el uid). No escribe nada en
 * `usuarios/`. El curso y el legajo los asigna la institucion despues; aca
 * nacen en null y "" respectivamente, como exige la regla de `alumnos`.
 */
export const crearAlumnoPublico = async ({
  email,
  password,
  nombre,
  apellido,
  dni = '',
  telefono = '',
}) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  await updateProfile(credential.user, { displayName: `${nombre} ${apellido}`.trim() });

  await setDoc(
    documentRef(COLLECTIONS.STUDENTS, uid),
    {
      nombre,
      apellido,
      dni,
      legajo: '',
      email,
      telefono,
      cursoId: null,
      activo: true,
      usuarioId: uid,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    },
    { merge: true }
  );

  return uid;
};

export const obtenerAlumno = async (alumnoId) => {
  if (!alumnoId) return null;
  const snapshot = await getDoc(documentRef(COLLECTIONS.STUDENTS, alumnoId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const obtenerAlumnos = async ({ cursoId, activo = true, limite } = {}) => {
  const filtros = [];
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (activo !== undefined) filtros.push(where('activo', '==', activo));

  let consulta = query(ref(), ...filtros, orderBy('apellido', 'asc'));
  if (limite) consulta = query(consulta, limit(limite));

  const snapshot = await getDocs(consulta);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerAlumnoPorLegajo = async (legajo) => {
  const snapshot = await getDocs(query(ref(), where('legajo', '==', legajo), limit(1)));
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const buscarAlumnos = async (texto, { limite = 20 } = {}) => {
  const term = normalizeText(texto);
  if (!term) return [];

  const snapshot = await getDocs(
    query(
      ref(),
      where('activo', '==', true),
      orderBy('apellido', 'asc'),
      limit(limite)
    )
  );

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((alumno) =>
      [alumno.nombre, alumno.apellido, alumno.dni, alumno.legajo]
        .map(normalizeText)
        .some((campo) => campo.includes(term))
    );
};

export const actualizarAlumno = (alumnoId, cambios) =>
  updateDoc(documentRef(COLLECTIONS.STUDENTS, alumnoId), {
    ...withoutUndefined(cambios),
    actualizadoEn: serverTimestamp(),
  });

export const cambiarCursoAlumno = (alumnoId, cursoId) => actualizarAlumno(alumnoId, { cursoId });

export const obtenerMapaAlumnos = async (alumnoIds) => {
  const ids = [...new Set((alumnoIds ?? []).filter(Boolean))];
  if (!ids.length) return {};

  const pares = await Promise.all(ids.map((id) => getDoc(doc(db, COLLECTIONS.STUDENTS, id))));
  const mapa = {};

  pares.forEach((snapshot, index) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      mapa[ids[index]] = {
        id: snapshot.id,
        nombre: data.nombre,
        apellido: data.apellido,
        nombreCompleto: `${data.nombre ?? ''} ${data.apellido ?? ''}`.trim(),
        cursoId: data.cursoId,
      };
    }
  });

  return mapa;
};

export const contarAlumnosPorCurso = async (cursoIds = []) => {
  const ids = [...new Set(cursoIds.filter(Boolean))];
  if (!ids.length) return {};

  const pares = await Promise.all(
    ids.map((cursoId) => getDocs(query(ref(), where('cursoId', '==', cursoId), where('activo', '==', true))))
  );

  return Object.fromEntries(ids.map((cursoId, index) => [cursoId, pares[index].size]));
};
