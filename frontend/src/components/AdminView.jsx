import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, deleteDoc, doc, where, updateDoc, setDoc } from 'firebase/firestore';
import { Shield, UserPlus, Trash2, Mail, Users, ArrowRight, Search, Activity } from 'lucide-react';

const AdminView = () => {
    const { switchContext, viewingUid, currentUser, isSuperAdmin } = useAuth();
    const SUPER_ADMIN_EMAIL = "emmanuel.ag92@gmail.com";
    const [authorizedEmails, setAuthorizedEmails] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('user');
    const [allDoctors, setAllDoctors] = useState([]);
    const [profiles, setProfiles] = useState({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('users'); // 'users', 'roles', or 'maintenance'
    const [roles, setRoles] = useState([]);
    const [maintenanceUser, setMaintenanceUser] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Role Form State
    const [roleName, setRoleName] = useState('');
    const [rolePermissions, setRolePermissions] = useState({
        can_view_admin: false,
        can_manage_users: false,
        can_view_shared_catalog: false,
        can_view_ordenes: false,
        can_share_ordenes: false,
        can_delete_data: false,
        is_ephemeral: false
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Authorized Emails
            const authSnap = await getDocs(collection(db, "authorized_emails"));
            const authList = authSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAuthorizedEmails(authList);

            // Trigger cleanup logic for "Prueba" users if I'm Super Admin
            runPruebaCleanup(authList);

            // 2. Fetch User Profiles (Mapping UID -> Info)
            const profSnap = await getDocs(collection(db, "profiles"));
            const profMap = {};
            profSnap.forEach(d => { profMap[d.id] = d.data(); });
            setProfiles(profMap);

            // 3. Fetch all unique doctors/users that have data
            const cajaSnap = await getDocs(collection(db, "caja"));
            const uniqueUsers = {};
            cajaSnap.forEach(d => {
                const data = d.data();
                if (data.userId) {
                    uniqueUsers[data.userId] = (uniqueUsers[data.userId] || 0) + 1;
                }
            });

            setAllDoctors(Object.entries(profMap).map(([uid, profile]) => ({
                uid,
                count: uniqueUsers[uid] || 0,
                profile
            })).sort((a, b) => (b.count - a.count)));

            // 4. Fetch Roles
            const rolesSnap = await getDocs(collection(db, "roles"));
            setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleUpdateRole = async (id, newRoleValue) => {
        // Find the email for this authorization
        const authRecord = authorizedEmails.find(a => a.id === id);
        if (authRecord?.email === SUPER_ADMIN_EMAIL) {
            alert("No puedes cambiar el rol del Super Administrador.");
            return;
        }
        try {
            await updateDoc(doc(db, "authorized_emails", id), {
                role: newRoleValue,
                ownerUid: currentUser.uid
            });
            fetchData();
        } catch (error) {
            alert("Error al actualizar rol: " + error.message);
        }
    };

    const runPruebaCleanup = async (authList) => {
        // Only Super Admin runs the cleanup
        if (currentUser.email !== SUPER_ADMIN_EMAIL) return;

        const pruebaEmails = authList.filter(a => a.role === 'prueba').map(a => a.email);
        if (pruebaEmails.length === 0) return;

        console.log("Iniciando purga de datos de usuarios de 'Prueba'...");

        // Find UIDs for these emails
        const profSnap = await getDocs(collection(db, "profiles"));
        const pruebaUids = profSnap.docs
            .filter(d => pruebaEmails.includes(d.data().email))
            .map(d => d.id);

        if (pruebaUids.length === 0) return;

        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        const yesterdayIso = yesterday.toISOString();

        const collectionsToClean = ['caja', 'notes', 'profesionales'];
        for (const colName of collectionsToClean) {
            for (const uid of pruebaUids) {
                const q = query(
                    collection(db, colName),
                    where("userId", "==", uid)
                );
                const snap = await getDocs(q);
                const toDelete = snap.docs.filter(d => {
                    const data = d.data();
                    const date = data.createdAt || data.date || data.timestamp || data.addedAt;
                    return date && date < yesterdayIso;
                });

                await Promise.all(toDelete.map(d => deleteDoc(d.ref)));
            }
        }
        console.log("Finalizada purga de datos antiguos.");
    };

    const handleAddAuthorized = async (e) => {
        e.preventDefault();
        if (!newEmail) return;
        try {
            await addDoc(collection(db, "authorized_emails"), {
                email: newEmail.toLowerCase().trim(),
                role: newRole,
                ownerUid: currentUser.uid,
                addedAt: new Date().toISOString()
            });
            setNewEmail('');
            setNewRole('user');
            fetchData();
        } catch (error) {
            alert(error.message);
        }
    };

    const handleRemoveAuthorized = async (id) => {
        // Find the email for this authorization
        const authRecord = authorizedEmails.find(a => a.id === id);
        if (authRecord?.email === SUPER_ADMIN_EMAIL) {
            alert("No puedes eliminar al Super Administrador.");
            return;
        }
        if (!window.confirm("¿Seguro que quieres quitar la autorización?")) return;
        try {
            await deleteDoc(doc(db, "authorized_emails", id));
            fetchData();
        } catch (error) {
            alert(error.message);
        }
    };

    const handleCreateRole = async (e) => {
        e.preventDefault();
        const roleId = roleName.toLowerCase().replace(/\s+/g, '_');
        try {
            await setDoc(doc(db, "roles", roleId), {
                name: roleName,
                isSystem: false,
                permissions: rolePermissions
            });
            setRoleName('');
            setRolePermissions({
                can_view_admin: false,
                can_manage_users: false,
                can_view_shared_catalog: false,
                can_view_ordenes: false,
                can_share_ordenes: false,
                can_delete_data: false,
                is_ephemeral: false
            });
            fetchData();
        } catch (error) {
            alert("Error creando rol: " + error.message);
        }
    };

    const handleDeleteRole = async (roleId) => {
        if (!window.confirm("¿Eliminar este rol? Los usuarios con este rol podrían perder acceso.")) return;
        try {
            await deleteDoc(doc(db, "roles", roleId));
            fetchData();
        } catch (error) {
            alert("Error eliminando rol: " + error.message);
        }
    };

    // Toggle individual permission for an existing role
    const handleToggleRolePermission = async (roleId, permissionKey, currentValue) => {
        try {
            const role = roles.find(r => r.id === roleId);
            if (!role) return;

            const updatedPermissions = {
                ...role.permissions,
                [permissionKey]: !currentValue
            };

            await setDoc(doc(db, "roles", roleId), {
                ...role,
                permissions: updatedPermissions
            });

            fetchData();
        } catch (error) {
            alert("Error actualizando permiso: " + error.message);
        }
    };

    const handleWipeData = async (uid) => {
        const email = profiles[uid]?.email || uid;

        // Protect Super Admin from being wiped
        if (email === SUPER_ADMIN_EMAIL) {
            alert("No puedes eliminar los datos del Super Administrador.");
            return;
        }

        if (!window.confirm(`⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Estás SEGURO de que quieres BORRAR TODA LA INFORMACIÓN de: ${email}?\n\nEsta acción eliminará:\n- Registros de Caja\n- Profesionales\n- Notas\n- Permisos de Acceso\n- Perfil y Configuración\n\nESTA ACCIÓN NO SE PUEDE DESHACER.`)) return;

        const secondConfirm = window.prompt(`Para confirmar, escribe el email o UID del usuario (${email}):`);
        if (secondConfirm !== email && secondConfirm !== uid) {
            alert("Confirmación incorrecta. No se borró nada.");
            return;
        }

        setLoading(true);
        try {
            const collectionsToWipe = [
                { name: 'caja', field: 'userId' },
                { name: 'profesionales', field: 'userId' },
                { name: 'notes', field: 'userId' },
                { name: 'access_grants', field: 'ownerUid' }
            ];

            // 1. Delete documents in shared collections
            for (const col of collectionsToWipe) {
                const q = query(collection(db, col.name), where(col.field, "==", uid));
                const snap = await getDocs(q);
                const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
                await Promise.all(deletePromises);
            }

            // 2. Delete unique documents (Profile & Settings)
            await deleteDoc(doc(db, "profiles", uid));
            await deleteDoc(doc(db, "user_settings", uid));

            alert("Datos eliminados correctamente.");
            fetchData();
        } catch (error) {
            alert("Error al eliminar datos: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteByRange = async () => {
        if (!maintenanceUser || !startDate || !endDate) {
            alert("Por favor selecciona un usuario y el rango de fechas.");
            return;
        }

        const email = profiles[maintenanceUser]?.email || maintenanceUser;
        if (!window.confirm(`⚠️ ADVERTENCIA ⚠️\n\n¿Estás SEGURO de que quieres BORRAR las órdenes de ${email} entre el ${startDate} y el ${endDate}?\n\nEsta acción afectará a Internaciones y Pedidos Médicos.`)) return;

        setLoading(true);
        try {
            let deletedCount = 0;
            const collections = [
                { name: 'ordenes_internacion', dateField: 'fechaCirugia' },
                { name: 'pedidos_medicos', dateField: 'fechaDocumento' }
            ];

            for (const col of collections) {
                const q = query(collection(db, col.name), where("userId", "==", maintenanceUser));
                const snap = await getDocs(q);

                const toDelete = snap.docs.filter(d => {
                    const data = d.data();
                    const date = data[col.dateField];
                    return date && date >= startDate && date <= endDate;
                });

                const deletePromises = toDelete.map(d => deleteDoc(d.ref));
                await Promise.all(deletePromises);
                deletedCount += toDelete.length;
            }

            alert(`Se han eliminado ${deletedCount} registros.`);
            fetchData();
        } catch (error) {
            alert("Error al eliminar registros: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredDoctors = allDoctors.filter(d => {
        const search = searchTerm.toLowerCase();
        const email = d.profile?.email?.toLowerCase() || '';
        const name = d.profile?.displayName?.toLowerCase() || '';
        return d.uid.toLowerCase().includes(search) || email.includes(search) || name.includes(search);
    });

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 bg-slate-900 text-white p-8 rounded-3xl shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                    <Shield size={32} />
                </div>
                <div>
                    <h2 className="text-3xl font-black tracking-tight">Panel de Control</h2>
                    <p className="text-teal-200 font-medium">Gestión global de accesos y usuarios</p>
                </div>
            </div>

            <div className="flex gap-4 mb-8">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                    Usuarios y Permisos
                </button>
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'roles' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                    Gestión de Roles
                </button>
                {isSuperAdmin && (
                    <button
                        onClick={() => setActiveTab('maintenance')}
                        className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'maintenance' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        Mantenimiento
                    </button>
                )}
            </div>

            {activeTab === 'users' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Section: Authorized Emails */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl">
                                <Mail size={24} />
                            </div>
                            <h3 className="text-xl font-bold dark:text-white">Usuarios Autorizados</h3>
                        </div>

                        <form onSubmit={handleAddAuthorized} className="flex gap-3 mb-8">
                            <div className="flex-1 relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="email"
                                    placeholder="nuevo@usuario.com"
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all dark:text-white"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <select
                                className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all dark:text-white text-sm font-bold"
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                            >
                                {roles.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                            <button type="submit" className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 dark:shadow-none transition-all">
                                <UserPlus size={20} />
                                <span className="hidden sm:inline">Autorizar</span>
                            </button>
                        </form>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {authorizedEmails.map(auth => (
                                <div key={auth.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-2xl group hover:border-teal-200 dark:hover:border-teal-900 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 font-bold border border-slate-200 dark:border-slate-700 group-hover:text-teal-500 transition-colors">
                                            {auth.email[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-700 dark:text-slate-300">{auth.email}</span>
                                            <select
                                                value={auth.role || 'user'}
                                                onChange={(e) => handleUpdateRole(auth.id, e.target.value)}
                                                className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border-none outline-none cursor-pointer w-fit bg-slate-100 text-slate-500"
                                            >
                                                {roles.map(r => (
                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* VIEW BUTTON FOR AUTHORIZED USERS */}
                                        {profiles[auth.id || ''] || (auth.email && Object.values(profiles).find(p => p.email === auth.email)) ? (
                                            <button
                                                onClick={() => {
                                                    const targetUid = auth.id || Object.keys(profiles).find(uid => profiles[uid].email === auth.email);
                                                    if (targetUid) switchContext(targetUid);
                                                }}
                                                disabled={viewingUid === (auth.id || Object.keys(profiles).find(uid => profiles[uid].email === auth.email))}
                                                className="p-2 text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-all"
                                                title="Entrar a esta caja"
                                            >
                                                <ArrowRight size={18} />
                                            </button>
                                        ) : null}

                                        <button
                                            onClick={() => handleRemoveAuthorized(auth.id)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                            title="Eliminar autorización"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Section: All User Data (Doctors) */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl">
                                <Users size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold dark:text-white">Cuentas Activas</h3>
                                <p className="text-xs text-slate-400 font-medium">Bases de datos con registros</p>
                            </div>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por Nombre, Email o UID..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all dark:text-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredDoctors.map(doctor => (
                                <div
                                    key={doctor.uid}
                                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${viewingUid === doctor.uid
                                        ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800'
                                        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${viewingUid === doctor.uid ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                            <Activity size={18} />
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">
                                                {doctor.profile?.displayName || doctor.profile?.email || 'Usuario Sin Identificar'}
                                            </p>
                                            {doctor.profile?.email && (
                                                <p className="text-[10px] text-slate-400 font-medium truncate">{doctor.profile.email}</p>
                                            )}
                                            <p className="text-[9px] font-mono text-slate-300 truncate">{doctor.uid}</p>
                                            <p className="text-[10px] font-bold text-teal-500 mt-1">{doctor.count} Registros</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isSuperAdmin && (
                                            <button
                                                onClick={() => handleWipeData(doctor.uid)}
                                                title="Borrar toda la información"
                                                className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => switchContext(doctor.uid)}
                                            disabled={viewingUid === doctor.uid}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tight transition-all ${viewingUid === doctor.uid
                                                ? 'bg-teal-500 text-white cursor-default'
                                                : 'bg-slate-900 text-white hover:bg-teal-600 shadow-md transform hover:scale-105'
                                                }`}
                                        >
                                            {viewingUid === doctor.uid ? 'Viendo' : (
                                                <>Entrar <ArrowRight size={14} /></>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {viewingUid !== currentUser.uid && (
                            <button
                                onClick={() => switchContext(currentUser.uid)}
                                className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400 hover:text-teal-500 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-all font-bold text-sm"
                            >
                                Volver a mi cuenta personal
                            </button>
                        )}
                    </div>
                </div>
            ) : activeTab === 'roles' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Create Role Form */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <h3 className="text-xl font-bold dark:text-white mb-6">Crear Nuevo Rol</h3>
                        <form onSubmit={handleCreateRole} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2">Nombre del Rol</label>
                                <input
                                    type="text"
                                    value={roleName}
                                    onChange={(e) => setRoleName(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-slate-900 dark:text-white"
                                    placeholder="Ej: Secretaria"
                                    required
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="block text-sm font-bold text-slate-400">Permisos</label>
                                {Object.keys(rolePermissions).map(perm => (
                                    <label key={perm} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                                        <input
                                            type="checkbox"
                                            checked={rolePermissions[perm]}
                                            onChange={(e) => setRolePermissions(prev => ({ ...prev, [perm]: e.target.checked }))}
                                            className="w-5 h-5 accent-blue-600"
                                        />
                                        <span className="text-sm font-medium text-slate-600">
                                            {{
                                                can_view_admin: "Acceso al Panel Admin",
                                                can_manage_users: "Gestión de Usuarios",
                                                can_view_shared_catalog: "Ver Catálogo Compartido",
                                                can_view_ordenes: "Ver Órdenes",
                                                can_share_ordenes: "Compartir Órdenes (crear con profesionales)",
                                                can_delete_data: "Borrar Información",
                                                is_ephemeral: "Datos Temporales (24h)"
                                            }[perm] || perm}
                                        </span>
                                    </label>
                                ))}
                            </div>

                            <button type="submit" className="w-full py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700">
                                Guardar Rol
                            </button>
                        </form>
                    </div>

                    {/* Roles List */}
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                        <h3 className="text-xl font-bold dark:text-white mb-6">Roles Existentes</h3>
                        <div className="space-y-4">
                            {roles.map(role => (
                                <div key={role.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-slate-800 dark:text-white">{role.name}</h4>
                                        {!role.isSystem && (
                                            <button
                                                onClick={() => handleDeleteRole(role.id)}
                                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.entries(role.permissions || {}).map(([permKey, permValue]) => (
                                            <label
                                                key={permKey}
                                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all text-xs ${permValue
                                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                    }`}
                                                onClick={() => handleToggleRolePermission(role.id, permKey, permValue)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={permValue}
                                                    onChange={() => { }}
                                                    className="w-4 h-4 accent-green-600 pointer-events-none"
                                                />
                                                <span className="font-medium">
                                                    {{
                                                        can_view_admin: "Panel Admin",
                                                        can_manage_users: "Gestión Usuarios",
                                                        can_view_shared_catalog: "Catálogo",
                                                        can_view_ordenes: "Ver Órdenes",
                                                        can_share_ordenes: "Compartir Órdenes",
                                                        can_delete_data: "Borrar Datos",
                                                        is_ephemeral: "Temporal (24h)"
                                                    }[permKey] || permKey}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl">
                            <Trash2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold dark:text-white">Borrado por Rango de Fecha</h3>
                            <p className="text-xs text-slate-400 font-medium">Elimina órdenes según la fecha de cirugía/realización</p>
                        </div>
                    </div>

                    <div className="space-y-6 max-w-md">
                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Usuario / Doctor</label>
                            <select
                                value={maintenanceUser}
                                onChange={(e) => setMaintenanceUser(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-slate-900 dark:text-white outline-none"
                            >
                                <option value="">Seleccionar cuenta...</option>
                                {allDoctors.map(doctor => (
                                    <option key={doctor.uid} value={doctor.uid}>
                                        {doctor.profile?.displayName || doctor.profile?.email || doctor.uid}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2">Desde (Cirugía / Pedido)</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-slate-900 dark:text-white outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2">Hasta (Cirugía / Pedido)</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl text-slate-900 dark:text-white outline-none"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleDeleteByRange}
                            disabled={loading || !maintenanceUser || !startDate || !endDate}
                            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${loading || !maintenanceUser || !startDate || !endDate
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-100'
                                }`}
                        >
                            <Trash2 size={20} />
                            Eliminar Registros en Rango
                        </button>

                        <div className="p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl">
                            <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                <strong>Nota:</strong> Esta herramienta filtra por la fecha de realización de la cirugía (Internación) o la fecha del documento (Pedidos Médicos). No afecta a los registros de Caja Diaria.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminView;
