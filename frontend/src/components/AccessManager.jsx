import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Users, UserPlus, Trash2, ShieldCheck, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

const AccessManager = () => {
  const { currentUser, grantAccess, revokeAccess } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [myGrants, setMyGrants] = useState([]);
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
      setRole('editor');
      fetchMyGrants();
      toast.success(`Acceso concedido a ${email}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id, email) => {
    if (!confirm(`¿Quitar acceso a ${email}?`)) return;
    try {
      await revokeAccess(id);
      fetchMyGrants();
      toast.success("Acceso revocado");
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
          <Users className="text-blue-600" size={24} />
          Compartir Mi Caja
        </h2>
        <p className="text-xs text-slate-400 font-medium mt-2">
          Agregá el email de otros usuarios para que puedan ver y gestionar tu Caja de Cirugía.
        </p>
      </div>

      {/* Grant Form */}
      <div className="p-6 border-b border-slate-100 bg-slate-50">
        <form onSubmit={handleGrant} className="flex gap-3">
          <div className="flex-1 relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="email"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="email@ejemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="editor">Editor (Total)</option>
            <option value="viewer">Solo Ver</option>
          </select>

          <button
            disabled={loading}
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
          >
            <UserPlus size={16} />
            {loading ? 'Agregando...' : 'Autorizar'}
          </button>
        </form>
      </div>

      {/* Grants List */}
      <div className="p-6">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
          Usuarios con acceso ({myGrants.length})
        </h3>

        {myGrants.length === 0 ? (
          <div className="text-center py-8">
            <Users size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No compartiste acceso con nadie aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myGrants.map(grant => (
              <div
                key={grant.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                  {grant.grantedEmail?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700 truncate">{grant.grantedEmail}</p>
                  <p className="text-[10px] text-slate-400">
                    {grant.role === 'editor' ? 'Editor total' : 'Solo lectura'}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(qu.id, grant.grantedEmail)}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccessManager;
