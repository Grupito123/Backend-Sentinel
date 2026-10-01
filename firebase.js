import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import firebaseConfig from './firebase.config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let analytics = null;
if (Platform.OS === 'web') {
  const { getAnalytics } = require('firebase/analytics');
  analytics = getAnalytics(app);
}

export { app, auth, db, analytics, firebaseConfig };
export default app;
