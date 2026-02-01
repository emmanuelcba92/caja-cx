import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCc1dRzrs8sg9naeCLMBjZMPMS1tMjIF3w",
    authDomain: "caja-de-cirugia.firebaseapp.com",
    projectId: "caja-de-cirugia",
    storageBucket: "caja-de-cirugia.firebasestorage.app",
    messagingSenderId: "1004973900727",
    appId: "1:1004973900727:web:8c0dba6c98a458991c5e32"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Exponer db para scripts de consola (temporal)
if (typeof window !== 'undefined') {
    window.__FIREBASE_DB__ = db;
}
