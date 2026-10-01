export { app, auth, db, firebaseConfig } from './firebase';
export { COLLECTIONS, type CollectionName } from './collections';
export { ROLES, type Rol } from './roles';
export { crearUsuario, obtenerPerfil, type CrearUsuarioInput } from './services/usuarios';
export { CONNECTION_PROBE, testFirestoreConnection, type FirestoreProbeResult, type FirestoreProbeStatus } from './services/connection';
