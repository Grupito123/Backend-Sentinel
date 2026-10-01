/**
 * Configuración de Firebase Client SDK para el proyecto existente `centinela-2b390`.
 *
 * Estos valores son los de una app web registrada en Firebase Console y son claves
 * públicas de cliente: el SDK de navegador las necesita para identificar el proyecto.
 * NO son credenciales privadas. Nunca se deben agregar aquí `private_key`, tokens de
 * cuenta de servicio ni archivos de Service Account (esos son de uso exclusivo del
 * Firebase Admin SDK en servidor).
 *
 * Los valores pueden sobrescribirse con variables de entorno `VITE_FIREBASE_*`
 * (ver `.env.example`) sin necesidad de tocar el código.
 */

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export const firebaseConfig: FirebaseClientConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBHxTujglobev6F2SncXWB5Mdi9yP-mE_I',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'centinela-2b390.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'centinela-2b390',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'centinela-2b390.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '1093229568741',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:1093229568741:web:d13a73d7bd461a68122a0c',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-WN7N5YQJGT',
};

export default firebaseConfig;
