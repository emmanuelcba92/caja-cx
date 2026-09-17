import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, getDoc, writeBatch, getCountFromServer
} from 'firebase/firestore';
import {
  Shield, UserPlus, Trash2, Mail, Users, Search,
  Download, Upload, Database, FileJson, AlertTriangle,
  ChevronDown, CheckCircle2, UserCheck, ShieldCheck,
  Calendar, RefreshCw, Layers, HardDrive, Key, X, Save, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import { logAction, AUDIT_ACTIONS } from '../services/auditService';
import { DEFAULT_ROLES } from '../services/roleService';
import DataImporter from './DataImporter.jsx';
import WhatsAppTemplatesAdmin from './WhatsAppTemplatesAdmin.jsx';
import { getCleanUsername } from '../utils/doctorName';

const AdminView = () => {
  const { currentUser, isSuperAdmin } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('usuarios');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Users sub-tab state
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('secre');
  const [newProfName, setNewProfName] = useState('');
  const [editingUser, setEditingUser] = useState(null);

  // Authorized emails
  const [authorizedEmails, setAuthorizedEmails] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch authorized emails
      const authSnap = await getDocs(collection(db, 'authorized_emails'));
      const authList = authSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAuthorizedEmails(authList);

      // Fetch roles
      const rolesSnap = await getDocs(collection(db, 'roles'));
      const rolesList = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRoles(rolesList.length > 0 ? rolesList : Object.entries(DEFAULT_ROLES).map(([id, data]) => ({ id, ...data })));
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return toast.error("Ingresá un email");

    const fullEmail = newEmail.includes('@') ? newEmail : `${newEmail}@coat.com.ar`;

    // Check if already exists
    if (authorizedEmails.find(u => u.email === fullEmail)) {
      return toast.error("Ya existe un usuario con ese email");
    }

    try {
      await setDoc(doc(db, 'authorized_emails', fullEmail.replace(/[.@]/g, '_')), {
        email: fullEmail,
        role: newRole,
        profesionalName: newProfName || '',
        createdAt: new Date().toISOString(),
        createdBy: currentUser.email
      });

      toast.success(`Usuario ${fullEmail} agregado`);
      logAction(AUDIT_ACTIONS.ADMIN_CHANGE_SETTINGS, fullEmail, `Agregó usuario: ${fullEmail} como ${newRole}`);
      setNewEmail('');
      setNewProfName('');
      fetchData();
    } catch (error) {
      console.error("Error adding user:", error);
      toast.error("Error al agregar usuario");
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await updateDoc(doc(db, 'authorized_emails', userId), { role: newRole });
      toast.success("Rol actualizado");
      logAction(AUDIT_ACTIONS.ADMIN_CHANGE_SETTINGS, userId, `Cambió rol de ${userId} a ${newRole}`);
      fetchData();
    } catch (error) {
      toast.error("Error al actualizar rol");
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (!confirm(`¿Eliminar acceso de ${email}?`)) return;
    try {
      await deleteDoc(doc(db, 'authorized_emails', userId));
      toast.success("Usuario eliminado");
      logAction(AUDIT_ACTIONS.ADMIN_CHANGE_SETTINGS, userId, `Eliminó usuario: ${email}`);
      fetchData();
    } catch (error) {
      toast.error("Error al eliminar usuario");
    }
  };

  const handleExportData = async () => {
    try {
      const collections = ['caja', 'ordenes_internacion', 'profesionales', 'pacientes'];
      const exportData = {};

      for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        exportData[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coat_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup descargado");
    } catch (error) {
      toast.error("Error al exportar datos");
    }
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-rose-100 text-rose-600',
      secre: 'bg-amber-100 text-amber-600',
      direccion_medica: 'bg-indigo-100 text-indigo-600',
      medico: 'bg-emerald-100 text-emerald-600',
      residente: 'bg-teal-100 text-teal-700',
      coat: 'bg-blue-100 text-blue-600'
    };
    return colors[role] || 'bg-slate-100 text-slate-600';
  };

  const subTabs = [
    { id: 'usuarios', label: 'Usuarios', icon: Users },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'mensajesWA', label: 'Mensajes WhatsApp', icon: MessageSquare },
    { id: 'datos', label: 'Datos', icon: Database },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Panel de Administración</h2>
          <p className="text-xs text-slate-400 font-medium mt-1">Gestión de usuarios, roles y datos del sistema</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === tab.id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Usuarios Tab */}
      {activeSubTab === 'usuarios' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Agregar Usuario</h3>
            <form onSubmit={handleAddUser} className="flex gap-3">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email o usuario"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                />
              </div>
              <input
                type="text"
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                placeholder="Nombre profesional"
                value={newProfName}
                onChange={e => setNewProfName(e.target.value)}
              />
              <select
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
              >
                {Object.entries(DEFAULT_ROLES).map(([key, role]) => (
                  <option key={key} value={key}>{role.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all"
              >
                <UserPlus size={16} /> Agregar
              </button>
            </form>
          </div>

          <div className="p-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
              Usuarios Autorizados ({authorizedEmails.length})
            </h3>
            <div className="space-y-2">
              {authorizedEmails.map(user => (
                <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                    {getCleanUsername(user.profesionalName || user.email)?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 truncate">{user.profesionalName || getCleanUsername(user.email)}</p>
                    {user.profesionalName && (
                      <p className="text-[10px] text-slate-400">Usuario: {getCleanUsername(user.email)}</p>
                    )}
                  </div>
                  <select
                    value={user.role}
                    onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border-0 ${getRoleBadge(user.role)}`}
                  >
                    {Object.entries(DEFAULT_ROLES).map(([key, role]) => (
                      <option key={key} value={key}>{role.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.email)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {activeSubTab === 'roles' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Roles del Sistema</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(DEFAULT_ROLES).map(([key, role]) => (
              <div key={key} className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-3 h-3 rounded-full ${getRoleBadge(key).split(' ')[0].replace('100', '500')}`} />
                  <h4 className="font-bold text-slate-800 text-sm">{role.name}</h4>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(role.permissions).map(([perm, value]) => (
                    <div key={perm} className="flex items-center gap-2 text-[10px]">
                      {value ? (
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      ) : (
                        <X size={12} className="text-slate-300" />
                      )}
                      <span className={value ? 'text-slate-600' : 'text-slate-400'}>
                        {perm.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Datos Tab */}
      {activeSubTab === 'datos' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Gestión de Datos y Backup</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={handleExportData}
              className="flex items-center gap-4 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                <Download size={24} />
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-700 text-sm">Exportar Backup</p>
                <p className="text-[10px] text-slate-400">Descarga un JSON con los datos actuales</p>
              </div>
            </button>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">Importador de Backup Maestro</h4>
            <DataImporter onDataImported={() => {
              toast.success("Datos importados con éxito");
              fetchData();
            }} />
          </div>

          {/* Firestore Stats */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Estado de Firestore</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['caja', 'ordenes_internacion', 'profesionales', 'pacientes'].map(col => (
                <FirestoreStat key={col} collectionName={col} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Templates Tab */}
      {activeSubTab === 'mensajesWA' && (
        <WhatsAppTemplatesAdmin />
      )}
    </div>
  );
};

// Small component to show collection count
const FirestoreStat = ({ collectionName }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const snap = await getCountFromServer(collection(db, collectionName));
        setCount(snap.data().count);
      } catch (e) {
        setCount('—');
      }
    };
    fetchCount();
  }, [collectionName]);

  return (
    <div className="text-center">
      <p className="text-lg font-black text-slate-800">{count}</p>
      <p className="text-[10px] text-slate-400 font-medium">{collectionName}</p>
    </div>
  );
};

export default AdminView;
