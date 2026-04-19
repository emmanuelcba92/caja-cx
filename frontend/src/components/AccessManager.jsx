import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Users, UserPlus, Trash2, ShieldCheck, Mail } from 'lucide-react';

const AccessManager = () => {
    const { currentUser, grantAccess, revokeAccess } = useAuth();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('editor'); // 'editor' | 'viewer'
    const [myGrants, setMyGrants] = useState([]); // People I shared WITH
    const [loading, setLoading] = useState(false);

    const fetchMyGrants = async () => {
        if (!currentUser) return;
        try {
            const q = query(
                collection(db, "access_grants"),
                where("ownerUid", "==", currentUser.uid)
            );
            const snapshot = await getDocs(q);
            setMyGrants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchMyGrants();
    }, [currentUser]);

    const handleGrant = async (e) => {
        e.preventDefault();
        if (!email) return;
        setLoading(true);
        try {
            await grantAccess(email, role);
            setEmail('');
            setRole('editor'); // Reset to default
            fetchMyGrants();
            alert(`Acceso concedido a ${email} como ${role === 'editor' ? 'Editor' : 'Lector'}`);
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (id, email) => {
        if (!window.confirm(`¿Seguro quieres quitar el acceso a ${email}?`)) return;
        try {
            await revokeAccess(id);
            fetchMyGrants();
        } catch (error) {
            alert(error.message);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden relative mt-8">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                <Users className="text-teal-600" size={24} />
                Compartir Mi Caja
            </h2>

            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                Agrega el email de otros usuarios (ej: socios o secretarias) para que puedan ver y gestionar tu Caja de Cirugía.
            </p>

            {/* Grant Form */}
            <form onSubmit={handleGrant} className="flex gap-4 mb-8 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex-1 relative">
                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                        type="email"
                        required
                        className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                        placeholder="email@ejemplo.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                </div>

                <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-700 dark:text-slate-200"
                >
                    <option value="editor">🖊️ Editor (Total)</option>
                    <option value="viewer">👀 Solo Ver</option>
                </select>

                <button
                    disabled={loading}
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-all disabled:opacity-50"
                >
                    <UserPlus size={18} />
                    {loading ? 'Agregando...' : 'Autorizar'}
                </button>
            </form>

            {/* List of Grants */}
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                <ShieldCheck size={18} className="text-teal-500" />
                Personas autorizadas
            </h3>

            {myGrants.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic">
                    Nadie tiene acceso a tus datos aún.
                </div>
            ) : (
                <div className="space-y-3">
                    {myGrants.map(grant => (
                        <div key={grant.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold">
                                    {grant.viewerEmail[0].toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 dark:text-slate-100">{grant.viewerEmail}</span>
                                    <span className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded">
                                        {grant.role === 'editor' ? 'Editor' : 'Solo Ver'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRevoke(grant.id, grant.viewerEmail)}
                                className="p-3 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors"
                                title="Revocar Acceso"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


export default AccessManager;
