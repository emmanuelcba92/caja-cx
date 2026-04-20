import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Configuración de Firebase - CXCOAT Mobile
// Los valores son consistentes con el proyecto 'caja-de-cirugia'
const firebaseConfig = {
    apiKey: "AIzaSyCc1dRzrs8sg9naeCLMBjZMPMS1tMjIF3w",
    authDomain: "caja-de-cirugia.firebaseapp.com",
    projectId: "caja-de-cirugia",
    storageBucket: "caja-de-cirugia.firebasestorage.app",
    messagingSenderId: "1004973900727",
    appId: "1:1004973900727:android:eb3b669d952dd1c41c5e32" // ID de Android detectado
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
