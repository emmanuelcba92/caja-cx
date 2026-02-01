import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, addDoc, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';

const MigrationTool = () => {
    const [status, setStatus] = useState('idle'); // idle, working, done, error
    const [log, setLog] = useState([]);

    const addLog = (msg) => setLog(prev => [...prev, msg]);

    const migrate = async () => {
        if (!window.confirm("¿Seguro que deseas migrar los datos? Esto subirá la base de datos local a Firebase.")) return;
        setStatus('working');
        setLog([]);

        try {
            // 1. Fetch Professionals
            addLog("Obteniendo profesionales locales...");
            const profRes = await fetch('http://127.0.0.1:5000/profesionales');
            const profesionales = await profRes.json();

            // Check if already migrated to avoid duplicates? 
            // Better to wipe? No, let's just append and user can wipe if needed.
            // Or use batch.

            const profMap = {}; // LocalID -> FirestoreID (if needed, but we store names mostly)

            addLog(`Encontrados ${profesionales.length} profesionales. Subiendo...`);

            for (const p of profesionales) {
                // Check if exists by name
                const q = query(collection(db, "profesionales"), where("nombre", "==", p.nombre));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    await addDoc(collection(db, "profesionales"), {
                        nombre: p.nombre,
                        categoria: p.categoria || 'ORL'
                    });
                    addLog(`[OK] Profesional ${p.nombre} subido.`);
                } else {
                    addLog(`[SKIP] Profesional ${p.nombre} ya existe.`);
                }
            }

            // 2. Fetch Caja Entries (History - All time)
            // We need a way to get ALL entries. app.py has /caja endpoint.
            // Let's request a wide range or just all. GET /caja returns all if no date? 
            // Checked app.py: if no date arg, it returns all? No, it looks like it might default to today or something?
            // "if date_str: ... elif start_date: ... else: query = query.filter... include_manual logic..."
            // Actually app.py code:
            // if date_str: filter
            // elif start_date: filter
            // else: (no filter on date, implies ALL) -> "entradas = query.order_by...all()"
            // So fetching /caja?include_manual=true should get EVERYTHING.

            addLog("Obteniendo historial completo...");
            const cajaRes = await fetch('http://127.0.0.1:5000/caja?include_manual=true&start_date=2000-01-01'); // Safe broad range
            const entradas = await cajaRes.json();

            addLog(`Encontradas ${entradas.length} entradas. Subiendo por lotes...`);

            // Batch writes (limit 500)
            const batchSize = 100;
            let currentBatch = writeBatch(db);
            let count = 0;
            let total = 0;

            for (const entry of entradas) {
                // We recreate the object for Firestore
                const docRef = doc(collection(db, "caja")); // Auto ID

                // Clean data
                const newEntry = {
                    fecha: entry.fecha, // "YYYY-MM-DD" string is fine for now, or convert to Timestamp? Strings are easier to query for equality.
                    paciente: entry.paciente,
                    dni: entry.dni || '',
                    obra_social: entry.obra_social || '',
                    comentario: entry.comentario || '',

                    // Profs (Store Names directly for simplicity in querying, or IDs?)
                    // Current app uses names heavily.
                    prof_1: entry.prof_1 || '',
                    prof_2: entry.prof_2 || '',
                    anestesista: entry.anestesista || '',

                    // Amounts
                    pesos: entry.pesos || 0,
                    dolares: entry.dolares || 0,

                    liq_prof_1: entry.liq_prof_1 || 0,
                    liq_prof_1_currency: entry.liq_prof_1_currency || 'ARS',

                    liq_prof_2: entry.liq_prof_2 || 0,
                    liq_prof_2_currency: entry.liq_prof_2_currency || 'ARS',

                    liq_anestesista: entry.liq_anestesista || 0,
                    liq_anestesista_currency: entry.liq_anestesista_currency || 'ARS',

                    coat_pesos: entry.coat_pesos || 0,
                    coat_dolares: entry.coat_dolares || 0,

                    imported_id: entry.id // Keep reference just in case
                };

                currentBatch.set(docRef, newEntry);
                count++;
                total++;

                if (count >= batchSize) {
                    await currentBatch.commit();
                    addLog(`Lote de ${count} subido.`);
                    currentBatch = writeBatch(db); // Reset
                    count = 0;
                }
            }

            if (count > 0) {
                await currentBatch.commit();
                addLog(`Lote final de ${count} subido.`);
            }

            addLog("¡Migración completada con éxito!");
            setStatus('done');

        } catch (error) {
            console.error(error);
            addLog(`ERROR: ${error.message}`);
            setStatus('error');
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto bg-white shadow-lg rounded-xl my-10 border border-blue-200">
            <h2 className="text-2xl font-bold mb-4 text-blue-800">Herramienta de Migración a Firebase</h2>
            <p className="mb-4 text-slate-600">
                Esta herramienta leerá los datos de tu servidor local (Python) y los subirá a la nube (Firestore).
                Asegúrate de que el servidor local esté corriendo.
            </p>

            {status === 'idle' && (
                <button
                    onClick={migrate}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 w-full"
                >
                    Iniciar Migración
                </button>
            )}

            {status === 'working' && (
                <div className="text-center text-blue-600 font-bold animate-pulse">
                    Migrando datos... por favor espera...
                </div>
            )}

            {status === 'done' && (
                <div className="text-center text-green-600 font-bold text-xl mb-4">
                    ✅ Migración Completada
                </div>
            )}

            <div className="mt-4 bg-slate-100 p-4 rounded h-64 overflow-y-auto font-mono text-xs border border-slate-300">
                {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
};

export default MigrationTool;
