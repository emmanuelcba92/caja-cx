import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, isLocalEnv } from '../firebase/config';
import { supabase } from '../supabase/config';
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { 
    collection, getDocs, doc, setDoc, updateDoc, deleteDoc, 
    query, where, orderBy, addDoc, getDoc, writeBatch,
    getCountFromServer, limit
} from "firebase/firestore";
import { 
    Shield, UserPlus, Trash2, Mail, Users, ArrowRight, Search, Activity, 
    Download, Upload, Database, FileJson, AlertTriangle, PieChart, 
    ChevronDown, Filter, CheckCircle2, UserCheck, ShieldCheck, 
    Calendar, RefreshCw, Layers, HardDrive, Key, LayoutDashboard, FileText, X,
    History as HistoryIcon, ShieldAlert, Zap, MessageCircle, Save, Building2, User, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

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
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-blue-500 dark:hover:border-blue-500 transition-all min-w-[220px] justify-between shadow-sm"
            >
                <div className="flex items-center gap-2 truncate">
                    {Icon && <Icon size={16} className="text-blue-500" />}
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
                                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
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
                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${value === 'all' ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-600 dark:text-slate-300'}`}
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
                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${value === opt ? 'text-blue-600 font-bold bg-blue-50/50' : 'text-slate-600 dark:text-slate-300'}`}
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
    const [activeTab, setActiveTab] = useState('seguridad');
    const [profiles, setProfiles] = useState({});
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showUserCreateModal, setShowUserCreateModal] = useState(false);
    const [newUserForm, setNewUserForm] = useState({
        email: '',
        password: '',
        displayName: '',
        role: 'user',
        specialty: '',
        mp: '',
        me: ''
    });
    const [dashboardLoaded, setDashboardLoaded] = useState(false);
    const [whatsappTemplates, setWhatsappTemplates] = useState({
        paciente: 'Buen día, le escribe Emmanuel del área de internaciones COAT.\n\n *{paciente}* tiene agendada una cirugía el día *{fecha}* con *{profesional}*.\n\nLe informamos que en el caso de su obra social, la autorización debe ser gestionada personalmente por el paciente ante la misma. Cualquier duda quedamos a su disposición.',
        institucional: 'Buen día, le escribe Emmanuel del área de internaciones COAT.\n\n *{paciente}* tiene agendada una cirugía el día *{fecha}* con *{profesional}*.\n\nEn el caso de su obra social, la autorización la gestionamos nosotros.\n\nPara poder comenzar la gestión con su obra social le voy a solicitar que envíe estudios realizados de nariz, garganta y oído.'
    });
    const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const secondaryConfig = {
                apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
                authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
                projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
                storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                appId: import.meta.env.VITE_FIREBASE_APP_ID
            };
            
            const secondaryApp = initializeApp(secondaryConfig, "Secondary");
            const secondaryAuth = getAuth(secondaryApp);
            
            const userCredential = await createUserWithEmailAndPassword(
                secondaryAuth, 
                newUserForm.email, 
                newUserForm.password
            );
            const uid = userCredential.user.uid;
            
            await setDoc(doc(db, "profiles", uid), {
                email: newUserForm.email.toLowerCase(),
                displayName: newUserForm.displayName,
                role: newUserForm.role,
                specialty: newUserForm.specialty || '',
                mp: newUserForm.mp || '',
                me: newUserForm.me || '',
                createdAt: new Date().toISOString()
            });
            
            await addDoc(collection(db, "authorized_emails"), {
                email: newUserForm.email.toLowerCase().trim(),
                role: newUserForm.role,
                addedAt: new Date().toISOString(),
                ownerUid: currentUser.uid
            });
            
            await signOut(secondaryAuth);
            await secondaryApp.delete();
            
            alert("Usuario creado exitosamente.");
            setShowUserCreateModal(false);
            setNewUserForm({ email: '', password: '', displayName: '', role: 'user', specialty: '', mp: '', me: '' });
            fetchData();
        } catch (error) {
            console.error("Error creando usuario:", error);
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Load WhatsApp Templates
    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const docSnap = await getDoc(doc(db, "settings", "whatsapp_templates"));
                if (docSnap.exists()) {
                    setWhatsappTemplates(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching templates:", error);
            }
        };
        fetchTemplates();
    }, []);

    const handleSaveTemplates = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, "settings", "whatsapp_templates"), whatsappTemplates);
            toast.success("Templates guardados correctamente");
        } catch (error) {
            console.error("Error saving templates:", error);
            toast.error("Error al guardar templates");
        } finally {
            setLoading(false);
        }
    };
    
    const [roles, setRoles] = useState([]);
    const [maintenanceUser, setMaintenanceUser] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [notificationEmails, setNotificationEmails] = useState('');
    const [scriptUrl, setScriptUrl] = useState('');
    const [appNotificationUids, setAppNotificationUids] = useState([]);
    const [stats, setStats] = useState({ totalCirugias: 0, realizadas: 0, proximas: 0, canceladas: 0 });
    const [firestoreUsage, setFirestoreUsage] = useState({ 
        totalDocs: 0, 
        totalSizeKB: 0,
        collections: { 
            caja: { count: 0, size: 0 }, 
            ordenes: { count: 0, size: 0 }, 
            profesionales: { count: 0, size: 0 }, 
            pacientes: { count: 0, size: 0 },
            reminders: { count: 0, size: 0 }, 
            notes: { count: 0, size: 0 } 
        } 
    });
    const [allSurgeries, setAllSurgeries] = useState([]);
    const [supabaseStats, setSupabaseStats] = useState({ count: 0, sizeMB: 0 });
    
    const [statsFilterType, setStatsFilterType] = useState('all');
    const [statsMonth, setStatsMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [statsYear, setStatsYear] = useState(new Date().getFullYear().toString());
    const [statsDateStart, setStatsDateStart] = useState('');
    const [statsDateEnd, setStatsDateEnd] = useState('');
    const [statsByOS, setStatsByOS] = useState({});
    const [statsOSFilter, setStatsOSFilter] = useState('all');
    const [availableOS, setAvailableOS] = useState([]);
    const [selectedOSForCodes, setSelectedOSForCodes] = useState('');

    const [roleName, setRoleName] = useState('');
    const [rolePermissions, setRolePermissions] = useState({
        can_view_admin: false,
        can_manage_users: false,
        can_view_shared_catalog: false,
        can_view_ordenes: false,
        can_share_ordenes: false,
        can_approve_ordenes: false,
        can_view_stats: false,
        can_delete_data: false,
        is_ephemeral: false
    });

    const [allProfessionals, setAllProfessionals] = useState([]);
    const [selectedLinkedProf, setSelectedLinkedProf] = useState('');
    const [remapImport, setRemapImport] = useState(true);

    const translatePermission = (key) => {
        const translations = {
            can_view_admin: "Ver Admin",
            can_manage_users: "Gestionar Usuarios",
            can_view_shared_catalog: "Ver Caja Compartida",
            can_view_ordenes: "Ver Órdenes",
            can_share_ordenes: "Compartir Órdenes",
            can_approve_ordenes: "Aprobar Órdenes",
            can_view_stats: "Ver Estadísticas",
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

    const estimateSize = (data) => {
        if (!data || (Array.isArray(data) && data.length === 0)) return 0;
        try {
            const sample = Array.isArray(data) ? data : [data];
            const str = JSON.stringify(sample);
            return str.length / 1024;
        } catch (e) { return 0; }
    };

    const fetchData = async () => {
        setLoading(true);
        const usage = {
            totalSizeKB: 0,
            collections: {
                caja: { count: 0, size: 0 },
                ordenes: { count: 0, size: 0 },
                profesionales: { count: 0, size: 0 },
                pacientes: { count: 0, size: 0 },
                reminders: { count: 0, size: 0 },
                notes: { count: 0, size: 0 }
            }
        };

        try {
            try {
                const authSnap = await getDocs(collection(db, "authorized_emails"));
                const authList = authSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAuthorizedEmails(authList);
                runPruebaCleanup(authList);
            } catch (e) { console.error("Error fetching auth emails:", e); }

            try {
                const profSnap = await getDocs(collection(db, "profiles"));
                let profMap = {};
                profSnap.forEach(d => { profMap[d.id] = d.data(); });
                setProfiles(profMap);
            } catch (e) { console.error("Error fetching profiles:", e); }

            try {
                const cajaCount = await getCountFromServer(collection(db, "caja"));
                usage.collections.caja.count = cajaCount.data().count;
                const cajaSample = await getDocs(query(collection(db, "caja"), limit(10)));
                const actualSampleSize = cajaSample.docs.length;
                const avgSize = actualSampleSize > 0 ? estimateSize(cajaSample.docs.map(d => d.data())) / actualSampleSize : 0;
                usage.collections.caja.size = avgSize * usage.collections.caja.count;
            } catch (e) { console.error("Error counting/estimating caja:", e); }

            try {
                const rolesSnap = await getDocs(collection(db, "roles"));
                setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.error("Error fetching roles:", e); }

            try {
                const profsCount = await getCountFromServer(collection(db, "profesionales"));
                usage.collections.profesionales.count = profsCount.data().count;
                const profsSnap = await getDocs(collection(db, "profesionales"));
                const profsData = profsSnap.docs.map(doc => doc.data());
                setAllProfessionals([...new Set(profsData.map(d => d.nombre))].sort());
                usage.collections.profesionales.size = estimateSize(profsData);
            } catch (e) { console.error("Error fetching profesionales:", e); }

            try {
                const emailDoc = await getDoc(doc(db, "settings", "notifications"));
                if (emailDoc.exists()) {
                    setNotificationEmails(emailDoc.data().emails || '');
                    setScriptUrl(emailDoc.data().scriptUrl || '');
                    setAppNotificationUids(emailDoc.data().appNotificationUids || []);
                }
            } catch (e) { console.error("Error fetching settings:", e); }

            try {
                const patientsCount = await getCountFromServer(collection(db, "pacientes"));
                usage.collections.pacientes.count = patientsCount.data().count;
                const patientsSample = await getDocs(query(collection(db, "pacientes"), limit(10)));
                const actualSampleSize = patientsSample.docs.length;
                const avgSize = actualSampleSize > 0 ? estimateSize(patientsSample.docs.map(d => d.data())) / actualSampleSize : 0;
                usage.collections.pacientes.size = avgSize * usage.collections.pacientes.count;
            } catch (e) { console.error("Error counting/estimating pacientes:", e); }

            try {
                const ordenesCount = await getCountFromServer(collection(db, "ordenes_internacion"));
                usage.collections.ordenes.count = ordenesCount.data().count;
                const ordenesSnap = await getDocs(collection(db, "ordenes_internacion"));
                const ordenesData = ordenesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setAllSurgeries(ordenesData);
                usage.collections.ordenes.size = estimateSize(ordenesData);
            } catch (e) { console.error("Error fetching ordenes:", e); }

            try {
                const fetchStorageStats = async () => {
                    let totalFiles = 0;
                    let totalSizeBytes = 0;
                    const listRecursive = async (path = '') => {
                        const { data, error } = await supabase.storage.from('Cirugias').list(path);
                        if (error) throw error;
                        for (const item of data) {
                            if (item.id === null) {
                                await listRecursive(path ? `${path}/${item.name}` : item.name);
                            } else {
                                totalFiles++;
                                totalSizeBytes += item.metadata.size || 0;
                            }
                        }
                    };
                    await listRecursive('');
                    setSupabaseStats({
                        count: totalFiles,
                        sizeMB: totalSizeBytes / (1024 * 1024)
                    });
                };
                fetchStorageStats();
            } catch (e) { console.error("Error fetching Supabase stats:", e); }

            try {
                const remindersCount = await getCountFromServer(collection(db, "reminders"));
                usage.collections.reminders.count = remindersCount.data().count;
            } catch (e) { console.warn("Reminders restricted:", e); }

            try {
                const notesCount = await getCountFromServer(collection(db, "notes"));
                usage.collections.notes.count = notesCount.data().count;
            } catch (e) { console.warn("Notes restricted:", e); }

            usage.totalDocs = Object.values(usage.collections).reduce((sum, col) => sum + col.count, 0);
            usage.totalSizeKB = Object.values(usage.collections).reduce((sum, col) => sum + (col.size || 0), 0);
            setFirestoreUsage(usage);

        } catch (error) {
            console.error("Critical Admin Fetch Error:", error);
            toast.error("Error parcial al cargar administración");
        } finally {
            setLoading(false);
        }
    };

    const runNotificationCleanup = async () => {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const limitIso = sevenDaysAgo.toISOString();
            const q = query(collection(db, "notifications"), where("createdAt", "<", limitIso));
            const snap = await getDocs(q);
            if (snap.empty) return;
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        } catch (error) {
            console.error("Error cleaning up notifications:", error);
        }
    };

    useEffect(() => {
        if ((activeTab === 'dashboard' || activeTab === 'intelligence') && !dashboardLoaded) {
            fetchData();
            setDashboardLoaded(true);
        }
    }, [activeTab, dashboardLoaded]);

    useEffect(() => {
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
            if (statsFilterType === 'all') include = true;
            else if (statsFilterType === 'month') include = dateStr.startsWith(`${statsYear}-${statsMonth}`);
            else if (statsFilterType === 'year') include = dateStr.startsWith(statsYear);
            else if (statsFilterType === 'range') include = (!statsDateStart || dateStr >= statsDateStart) && (!statsDateEnd || dateStr <= statsDateEnd);

            if (include) {
                if (statsOSFilter === 'all' || os === statsOSFilter) {
                    totalCirugias++;
                    if (data.suspendida) canceladas++;
                    else if (dateStr < todayStr) realizadas++;
                    else proximas++;
                }
                if (!osStats[os]) osStats[os] = {};
                const codes = data.codigosCirugia || [];
                codes.forEach(c => {
                    const codeKey = c.codigo || c.nombre || 'SIN CÓDIGO';
                    if (codeKey) osStats[os][codeKey] = (osStats[os][codeKey] || 0) + 1;
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
        const pruebaUids = profSnap.docs.filter(d => pruebaEmails.includes(d.data().email)).map(d => d.id);
        if (pruebaUids.length === 0) return;
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        const yesterdayIso = yesterday.toISOString();
        const collectionsToClean = ['caja', 'notes', 'profesionales'];
        for (const colName of collectionsToClean) {
            for (const uid of pruebaUids) {
                const q = query(collection(db, colName), where("userId", "==", uid));
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
            alert("­ƒöÆ SEGURIDAD LOCAL: No se permite eliminar autorizaciones de la nube desde el entorno local.");
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
                can_view_stats: false,
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
            alert("­ƒöÆ SEGURIDAD LOCAL: No se permite eliminar roles globales desde el entorno local.");
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

    const handleWipeData = async (uid) => {
        const email = profiles[uid]?.email || uid;
        if (email === SUPER_ADMIN_EMAIL) {
            alert("No puedes eliminar los datos del Super Administrador.");
            return;
        }
        if (isLocalEnv) {
            alert("BLOQUEO DE SEGURIDAD: Estás en modo LOCAL. El borrado masivo de datos está desactivado.");
            return;
        }
        if (!window.confirm(`ADVERTENCIA CRÍTICA: ¿Estás SEGURO de que quieres BORRAR TODA LA INFORMACIÓN de: ${email}?`)) return;
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
            alert("Acción denegada en LOCAL.");
            return;
        }
        if (!window.confirm(`ADVERTENCIA: ¿Seguro de borrar las órdenes de ${email} entre ${startDate} y ${endDate}?`)) return;
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
            alert("Acción denegada en LOCAL.");
            return;
        }
        if (!window.confirm("¿Seguro que deseas normalizar todas las obras sociales?")) return;
        setLoading(true);
        try {
            const collectionsToNormalize = ['ordenes_internacion', 'pedidos_medicos', 'caja'];
            let updatedCount = 0;
            for (const colName of collectionsToNormalize) {
                const q = query(collection(db, colName));
                const snap = await getDocs(q);
                for (const docSnap of snap.docs) {
                    const data = docSnap.data();
                    const osField = data.obraSocial !== undefined ? 'obraSocial' : (data.obra_social !== undefined ? 'obra_social' : null);
                    if (osField && data[osField]) {
                        let os = data[osField];
                        let normalized = os.trim().toUpperCase();
                        if (/^APROS/i.test(normalized)) normalized = "APROSS";
                        else if (/^OSDE/i.test(normalized)) normalized = "OSDE";
                        if (os !== normalized) {
                            await updateDoc(docSnap.ref, { [osField]: normalized });
                            updatedCount++;
                        }
                    }
                }
            }
            alert(`Normalización completada! ${updatedCount} registros actualizados.`);
            fetchData();
        } catch (error) {
            alert("Error al normalizar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExportData = async () => {
        if (!maintenanceUser) {
            alert("Selecciona un usuario.");
            return;
        }
        setLoading(true);
        try {
            const collectionsToExport = ['pedidos_medicos', 'ordenes_internacion', 'profesionales', 'caja', 'notes'];
            const exportData = { version: '1.0', exportDate: new Date().toISOString(), userId: maintenanceUser, data: {} };
            for (const colName of collectionsToExport) {
                const q = query(collection(db, colName), where("userId", "==", maintenanceUser));
                const snap = await getDocs(q);
                exportData.data[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_${maintenanceUser}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncPatientsFromOrders = async () => {
        if (!window.confirm("¿Seguro que deseas sincronizar la base de pacientes desde las órdenes? Esto creará registros para cada paciente único encontrado en las órdenes de internación.")) return;
        
        setLoading(true);
        try {
            const ordersSnap = await getDocs(collection(db, "ordenes_internacion"));
            const orders = ordersSnap.docs.map(d => d.data());
            const patientsMap = new Map();

            orders.forEach(order => {
                const dni = order.dni || order.pacienteDni;
                const nombre = order.afiliado || order.pacienteNombre;
                if (dni && nombre) {
                    if (!patientsMap.has(dni)) {
                        patientsMap.set(dni, {
                            dni: String(dni),
                            nombre: nombre,
                            obraSocial: order.obraSocial || '',
                            numeroAfiliado: order.numeroAfiliado || '',
                            telefono: order.telefono || '',
                            email: order.email || '',
                            lastUpdate: new Date().toISOString()
                        });
                    }
                }
            });

            const patientsToSync = Array.from(patientsMap.values());
            let syncedCount = 0;

            for (const patient of patientsToSync) {
                await setDoc(doc(db, 'pacientes', patient.dni), patient);
                syncedCount++;
            }

            alert(`Sincronización completada. Se procesaron ${syncedCount} pacientes.`);
        } catch (error) {
            console.error("Error syncing patients:", error);
            alert("Error en la sincronización: " + error.message);
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
                if (!window.confirm(`¿Importar en la cuenta de ${importData.userId}?`)) return;
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
                alert(`Importación completada. ${importedCount} documentos.`);
                fetchData();
            } catch (error) {
                alert("Error: " + error.message);
            } finally {
                setLoading(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleSaveEmailConfig = async () => {
        setLoading(true);
        try {
            await setDoc(doc(db, "settings", "notifications"), {
                emails: notificationEmails,
                scriptUrl: scriptUrl,
                appNotificationUids: appNotificationUids,
                updatedAt: new Date().toISOString()
            });
            alert("Configuración de notificaciones guardada correctamente.");
        } catch (error) {
            alert("Error al guardar configuración: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTestEmail = async () => {
        if (!scriptUrl || !notificationEmails) {
            alert("Configura primero la URL y al menos un email.");
            return;
        }
        if (!window.confirm(`¿Enviar un email de prueba a: ${notificationEmails}?`)) return;

        try {
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
            alert("Solicitud de prueba enviada. Revisa los correos (incluyendo SPAM).");
        } catch (error) {
            alert("Error al intentar la prueba: " + error.message);
        }
    };

    const filteredDoctors = allDoctors.filter(d => {
        const search = searchTerm.toLowerCase();
        const email = d.profile?.email?.toLowerCase() || '';
        const name = d.profile?.displayName?.toLowerCase() || '';
        return d.uid.toLowerCase().includes(search) || email.includes(search) || name.includes(search);
    });

    const tabs = [
        { id: 'seguridad', label: 'Seguridad', icon: ShieldAlert, show: isSuperAdmin || permissions?.can_manage_users, color: 'blue' },
        { id: 'intelligence', label: 'Inteligencia', icon: Zap, show: isSuperAdmin || permissions?.can_view_stats, color: 'purple' },
        { id: 'permissions', label: 'Permisos', icon: Key, show: isSuperAdmin, color: 'emerald' },
        { id: 'mantenimiento', label: 'Mantenimiento', icon: RefreshCw, show: isSuperAdmin, color: 'amber' },
        { id: 'infrastructure', label: 'Infraestructura', icon: HardDrive, show: isSuperAdmin, color: 'indigo' },
        { id: 'messages', label: 'Mensajes', icon: MessageCircle, show: isSuperAdmin, color: 'blue' },
        { id: 'notifications', label: 'Alertas', icon: Mail, show: isSuperAdmin, color: 'rose' },
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: isSuperAdmin || permissions?.can_view_stats, color: 'cyan' }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="relative overflow-hidden bg-white dark:bg-slate-950 rounded-[2.5rem] p-6 md:p-8 shadow-xl border border-slate-200 dark:border-white/5">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] -mr-48 -mt-48 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-[80px] -ml-32 -mb-32"></div>
                
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.3)] transform -rotate-3 transition-transform hover:rotate-0">
                            <Shield className="text-white" size={40} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-1">Panel Maestro</h2>
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-black uppercase tracking-widest border border-blue-500/30">
                                    <ShieldCheck size={14} /> Control de Accesos
                                </span>
                                <span className="text-slate-500 font-medium text-sm">Caja v4.0 • Enterprise</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        {[
                            { label: 'Cuentas', value: allDoctors.length, icon: Users, color: 'text-blue-400' },
                            { label: 'Autorizados', value: authorizedEmails.length, icon: UserCheck, color: 'text-emerald-400' },
                            { label: 'Roles', value: roles.length, icon: Key, color: 'text-purple-400' }
                        ].map((stat, i) => (
                            <div key={i} className="px-6 py-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl min-w-[120px] transition-all hover:bg-white/10 hover:scale-105">
                                <div className="flex items-center gap-2 mb-1">
                                    <stat.icon size={14} className={stat.color} />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</span>
                                </div>
                                <p className="text-2xl font-black text-white">{stat.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 p-2 bg-slate-100/50 dark:bg-white/5 backdrop-blur-md rounded-[2rem] w-fit border border-slate-200 dark:border-white/5 shadow-inner">
                {tabs.map(tab => tab.show && (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-[1.2rem] font-black transition-all duration-500 uppercase tracking-widest text-[9px] ${
                            activeTab === tab.id 
                            ? `bg-white dark:bg-slate-800 text-${tab.color}-600 dark:text-${tab.color}-400 shadow-xl shadow-${tab.color}-500/10 scale-105 border border-${tab.color}-500/20` 
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-white/5'
                        }`}
                    >
                        <tab.icon size={16} strokeWidth={activeTab === tab.id ? 3 : 2} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'dashboard' && (isSuperAdmin || permissions?.can_view_stats) && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="premium-card p-5 bg-white dark:bg-slate-900 border-l-4 border-l-blue-500 shadow-xl relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.2em]">Base de Pacientes</p>
                                <Users size={18} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <h4 className="text-3xl font-black text-slate-900 dark:text-white mb-1">{firestoreUsage.collections.pacientes.count}</h4>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Registros Únicos</p>
                        </div>
                        <div className="premium-card p-5 bg-white dark:bg-slate-900 border-l-4 border-l-purple-500 shadow-xl relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-black text-purple-500 dark:text-purple-400 uppercase tracking-[0.2em]">Cirugías Totales</p>
                                <FileText size={18} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <h4 className="text-3xl font-black text-slate-900 dark:text-white mb-1">{firestoreUsage.collections.ordenes.count}</h4>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Historial Médico</p>
                        </div>
                        <div className="premium-card p-5 bg-white dark:bg-slate-900 border-l-4 border-l-pink-500 shadow-xl relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-2">
                                <p className="text-[9px] font-black text-pink-500 dark:text-pink-400 uppercase tracking-[0.2em]">Movimientos Caja</p>
                                <HistoryIcon size={18} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <h4 className="text-3xl font-black text-slate-900 dark:text-white mb-1">{firestoreUsage.collections.caja.count}</h4>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Flujo Financiero</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="premium-card p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-slate-900 dark:text-white">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
                                    <Database size={18} />
                                </div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight uppercase">Datos (Firestore)</h3>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-4xl font-black text-slate-900 dark:text-white">
                                        {firestoreUsage.totalSizeKB > 1024 
                                            ? (firestoreUsage.totalSizeKB / 1024).toFixed(1) 
                                            : firestoreUsage.totalSizeKB.toFixed(1)}
                                    </h4>
                                    <span className="text-lg font-black text-slate-500 mt-2">{firestoreUsage.totalSizeKB > 1024 ? 'MB' : 'KB'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Peso Total Estimado</p>
                                    <div className="px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[8px] font-black uppercase tracking-tighter">Muestreo Activo</div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-blue-400">Caja Diaria</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-300">{firestoreUsage.collections.caja.count} Docs</span>
                                        <span className="text-slate-500 font-bold">{(firestoreUsage.collections.caja.size || 0).toFixed(1)} KB</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-purple-400">Órdenes</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-300">{firestoreUsage.collections.ordenes.count} Docs</span>
                                        <span className="text-slate-500 font-bold">{(firestoreUsage.collections.ordenes.size || 0).toFixed(1)} KB</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-emerald-400">Profesionales</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-300">{firestoreUsage.collections.profesionales.count} Docs</span>
                                        <span className="text-slate-500 font-bold">{(firestoreUsage.collections.profesionales.size || 0).toFixed(1)} KB</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-slate-400">Pacientes</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-slate-300">{firestoreUsage.collections.pacientes.count} Docs</span>
                                        <span className="text-slate-500 font-bold">{(firestoreUsage.collections.pacientes.size || 0).toFixed(1)} KB</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                                    Consumo optimizado: Los documentos se cuentan mediante metadatos del servidor para ahorrar recursos de hardware y ancho de banda.
                                </p>
                            </div>
                        </div>
                        <div className="premium-card p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl text-slate-900 dark:text-white">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                                    <Upload size={18} />
                                </div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight uppercase">Archivos (Supabase)</h3>
                            </div>
                            <div className="space-y-8">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <h4 className="text-4xl font-black text-slate-900 dark:text-white mb-1">
                                            {supabaseStats.sizeMB.toFixed(2)} 
                                            <span className="text-lg text-slate-500 ml-2">MB</span>
                                        </h4>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Capacidad usada</p>
                                    </div>
                                    <div className="text-right">
                                        <h4 className="text-2xl font-black text-emerald-500 mb-1">{supabaseStats.count}</h4>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Archivos</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                        <div 
                                            className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000"
                                            style={{ width: `${Math.min((supabaseStats.sizeMB / 1024) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-relaxed pt-10">
                                    Aloja firmas y PDFs de informes. Límite de 1GB en plan gratuito.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Security / User Management Tab */}
            {activeTab === 'seguridad' && (isSuperAdmin || permissions?.can_manage_users) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Create Account Card */}
                    <div className="premium-card p-5 relative group overflow-hidden border-t-4 border-t-emerald-500 flex flex-col justify-center">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl shadow-inner">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Registro de Usuarios</h3>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest opacity-60">Control de acceso administrativo</p>
                            </div>
                        </div>

                        <div className="bg-slate-50/50 dark:bg-white/5 rounded-3xl p-6 border border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center text-center space-y-4">
                            <div className="w-14 h-14 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-xl border border-slate-100 dark:border-slate-800">
                                <UserPlus size={28} className="text-emerald-500" />
                            </div>
                            <div>
                                <h4 className="text-slate-900 dark:text-white font-black uppercase tracking-widest text-sm">¿Nuevo Integrante?</h4>
                                <p className="text-[11px] text-slate-500 mt-1 px-4 leading-relaxed">Crea una cuenta oficial para el médico o personal administrativo con sus matrículas y especialidades.</p>
                            </div>
                            <button 
                                onClick={() => setShowUserCreateModal(true)}
                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black transition-all shadow-xl shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-[10px]"
                            >
                                <UserPlus size={16} /> Crear Cuenta Ahora
                            </button>
                        </div>
                    </div>

                    {/* Active Accounts Card */}
                    <div className="premium-card p-5 relative group overflow-hidden border-t-4 border-t-blue-500">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl shadow-inner">
                                    <Users size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Cuentas Activas</h3>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest opacity-60">Historial de registros</p>
                                </div>
                            </div>
                        </div>

                        <div className="relative mb-6">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o email..."
                                className="w-full pl-12 pr-4 py-4 bg-slate-50/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl outline-none focus:border-blue-500 transition-all font-bold text-slate-900 dark:text-white text-xs shadow-inner"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredDoctors.map(doctor => (
                                <div key={doctor.uid} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl hover:shadow-xl hover:bg-slate-50 dark:hover:bg-white/10 transition-all group relative overflow-hidden">
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className="relative flex-shrink-0">
                                            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-xl font-black text-slate-400 dark:text-slate-500 overflow-hidden border-2 border-white dark:border-slate-700 shadow-lg group-hover:scale-105 transition-transform duration-500">
                                                {doctor.profile?.photoURL ? (
                                                    <img src={doctor.profile.photoURL} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    doctor.profile?.displayName?.[0] || doctor.profile?.email?.[0]?.toUpperCase() || '?'
                                                )}
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-lg"></div>
                                        </div>
                                        <div className="overflow-hidden">
                                            <h4 className="text-sm font-black text-slate-800 dark:text-white truncate uppercase tracking-tight">{doctor.profile?.displayName || 'Usuario Sin Nombre'}</h4>
                                            <p className="text-xs text-slate-400 font-bold truncate mb-1">{doctor.profile?.email || 'Sin Email'}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-md text-[8px] font-black uppercase tracking-widest">
                                                    {doctor.uid.slice(0, 8)}...
                                                </span>
                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-md text-[8px] font-black uppercase tracking-widest">
                                                    {doctor.profile?.role || 'User'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 sm:mt-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleWipeData(doctor.uid)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all" title="Eliminar Datos">
                                            <Trash2 size={18} />
                                        </button>
                                        <button onClick={() => switchContext(doctor.uid)} className="p-3 text-slate-300 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all" title="Ver Detalles">
                                            <ArrowRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Intelligence Tab */}
            {activeTab === 'intelligence' && (isSuperAdmin || permissions?.can_view_stats) && (
                <div className="space-y-10">
                    <div className="premium-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 border-t-4 border-t-blue-500">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-blue-500 text-white rounded-3xl shadow-xl shadow-blue-500/20 transform -rotate-3">
                                <Activity size={32} />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Análisis Inteligente</h3>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] opacity-60">Visualización de rendimiento quirúrgico</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-white/5 p-3 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-inner">
                            <div className="relative group">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <select 
                                    value={statsFilterType} 
                                    onChange={(e) => setStatsFilterType(e.target.value)} 
                                    className="pl-12 pr-10 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl outline-none text-xs font-black uppercase tracking-widest cursor-pointer hover:border-blue-500 transition-all appearance-none"
                                >
                                    <option value="all">Histórico Total</option>
                                    <option value="month">Por Mes</option>
                                    <option value="year">Por Año</option>
                                    <option value="range">Rango Libre</option>
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                            </div>
                            {statsFilterType === 'month' && (
                                <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-500">
                                    <select value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} className="px-6 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl outline-none text-xs font-black appearance-none hover:border-blue-500 transition-all">
                                        {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <input type="number" value={statsYear} onChange={(e) => setStatsYear(e.target.value)} className="w-28 px-6 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl outline-none text-xs font-black hover:border-blue-500 transition-all" />
                                </div>
                            )}
                            {statsFilterType === 'range' && (
                                <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-500">
                                    <input type="date" value={statsDateStart} onChange={(e) => setStatsDateStart(e.target.value)} className="px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase hover:border-blue-500 transition-all" />
                                    <span className="text-slate-400 font-black">~</span>
                                    <input type="date" value={statsDateEnd} onChange={(e) => setStatsDateEnd(e.target.value)} className="px-5 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase hover:border-blue-500 transition-all" />
                                </div>
                            )}
                            <SearchableSelect 
                                options={availableOS}
                                value={statsOSFilter}
                                onChange={setStatsOSFilter}
                                placeholder="Obra Social"
                                icon={Filter}
                                showAllOption={true}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { label: 'Total Cirugías', value: stats.totalCirugias, color: 'blue', icon: Database, gradient: 'from-blue-500 to-indigo-600' },
                            { label: 'Realizadas', value: stats.realizadas, color: 'emerald', icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-600' },
                            { label: 'Próximas', value: stats.proximas, color: 'amber', icon: Calendar, gradient: 'from-amber-500 to-orange-600' },
                            { label: 'Canceladas', value: stats.canceladas, color: 'rose', icon: AlertTriangle, gradient: 'from-rose-500 to-red-600' }
                        ].map((s, i) => (
                            <div key={i} className="premium-card p-10 group hover:scale-105 transition-all duration-500 cursor-default">
                                <div className={`w-16 h-16 bg-gradient-to-br ${s.gradient} rounded-3xl flex items-center justify-center text-white mb-6 shadow-xl shadow-${s.color}-500/20 transform group-hover:rotate-6 transition-transform`}>
                                    <s.icon size={28} />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">{s.label}</p>
                                <div className="flex items-baseline gap-3">
                                    <p className="text-5xl font-black text-slate-800 dark:text-white leading-none tracking-tighter">{s.value}</p>
                                    <div className={`w-2 h-2 rounded-full bg-${s.color}-500 animate-pulse`}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="premium-card p-5 border-l-4 border-l-blue-500 shadow-xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                                    <PieChart size={20} />
                                </div>
                                <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Distribución de Estados</h4>
                            </div>
                            {stats.totalCirugias > 0 ? (
                                <div className="space-y-10">
                                    {[
                                        { label: 'Realizadas', value: stats.realizadas, color: 'emerald', bg: 'bg-emerald-500' },
                                        { label: 'Próximas', value: stats.proximas, color: 'amber', bg: 'bg-amber-500' },
                                        { label: 'Canceladas', value: stats.canceladas, color: 'rose', bg: 'bg-rose-500' }
                                    ].map((item, i) => (
                                        <div key={i} className="group">
                                            <div className="flex justify-between items-end mb-4">
                                                <div>
                                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] text-${item.color === 'rose' ? 'red' : item.color}-500`}>{item.label}</span>
                                                    <p className="text-2xl font-black text-slate-800 dark:text-white leading-none mt-1">{item.value} <span className="text-xs text-slate-400 font-bold tracking-normal opacity-50 ml-1">UNIDADES</span></p>
                                                </div>
                                                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter opacity-20 group-hover:opacity-100 transition-opacity">
                                                    {Math.round((item.value / stats.totalCirugias) * 100)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-5 overflow-hidden shadow-inner p-1">
                                                <div 
                                                    className={`${item.bg} h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(var(--${item.color}-rgb),0.4)] relative overflow-hidden`}
                                                    style={{ width: `${(item.value / stats.totalCirugias) * 100}%` }}
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-24 text-center">
                                    <div className="w-24 h-24 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <AlertTriangle className="text-slate-300" size={48} />
                                    </div>
                                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Sin datos disponibles para el periodo</p>
                                </div>
                            )}
                        </div>
                        <div className="premium-card overflow-hidden border-l-4 border-l-purple-500 flex flex-col shadow-xl">
                            <div className="p-5 border-b border-slate-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-500/10 text-purple-500 rounded-xl">
                                        <FileJson size={20} />
                                    </div>
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">Códigos por O.S.</h4>
                                </div>
                                <div className="scale-90 origin-right">
                                    <SearchableSelect 
                                        options={availableOS}
                                        value={selectedOSForCodes}
                                        onChange={setSelectedOSForCodes}
                                        placeholder="Seleccionar O.S."
                                        icon={Search}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[500px]">
                                {selectedOSForCodes && statsByOS[selectedOSForCodes] ? (
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-sm">
                                            <tr>
                                                <th className="px-10 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-white/5">Práctica / Código</th>
                                                <th className="px-10 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-white/5 text-right">Cantidad</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                            {Object.entries(statsByOS[selectedOSForCodes])
                                                .sort((a, b) => b[1] - a[1])
                                                .map(([code, count], idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all group">
                                                        <td className="px-10 py-6 font-bold text-slate-700 dark:text-slate-200 text-sm tracking-tight uppercase group-hover:text-purple-500 transition-colors">{code}</td>
                                                        <td className="px-10 py-6 text-right">
                                                            <span className="inline-flex items-center justify-center min-w-[40px] px-4 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-xs shadow-lg shadow-black/10">
                                                                {count}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="p-24 text-center">
                                        <div className="w-24 h-24 bg-purple-50 dark:bg-purple-900/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <Search size={40} className="text-purple-300/50" />
                                        </div>
                                        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Selecciona una Obra Social para analizar</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Permissions Tab */}
            {activeTab === 'permissions' && isSuperAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-purple-500/10 shadow-xl">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl shadow-inner-sm">
                                <Key size={22} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Nuevo Rol</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-60">Matriz de permisos</p>
                            </div>
                        </div>
                        <form onSubmit={handleCreateRole} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Identificador del Rol</label>
                                <input
                                    type="text"
                                    value={roleName}
                                    onChange={(e) => setRoleName(e.target.value)}
                                    className="input-premium focus:ring-purple-500/10 focus:border-purple-500/50"
                                    placeholder="Nombre del Rol (ej: Secretaria)"
                                    required
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Matriz de Permisos</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.keys(rolePermissions).map(perm => (
                                        <label key={perm} className="flex items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl cursor-pointer hover:bg-purple-500/5 dark:hover:bg-purple-500/10 transition-all border border-transparent hover:border-purple-500/20 group">
                                            <div className="relative flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    checked={rolePermissions[perm]}
                                                    onChange={(e) => setRolePermissions(prev => ({ ...prev, [perm]: e.target.checked }))}
                                                    className="w-5 h-5 appearance-none border-2 border-slate-300 dark:border-slate-600 rounded-lg checked:bg-purple-600 checked:border-purple-600 transition-all cursor-pointer"
                                                />
                                                {rolePermissions[perm] && <div className="absolute text-white pointer-events-none text-[10px]">✓</div>}
                                            </div>
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-tight group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                                {translatePermission(perm)}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <button type="submit" className="w-full py-5 bg-purple-600 hover:bg-purple-700 text-white rounded-[2rem] font-black shadow-xl shadow-purple-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                                <CheckCircle2 size={20} />
                                CREAR ROL PERSONALIZADO
                            </button>
                        </form>
                    </div>
                    <div className="premium-card p-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-blue-500/10">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                                Roles Configurados
                            </h3>
                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-black text-slate-500 uppercase">
                                {roles.length} TOTALES
                            </span>
                        </div>
                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {roles.map(role => (
                                <div key={role.id} className="p-6 border border-slate-100 dark:border-slate-800/50 rounded-3xl bg-white dark:bg-slate-800/20 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all group">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-3 h-3 rounded-full ${role.isSystem ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]'}`}></div>
                                            <div>
                                                <h4 className="font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">{role.name}</h4>
                                                {role.isSystem && <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase">Sistema</span>}
                                            </div>
                                        </div>
                                        {!role.isSystem && (
                                            <button 
                                                onClick={() => handleDeleteRole(role.id)} 
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(role.permissions || {}).map(([k, v]) => (
                                            v && <span key={k} className="px-2.5 py-1 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 rounded-lg text-[8px] font-black uppercase tracking-wider border border-slate-100 dark:border-slate-800 shadow-sm">
                                                {translatePermission(k)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && isSuperAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-blue-500/10">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-4 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl shadow-inner-sm">
                                <Mail size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Alertas Automáticas</h3>
                                <p className="text-sm text-slate-500 font-medium">Google Apps Script Integration</p>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Destinatarios (separados por coma)</label>
                                <input
                                    type="text"
                                    value={notificationEmails}
                                    onChange={(e) => setNotificationEmails(e.target.value)}
                                    className="input-premium focus:ring-blue-500/10 focus:border-blue-500/50"
                                    placeholder="email1@test.com, email2@test.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">App Script Deployment URL</label>
                                <input
                                    type="text"
                                    value={scriptUrl}
                                    onChange={(e) => setScriptUrl(e.target.value)}
                                    className="input-premium text-xs focus:ring-blue-500/10 focus:border-blue-500/50"
                                    placeholder="https://script.google.com/macros/s/..."
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button onClick={handleSaveEmailConfig} className="flex-1 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black shadow-xl shadow-blue-600/20 active:scale-[0.98] transition-all">
                                    GUARDAR CONFIGURACIÓN
                                </button>
                                <button onClick={handleTestEmail} className="px-8 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-[2rem] font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700">
                                    PROBAR
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-emerald-500/10">
                        <h3 className="text-xl font-black mb-8 text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                            Estado del Servicio
                        </h3>
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                            <div className="relative p-6 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 rounded-[2rem] flex flex-col items-center text-center gap-6">
                                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-2xl shadow-emerald-500/40 animate-bounce-slow">
                                    <CheckCircle2 size={40} />
                                </div>
                                <div>
                                    <p className="text-emerald-700 dark:text-emerald-400 font-black text-2xl mb-2">Sistema Activo</p>
                                    <p className="text-sm text-emerald-600/70 dark:text-emerald-400/60 font-medium max-w-[280px] mx-auto leading-relaxed">
                                        Las notificaciones de caja se están procesando correctamente en la infraestructura cloud.
                                    </p>
                                </div>
                                <div className="flex gap-2 items-center px-4 py-2 bg-emerald-500/10 rounded-full">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Latencia Óptima</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mantenimiento Tab */}
            {activeTab === 'mantenimiento' && isSuperAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-red-500/10">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-4 bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl shadow-inner-sm">
                                <AlertTriangle size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Limpieza por Rango</h3>
                                <p className="text-sm text-slate-500 font-medium">Eliminación masiva de órdenes (Irreversible)</p>
                            </div>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Cuenta de Usuario</label>
                                <select
                                    value={maintenanceUser}
                                    onChange={(e) => setMaintenanceUser(e.target.value)}
                                    className="input-premium focus:ring-red-500/10 focus:border-red-500/50"
                                >
                                    <option value="">Seleccionar cuenta...</option>
                                    {allDoctors.map(d => <option key={d.uid} value={d.uid}>{d.profile?.email || d.uid}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Desde</label>
                                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-premium focus:ring-red-500/10 focus:border-red-500/50" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Hasta</label>
                                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-premium focus:ring-red-500/10 focus:border-red-500/50" />
                                </div>
                            </div>
                            <button 
                                onClick={handleDeleteByRange} 
                                className="w-full py-5 bg-red-600 hover:bg-red-700 text-white rounded-[2rem] font-black shadow-xl shadow-red-600/20 active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-3"
                            >
                                <Trash2 size={20} />
                                EJECUTAR BORRADO MASIVO
                            </button>
                        </div>
                    </div>

                    {/* Firestore Usage Stats */}
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-orange-500/10">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-4 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-2xl shadow-inner-sm">
                                <Database size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Uso de Base de Datos</h3>
                                <p className="text-sm text-slate-500 font-medium">Estadísticas de almacenamiento en la nube</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Documentos Totales</p>
                                <p className="text-3xl font-black text-slate-800 dark:text-white">
                                    {firestoreUsage.totalDocs.toLocaleString()}
                                </p>
                            </div>
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Caja Diaria</p>
                                <p className="text-xl font-black text-teal-600 dark:text-teal-400">{firestoreUsage?.collections?.caja?.count || 0}</p>
                            </div>
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Órdenes</p>
                                <p className="text-xl font-black text-blue-600 dark:text-blue-400">{firestoreUsage?.collections?.ordenes?.count || 0}</p>
                            </div>
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Profesionales</p>
                                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{firestoreUsage?.collections?.profesionales?.count || 0}</p>
                            </div>
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recordatorios</p>
                                <p className="text-xl font-black text-amber-600 dark:text-amber-400">{firestoreUsage?.collections?.reminders?.count || 0}</p>
                            </div>
                            <div className="p-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notas AI</p>
                                <p className="text-xl font-black text-rose-600 dark:text-rose-400">{firestoreUsage?.collections?.notes?.count || 0}</p>
                            </div>
                        </div>

                        <div className="mt-8 p-6 bg-orange-500/5 rounded-3xl border border-orange-500/10 flex items-center gap-4">
                            <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                                <Activity size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Cuota de Lectura/Escritura</p>
                                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                    El sistema utiliza el Plan gratuito de Firebase (Spark). Límite: 50.000 lecturas/día.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Global Tools */}
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-blue-500/10">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-4 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl shadow-inner-sm">
                                <RefreshCw size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Herramientas Globales</h3>
                                <p className="text-sm text-slate-500 font-medium">Mantenimiento y normalización de BD</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-8 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-700/50 rounded-[2rem] relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Users size={80} />
                                </div>
                                <div className="flex items-center gap-3 mb-4">
                                    <Users className="text-blue-500" size={20} />
                                    <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-widest text-sm">Base de Pacientes</h4>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-8 leading-relaxed relative z-10">
                                    Genera la base de datos de pacientes a partir de la información contenida en las órdenes de internación. Ideal para recuperar el directorio si se borró la colección.
                                </p>
                                <button 
                                    onClick={handleSyncPatientsFromOrders} 
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black transition-all shadow-xl active:scale-[0.98] relative z-10 flex items-center justify-center gap-2"
                                >
                                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                                    {loading ? 'SINCRONIZANDO...' : 'SINCRONIZAR DIRECTORIO'}
                                </button>
                            </div>

                            <div className="p-8 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded-[2rem] relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <CheckCircle2 size={80} />
                            </div>
                            <div className="flex items-center gap-3 mb-4">
                                <CheckCircle2 className="text-emerald-500" size={20} />
                                <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-widest text-sm">Estandarizar Obras Sociales</h4>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-8 leading-relaxed relative z-10">
                                Esta herramienta analiza toda la base de datos y unifica variaciones de nombres (ej: "Osde", "osde 210" &rarr; "OSDE") para asegurar que las estadísticas sean 100% precisas.
                            </p>
                            <button 
                                onClick={handleNormalizeObraSocial} 
                                className="w-full py-4 bg-slate-900 dark:bg-slate-700 hover:bg-slate-950 dark:hover:bg-slate-600 text-white rounded-2xl font-black transition-all shadow-xl active:scale-[0.98] relative z-10"
                            >
                                NORMALIZAR TODA LA BASE
                            </button>
                        </div>
                    </div>

                        <div className="mt-6 p-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
                                <ShieldCheck size={20} />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Integridad de datos verificada</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Infrastructure Tab */}
            {activeTab === 'infrastructure' && isSuperAdmin && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Export */}
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-indigo-500/10">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-4 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-inner-sm">
                                <Download size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Exportación JSON</h3>
                                <p className="text-sm text-slate-500 font-medium">Backup completo por usuario o global</p>
                            </div>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Seleccionar Origen de Datos</label>
                                <select
                                    value={maintenanceUser}
                                    onChange={(e) => setMaintenanceUser(e.target.value)}
                                    className="input-premium focus:ring-indigo-500/10 focus:border-indigo-500/50"
                                >
                                    <option value="">Todo el sistema (Global)</option>
                                    {allDoctors.map(d => <option key={d.uid} value={d.uid}>{d.profile?.email || d.uid}</option>)}
                                </select>
                            </div>
                            <button 
                                onClick={handleExportData} 
                                className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[2rem] font-black shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                            >
                                <FileJson size={24} /> DESCARGAR BACKUP COMPLETO
                            </button>
                            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
                                El archivo descargado contendrá todas las órdenes registradas
                            </p>
                        </div>
                    </div>

                    {/* Import */}
                    <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border-emerald-500/10">
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-inner-sm">
                                <Upload size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Restauración</h3>
                                <p className="text-sm text-slate-500 font-medium">Carga de backups externos (.json)</p>
                            </div>
                        </div>

                        <div className="relative group">
                            <input 
                                type="file" 
                                onChange={handleImportData} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                            />
                            <div className="border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem] p-12 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 group-hover:bg-emerald-500/5 group-hover:border-emerald-500/30 transition-all duration-500 relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center text-emerald-500 mb-6 shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 relative z-10">
                                    <Upload size={36} />
                                </div>
                                <div className="text-center relative z-10">
                                    <p className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-2">Arrastrar o Seleccionar</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Solo archivos generados por este sistema</p>
                                </div>
                                
                                {/* Status micro-indicator */}
                                <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                                    <ShieldCheck size={14} className="text-emerald-500" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Validación Activa</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            )}

            {/* Messages Tab */}
            {activeTab === 'messages' && isSuperAdmin && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Paciente Template */}
                        <div className="premium-card p-6 bg-white dark:bg-slate-900 border-blue-500/10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                                    <User size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-widest text-sm">Mensaje Paciente</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Autorización gestionada por el paciente</p>
                                </div>
                            </div>
                            <textarea
                                value={whatsappTemplates.paciente}
                                onChange={(e) => setWhatsappTemplates({...whatsappTemplates, paciente: e.target.value})}
                                className="w-full h-64 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none font-medium leading-relaxed"
                                placeholder="Escribe el template aquí..."
                            />
                        </div>

                        {/* Institucional Template */}
                        <div className="premium-card p-6 bg-white dark:bg-slate-900 border-emerald-500/10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                                    <Building2 size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 dark:text-white uppercase tracking-widest text-sm">Mensaje Institucional</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Autorización gestionada por la institución</p>
                                </div>
                            </div>
                            <textarea
                                value={whatsappTemplates.institucional}
                                onChange={(e) => setWhatsappTemplates({...whatsappTemplates, institucional: e.target.value})}
                                className="w-full h-64 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none font-medium leading-relaxed"
                                placeholder="Escribe el template aquí..."
                            />
                        </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 p-6 rounded-3xl">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm text-blue-500">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h5 className="text-sm font-black text-blue-900 dark:text-blue-200 uppercase tracking-widest mb-2">Variables Disponibles</h5>
                                <p className="text-xs text-blue-700/70 dark:text-blue-300/60 leading-relaxed font-medium">
                                    Puedes usar las siguientes etiquetas que serán reemplazadas automáticamente:
                                    <br />
                                    <span className="font-black text-blue-600 dark:text-blue-400">{"{paciente}"}</span>: Nombre del afiliado
                                    <br />
                                    <span className="font-black text-blue-600 dark:text-blue-400">{"{fecha}"}</span>: Fecha de la cirugía
                                    <br />
                                    <span className="font-black text-blue-600 dark:text-blue-400">{"{profesional}"}</span>: Nombre del médico
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center pt-4">
                        <button
                            onClick={handleSaveTemplates}
                            disabled={loading}
                            className="px-12 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Save size={24} />
                            {loading ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                        </button>
                    </div>
                </div>

            )}
            {/* Modal Crear Usuario */}
            {showUserCreateModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                                <UserPlus className="w-5 h-5 text-blue-500" />
                                Nuevo Usuario
                            </h3>
                            <button onClick={() => setShowUserCreateModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                                    <input 
                                        type="text" required
                                        value={newUserForm.displayName}
                                        onChange={e => setNewUserForm({...newUserForm, displayName: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="Dr. Juan Perez"
                                    />
                                </div>
                                
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email</label>
                                    <input 
                                        type="email" required
                                        value={newUserForm.email}
                                        onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="juan@ejemplo.com"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Contraseña</label>
                                    <input 
                                        type="password" required
                                        value={newUserForm.password}
                                        onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>

                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Rol del Sistema</label>
                                    <select 
                                        value={newUserForm.role}
                                        onChange={e => setNewUserForm({...newUserForm, role: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                    >
                                        <option value="user">Médico / Usuario</option>
                                        <option value="admin">Administrador</option>
                                        <option value="view">Solo Lectura</option>
                                        {roles.filter(r => !['user', 'admin', 'view'].includes(r.id)).map(role => (
                                            <option key={role.id} value={role.id}>{role.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-span-2 h-px bg-slate-100 dark:bg-slate-800 my-2"></div>

                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Especialidad (Opcional)</label>
                                    <input 
                                        type="text"
                                        value={newUserForm.specialty}
                                        onChange={e => setNewUserForm({...newUserForm, specialty: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="Cirugía General"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Matrícula (MP)</label>
                                    <input 
                                        type="text"
                                        value={newUserForm.mp}
                                        onChange={e => setNewUserForm({...newUserForm, mp: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="12345"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Matrícula (ME)</label>
                                    <input 
                                        type="text"
                                        value={newUserForm.me}
                                        onChange={e => setNewUserForm({...newUserForm, me: e.target.value})}
                                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                        placeholder="6789"
                                    />
                                </div>
                            </div>

                            <button 
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 transition-all disabled:opacity-50 mt-4"
                            >
                                {loading ? 'Creando Usuario...' : 'Crear Cuenta'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminView;
