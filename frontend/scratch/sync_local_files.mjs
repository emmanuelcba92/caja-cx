import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import fs from 'fs';
import path from 'path';

const firebaseConfig = {
  apiKey: "AIzaSyCc1dRzrs8sg9naeCLMBjZMPMS1tMjIF3w",
  authDomain: "caja-de-cirugia.firebaseapp.com",
  projectId: "caja-de-cirugia",
  storageBucket: "caja-de-cirugia.firebasestorage.app",
  messagingSenderId: "1004973900727",
  appId: "1:1004973900727:web:8c0dba6c98a458991c5e32"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function syncFiles() {
  const firmasPath = 'e:/Proyectos con IA/Antigravity/Caja/frontend/public/firmas';
  const consentPath = 'e:/Proyectos con IA/Antigravity/Caja/frontend/public/consentimientos';

  // 1. Sync Firmas
  const firmas = fs.readdirSync(firmasPath);
  for (const file of firmas) {
    if (file.endsWith('.png')) {
      const name = file.replace('.png', '').replace(/_/g, ' ').toUpperCase();
      console.log(`Syncing Signature: ${name}`);
      
      const q = query(collection(db, 'storage_files'), where('name', '==', name), where('type', '==', 'signature'));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        await addDoc(collection(db, 'storage_files'), {
          name: name,
          url: `/firmas/${file}`,
          type: 'signature',
          category: 'Firma',
          uploadedAt: new Date().toISOString()
        });
      }
    }
  }

  // 2. Sync Consentimientos
  const consents = fs.readdirSync(consentPath);
  for (const file of consents) {
    if (file.endsWith('.pdf')) {
      const name = file.replace('.pdf', '');
      console.log(`Syncing Consent: ${name}`);

      const q = query(collection(db, 'storage_files'), where('name', '==', name), where('type', '==', 'consent'));
      const snap = await getDocs(q);

      if (snap.empty) {
        await addDoc(collection(db, 'storage_files'), {
          name: name,
          url: `/consentimientos/${file}`,
          type: 'consent',
          category: 'Consentimiento',
          uploadedAt: new Date().toISOString()
        });
      }
    }
  }

  console.log("Sync complete!");
  process.exit(0);
}

syncFiles().catch(console.error);
