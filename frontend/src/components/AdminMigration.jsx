import React, { useState } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Shield, ArrowRight, CheckCircle2, AlertTriangle, Loader2, Repeat } from 'lucide-react';

const AdminMigration = () => {
    const { isSuperAdmin } = useAuth();
    const [oldEmail, setOldEmail] = useState('');
    const [newEmail, setNewEmail] = useState('egomez@coat.com.ar');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    if (!isSuperAdmin) return null;

    const handleMigrate = async (e) => {
        e.preventDefault();
        if (!window.confirm(`¿Seguro que deseas mover TODO de ${oldEmail} a ${newEmail}?`)) return;

        setLoading(true);
        setError(null);
        setResults(null);

        try {
            // 1. Find UIDs
            const findUid = async (email) => {
                const q = query(collection(db, "profiles"), where("email", "==", email));
                const snap = await getDocs(q);
                if (snap.empty) throw new Error(`No se encontró el perfil para: ${email}`);
                return snap.docs[0].id;
            };

            const oldUid = await findUid(oldEmail);
            const newUid = await findUid(newEmail);

            const collections = [
                { name: "ordenes_internacion", field: "userId" },
                { name: "pedidos_medicos", field: "userId" },
                { name: "profesionales", field: "userId" },
                { name: "user_settings", field: "userId" },
                { name: "caja", field: "userId" },
                { name: "notes", field: "userId" },
                { name: "reminders", field: "userId" },
                { name: "access_grants", field: "ownerUid" }
            ];
            const migrationResults = {};

            for (const collInfo of collections) {
                const q = query(collection(db, collInfo.name), where(collInfo.field, "==", oldUid));
                const snap = await getDocs(q);

                if (snap.empty) {
                    migrationResults[collInfo.name] = 0;
                    continue;
                }

                const batch = writeBatch(db);
                snap.docs.forEach(d => {
                    batch.update(doc(db, collInfo.name, d.id), { [collInfo.field]: newUid });
                });

                await batch.commit();
                migrationResults[collInfo.name] = snap.size;
            }

            setResults(migrationResults);
        } catch (err) {
            console.error("Migration error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [diagnostic, setDiagnostic] = useState(null);
    const runDiagnostic = async () => {
        setLoading(true);
        try {
            const collections = ["ordenes_internacion", "pedidos_medicos", "caja", "profesionales"];
            const stats = {};

            // Get all profiles to map UIDs to Emails
            const profSnap = await getDocs(collection(db, "profiles"));
            const uidMap = {};
            profSnap.forEach(d => uidMap[d.id] = d.data().email);

            for (const coll of collections) {
                const snap = await getDocs(collection(db, coll));
                snap.forEach(d => {
                    const uid = d.data().userId || d.data().ownerUid || "sin_id";
                    const email = uidMap[uid] || `UID: ${uid}`;
                    if (!stats[email]) stats[email] = {};
                    stats[email][coll] = (stats[email][coll] || 0) + 1;
                });
            }
            setDiagnostic(stats);
        } catch (err) {
            setError("Error en diagnóstico: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto mt-10 space-y-8 pb-20">
            <div className="p-6 bg-white rounded-2xl shadow-xl border border-amber-100">
                <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <Shield className="text-amber-500" size={24} />
                    Herramienta de Migración ID (Admin)
                </h2>

                <form onSubmit={handleMigrate} className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Gmail (Origen)</label>
                        <input
                            type="email"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                            value={oldEmail}
                            onChange={e => setOldEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="flex justify-center pt-5">
                        <ArrowRight className="text-slate-300 hidden md:block" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">COAT (Destino)</label>
                        <input
                            type="email"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        disabled={loading}
                        type="submit"
                        className="md:col-span-3 mt-4 py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Ejecutar Migración de Datos'}
                    </button>
                </form>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-sm border border-red-100">
                        <AlertTriangle size={18} />
                        {error}
                    </div>
                )}

                {results && (
                    <div className="mt-6 p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <h3 className="font-bold text-emerald-800 flex items-center gap-2 mb-3">
                            <CheckCircle2 size={20} />
                            Migración Exitosa
                        </h3>
                        <ul className="space-y-1 text-xs text-emerald-700">
                            {Object.entries(results).map(([coll, count]) => (
                                <li key={coll} className="flex justify-between border-b border-emerald-50 pb-1">
                                    <span className="capitalize">{coll.replace('_', ' ')}:</span>
                                    <span className="font-bold">{count} movidos</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="p-6 bg-slate-900 rounded-2xl shadow-xl text-white">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Repeat className="text-blue-400" size={20} />
                        Diagnóstico Global de Datos
                    </h3>
                    <button
                        onClick={runDiagnostic}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold transition-colors"
                    >
                        Escanear Firestore
                    </button>
                </div>

                {diagnostic && (
                    <div className="space-y-4">
                        {Object.entries(diagnostic).map(([email, colls]) => (
                            <div key={email} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                <div className="font-bold text-blue-300 mb-2 truncate">{email}</div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {Object.entries(colls).map(([name, count]) => (
                                        <div key={name} className="bg-slate-900 p-2 rounded border border-slate-700">
                                            <div className="text-[10px] text-slate-500 uppercase">{name}</div>
                                            <div className="text-lg font-bold text-white">{count}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminMigration;
