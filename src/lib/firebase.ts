import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

// These values are public Firebase client configuration. Override them per
// environment with VITE_FIREBASE_* variables when deploying another project.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAUidt5YsvX7PWziSBL6MQlI3CiuUfZJt8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ignite-2d2dc.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ignite-2d2dc',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ignite-2d2dc.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '432046363093',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:432046363093:web:45f8797cc66543a941ed5c',
};

// Initialize Firebase (singleton pattern to prevent re-initialization in HMR)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google using popup
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Sign out current Firebase user
 */
export async function signOutFirebaseUser(): Promise<void> {
  await signOut(auth);
}

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };

