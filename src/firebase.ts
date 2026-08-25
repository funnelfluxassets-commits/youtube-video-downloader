import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyPlaceholderForDemoOnlyKey12345',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tubedownloader.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tubedownloader',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tubedownloader.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '100000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:100000000000:web:dummyappid123'
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
