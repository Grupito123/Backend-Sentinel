import { addDoc, getDoc, getDocs, limit as limitQuery, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import {
  COLLECTIONS,
  collectionRef,
  documentRef,
  randomCode,
  startOfDay,
  toDateKey,
  toTimestamp,
  withoutUndefined,
} from './helpers';

const COLECCION = COLLECTIONS.QR_SESSIONS;
const ref = () => collectionRef(COLECCION);

export const HORA_LIMITE_TARDE = 8;

export const crearSesionQr = async ({
  cursoId,
  materiaId = null,
  creadoPor,
  fecha,
  horaInicio,
  horaFin = null,
  duracionMinutos = 15,
  ubicacion = null,
  activo = true,
  codigo = randomCode(),
}) => {
  const inicio = horaInicio ?? new Date();
  const fin = horaFin ?? new Date(inicio.getTime() + duracionMinutos * 60 * 1000);
  const claveFecha = toDateKey(fecha ?? inicio);

  const documento = await addDoc(ref(), {
    cursoId,
    materiaId,
    creadoPor,
    fecha: toTimestamp(startOfDay(inicio)),
    fechaKey: claveFecha,
    horaInicio: toTimestamp(inicio),
    horaFin: toTimestamp(fin),
    codigo: codigo.toUpperCase(),
    activo,
    ubicacion,
    creadoEn: serverTimestamp(),
  });

  return { id: documento.id, codigo: codigo.toUpperCase() };
};

export const obtenerSesionQr = async (sesionId) => {
  if (!sesionId) return null;
  const snapshot = await getDoc(documentRef(COLECCION, sesionId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
};

export const obtenerSesionPorCodigo = async (codigo) => {
  if (!codigo) return null;
  const snapshot = await getDocs(query(ref(), where('codigo', '==', String(codigo).toUpperCase()), limitQuery(1)));
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const obtenerSesionesDelDia = async (fechaKey, { cursoId, activo } = {}) => {
  const filtros = [where('fechaKey', '==', fechaKey)];
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));
  if (activo !== undefined) filtros.push(where('activo', '==', activo));

  const snapshot = await getDocs(query(ref(), ...filtros, orderBy('horaInicio', 'asc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const obtenerSesionVigenteDeCurso = async (cursoId, { fecha = new Date() } = {}) => {
  if (!cursoId) return null;

  const sesiones = await obtenerSesionesDelDia(toDateKey(fecha), { cursoId, activo: true });
  const ahora = fecha.getTime();

  return (
    sesiones.find((sesion) => {
      const inicio = sesion.horaInicio?.toDate?.();
      const fin = sesion.horaFin?.toDate?.();
      return Boolean(inicio && fin) && ahora >= inicio.getTime() && ahora <= fin.getTime();
    }) ?? null
  );
};

export const obtenerSesionesActivas = async ({ cursoId } = {}) => {
  const filtros = [where('activo', '==', true)];
  if (cursoId) filtros.push(where('cursoId', '==', cursoId));

  const snapshot = await getDocs(query(ref(), ...filtros, orderBy('horaInicio', 'desc'), limitQuery(25)));
  const ahora = new Date();

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((sesion) => {
      const fin = sesion.horaFin?.toDate?.() ?? new Date();
      return fin >= ahora;
    });
};

export const cerrarSesionQr = (sesionId) =>
  updateDoc(documentRef(COLECCION, sesionId), { activo: false, cerradoEn: serverTimestamp() });

export const actualizarSesionQr = (sesionId, cambios) =>
  updateDoc(documentRef(COLECCION, sesionId), { ...withoutUndefined(cambios), actualizadoEn: serverTimestamp() });

export const validarSesionQr = async (codigo, { fecha = new Date(), margenToleranciaMinutos = 0 } = {}) => {
  const sesion = await obtenerSesionPorCodigo(codigo);

  if (!sesion) return { valida: false, razon: 'codigo_invalido', sesion: null };
  if (!sesion.activo) return { valida: false, razon: 'sesion_inactiva', sesion };

  const inicio = sesion.horaInicio?.toDate?.() ?? null;
  const fin = sesion.horaFin?.toDate?.() ?? null;
  if (!inicio) return { valida: false, razon: 'sesion_sin_horario', sesion };

  const ahora = fecha;
  const tolerancia = margenToleranciaMinutos * 60 * 1000;

  if (ahora.getTime() < inicio.getTime() - tolerancia) {
    return { valida: false, razon: 'aun_no_comienza', sesion };
  }

  if (fin && ahora.getTime() > fin.getTime() + tolerancia) {
    return { valida: false, razon: 'sesion_terminada', sesion };
  }

  if (toDateKey(inicio) !== toDateKey(ahora)) {
    return { valida: false, razon: 'otra_fecha', sesion };
  }

  return { valida: true, razon: null, sesion };
};

export const validarAlumnoEnCurso = async ({ alumnoId, cursoId }) => {
  if (!alumnoId || !cursoId) return { valida: false, razon: 'datos_incompletos' };

  const snapshot = await getDoc(documentRef(COLLECTIONS.STUDENTS, alumnoId));
  if (!snapshot.exists()) return { valida: false, razon: 'alumno_inexistente' };

  const alumno = snapshot.data();
  if (alumno.activo === false) return { valida: false, razon: 'alumno_inactivo' };
  if (alumno.cursoId !== cursoId) return { valida: false, razon: 'alumno_de_otro_curso' };

  return { valida: true, razon: null, alumno: { id: snapshot.id, ...alumno } };
};
