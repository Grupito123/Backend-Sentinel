import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from './firebase.config';

const options = firebaseConfig as FirebaseOptions;

/**
 * Reutiliza la app ya inicializada si existe (hot reload de Vite / doble montaje)
 * para evitar el error "Firebase App named '[DEFAULT]' already exists".
 */
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(options);

export const db: Firestore = getFirestore(app);

export const auth: Auth = getAuth(app);

export { firebaseConfig };

export default app;
