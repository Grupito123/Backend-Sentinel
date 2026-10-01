import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { firebaseConfig } from '../firebase.config';
import { COLLECTIONS, type CollectionName } from '../collections';

/**
 * Documento real del proyecto `centinela-2b390` usado para comprobar la conexión.
 * `novedades/nov_actos` existe en la base de datos compartida con la app móvil.
 */
export const CONNECTION_PROBE = {
  collection: COLLECTIONS.NEWS,
  documentId: 'nov_actos',
} as const;

export type FirestoreProbeStatus = 'connected' | 'not-found' | 'unauthenticated' | 'error';

export interface FirestoreProbeResult {
  status: FirestoreProbeStatus;
  path: string;
  projectId: string;
  exists: boolean;
  data: Record<string, unknown> | null;
  error: string | null;
}

/**
 * Lee un documento real de Firestore para verificar que el Client SDK está
 * apuntando al proyecto correcto y que hay salida a la red.
 *
 * Tené en cuenta que `firestore.rules` de este proyecto exige `request.auth != null`
 * para cualquier lectura: sin sesión iniciada la respuesta esperada es
 * `unauthenticated` (PERMISSION_DENIED), lo que igual confirma que el SDK llegó
 * al servidor real de Firestore del proyecto `centinela-2b390`.
 */
export async function testFirestoreConnection(
  probe: { collection: CollectionName; documentId: string } = CONNECTION_PROBE,
): Promise<FirestoreProbeResult> {
  const path = `${probe.collection}/${probe.documentId}`;

  try {
    const snapshot = await getDoc(doc(db, probe.collection, probe.documentId));
    const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;

    return {
      status: snapshot.exists() ? 'connected' : 'not-found',
      path,
      projectId: firebaseConfig.projectId,
      exists: snapshot.exists(),
      data,
      error: null,
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
    const message = error instanceof Error ? error.message : String(error);

    return {
      status: code === 'permission-denied' ? 'unauthenticated' : 'error',
      path,
      projectId: firebaseConfig.projectId,
      exists: false,
      data: null,
      error: `${code}: ${message}`,
    };
  }
}

export default testFirestoreConnection;
