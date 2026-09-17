import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// TODO: Reemplazar con tu configuración de Firebase
// Ir a Firebase Console > Project Settings > General > Your apps > Config
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCc1dRzrs8sg9naeCLMBjZMPMS1tMjIF3w",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "caja-de-cirugia.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "caja-de-cirugia",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "caja-de-cirugia.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1004973900727",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1004973900727:web:8c0dba6c98a458991c5e32"
};

// Detectar si estamos en local
export const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const USE_LOCAL_DB = false; // true = localStorage local, false = Firestore en la nube
export const isTestEnv = isLocalEnv && USE_LOCAL_DB;
export const LOCAL_API_URL = 'http://localhost:5001';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Conectar emuladores en desarrollo (opcional)
if (isLocalEnv && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log('[Firebase] Emuladores conectados');
  } catch (e) {
    console.warn('[Firebase] Error conectando emuladores:', e.message);
  }
}

export default app;
