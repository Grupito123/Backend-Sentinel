'use strict';

const NOMBRES = [
  'Juan', 'María', 'Carlos', 'Ana', 'Lucas', 'Sofía', 'Tomás', 'Valentina',
  'Santiago', 'Camila', 'Facundo', 'Lucía', 'Mateo', 'Julieta', 'Nicolás', 'Franca',
  'Emiliano', 'Agustina', 'Gonzalo', 'Rocío', 'Bruno', 'Martina', 'Thiago', 'Pilar',
  'Joaquín', 'Celeste', 'Bautista', 'Delfina', 'Ignacio', 'Malena',
];

const APELLIDOS = [
  'Pérez', 'López', 'Gómez', 'Martínez', 'Rodríguez', 'Fernández', 'Díaz', 'Sosa',
  'Romero', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Benítez', 'Acosta',
  'Medina', 'Herrera', 'Aguirre', 'Pereyra', 'Giménez', 'Molina', 'Silva', 'Castro',
  'Ortiz', 'Rojas', 'Silva', 'Vega', 'Mansilla', 'Quiroga',
];

// año → cantidad de divisiones (secundaria técnica):
//   ciclo básico 1°-3°: 5 divisiones por año · 4°: 4 · 5°: 3 · 6°: 2 · 7°: 2
//   → 26 cursos, con id "4°2" (mismo formato que horarios/QR/registro)
const DIVISIONES_POR_ANIO = { 1: 5, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2, 7: 2 };
const turnos = ['mañana', 'tarde'];

const pad = (n, largo = 3) => String(n).padStart(largo, '0');

const construirCursos = () => {
  const cursos = [];

  Object.entries(DIVISIONES_POR_ANIO).forEach(([anio, cantidad], iAnio) => {
    for (let division = 1; division <= cantidad; division += 1) {
      const id = `${anio}°${division}`;
      cursos.push({
        id,
        nombre: `${anio}° ${division}`,
        anio: Number(anio),
        division: String(division),
        turno: turnos[(iAnio + division) % turnos.length],
        // ciclo básico sin orientación; en el superior la división 2 es
        // Informática y el resto Electromecánica (igual que malla.especialidadDe)
        orientacion: Number(anio) <= 3 ? '' : division === 2 ? 'Informática' : 'Electromecánica',
        activo: true,
        anioLectivo: 2026,
        preceptorIds: [],
        docenteIds: [],
        materiaIds: [],
      });
    }
  });

  return cursos;
};

const construirUsuarios = () => [
  {
    id: 'usr_admin',
    uid: 'usr_admin',
    nombre: 'Marcela',
    apellido: 'Quiroga',
    email: 'admin@escuela.edu',
    dni: '20111222',
    rol: 'administrador',
    telefono: '+54 11 5555-0001',
    activo: true,
    alumnoId: null,
  },
  {
    id: 'usr_directivo',
    uid: 'usr_directivo',
    nombre: 'Héctor',
    apellido: 'Bianchi',
    email: 'directivo@escuela.edu',
    dni: '18988777',
    rol: 'directivo',
    telefono: '+54 11 5555-0002',
    activo: true,
    alumnoId: null,
  },
  {
    id: 'usr_preceptor_3a',
    uid: 'usr_preceptor_3a',
    nombre: 'Silvia',
    apellido: 'Núñez',
    email: 'preceptor@escuela.edu',
    dni: '25444333',
    rol: 'preceptor',
    telefono: '+54 11 5555-0003',
    activo: true,
    alumnoId: null,
  },
  {
    id: 'usr_preceptor_4a',
    uid: 'usr_preceptor_4a',
    nombre: 'Jorge',
    apellido: 'Ledesma',
    email: 'preceptor4@escuela.edu',
    dni: '22111999',
    rol: 'preceptor',
    telefono: '+54 11 5555-0004',
    activo: true,
    alumnoId: null,
  },
  {
    id: 'usr_profesor_prog',
    uid: 'usr_profesor_prog',
    nombre: 'Daniela',
    apellido: 'Ferreyra',
    email: 'profesor@escuela.edu',
    dni: '27666777',
    rol: 'profesor',
    telefono: '+54 11 5555-0005',
    activo: true,
    alumnoId: null,
  },
  {
    id: 'usr_profesor_mate',
    uid: 'usr_profesor_mate',
    nombre: 'Raúl',
    apellido: 'Ibáñez',
    email: 'profesormate@escuela.edu',
    dni: '24333888',
    rol: 'profesor',
    telefono: '+54 11 5555-0006',
    activo: true,
    alumnoId: null,
  },
  {
    id: 'usr_profesor_lengua',
    uid: 'usr_profesor_lengua',
    nombre: 'Patricia',
    apellido: 'Sotelo',
    email: 'profesorlengua@escuela.edu',
    dni: '21009911',
    rol: 'profesor',
    telefono: '+54 11 5555-0007',
    activo: true,
    alumnoId: null,
  },
];

