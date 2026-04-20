import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, isLocalEnv } from '../firebase/config';
import { collection, query, getDocs, addDoc, deleteDoc, doc, where, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Shield, UserPlus, Trash2, Mail, Users, ArrowRight, Search, Activity, Download, Upload, Database, FileJson, AlertTriangle, PieChart, ChevronDown, Filter } from 'lucide-react';

const SearchableSelect = ({ options, value, onChange, placeholder, icon: Icon, showAllOption = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    
    const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
    const selectedLabel = (value === 'all' || !value) ? (showAllOption ? 'Todas las Obras Sociales' : placeholder) : value;

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-teal-500 dark:hover:border-teal-500 transition-all min-w-[220px] justify-between shadow-sm"
            >
                <div className="flex items-center gap-2 truncate">
                    {Icon && <Icon size={16} className="text-teal-500" />}
                    <span className="truncate">{selectedLabel}</span>
                </div>
                <ChevronDown size={16} className={`transition-transform text-slate-400 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    autoFocus
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar obra social..."
                                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1 custom-scrollbar">
                            {showAllOption && (
                                <button
                                    onClick={() => {
                                        onChange('all');
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors ${value === 'all' ? 'text-teal-600 font-bold bg-teal-50/50' : 'text-slate-600 dark:text-slate-300'}`}
                                >
                                    Todas las Obras Sociales
                                </button>
                            )}
                            {filtered.length > 0 ? (
                                filtered.map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => {
                                            onChange(opt);
                                            setIsOpen(false);
                                            setSearch('');
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors ${value === opt ? 'text-teal-600 font-bold bg-teal-50/50' : 'text-slate-600 dark:text-slate-300'}`}
                                    >
                                        {opt}
                                    </button>
                                ))
                            ) : (
                                <div className="px-4 py-8 text-center">
                                    <p className="text-xs text-slate-400 italic">No se encontraron resultados</p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const AdminView = () => {
    const { switchContext, viewingUid, currentUser, isSuperAdmin, permissions } = useAuth();
    const SUPER_ADMIN_EMAIL = "emmanuel.ag92@gmail.com";
    const [authorizedEmails, setAuthorizedEmails] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('user');
    const [allDoctors, setAllDoctors] = useState([]);
    const [profiles, setProfiles] = useState({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(() => {
        if (isSuperAdmin || permissions?.can_manage_users) return 'users';
        if (permissions?.can_view_stats) return 'stats';
        return 'users';
    }); // 'users', 'stats', 'maintenance', 'backup', 'notifications'
    const [roles, setRoles] = useState([]);
    const [maintenanceUser, setMaintenanceUser] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [notificationEmails, setNotificationEmails] = useState('');
    const [scriptUrl, setScriptUrl] = useState('');
    const [appNotificationUids, setAppNotificationUids] = useState([]);
    const [stats, setStats] = useState({ totalCirugias: 0, realizadas: 0, proximas: 0, canceladas: 0 });
    const [allSurgeries, setAllSurgeries] = useState([]);
    
    // Statistics Filter State
    const [statsFilterType, setStatsFilterType] = useState('all'); // 'all', 'month', 'year', 'range'
    const [statsMonth, setStatsMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [statsYear, setStatsYear] = useState(new Date().getFullYear().toString());
    const [statsDateStart, setStatsDateStart] = useState('');
    const [statsDateEnd, setStatsDateEnd] = useState('');
    const [statsByOS, setStatsByOS] = useState({});
    const [statsOSFilter, setStatsOSFilter] = useState('all');
    const [availableOS, setAvailableOS] = useState([]);
    const [selectedOSForCodes, setSelectedOSForCodes] = useState('');

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

    const translatePermission = (key) => {
        const translations = {
            can_view_admin: "Ver Admin",
            can_manage_users: "Gestionar Usuarios",
            can_view_shared_catalog: "Ver Caja Compartida",
            can_view_ordenes: "Ver Órdenes",
            can_share_ordenes: "Compartir Órdenes",
            can_approve_ordenes: "Aprobar Órdenes",
            can_delete_data: "Eliminar Datos",
            can_edit_own: "Editar Propios",
            can_delete_own: "Eliminar Propios",
            is_ephemeral: "Cuenta Efímera (24h)",
            view_global_calendar: "Ver Calendario Global",
            view_audit: "Ver Auditoría",
            readonly_caja: "Caja (Solo Lectura)",
            manage_users: "Administrar Usuarios",
            view_admin: "Ver Panel Admin",
            delete_data: "Borrar Datos",
            share_ordenes: "Enviar Órdenes",
            view_ordenes: "Ver Órdenes",
            view_shared_catalog: "Ver Catálogo Compartido",
            approve_ordenes: "Aprobar Órdenes"
        };
        return translations[key] || key.replace(/_/g, ' ');
    };

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

            // 5. Fetch Professionals (Global Access)
            const profsSnap = await getDocs(collection(db, "profesionales"));
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

            // 7. Fetch Stats for Surgeries
            const ordenesSnap = await getDocs(collection(db, "ordenes_internacion"));
            const fetchedSurgeries = [];
            ordenesSnap.forEach(d => fetchedSurgeries.push({ id: d.id, ...d.data() }));
            setAllSurgeries(fetchedSurgeries);

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

    useEffect(() => {
        let totalCirugias = 0;
        let realizadas = 0;
        let proximas = 0;
        let canceladas = 0;
        const todayStr = new Date().toISOString().split('T')[0];
        const osStats = {};
        const osSet = new Set();

        allSurgeries.forEach(data => {
            const os = (data.obraSocial || 'SIN OBRA SOCIAL').trim().toUpperCase();
            osSet.add(os);

            const dateStr = data.fechaCirugia || data.date || data.createdAt || '';
            if (!dateStr) return;

            let include = false;
            if (statsFilterType === 'all') {
                include = true;
            } else if (statsFilterType === 'month') {
                include = dateStr.startsWith(`${statsYear}-${statsMonth}`);
            } else if (statsFilterType === 'year') {
                include = dateStr.startsWith(statsYear);
            } else if (statsFilterType === 'range') {
                include = (!statsDateStart || dateStr >= statsDateStart) && (!statsDateEnd || dateStr <= statsDateEnd);
            }

            if (include) {
                // Filtro global por Obra Social para los contadores
                if (statsOSFilter === 'all' || os === statsOSFilter) {
                    totalCirugias++;
                    if (data.suspendida) {
                        canceladas++;
                    } else if (dateStr < todayStr) {
                        realizadas++;
                    } else {
                        proximas++;
                    }
                }

                // Siempre calculamos el desglose de códigos por OS (independiente del filtro global de contadores)
                if (!osStats[os]) osStats[os] = {};
                
                const codes = data.codigosCirugia || [];
                codes.forEach(c => {
                    const codeKey = c.codigo || c.nombre || 'SIN CÓDIGO';
                    if (codeKey) {
                        osStats[os][codeKey] = (osStats[os][codeKey] || 0) + 1;
                    }
                });
            }
        });

        setStats({ totalCirugias, realizadas, proximas, canceladas });
        setStatsByOS(osStats);
        setAvailableOS(Array.from(osSet).sort());
    }, [allSurgeries, statsFilterType, statsMonth, statsYear, statsDateStart, statsDateEnd, statsOSFilter]);

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
        if (isLocalEnv) {
            alert("🔒 SEGURIDAD LOCAL: No se permite eliminar autorizaciones de la nube desde el entorno local para evitar pérdida de datos accidental.");
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
        if (isLocalEnv) {
            alert("🔒 SEGURIDAD LOCAL: No se permite eliminar roles globales desde el entorno local.");
            return;
        }
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
        if (isLocalEnv) {
            alert("⚠️ BLOQUEO DE SEGURIDAD: Estás en modo LOCAL. El borrado masivo de datos está desactivado para proteger la base de datos de producción.");
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
        if (isLocalEnv) {
            alert("🔒 Acción denegada en LOCAL para proteger el historial de la nube.");
            return;
        }
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

    const handleNormalizeObraSocial = async () => {
        if (isLocalEnv) {
            alert("🔒 Acción denegada en LOCAL para proteger el historial de la nube.");
            return;
        }
        if (!window.confirm("¿Seguro que deseas normalizar todas las obras sociales en la base de datos?\n\nEsto unificará variaciones (ej: 'Apros', 'apross' -> 'APROSS', 'Osde' -> 'OSDE') en todas las colecciones para corregir las estadísticas.")) return;
        
        setLoading(true);
        try {
            const collectionsToNormalize = ['ordenes_internacion', 'pedidos_medicos', 'caja'];
            let updatedCount = 0;
            
            for (const colName of collectionsToNormalize) {
                const q = query(collection(db, colName));
                const snap = await getDocs(q);
                
                for (const docSnap of snap.docs) {
                    const data = docSnap.data();
                    // En ordenes_internacion y pedidos_medicos el campo es 'obraSocial'
                    // En caja el campo es 'obra_social'
                    const osField = data.obraSocial !== undefined ? 'obraSocial' : (data.obra_social !== undefined ? 'obra_social' : null);
                    
                    if (osField && data[osField]) {
                        let os = data[osField];
                        let normalized = os.trim().toUpperCase();
                        
                        // Reglas de normalización
                        if (/^APROS/i.test(normalized)) normalized = "APROSS";
                        else if (/^OSDE/i.test(normalized)) normalized = "OSDE";
                        else if (/^OMINT/i.test(normalized)) normalized = "OMINT";
                        else if (/SANCOR/i.test(normalized)) normalized = "SANCOR SALUD";
                        else if (/SWISS/i.test(normalized)) normalized = "SWISS MEDICAL";
                        else if (/OSECAC/i.test(normalized)) normalized = "OSECAC";
                        else if (/OSPEDY/i.test(normalized)) normalized = "OSPEDYC";
                        else if (/JER[AÁ]RQUICOS/i.test(normalized)) normalized = "JERARQUICOS SALUD";
                        else if (/NOBIS/i.test(normalized)) normalized = "NOBIS";
                        else if (/SIPSSA/i.test(normalized)) normalized = "SIPSSA";
                        else if (/MET/i.test(normalized)) normalized = "MET MEDICINA PRIVADA";
                        else if (/PREVENCI[OÓ]N/i.test(normalized)) normalized = "PREVENCION SALUD";
                        else if (/GALENO/i.test(normalized)) normalized = "GALENO";
                        else if (/MEDIFE/i.test(normalized)) normalized = "MEDIFE";
                        else if (/DASPU/i.test(normalized)) normalized = "DASPU";
                        
                        if (os !== normalized) {
                            await updateDoc(docSnap.ref, { [osField]: normalized });
                            updatedCount++;
                        }
                    }
                }
            }
            alert(`¡Normalización completada! Se actualizaron ${updatedCount} registros.`);
            fetchData();
        } catch (error) {
            alert("Error al normalizar: " + error.message);
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
                {(isSuperAdmin || permissions?.can_manage_users) && (
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        Usuarios y Permisos
                    </button>
                )}
                {(isSuperAdmin || permissions?.can_view_stats) && (
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'stats' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        Estadísticas
                    </button>
                )}
                {isSuperAdmin && (
                    <>
                        <button
                            onClick={() => setActiveTab('maintenance')}
                            className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'maintenance' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        >
                            Mantenimiento
                        </button>
                        <button
                            onClick={() => setActiveTab('backup')}
                            className={`px-6 py-2 rounded-xl font-bold transition-all ${activeTab === 'backup' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        >
                            Backup / Migración
                        </button>
                    </>
                )}
            </div>

            {activeTab === 'users' && (isSuperAdmin || permissions?.can_manage_users) ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Authorized Emails */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                                <Mail size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Usuarios Autorizados</h3>
                        </div>

                        <form onSubmit={handleAddAuthorized} className="flex flex-col gap-3 mb-8">
                            <div className="flex flex-wrap gap-3">
                                <div className="flex-1 min-w-[200px] relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="email"
                                        placeholder="nuevo@usuario.com"
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                    <select
                                        className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
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
                                <div key={auth.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl group hover:border-blue-200 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                                            {auth.email[0].toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-700 dark:text-slate-200">{auth.email}</span>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{auth.role}</span>
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
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                <Users size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Cuentas Activas</h3>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredDoctors.map(doctor => (
                                <div key={doctor.uid} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl hover:border-slate-300 dark:hover:border-slate-600 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <Activity size={18} className="text-blue-500" />
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{doctor.profile?.displayName || doctor.profile?.email || 'Sin Nombre'}</p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500">{doctor.count} Registros</p>
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
            ) : activeTab === 'stats' ? (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                                <PieChart size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Estadísticas de Cirugías</h3>
                        </div>
                        
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <select 
                                value={statsFilterType} 
                                onChange={(e) => setStatsFilterType(e.target.value)}
                                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm font-bold text-slate-700 dark:text-slate-200"
                            >
                                <option value="all">Historico (Todo)</option>
                                <option value="month">Por Mes</option>
                                <option value="year">Por Año</option>
                                <option value="range">Rango de Fechas</option>
                            </select>

                            {statsFilterType === 'month' && (
                                <>
                                    <select 
                                        value={statsMonth} 
                                        onChange={(e) => setStatsMonth(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm text-slate-700 dark:text-slate-200"
                                    >
                                        <option value="01">Ene</option>
                                        <option value="02">Feb</option>
                                        <option value="03">Mar</option>
                                        <option value="04">Abr</option>
                                        <option value="05">May</option>
                                        <option value="06">Jun</option>
                                        <option value="07">Jul</option>
                                        <option value="08">Ago</option>
                                        <option value="09">Sep</option>
                                        <option value="10">Oct</option>
                                        <option value="11">Nov</option>
                                        <option value="12">Dic</option>
                                    </select>
                                    <input 
                                        type="number" 
                                        value={statsYear} 
                                        onChange={(e) => setStatsYear(e.target.value)}
                                        className="w-20 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm text-slate-700 dark:text-slate-200"
                                    />
                                </>
                            )}

                            {statsFilterType === 'year' && (
                                <input 
                                    type="number" 
                                    value={statsYear} 
                                    onChange={(e) => setStatsYear(e.target.value)}
                                    className="w-24 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm text-slate-700 dark:text-slate-200"
                                />
                            )}

                            {statsFilterType === 'range' && (
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="date" 
                                        value={statsDateStart} 
                                        onChange={(e) => setStatsDateStart(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm text-slate-700 dark:text-slate-200"
                                    />
                                    <span className="text-slate-400">-</span>
                                    <input 
                                        type="date" 
                                        value={statsDateEnd} 
                                        onChange={(e) => setStatsDateEnd(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm text-slate-700 dark:text-slate-200"
                                    />
                                </div>
                            )}

                            <SearchableSelect 
                                options={availableOS}
                                value={statsOSFilter}
                                onChange={setStatsOSFilter}
                                placeholder="Filtrar por Obra Social"
                                icon={Filter}
                                showAllOption={true}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">Totales</p>
                            <p className="text-3xl font-black text-slate-800 dark:text-white">{stats.totalCirugias}</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-1">Realizadas</p>
                            <p className="text-3xl font-black text-slate-800 dark:text-white">{stats.realizadas}</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-100 dark:border-amber-800/50">
                            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">Próximas</p>
                            <p className="text-3xl font-black text-slate-800 dark:text-white">{stats.proximas}</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-2xl border border-red-100 dark:border-red-800/50">
                            <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-1">Canceladas</p>
                            <p className="text-3xl font-black text-slate-800 dark:text-white">{stats.canceladas}</p>
                        </div>
                    </div>

                    {/* Simple Bar Chart UI using Tailwind */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6 uppercase tracking-wider">Distribución de Estados</h4>
                        
                        {stats.totalCirugias > 0 ? (
                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between text-sm font-bold mb-2">
                                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Realizadas</span>
                                        <span className="text-slate-600 dark:text-slate-300">{Math.round((stats.realizadas / stats.totalCirugias) * 100)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                                        <div className="bg-emerald-500 h-4 rounded-full transition-all duration-1000" style={{ width: `${(stats.realizadas / stats.totalCirugias) * 100}%` }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-sm font-bold mb-2">
                                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div>Próximas</span>
                                        <span className="text-slate-600 dark:text-slate-300">{Math.round((stats.proximas / stats.totalCirugias) * 100)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                                        <div className="bg-amber-500 h-4 rounded-full transition-all duration-1000" style={{ width: `${(stats.proximas / stats.totalCirugias) * 100}%` }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-sm font-bold mb-2">
                                        <span className="text-red-600 dark:text-red-400 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div>Canceladas</span>
                                        <span className="text-slate-600 dark:text-slate-300">{Math.round((stats.canceladas / stats.totalCirugias) * 100)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                                        <div className="bg-red-500 h-4 rounded-full transition-all duration-1000" style={{ width: `${(stats.canceladas / stats.totalCirugias) * 100}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-center text-slate-500 font-medium py-4">No hay cirugías registradas.</p>
                        )}
                    </div>

                    {/* Codes by OS Table */}
                    <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <Activity className="text-blue-500" size={20} />
                                <h4 className="text-lg font-bold text-slate-800 dark:text-white">Códigos por Obra Social</h4>
                            </div>
                            
                            <SearchableSelect 
                                options={availableOS}
                                value={selectedOSForCodes}
                                onChange={setSelectedOSForCodes}
                                placeholder="Elegir Obra Social..."
                                icon={Search}
                            />
                        </div>
                        
                        <div className="overflow-x-auto">
                            {selectedOSForCodes ? (
                                statsByOS[selectedOSForCodes] ? (
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/30">
                                                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Obra Social</th>
                                                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Códigos / Prácticas</th>
                                                <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400 text-right">Cant.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            <tr className="bg-blue-50/20 dark:bg-blue-900/10">
                                                <td colSpan="2" className="px-6 py-3 font-black text-blue-600 dark:text-blue-400 text-sm">
                                                    {selectedOSForCodes}
                                                </td>
                                                <td className="px-6 py-3 font-black text-blue-600 dark:text-blue-400 text-sm text-right">
                                                    {Object.values(statsByOS[selectedOSForCodes]).reduce((sum, val) => sum + val, 0)}
                                                </td>
                                            </tr>
                                            {Object.entries(statsByOS[selectedOSForCodes])
                                                .sort((a, b) => b[1] - a[1])
                                                .map(([code, count]) => (
                                                <tr key={code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-3 pl-12 text-slate-400 text-xs italic">
                                                        —
                                                    </td>
                                                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300 text-sm font-medium">
                                                        {code}
                                                    </td>
                                                    <td className="px-6 py-3 text-slate-900 dark:text-white text-sm font-black text-right">
                                                        {count}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-12 text-center text-slate-500 font-medium">
                                        No hay datos para {selectedOSForCodes} en este período.
                                    </div>
                                )
                            ) : (
                                <div className="p-12 text-center">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
                                        <Search size={24} />
                                    </div>
                                    <p className="text-slate-500 font-medium">Selecciona una Obra Social para ver el desglose de códigos.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'roles' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Create Role */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-bold mb-6 text-slate-800 dark:text-white">Nuevo Rol</h3>
                        <form onSubmit={handleCreateRole} className="space-y-4">
                            <input
                                type="text"
                                value={roleName}
                                onChange={(e) => setRoleName(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                                placeholder="Nombre (ej: Secretaria)"
                                required
                            />
                            <div className="space-y-2">
                                {Object.keys(rolePermissions).map(perm => (
                                    <label key={perm} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={rolePermissions[perm]}
                                            onChange={(e) => setRolePermissions(prev => ({ ...prev, [perm]: e.target.checked }))}
                                            className="w-5 h-5 accent-blue-600"
                                        />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                            {translatePermission(perm)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">Guardar Rol</button>
                        </form>
                    </div>

                    {/* Roles List */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-bold mb-6 text-slate-800 dark:text-white">Roles Existentes</h3>
                        <div className="space-y-4">
                            {roles.map(role => (
                                <div key={role.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100">{role.name}</h4>
                                        {!role.isSystem && <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-red-500"><Trash2 size={16} /></button>}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(role.permissions || {}).map(([k, v]) => (
                                            v && <span key={k} className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-[9px] font-bold uppercase">
                                                {translatePermission(k)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'maintenance' && isSuperAdmin ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Borrado por Rango */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-bold mb-8 text-slate-800 dark:text-white">Borrado por Rango</h3>
                        <div className="space-y-4">
                            <select
                                value={maintenanceUser}
                                onChange={(e) => setMaintenanceUser(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                            >
                                <option value="">Seleccionar cuenta...</option>
                                {allDoctors.map(d => <option key={d.uid} value={d.uid}>{d.profile?.email || d.uid}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white" />
                                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white" />
                            </div>
                            <button onClick={handleDeleteByRange} className="w-full py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100">
                                Eliminar en Rango
                            </button>
                        </div>
                    </div>

                    {/* Herramientas Globales */}
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Herramientas Globales</h3>
                        <p className="text-sm text-slate-500 mb-6">Mantenimiento masivo de datos en toda la aplicación.</p>
                        <div className="space-y-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl">
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Estandarizar Obras Sociales</h4>
                                <p className="text-xs text-slate-500 mb-4">Corrige errores de tipeo y mayúsculas en todas las obras sociales guardadas para mejorar las estadísticas.</p>
                                <button onClick={handleNormalizeObraSocial} className="w-full py-3 bg-slate-800 text-white dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl font-bold hover:bg-slate-900 shadow-lg transition-all">
                                    Normalizar Datos
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'backup' && isSuperAdmin ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Exportar Datos</h3>
                        <p className="text-sm text-slate-500 mb-6">Descarga un backup JSON completo de un usuario.</p>
                        <select
                            value={maintenanceUser}
                            onChange={(e) => setMaintenanceUser(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl mb-4 text-slate-900 dark:text-white"
                        >
                            <option value="">Seleccionar cuenta...</option>
                            {allDoctors.map(d => <option key={d.uid} value={d.uid}>{d.profile?.email || d.uid}</option>)}
                        </select>
                        <button onClick={handleExportData} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700">
                            <Download size={20} /> Exportar JSON
                        </button>
                    </div>
                    <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Importar Datos</h3>
                        <p className="text-sm text-slate-500 mb-6">Carga un backup JSON en una cuenta.</p>
                        <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition min-h-[160px] flex flex-col items-center justify-center">
                            <input type="file" onChange={handleImportData} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <FileJson size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">Seleccionar Archivo</span>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default AdminView;
