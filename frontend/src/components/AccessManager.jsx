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
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 max-w-2xl mx-auto mt-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Users className="text-teal-600" size={24} />
                Compartir Mi Caja
            </h2>

            <p className="text-slate-500 mb-6 text-sm">
                Agrega el email de otros usuarios (ej: socios o secretarias) para que puedan ver y gestionar tu Caja de Cirugía.
            </p>

            {/* Grant Form */}
            <form onSubmit={handleGrant} className="flex gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex-1 relative">
                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                        type="email"
                        required
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="email@ejemplo.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />
                </div>

                <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="px-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-700"
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
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
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
                        <div key={grant.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold">
                                    {grant.viewerEmail[0].toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-slate-700">{grant.viewerEmail}</span>
                                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                        {grant.role === 'editor' ? 'Editor' : 'Solo Ver'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRevoke(grant.id, grant.viewerEmail)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