const PRECEPTORES_POR_CURSO = {
  '3°1': ['usr_preceptor_3a'],
  '3°2': ['usr_preceptor_3a'],
  '4°1': ['usr_preceptor_4a'],
  '4°2': ['usr_preceptor_4a'],
  '5°1': ['usr_preceptor_4a'],
  '5°2': ['usr_preceptor_4a'],
};

const MATERIAS_BASE = [
  { codigo: 'PROG', nombre: 'Programación', docenteId: 'usr_profesor_prog' },
  { codigo: 'MATE', nombre: 'Matemática', docenteId: 'usr_profesor_mate' },
  { codigo: 'LENG', nombre: 'Lengua y Literatura', docenteId: 'usr_profesor_lengua' },
  { codigo: 'FIS', nombre: 'Física', docenteId: 'usr_profesor_mate' },
  { codigo: 'QUIM', nombre: 'Química', docenteId: 'usr_profesor_prog' },
];

const construirMaterias = (cursos) =>
  cursos.flatMap((curso) =>
    MATERIAS_BASE.map((materia, i) => ({
      id: `mat_${curso.id}_${materia.codigo}`.toLowerCase(),
      nombre: materia.nombre,
      codigo: `${materia.codigo}-${curso.id}`,
      cursoId: curso.id,
      docenteId: materia.docenteId,
      activo: true,
      orden: i,
    }))
  );

const construirAlumnos = (cursos, anio = 2026) => {
  const alumnos = [];
  let indice = 0;

  cursos.forEach((curso) => {
    const cantidad = 6 + (indice % 3);

    for (let i = 0; i < cantidad; i += 1) {
      const legajo = `${anio}-${pad(alumnos.length + 1, 4)}`;
      alumnos.push({
        id: `alu_${legajo}`,
        nombre: NOMBRES[(indice * 3 + i) % NOMBRES.length],
        apellido: APELLIDOS[(indice * 5 + i) % APELLIDOS.length],
        dni: String(32000000 + alumnos.length * 137),
        legajo,
        email: `alumno${legajo}@escuela.edu`,
        telefono: '',
        fechaNacimiento: new Date(2008 - Math.floor(curso.anio / 2) + (i % 3), i % 12, (i % 27) + 1),
        cursoId: curso.id,
        activo: true,
        fechaIngreso: new Date(anio - curso.anio, 2, 1),
        usuarioId: null,
      });
    }

    indice += 1;
  });

  return alumnos;
};

const construirInscripciones = (alumnos, anio = 2026) =>
  alumnos.map((alumno) => ({
    id: `ins_${alumno.id}`,
    alumnoId: alumno.id,
    cursoId: alumno.cursoId,
    anioLectivo: anio,
    fechaInicio: alumno.fechaIngreso,
    fechaFin: null,
    activo: true,
  }));

const HORAS = [
  ['07:20', '08:40'],
  ['08:45', '10:05'],
  ['10:10', '11:30'],
  ['13:00', '14:20'],
];

const construirHorarios = (cursos, materias) => {
  const horarios = [];

  cursos.forEach((curso) => {
    const delCurso = materias.filter((m) => m.cursoId === curso.id);

    delCurso.forEach((materia, i) => {
      const [horaInicio, horaFin] = HORAS[i % HORAS.length];
      const diaSemana = (i % 5) + 1;

      horarios.push({
        id: `hor_${curso.id}_${materia.codigo}_${diaSemana}`.toLowerCase(),
        cursoId: curso.id,
        materiaId: materia.id,
        docenteId: materia.docenteId,
        diaSemana,
        horaInicio,
        horaFin,
        aula: `Aula ${100 + i}`,
        activo: true,
      });
    });
  });

  return horarios;
};

module.exports = {
  construirUsuarios,
  construirCursos,
  construirMaterias,
  construirAlumnos,
  construirInscripciones,
  construirHorarios,
  DIVISIONES_POR_ANIO,
  PRECEPTORES_POR_CURSO,
  MATERIAS_BASE,
  ANIO_LECTIVO: 2026,
};
