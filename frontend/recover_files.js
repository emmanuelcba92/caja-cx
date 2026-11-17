// ISOLATION-BLOCKED: script de mantenimiento bloqueado (Etapa 1). Apunta a PRODUCCION (caja-de-cirugia).
// No se elimina, pero NO puede ejecutarse desde el rediseño. Rehabilitarlo requiere autorizacion explicita,
// reemplazar su configuracion por la del entorno aislado y retirar este bloqueo.
throw new Error('[ISOLATION-BLOCKED] Script de mantenimiento bloqueado: apunta a produccion. Ver DESPLIEGUE.md.');

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { getStorage, ref, listAll, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
    apiKey: "<APIKEY-PRODUCCION-REDACTADA>",
    authDomain: "caja-de-cirugia.firebaseapp.com",
    projectId: "caja-de-cirugia",
    storageBucket: "caja-de-cirugia.firebasestorage.app",
    messagingSenderId: "1004973900727",
    appId: "1:1004973900727:web:8c0dba6c98a458991c5e32"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

async function registerExisting() {
    console.log("🚀 Iniciando recuperación de archivos existentes en Firebase...");
    
    const folders = [
        { path: 'firmas', type: 'signature' },
        { path: 'consentimientos', type: 'consent' }
    ];

    for (const folder of folders) {
        console.log(`\n📂 Escaneando carpeta: ${folder.path}...`);
        const storageRef = ref(storage, folder.path);
        
        try {
            const list = await listAll(storageRef);
            console.log(`Se encontraron ${list.items.length} archivos.`);

            for (const item of list.items) {
                // Check if already registered
                const q = query(collection(db, 'storage_files'), where('name', '==', item.name));
                const existing = await getDocs(q);
                
                if (existing.empty) {
                    const url = await getDownloadURL(item);
                    await addDoc(collection(db, 'storage_files'), {
                        name: item.name,
                        url: url,
                        type: folder.type,
                        uploadedAt: new Date().toISOString(),
                        recovered: true
                    });
                    console.log(`✅ Registrado: ${item.name}`);
                } else {
                    console.log(`⏭️ Ya existe: ${item.name}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error en carpeta ${folder.path}:`, error.message);
        }
    }

    console.log("\n✨ Recuperación finalizada. Recarga la página y verás todo de nuevo.");
    process.exit(0);
}

registerExisting();
