import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let firestoreSettings: any = {
  experimentalForceLongPolling: true
};

try {
  firestoreSettings.localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() });
} catch (e) {
  console.warn("Firestore offline persistence failed to initialize (expected in sandboxed iframe):", e);
}

export const db = initializeFirestore(app, firestoreSettings, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
}

export async function loginWithUserId(userId: string, password: string) {
  const email = `${userId.toLowerCase()}@iskcon.app`;
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerSevak(userId: string, password: string) {
  const email = `${userId.toLowerCase()}@iskcon.app`;
  
  const secondaryAppName = 'SecondaryAppForRegistration';
  
  let secondaryApp;
  const existingApps = getApps();
  const found = existingApps.find((a: any) => a.name === secondaryAppName);
  if (found) {
    secondaryApp = found;
  } else {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }
  
  const secondaryAuth = getAuth(secondaryApp);
  // CRITICAL: Stop secondary auth from overwriting current session persistence
  await setPersistence(secondaryAuth, inMemoryPersistence);
  
  const creds = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await secondaryAuth.signOut();
  return creds;
}

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration: Firestore client is offline.");
    } else {
      console.log("Connection test complete (status):", error.message);
    }
  }
}
testConnection();

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: any[];
  }
}

export function handleFirestoreError(error: any, operation: any, path: string | null = null): never {
  const authInfo = auth.currentUser ? {
    userId: auth.currentUser.uid,
    email: auth.currentUser.email || '',
    emailVerified: auth.currentUser.emailVerified,
    isAnonymous: auth.currentUser.isAnonymous,
    providerInfo: auth.currentUser.providerData
  } : {
    userId: 'anonymous',
    email: '',
    emailVerified: false,
    isAnonymous: true,
    providerInfo: []
  };

  const errorInfo: FirestoreErrorInfo = {
    error: error.message || 'Unknown Firestore error',
    operationType: operation,
    path,
    authInfo
  };

  const errorString = JSON.stringify(errorInfo);
  console.error('Firestore Error:', errorString);
  throw new Error(errorString);
}
