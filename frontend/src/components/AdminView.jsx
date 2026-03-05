import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, getDocs, addDoc, deleteDoc, doc, where, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Shield, UserPlus, Trash2, Mail, Users, ArrowRight, Search, Activity, Download, Upload, Database, FileJson, AlertTriangle } from 'lucide-react';

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
    const [activeTab, setActiveTab] = useState('users'); // 'users', 'roles', 'maintenance', 'backup', 'notifications'
    const [roles, setRoles] = useState([]);
    const [maintenanceUser, setMaintenanceUser] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [notificationEmails, setNotificationEmails] = useState('');
    const [scriptUrl, setScriptUrl] = useState('');
    const [appNotificationUids, setAppNotificationUids] = useState([]);

    // Role Form State
    const [roleName, setRoleName] = useState('');
    const [rolePermissions, setRolePermissions] = useState({
        can_view_admin: false,
        can_manage_users: false,
        can_view_shared_catalog: false,
        can_view_ordenes: false,
        can_share_ordenes: false,
        can_approve_ordenes: false,
        can_delete_data: false,
        is_ephemeral: false
    });

    // Professionals for linking
    const [allProfessionals, setAllProfessionals] = useState([]);
    const [selectedLinkedProf, setSelectedLinkedProf] = useState('');

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

            // 5. Fetch Professionals (for linking accounts)
            const ownerToUse = currentUser.uid;
            const profsSnap = await getDocs(query(collection(db, "profesionales"), where("userId", "==", ownerToUse)));
            const profsList = profsSnap.docs.map(doc => doc.data().nombre);
            setAllProfessionals([...new Set(profsList)].sort());

            // 6. Fetch Notification Email Config (from Firestore now for 24/7 access)
            const emailDoc = await getDoc(doc(db, "settings", "notifications"));
            if (emailDoc.exists()) {
                setNotificationEmails(emailDoc.data().emails || '');
                setScriptUrl(emailDoc.data().scriptUrl || '');
                setAppNotificationUids(emailDoc.data().appNotificationUids || []);
            } else {
                setNotificationEmails('emmanuel.ag92@gmail.com');
            }

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const [remapImport, setRemapImport] = useState(true);

    const runNotificationCleanup = async () => {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const limitIso = sevenDaysAgo.toISOString();

            const q = query(
                collection(db, "notifications"),
                where("createdAt", "<", limitIso)
            );

            const snap = await getDocs(q);
            if (snap.empty) return;

            const batch = writeBatch(db);
            snap.docs.forEach(d => {
                batch.delete(d.ref);
            });
            await batch.commit();
            console.log(`Limpieza de notificaciones: ${snap.size} eliminadas.`);
        } catch (error) {
            console.error("Error cleaning up notifications:", error);
        }
    };

    useEffect(() => {
        fetchData();
        runNotificationCleanup();
    }, []);

    const handleUpdateRole = async (id, newRoleValue) => {
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
        if (currentUser.email !== SUPER_ADMIN_EMAIL) return;
        const pruebaEmails = authList.filter(a => a.role === 'prueba').map(a => a.email);
        if (pruebaEmails.length === 0) return;

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
    };

    const handleAddAuthorized = async (e) => {
        e.preventDefault();
        if (!newEmail) return;
        try {
            await addDoc(collection(db, "authorized_emails"), {
                email: newEmail.toLowerCase().trim(),
                role: newRole,
                linkedProfesionalName: selectedLinkedProf || null,
                ownerUid: currentUser.uid,
                addedAt: new Date().toISOString()
            });
            setNewEmail('');
            setNewRole('user');
            setSelectedLinkedProf('');
            fetchData();
        } catch (error) {
            alert(error.message);
        }
    };

    const handleRemoveAuthorized = async (id) => {
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
                can_approve_ordenes: false,
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
        if (email === SUPER_ADMIN_EMAIL) {
            alert("No puedes eliminar los datos del Super Administrador.");
            return;
        }
        if (!window.confirm(`⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Estás SEGURO de que quieres BORRAR TODA LA INFORMACIÓN de: ${email}?\n\nEsta acción eliminará registros de Caja, Profesionales, Notas, Permisos de Acceso, Perfil y Configuración.`)) return;
        const secondConfirm = window.prompt(`Para confirmar, escribe el email o UID del usuario (${email}):`);
        if (secondConfirm !== email && secondConfirm !== uid) {
            alert("Confirmación incorrecta.");
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
            for (const col of collectionsToWipe) {
                const q = query(collection(db, col.name), where(col.field, "==", uid));
                const snap = await getDocs(q);
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            }
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
        if (!window.confirm(`⚠️ ADVERTENCIA ⚠️\n\n¿Estás SEGURO de que quieres BORRAR las órdenes de ${email} entre el ${startDate} y el ${endDate}?`)) return;
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
                await Promise.all(toDelete.map(d => deleteDoc(d.ref)));
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

    const handleExportData = async () => {
        if (!maintenanceUser) {
            alert("Selecciona un usuario para exportar sus datos.");
            return;
        }
        setLoading(true);
        try {
            const collectionsToExport = ['pedidos_medicos', 'ordenes_internacion', 'profesionales', 'caja', 'notes'];
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                userId: maintenanceUser,
                data: {}
            };
            for (const colName of collectionsToExport) {
                const q = query(collection(db, colName), where("userId", "==", maintenanceUser));
                const snap = await getDocs(q);
                exportData.data[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${maintenanceUser}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert("Exportación completada con éxito.");
        } catch (error) {
            alert("Error al exportar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleImportData = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importData = JSON.parse(event.target.result);
                if (!importData.data || !importData.userId) throw new Error("Formato incorrecto.");
                if (!window.confirm(`¿Importar datos en la cuenta de ${importData.userId}?`)) return;
                setLoading(true);
                let importedCount = 0;
                for (const [colName, docs] of Object.entries(importData.data)) {
                    for (const docData of docs) {
                        const { id, ...cleanData } = docData;
                        if (remapImport && maintenanceUser) cleanData.userId = maintenanceUser;
                        await setDoc(doc(db, colName, id), cleanData);
                        importedCount++;
                    }
                }
                alert(`Importación completada. Se procesaron ${importedCount} documentos.`);
                fetchData();
            } catch (error) {
                alert("Error al importar: " + error.message);
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleSaveEmailConfig = async () => {
        try {
            await setDoc(doc(db, "settings", "notifications"), {
                emails: notificationEmails,
                scriptUrl: scriptUrl,
                appNotificationUids: appNotificationUids,
                updatedAt: new Date().toISOString()
            });
            alert("Configuración de emails actualizada en la nube");
        } catch (error) {
            alert("Error al guardar en Firebase: " + error.message);
        }
    };

    const handleTestEmail = async () => {
        if (!scriptUrl || !notificationEmails) {
            alert("Configura primero la URL y al menos un email.");
            return;
        }
        if (!window.confirm(`¿Enviar un email de prueba a: ${notificationEmails}?`)) return;

        try {
            // Note: Cloud triggers are opaque in no-cors mode
            fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    to: notificationEmails,
                    subject: "PRUEBA: Sistema de Notificaciones Caja de Cirugía",
                    body: "Si recibes este correo, la integración con Google Apps Script está funcionando correctamente."
                })
            });
            alert("Solicitud de prueba enviada. Revisa los correos (incluyendo SPAM). Si no llega en 1 minuto, revisa los permisos del script.");
        } catch (error) {
            alert("Error al intentar la prueba: " + error.message);
        }
    };

    const toggleNotificationRecipient = (uid) => {
        setAppNotificationUids(prev =>
            prev.includes(uid)
                ? prev.filter(id => id !== uid)
                : [...prev, uid]
        );
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
            <div className="flex items-center gap-4 bg-blue-600 text-white p-8 rounded-3xl shadow-xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
                    <Shield size={32} />
                </div>
                <div>
                    <h2 className="text-3xl font-black tracking-tight">Panel de Control</h2>
                    <p className="text-blue-50 font-medium">Gestión global de accesos y usuarios</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-4 mb-8">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                    Usuarios y Permisos
                </button>
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'roles' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                    Gestión de Roles
                </button>
                {isSuperAdmin && (
                    <>
                        <button
                            onClick={() => setActiveTab('maintenance')}
                            className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'maintenance' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            Mantenimiento
                        </button>
                        <button
                            onClick={() => setActiveTab('backup')}
                            className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'backup' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            Backup / Migración
                        </button>
                        <button
                            onClick={() => setActiveTab('notifications')}
                            className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'notifications' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                            Notificaciones
                        </button>
                    </>
                )}
            </div>

            {activeTab === 'users' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Authorized Emails */}
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                                <Mail size={24} />
                            </div>
                            <h3 className="text-xl font-bold">Usuarios Autorizados</h3>
                        </div>

                        <form onSubmit={handleAddAuthorized} className="flex flex-col gap-3 mb-8">
                            <div className="flex flex-wrap gap-3">
                                <div className="flex-1 min-w-[200px] relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="email"
                                        placeholder="nuevo@usuario.com"
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <select
                                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                >
                                    {roles.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                                <button type="submit" className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-100">
                                    Autorizar
                                </button>
                            </div>
                        </form>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {authorizedEmails.map(auth => (
                                <div key={auth.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-blue-200 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 font-bold border border-slate-200">
                                            {auth.email[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-700">{auth.email}</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{auth.role}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => handleRemoveAuthorized(auth.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Accounts */}
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                <Users size={24} />
                            </div>
                            <h3 className="text-xl font-bold">Cuentas Activas</h3>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredDoctors.map(doctor => (
                                <div key={doctor.uid} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <Activity size={18} className="text-blue-500" />
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-bold text-slate-700 truncate">{doctor.profile?.displayName || doctor.profile?.email || 'Sin Nombre'}</p>
                                            <p className="text-[10px] text-slate-400">{doctor.count} Registros</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isSuperAdmin && (
                                            <button onClick={() => handleWipeData(doctor.uid)} className="p-2 text-slate-400 hover:text-red-500 rounded-lg">
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                        <button onClick={() => switchContext(doctor.uid)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition">
                                            Entrar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'roles' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Create Role */}
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <h3 className="text-xl font-bold mb-6">Nuevo Rol</h3>
                        <form onSubmit={handleCreateRole} className="space-y-4">
                            <input
                                type="text"
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                                placeholder="Nombre (ej: Secretaria)"
                                required
                            />
                            <div className="space-y-2">
                                {Object.keys(rolePermissions).map(perm => (
                                    <label key={perm} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                                        <input
                                            type="checkbox"
                                            checked={rolePermissions[perm]}
                                            onChange={(e) => setRolePermissions(prev => ({ ...prev, [perm]: e.target.checked }))}
                                            className="w-5 h-5 accent-blue-600"
                                        />
                                        <span className="text-sm font-medium text-slate-600">{perm.replace(/_/g, ' ')}</span>
                                    </label>
                                ))}
                            </div>
                            <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">Guardar Rol</button>
                        </form>
                    </div>

                    {/* Roles List */}
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <h3 className="text-xl font-bold mb-6">Roles Existentes</h3>
                        <div className="space-y-4">
                            {roles.map(role => (
                                <div key={role.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-slate-800">{role.name}</h4>
                                        {!role.isSystem && <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-red-500"><Trash2 size={16} /></button>}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(role.permissions || {}).map(([k, v]) => (
                                            v && <span key={k} className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-[9px] font-bold uppercase">{k.replace('can_', '')}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'maintenance' ? (
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-md mx-auto">
                    <h3 className="text-xl font-bold mb-8">Borrado por Rango</h3>
                    <div className="space-y-4">
                        <select
                            value={maintenanceUser}
                            onChange={(e) => setMaintenanceUser(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl"
                        >
                            <option value="">Seleccionar cuenta...</option>
                            {allDoctors.map(d => <option key={d.uid} value={d.uid}>{d.profile?.email || d.uid}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-4">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl" />
                        </div>
                        <button onClick={handleDeleteByRange} className="w-full py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100">
                            Eliminar en Rango
                        </button>
                    </div>
                </div>
            ) : activeTab === 'backup' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
                        <h3 className="text-xl font-bold mb-4">Exportar Datos</h3>
                        <p className="text-sm text-slate-500 mb-6">Descarga un backup JSON completo de un usuario.</p>
                        <select
                            value={maintenanceUser}
                            onChange={(e) => setMaintenanceUser(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl mb-4"
                        >
                            <option value="">Seleccionar cuenta...</option>
                            {allDoctors.map(d => <option key={d.uid} value={d.uid}>{d.profile?.email || d.uid}</option>)}
                        </select>
                        <button onClick={handleExportData} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700">
                            <Download size={20} /> Exportar JSON
                        </button>
                    </div>
                    <div className="p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
                        <h3 className="text-xl font-bold mb-4">Importar Datos</h3>
                        <p className="text-sm text-slate-500 mb-6">Carga un backup JSON en una cuenta.</p>
                        <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-8 hover:bg-emerald-50 transition min-h-[160px] flex flex-col items-center justify-center">
                            <input type="file" onChange={handleImportData} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <FileJson size={32} className="text-slate-300 mb-2" />
                            <span className="text-sm font-bold text-slate-400">Seleccionar Archivo</span>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'notifications' ? (
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-2xl mx-auto">
                    <div className="flex items-center gap-3 mb-8">
                        <Mail className="text-blue-600" size={24} />
                        <div>
                            <h3 className="text-xl font-bold">Configuración de Emails</h3>
                            <p className="text-xs text-slate-400">Destinatarios de alertas de internación</p>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="p-4 bg-amber-50 rounded-2xl text-amber-800 text-sm italic border border-amber-100">
                            Separa múltiples correos con comas. Ej: doctor@gmail.com, admin@clinica.com
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Destinatarios</label>
                            <textarea
                                value={notificationEmails}
                                onChange={(e) => setNotificationEmails(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl min-h-[120px] outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                placeholder="lista@correos.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Google Apps Script URL</label>
                            <input
                                type="text"
                                value={scriptUrl}
                                onChange={(e) => setScriptUrl(e.target.value)}
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                placeholder="https://script.google.com/macros/s/.../exec"
                            />
                            <p className="text-[10px] text-slate-400 mt-2 px-2">
                                Pega aquí la URL que obtendrás al publicar tu Google Apps Script.
                            </p>
                        </div>

                        <div className="pt-6 border-t border-slate-100">
                            <div className="flex items-center gap-2 mb-4">
                                <Activity className="text-emerald-600" size={18} />
                                <h4 className="font-bold text-slate-700">Notificaciones en la App (Campana)</h4>
                            </div>
                            <p className="text-xs text-slate-400 mb-4">
                                Selecciona los usuarios que verán las alertas de cirugía auditada directamente en la aplicación.
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {allDoctors.map(doctor => (
                                    <label key={doctor.uid} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-slate-400 border border-slate-100">
                                                {doctor.profile?.displayName?.[0] || '?'}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-xs font-bold text-slate-700 truncate">{doctor.profile?.displayName || doctor.profile?.email || 'Sin Nombre'}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{doctor.profile?.email}</p>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={appNotificationUids.includes(doctor.uid)}
                                            onChange={() => toggleNotificationRecipient(doctor.uid)}
                                            className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={handleSaveEmailConfig}
                                className="py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                            >
                                <Activity size={20} /> Guardar
                            </button>
                            <button
                                onClick={handleTestEmail}
                                className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 border border-slate-200 flex items-center justify-center gap-2"
                            >
                                <Mail size={20} /> Probar Envío
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default AdminView;
