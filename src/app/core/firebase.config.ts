import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported } from 'firebase/analytics';
import { Auth, getAuth } from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

function getEnvVal(key: string, fallback: string): string {
  try {
    const proc = (globalThis as any).process;
    if (proc && proc.env && proc.env[key]) {
      return proc.env[key];
    }
  } catch {
    // process is not defined in browser
  }
  return fallback;
}

export const firebaseConfig = {
  apiKey: getEnvVal('NG_APP_FIREBASE_API_KEY', 'AIzaSyAa799JlSn_dmKmNv5aYmAqgfLd4MA9H8U'),
  authDomain: getEnvVal('NG_APP_FIREBASE_AUTH_DOMAIN', 'soulfudy-demo.firebaseapp.com'),
  projectId: getEnvVal('NG_APP_FIREBASE_PROJECT_ID', 'soulfudy-demo'),
  storageBucket: getEnvVal('NG_APP_FIREBASE_STORAGE_BUCKET', 'soulfudy-demo.firebasestorage.app'),
  messagingSenderId: getEnvVal('NG_APP_FIREBASE_MESSAGING_SENDER_ID', '228475326792'),
  appId: getEnvVal('NG_APP_FIREBASE_APP_ID', '1:228475326792:web:e6350455c8da058a2f637d'),
  measurementId: getEnvVal('NG_APP_FIREBASE_MEASUREMENT_ID', 'G-8DGZRZF5NV')
};

export const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const firestoreDb: Firestore = (() => {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch {
    return getFirestore(firebaseApp);
  }
})();
export const storageDb: FirebaseStorage = getStorage(firebaseApp);
export const authDb: Auth = getAuth(firebaseApp);

let analyticsInstance: Promise<Analytics | null> | null = null;

export function initializeFirebaseAnalytics(): Promise<Analytics | null> {
  if (!analyticsInstance) {
    analyticsInstance = typeof window === 'undefined'
      ? Promise.resolve(null)
      : isSupported()
          .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
          .catch(() => null);
  }

  return analyticsInstance;
}
