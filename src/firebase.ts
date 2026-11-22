import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function syncGoogleAuthLinkToFirestore(
  firebaseUser: FirebaseUser,
  evasionUserId: string
): Promise<void> {
  const safeUid = (firebaseUser.uid || '').trim().slice(0, 128);
  const safeEvasionId = (evasionUserId || '').trim().slice(0, 64);
  if (!safeUid || !/^[a-zA-Z0-9_-]+$/.test(safeUid)) return;
  if (!safeEvasionId || !/^[a-zA-Z0-9_-]+$/.test(safeEvasionId)) return;

  const rawName = (
    firebaseUser.displayName ||
    firebaseUser.email?.split('@')[0] ||
    'Membre Google'
  )
    .trim()
    .slice(0, 64);
  const safeDisplayName = rawName.length > 0 ? rawName : 'Membre Google';
  const docPath = `googleAuthLinks/${safeUid}`;
  const docRef = doc(db, 'googleAuthLinks', safeUid);

  let exists = false;
  try {
    const snap = await getDoc(docRef);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }

  if (!exists) {
    try {
      await setDoc(docRef, {
        uid: safeUid,
        evasionUserId: safeEvasionId,
        displayName: safeDisplayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }
  } else {
    try {
      await updateDoc(docRef, {
        evasionUserId: safeEvasionId,
        displayName: safeDisplayName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

const LEGACY_SAVED_GOOGLE_ACCOUNTS_KEY = 'evasion_google_accounts_v1';

try {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_SAVED_GOOGLE_ACCOUNTS_KEY);
  }
} catch {
  // ignore storage errors
}

