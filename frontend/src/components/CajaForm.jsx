import React, { useState } from 'react';
import { Save, Plus, Trash2, MessageSquare, Calendar, X, Bell, CheckCircle2, Circle, LayoutDashboard, User, Edit2, Shield, Clock, Lock as LockIcon, History as HistoryIcon } from 'lucide-react';
import { db, USE_LOCAL_DB, isTestEnv } from '../firebase/config';
import { collection, addDoc, getDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { apiService } from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import MoneyInput from './MoneyInput';
import ModalPortal from './common/ModalPortal';
import { scrollToTop } from '../utils/navigation';


const CajaForm = ({ lowPerfMode = false }) => {
    const { viewingUid, permission, currentUser, catalogOwnerUid, permissions } = useAuth(); // Get permission ('owner', 'editor', 'viewer')
    const isReadOnly = permission === 'viewer' || permissions?.readonly_caja;
    // Global Date State
    const [globalDate, setGlobalDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyComment, setDailyComment] = useState('');
    const [showDailyCommentModal, setShowDailyCommentModal] = useState(false);
    const [reminders, setReminders] = useState([]);
    const [newReminder, setNewReminder] = useState('');
    const [isAddingReminder, setIsAddingReminder] = useState(false);

    // History of Saved Entries for current date
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [showHistoryPinModal, setShowHistoryPinModal] = useState(false);
    const [historyPinInput, setHistoryPinInput] = useState('');
    const [historyToEdit, setHistoryToEdit] = useState(null);
    const [isPinVerified, setIsPinVerified] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [historyAction, setHistoryAction] = useState(null); // 'edit' or 'delete'

    // Initial State with LocalStorage check
    const [entries, setEntries] = useState(() => {
        const saved = localStorage.getItem('cajaDiariaEntries');
        if (saved) {
            return JSON.parse(saved);
        }
        return [{
            id: 1,
            paciente: '', dni: '', obra_social: '',
            prof_1: '', prof_2: '', prof_3: '',
            porcentaje_prof_1: 100, // Default 100% to professional
            showPercent_1: false,
            porcentaje_prof_2: 0, // Default 0%
            showPercent_2: false,
            porcentaje_prof_3: 0,
            showPercent_3: false,
            showProf3: false,
            pesos: 0, dolares: 0,
            liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
            liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
            liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
            anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS', liq_anestesista_secondary: 0, liq_anestesista_currency_secondary: 'USD', showSecondaryAnes: false,
            coat_pesos: 0, coat_dolares: 0,
            comentario: ''
        }];
    });


    const [profesionales, setProfesionales] = useState([]);
    const [commentModalId, setCommentModalId] = useState(null);

    const fetchProfs = async () => {
        try {
            // "Todos ven todo": ya no filtramos por userId
            const profs = await apiService.getCollection("profesionales");
            profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProfesionales(profs);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    const fetchHistory = async () => {
        if (!globalDate) return;
        setLoadingHistory(true);
        try {
            // "Todos ven todo": ya no filtramos por userId
            const entriesList = await apiService.getCollection("caja", {
                fecha: globalDate
            });
            entriesList.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            setHistory(entriesList);
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const fetchReminders = async () => {
        try {
            // Recordatorios también son globales ahora si "todos ven todo"
            const rems = await apiService.getCollection("reminders");
            rems.sort((a, b) => {
                if (a.completed === b.completed) {
                    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
                }
                return a.completed ? 1 : -1;
            });
            setReminders(rems);
        } catch (error) {
            console.error("Error fetching reminders:", error);
        }
    };

    const handleAddReminder = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!newReminder.trim() || !ownerToUse) return;

        try {
            await apiService.addDocument("reminders", {
                text: newReminder,
                userId: ownerToUse,
                completed: false,
                createdAt: new Date().toISOString(),
                createdBy: currentUser?.email || 'unknown'
            });
            setNewReminder('');
            setIsAddingReminder(false);
            fetchReminders();
        } catch (error) {
            console.error("Error adding reminder:", error);
        }
    };

    const toggleReminderStatus = async (id, currentStatus) => {
        try {
            await apiService.updateDocument("reminders", id, {
                completed: !currentStatus,
                updatedAt: new Date().toISOString()
            });
            setReminders(reminders.map(r => r.id === id ? { ...r, completed: !currentStatus } : r));
        } catch (error) {
            console.error("Error updating reminder:", error);
        }
    };

    const handleDeleteReminder = async (id) => {
        if (!window.confirm("¿Eliminar este recordatorio?")) return;
        try {
            await apiService.deleteDocument("reminders", id);
            setReminders(reminders.filter(r => r.id !== id));
        } catch (error) {
            console.error("Error deleting reminder:", error);
        }
    };

    React.useEffect(() => {
        fetchProfs();
        fetchReminders();
    }, [viewingUid, catalogOwnerUid]);

    // Save to LocalStorage on change
    React.useEffect(() => {
        localStorage.setItem('cajaDiariaEntries', JSON.stringify(entries));
    }, [entries]);

    React.useEffect(() => {
        fetchHistory();
    }, [globalDate, viewingUid, catalogOwnerUid]);

    const anestesistas = profesionales.filter(p => p.categoria === 'Anestesista');

    const addRow = () => {
        const newId = entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1;
        setEntries([...entries, {
            id: newId,
            paciente: '', dni: '', obra_social: '',
            prof_1: '', prof_2: '', prof_3: '',
            porcentaje_prof_1: 100, showPercent_1: false,
            porcentaje_prof_2: 0, showPercent_2: false,
            porcentaje_prof_3: 0, showPercent_3: false,
            showProf3: false,
            pesos: 0, dolares: 0,
            liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
            liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
            liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
            anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS', liq_anestesista_secondary: 0, liq_anestesista_currency_secondary: 'USD', showSecondaryAnes: false,
            coat_pesos: 0, coat_dolares: 0,
            comentario: ''
        }]);
    };

    const updateEntry = (id, field, value) => {
        setEntries(prevEntries => prevEntries.map(e => {
            if (e.id !== id) return e;

            const updated = { ...e, [field]: value };

            // 1. Percentage -> Amount calculation (if percentage or payment changed)
            if (['pesos', 'dolares', 'porcentaje_prof_1', 'porcentaje_prof_2', 'porcentaje_prof_3', 'liq_prof_1_currency', 'liq_prof_2_currency', 'liq_prof_3_currency'].includes(field)) {

                const payPesos = field === 'pesos' ? (value || 0) : (updated.pesos || 0);
                const payDolares = field === 'dolares' ? (value || 0) : (updated.dolares || 0);

                const pct1 = field === 'porcentaje_prof_1' ? (value || 0) : (updated.porcentaje_prof_1 || 0);
                const pct2 = field === 'porcentaje_prof_2' ? (value || 0) : (updated.porcentaje_prof_2 || 0);
                const pct3 = field === 'porcentaje_prof_3' ? (value || 0) : (updated.porcentaje_prof_3 || 0);

                const share1 = pct1 / 100;
                const share2 = pct2 / 100;
                const share3 = pct3 / 100;

                const pPesos = field === 'pesos' ? (value || 0) : (updated.pesos || 0);
                const pDolares = field === 'dolares' ? (value || 0) : (updated.dolares || 0);

                // Aggressive Auto-currency detection: If only USD is paid, switch everyone to USD
                if (pDolares > 0 && pPesos === 0) {
                    if (updated.prof_1 && updated.liq_prof_1_currency === 'ARS') updated.liq_prof_1_currency = 'USD';
                    if (updated.prof_2 && updated.liq_prof_2_currency === 'ARS') updated.liq_prof_2_currency = 'USD';
                    if (updated.prof_3 && updated.liq_prof_3_currency === 'ARS') updated.liq_prof_3_currency = 'USD';
                    if (updated.anestesista && updated.liq_anestesista_currency === 'ARS') updated.liq_anestesista_currency = 'USD';
                } else if (pPesos > 0 && pDolares === 0) {
                    if (updated.prof_1 && updated.liq_prof_1_currency === 'USD') updated.liq_prof_1_currency = 'ARS';
                    if (updated.prof_2 && updated.liq_prof_2_currency === 'USD') updated.liq_prof_2_currency = 'ARS';
                    if (updated.prof_3 && updated.liq_prof_3_currency === 'USD') updated.liq_prof_3_currency = 'ARS';
                    if (updated.anestesista && updated.liq_anestesista_currency === 'USD') updated.liq_anestesista_currency = 'ARS';
                }

                // Final Pay amounts to use in calculation (taking into account auto-switches above)
                if (updated.liq_prof_1_currency === 'ARS') updated.liq_prof_1 = pPesos * share1;
                else updated.liq_prof_1 = pDolares * share1;

                if (updated.liq_prof_2_currency === 'ARS') updated.liq_prof_2 = pPesos * share2;
                else updated.liq_prof_2 = pDolares * share2;

                if (updated.liq_prof_3_currency === 'ARS') updated.liq_prof_3 = pPesos * share3;
                else updated.liq_prof_3 = pDolares * share3;

                // Secondary calculations
                if (updated.showSecondary_1) {
                    updated.liq_prof_1_secondary = (updated.liq_prof_1_currency_secondary === 'USD' ? pDolares : pPesos) * share1;
                }
                if (updated.showSecondary_2) {
                    updated.liq_prof_2_secondary = (updated.liq_prof_2_currency_secondary === 'USD' ? pDolares : pPesos) * share2;
                }
                if (updated.showSecondary_3) {
                    updated.liq_prof_3_secondary = (updated.liq_prof_3_currency_secondary === 'USD' ? pDolares : pPesos) * share3;
                }
            }

            // 2. SALDO COAT = Pago - (Prof1 + Prof2 + Prof3 + Anestesista)
            const balanceAffected = [
                'pesos', 'dolares',
                'liq_prof_1', 'liq_prof_2', 'liq_prof_3', 'liq_anestesista',
                'liq_prof_1_currency', 'liq_prof_2_currency', 'liq_prof_3_currency', 'liq_anestesista_currency',
                'porcentaje_prof_1', 'porcentaje_prof_2', 'porcentaje_prof_3'
            ].includes(field);

            if (balanceAffected && field !== 'coat_pesos' && field !== 'coat_dolares') {
                let totalSubPesos = 0;
                let totalSubUSD = 0;

                const checkSub = (amt, curr) => {
                    if (curr === 'ARS') totalSubPesos += (amt || 0);
                    else totalSubUSD += (amt || 0);
                };

                checkSub(updated.liq_prof_1, updated.liq_prof_1_currency);
                checkSub(updated.liq_prof_2, updated.liq_prof_2_currency);
                checkSub(updated.liq_prof_3, updated.liq_prof_3_currency);
                // Anesthesiologist is now "out" of the COAT balance calculation per user request
                // checkSub(updated.liq_anestesista, updated.liq_anestesista_currency);

                // Check Secondaries
                if (updated.showSecondary_1) checkSub(updated.liq_prof_1_secondary, updated.liq_prof_1_currency_secondary);
                if (updated.showSecondary_2) checkSub(updated.liq_prof_2_secondary, updated.liq_prof_2_currency_secondary);
                if (updated.showSecondary_3) checkSub(updated.liq_prof_3_secondary, updated.liq_prof_3_currency_secondary);
                // if (updated.showSecondaryAnes) checkSub(updated.liq_anestesista_secondary, updated.liq_anestesista_currency_secondary);

                updated.coat_pesos = (updated.pesos || 0) - totalSubPesos;
                updated.coat_dolares = (updated.dolares || 0) - totalSubUSD;
            }

            return updated;
        }));
    };

    const toggleCurrency = (id, field) => {
        const newValue = entries.find(e => e.id === id)?.[field] === 'ARS' ? 'USD' : 'ARS';
        updateEntry(id, field, newValue);
    };

    const removeRow = (id) => {
        if (entries.length > 1) {
            setEntries(entries.filter(e => e.id !== id));
        }
    };

    const handleCerrarCaja = async () => {
        if (isSaving) return;
        if (!window.confirm("¿Estás seguro de cerrar la caja? Esto guardará los datos en el historial y limpiará el formulario.")) return;

        const ownerToUse = catalogOwnerUid || viewingUid;
        const entriesWithDate = entries.map((e, index) => {
            const entryData = {
                ...e,
                fecha: globalDate,
                userId: ownerToUse,
                createdBy: currentUser?.email || 'unknown',
                createdAt: e.createdAt || new Date(Date.now() + index).toISOString(),
                updatedAt: new Date().toISOString()
            };
            if (isTestEnv) {
                entryData.isTest = true;
            }
            return entryData;
        });

        try {
            const promises = entriesWithDate.map(entry => {
                const { id, ...dataToSave } = entry;
                if (typeof id === 'string') {
                    // Safety check for production items in test environment
                    if (isTestEnv && !entry.isTest) {
                        return Promise.reject(new Error("Cannot modify production data in test environment"));
                    }
                    return apiService.updateDocument("caja", id, dataToSave);
                } else {
                    return apiService.addDocument("caja", dataToSave);
                }
            });

            await Promise.all(promises);

            if (dailyComment.trim()) {
                const q = query(collection(db, "daily_comments"),
                    where("userId", "==", ownerToUse),
                    where("date", "==", globalDate)
                );
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    await apiService.updateDocument("daily_comments", snapshot.docs[0].id, {
                        comment: dailyComment,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    await apiService.addDocument("daily_comments", {
                        date: globalDate,
                        comment: dailyComment,
                        userId: ownerToUse,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            alert("Caja cerrada correctamente.");

            localStorage.removeItem('cajaDiariaEntries');
            setEntries([{
                id: 1,
                paciente: '', dni: '', obra_social: '',
                prof_1: '', prof_2: '', prof_3: '',
                porcentaje_prof_1: 100, showPercent_1: false,
                porcentaje_prof_2: 0, showPercent_2: false,
                porcentaje_prof_3: 0, showPercent_3: false,
                showProf3: false,
                pesos: 0, dolares: 0,
                liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
                liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
                liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
                anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS', liq_anestesista_secondary: 0, liq_anestesista_currency_secondary: 'USD', showSecondaryAnes: false,
                coat_pesos: 0, coat_dolares: 0,
                comentario: ''
            }]);
            setDailyComment('');
            fetchHistory();
        } catch (error) {
            console.error("Error finalizando jornada:", error);
            alert("Error al guardar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveOperation = async () => {
        if (isReadOnly || isSaving) return;

        const entriesToSave = entries.filter(e => e.paciente.trim().length > 3);
        if (entriesToSave.length === 0) {
            alert("Completa al menos el nombre del paciente (mín. 4 letras).");
            return;
        }

        setIsSaving(true);
        const ownerToUse = catalogOwnerUid || viewingUid;

        try {
            const promises = entriesToSave.map(async (e, index) => {
                const { id, ...dataToSave } = e;
                const finalData = {
                    ...dataToSave,
                    fecha: globalDate,
                    userId: ownerToUse,
                    createdBy: currentUser?.email || 'unknown',
                    updatedAt: new Date().toISOString()
                };

                if (isTestEnv) {
                    finalData.isTest = true;
                }

                // If ID is a string, it's a Firebase ID (existing record)
                if (typeof id === 'string') {
                    if (isTestEnv && !e.isTest) {
                        throw new Error(`No puedes editar registros de producción (${e.paciente}) desde el entorno de pruebas.`);
                    }
                    return updateDoc(doc(db, "caja", id), finalData);
                } else {
                    // It's a temporary numeric ID (new record)
                    return addDoc(collection(db, "caja"), {
                        ...finalData,
                        createdAt: new Date(Date.now() + index).toISOString()
                    });
                }
            });

            await Promise.all(promises);

            // Reset form
            setEntries([{
                id: 1,
                paciente: '', dni: '', obra_social: '',
                prof_1: '', prof_2: '', prof_3: '',
                porcentaje_prof_1: 100, showPercent_1: false,
                porcentaje_prof_2: 0, showPercent_2: false,
                porcentaje_prof_3: 0, showPercent_3: false,
                showProf3: false,
                pesos: 0, dolares: 0,
                liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
                liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
                liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
                anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS', liq_anestesista_secondary: 0, liq_anestesista_currency_secondary: 'USD', showSecondaryAnes: false,
                coat_pesos: 0, coat_dolares: 0,
                comentario: ''
            }]);

            localStorage.removeItem('cajaDiariaEntries');
            fetchHistory();
            scrollToTop();
            alert("Operación guardada correctamente.");
        } catch (error) {
            console.error("Error saving operation:", error);
            alert("Error al guardar.");
        } finally {
            setIsSaving(false);
        }
    };

    const executePinAction = () => {
        setIsPinVerified(true);
        setShowHistoryPinModal(false);
        setHistoryPinInput('');

        if (historyAction === 'delete' && historyToEdit) {
            handleDeleteHistory(historyToEdit.id);
        } else if (historyAction === 'edit' && historyToEdit) {
            // LOAD FOR EDIT: Keep the Firestore ID so we update instead of duplicate
            setEntries([{ ...historyToEdit }]);
            scrollToTop();
            alert("Cargado en el formulario para editar.");
        }
    };

    const handleVerifyPin = async () => {
        const input = historyPinInput.trim();
        if (!input) {
            alert("Por favor ingresa un PIN.");
            return;
        }

        // 1. FAST TRACK: Check Local Master PINs first (No DB wait)
        const masterPins = ['0511', '1105', 'admin', '1234', '12345678', '2024', '2025', '0000'];
        if (masterPins.includes(input)) {
            executePinAction();
            return;
        }

        // 2. DATABASE TRACK: Check custom PIN in Firestore
        try {
            // Check Current User Settings first
            if (currentUser?.uid) {
                const selfSnap = await getDoc(doc(db, "user_settings", currentUser.uid));
                if (selfSnap.exists() && selfSnap.data().adminPin) {
                    if (input === selfSnap.data().adminPin.toString().trim()) {
                        executePinAction();
                        return;
                    }
                }
            }

            // Check Owner Settings if viewing shared catalog
            const ownerUid = catalogOwnerUid || viewingUid;
            if (ownerUid && ownerUid !== currentUser?.uid) {
                try {
                    const ownerSnap = await getDoc(doc(db, "user_settings", ownerUid));
                    if (ownerSnap.exists() && ownerSnap.data().adminPin) {
                        if (input === ownerSnap.data().adminPin.toString().trim()) {
                            executePinAction();
                            return;
                        }
                    }
                } catch (err) {
                    console.warn("No permission to read owner settings, skipping.");
                }
            }

            alert("PIN Incorrecto.");
            setHistoryPinInput('');
        } catch (error) {
            console.error("Error verifying PIN:", error);
            alert("Error al verificar el PIN personalizado. Intente con uno maestro (0511 / 1234).");
        }
    };

    const requestHistoryAction = (item, action) => {
        if (isTestEnv && !item.isTest) {
            alert("No puedes modificar registros de producción desde el entorno de pruebas.");
            return;
        }

        // --- ENFORCE OWN RECORDS POLICY ---
        // Admin or superadmin can do everything.
        // Others (Secretaria) can only edit/delete what they created.
        const canManageAny = permissions?.can_delete_data || currentUser?.email === "emmanuel.ag92@gmail.com";
        const isOwner = item.createdBy === currentUser?.email;

        if (!canManageAny && !isOwner) {
            alert(`Solo puedes ${action === 'edit' ? 'editar' : 'eliminar'} registros cargados por ti mismo.`);
            return;
        }

        setHistoryToEdit(item);
        setHistoryAction(action);
        if (isPinVerified) {
            if (action === 'delete') handleDeleteHistory(item.id);
            else {
                setEntries([{ ...item }]);
                scrollToTop();
            }
        } else {
            setShowHistoryPinModal(true);
        }
    };

    const handleDeleteHistory = async (id) => {
        if (isTestEnv) {
            const item = history.find(h => h.id === id);
            if (item && !item.isTest) {
                alert("No puedes eliminar registros de producción desde el entorno de pruebas.");
                return;
            }
        }
        if (!window.confirm("¿Seguro que deseas eliminar este registro?")) return;
        try {
            await apiService.deleteDocument("caja", id);
            fetchHistory();
            alert("Registro eliminado.");
        } catch (error) {
            console.error("Error deleting history item:", error);
            alert("Error al eliminar.");
        }
    };

    // Calculate Totals for Summary
    // Calculate Totals for Summary based on HISTORY (Confirmed operations)
    const totals = history.reduce((acc, entry) => {
        acc.pesos += parseFloat(entry.pesos) || 0;
        acc.dolares += parseFloat(entry.dolares) || 0;
        acc.coat_pesos += parseFloat(entry.coat_pesos) || 0;
        acc.coat_dolares += parseFloat(entry.coat_dolares) || 0;
        return acc;
    }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 });

    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            {/* --- TOP MASTER PANEL: DATE & TOTALS --- */}
            <div className="premium-card p-1 bg-slate-50/50 dark:bg-slate-900/50 border-none shadow-xl overflow-hidden">
                <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-2 md:p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-blue-600 rounded-[1.5rem] shadow-lg shadow-blue-500/20 flex items-center justify-center text-white flex-shrink-0">
                            <LayoutDashboard size={32} />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">Caja de Cirugía</h2>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:border-blue-500/30">
                                <Calendar size={14} className="text-blue-500 dark:text-blue-400" />
                                <input
                                    type="date"
                                    className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none cursor-pointer hover:text-blue-500 transition-colors dark:[color-scheme:dark]"
                                    value={globalDate}
                                    onChange={(e) => setGlobalDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:flex md:items-center gap-4">
                        <div className="px-6 py-3 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 dark:from-emerald-500/20 dark:to-emerald-900/10 rounded-[1.8rem] border border-emerald-500/20 dark:border-emerald-500/30 min-w-[150px] group hover:scale-105 transition-all duration-500 shadow-lg shadow-emerald-500/5">
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] mb-0.5 opacity-80">Balance ARS</p>
                            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums leading-none">
                                <span className="text-sm opacity-50 mr-1">$</span>
                                {totals.coat_pesos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className="px-6 py-3 bg-gradient-to-br from-blue-500/10 to-indigo-600/5 dark:from-blue-500/20 dark:to-indigo-900/10 rounded-[1.8rem] border border-blue-500/20 dark:border-blue-500/30 min-w-[150px] group hover:scale-105 transition-all duration-500 shadow-lg shadow-blue-500/5">
                            <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em] mb-0.5 opacity-80">Balance USD</p>
                            <p className="text-2xl font-black text-blue-700 dark:text-blue-300 tabular-nums leading-none">
                                <span className="text-sm opacity-50 mr-1">U$D</span>
                                {totals.coat_dolares.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- MASTER ENTRY SECTION --- */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-4">
                    <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="w-8 h-px bg-slate-200 dark:bg-slate-800" />
                        Nuevas Entradas
                    </h3>
                </div>

                <div className="space-y-2">
                    {entries.map((entry, index) => (
                        <div key={entry.id} className="premium-card group bg-white dark:bg-slate-900 border-none shadow-sm hover:shadow-md p-0.5 transition-all duration-500 overflow-hidden">
                                <div className="p-1 md:p-1.5">
                                    {/* Header: Patient & Core Data */}
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start mb-1 pb-1 border-b border-slate-50 dark:border-slate-800/50">
                                        <div className="lg:col-span-12 flex items-center gap-6">
                                        <div className="w-8 h-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex items-center justify-center text-slate-300 dark:text-slate-700 font-black text-sm border border-slate-100 dark:border-slate-800 flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                                            {index + 1}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 w-full">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Paciente</label>
                                                <input
                                                    className="input-premium py-1.5 text-sm"
                                                    value={entry.paciente}
                                                    onChange={(e) => updateEntry(entry.id, 'paciente', e.target.value)}
                                                    placeholder="Nombre Completo..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">DNI / Documento</label>
                                                <input
                                                    className="input-premium py-2 text-sm"
                                                    value={entry.dni}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '');
                                                        updateEntry(entry.id, 'dni', val);
                                                    }}
                                                    placeholder="Sin puntos..."
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Obra Social</label>
                                                <input
                                                    className="input-premium py-2 text-sm"
                                                    value={entry.obra_social}
                                                    onChange={(e) => updateEntry(entry.id, 'obra_social', e.target.value)}
                                                    placeholder="Cobertura médica..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setCommentModalId(entry.id)}
                                            className={`p-3 rounded-xl transition-all ${entry.comentario ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shadow-inner' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-blue-600'}`}
                                            title="Añadir notas"
                                        >
                                            <MessageSquare size={18} />
                                        </button>
                                        {!isReadOnly && (
                                            <button
                                                onClick={() => removeRow(entry.id)}
                                                className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-xl transition-all"
                                                title="Eliminar fila"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Main Financial Layout */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                    {/* Left: Payments & Retention */}
                                    <div className="lg:col-span-3 space-y-3">
                                        <div className="p-3 bg-emerald-50/30 dark:bg-emerald-500/5 rounded-[1.2rem] border border-emerald-100/50 dark:border-emerald-500/10 space-y-3">
                                            <div>
                                                <label className="block text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-3">Cobro Paciente</label>
                                                <div className="space-y-4">
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/40 font-black text-sm">$</span>
                                                        <MoneyInput
                                                            className="w-full pl-8 pr-4 py-2 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-800/50 rounded-xl text-emerald-900 dark:text-emerald-100 font-black text-lg outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm"
                                                            value={entry.pesos}
                                                            onChange={(val) => updateEntry(entry.id, 'pesos', val)}
                                                        />
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/40 font-black text-sm">U$D</span>
                                                        <MoneyInput
                                                            className="w-full pl-12 pr-4 py-2 bg-white dark:bg-slate-800 border border-blue-100 dark:border-blue-800/50 rounded-xl text-blue-900 dark:text-blue-100 font-black text-lg outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                                                            value={entry.dolares}
                                                            onChange={(val) => updateEntry(entry.id, 'dolares', val)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-emerald-100/50 dark:border-emerald-900/30">
                                                <label className="block text-[10px] font-black text-orange-600/60 dark:text-orange-400/60 uppercase tracking-widest mb-3">Retención COAT</label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-white/60 dark:bg-slate-800 p-3 rounded-xl border border-orange-100/50 dark:border-orange-900/30">
                                                        <p className="text-[8px] font-black text-orange-400 uppercase mb-1">ARS</p>
                                                        <MoneyInput
                                                            className="w-full bg-transparent border-none p-0 text-sm font-black text-orange-700 dark:text-orange-300 outline-none tabular-nums"
                                                            value={entry.coat_pesos}
                                                            onChange={(val) => updateEntry(entry.id, 'coat_pesos', val)}
                                                        />
                                                    </div>
                                                    <div className="bg-white/60 dark:bg-slate-800 p-3 rounded-xl border border-orange-100/50 dark:border-orange-900/30">
                                                        <p className="text-[8px] font-black text-orange-400 uppercase mb-1">USD</p>
                                                        <MoneyInput
                                                            className="w-full bg-transparent border-none p-0 text-sm font-black text-orange-700 dark:text-orange-300 outline-none tabular-nums"
                                                            value={entry.coat_dolares}
                                                            onChange={(val) => updateEntry(entry.id, 'coat_dolares', val)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle: Professionals Distribution */}
                                    <div className="lg:col-span-5 space-y-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                                Distribución Honorarios
                                                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded text-[9px] font-black tracking-normal">{entry.showProf3 ? '3' : '2'} MÉDICOS</span>
                                            </label>
                                            {!entry.showProf3 && (
                                                <button
                                                    onClick={() => updateEntry(entry.id, 'showProf3', true)}
                                                    className="text-[9px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 dark:bg-blue-500/10 px-3 py-1.5 rounded-xl transition-all"
                                                >
                                                    <Plus size={10} /> AGREGAR PROF. 3
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            {[1, 2, 3].map(n => {
                                                if (n === 3 && !entry.showProf3) return null;
                                                const profKey = `prof_${n}`;
                                                const pctKey = `porcentaje_prof_${n}`;
                                                const liqKey = `liq_prof_${n}`;
                                                const currKey = `liq_prof_${n}_currency`;
                                                const secKey = `liq_prof_${n}_secondary`;
                                                const secCurrKey = `liq_prof_${n}_currency_secondary`;
                                                const showSecKey = `showSecondary_${n}`;

                                                const colors = n === 1 ? 'blue' : n === 2 ? 'indigo' : 'teal';

                                                return (
                                                    <div key={n} className={`p-3 rounded-[1.2rem] border transition-all duration-300 flex flex-col md:flex-row gap-3 items-end ${n === 1 ? 'bg-blue-50/30 dark:bg-blue-500/5 border-blue-100 dark:border-blue-900/30' : n === 2 ? 'bg-indigo-50/30 dark:bg-indigo-500/5 border-indigo-100 dark:border-indigo-900/30' : 'bg-teal-50/30 dark:bg-teal-500/5 border-teal-100 dark:border-teal-900/30'}`}>
                                                        <div className="flex-1 w-full space-y-2">
                                                            <label className={`text-[9px] font-black text-${colors}-500/70 uppercase tracking-widest ml-1`}>Médico {n}</label>
                                                            <select
                                                                className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                                                                value={entry[profKey]}
                                                                onChange={(e) => updateEntry(entry.id, profKey, e.target.value)}
                                                            >
                                                                <option value="">Seleccionar profesional...</option>
                                                                {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="w-24 space-y-2">
                                                            <label className="text-center block text-[9px] font-black text-slate-400 uppercase tracking-widest">%</label>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-3 py-3 text-center font-black text-blue-600 dark:text-blue-400 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                                                                value={entry[pctKey]}
                                                                onFocus={(e) => e.target.select()}
                                                                onChange={(e) => updateEntry(entry.id, pctKey, parseFloat(e.target.value) || 0)}
                                                            />
                                                        </div>
                                                        <div className="w-full md:w-40 space-y-2">
                                                            <div className="flex items-center justify-between px-1">
                                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Liquidación</label>
                                                                <button onClick={() => updateEntry(entry.id, showSecKey, !entry[showSecKey])} className="text-[10px] text-blue-500 font-black"><Plus size={14} /></button>
                                                            </div>
                                                            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border-none rounded-2xl p-1.5 shadow-sm focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                                                                <button
                                                                    onClick={() => toggleCurrency(entry.id, currKey)}
                                                                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                                                                >
                                                                    {entry[currKey]}
                                                                </button>
                                                                <MoneyInput
                                                                    className="flex-1 bg-transparent border-none text-sm font-black text-slate-800 dark:text-slate-100 outline-none tabular-nums text-right pr-2"
                                                                    value={entry[liqKey]}
                                                                    onChange={(val) => updateEntry(entry.id, liqKey, val)}
                                                                />
                                                            </div>
                                                        </div>

                                                        {entry[showSecKey] && (
                                                            <div className="col-span-full w-full pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-4 animate-in slide-in-from-top-1">
                                                                <span className="text-[9px] font-black text-slate-400 uppercase">Segundo Pago</span>
                                                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 rounded-xl px-3 py-1.5 border border-slate-100 dark:border-slate-800">
                                                                    <button onClick={() => toggleCurrency(entry.id, secCurrKey)} className="text-[9px] font-black text-blue-500">{entry[secCurrKey]}</button>
                                                                    <MoneyInput
                                                                        className="w-24 bg-transparent border-none text-xs text-slate-500 font-bold outline-none tabular-nums text-right"
                                                                        value={entry[secKey]}
                                                                        onChange={(val) => updateEntry(entry.id, secKey, val)}
                                                                    />
                                                                </div>
                                                                {n === 3 && (
                                                                    <button onClick={() => updateEntry(entry.id, 'showProf3', false)} className="ml-2 text-red-400 hover:text-red-500"><X size={16} /></button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Right: Anesthetist Section */}
                                    <div className="lg:col-span-4 space-y-4">
                                        <div className="p-3 bg-purple-50/40 dark:bg-purple-500/5 rounded-[1.2rem] border border-purple-100 dark:border-purple-900/30 space-y-3">
                                            <label className="block text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                                Anestesia
                                            </label>
                                            
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-purple-500/70 uppercase tracking-widest ml-1">Profesional</label>
                                                    <select
                                                        className="w-full bg-white dark:bg-slate-800 border-none rounded-2xl px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all shadow-sm"
                                                        value={entry.anestesista || ''}
                                                        onChange={(e) => updateEntry(entry.id, 'anestesista', e.target.value)}
                                                    >
                                                        <option value="">No requiere</option>
                                                        {anestesistas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                                    </select>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between px-1">
                                                        <label className="text-[9px] font-black text-purple-500/70 uppercase tracking-widest">Liquidación</label>
                                                        <button onClick={() => updateEntry(entry.id, 'showSecondaryAnes', !entry.showSecondaryAnes)} className="text-[10px] text-purple-500 font-black"><Plus size={14} /></button>
                                                    </div>
                                                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border-none rounded-2xl p-1.5 shadow-sm focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                                                        <button
                                                            onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency')}
                                                            className="px-3 py-2 bg-purple-600 text-white rounded-xl text-[9px] font-black shadow-lg shadow-purple-500/20 active:scale-95 transition-all"
                                                        >
                                                            {entry.liq_anestesista_currency}
                                                        </button>
                                                        <MoneyInput
                                                            className="flex-1 bg-transparent border-none text-sm font-black text-slate-800 dark:text-slate-100 outline-none tabular-nums text-right pr-2"
                                                            value={entry.liq_anestesista}
                                                            onChange={(val) => updateEntry(entry.id, 'liq_anestesista', val)}
                                                        />
                                                    </div>
                                                </div>

                                                {entry.showSecondaryAnes && (
                                                    <div className="pt-4 mt-2 border-t border-purple-100/50 dark:border-purple-900/30 space-y-2 animate-in slide-in-from-top-1">
                                                        <p className="text-[9px] font-black text-purple-400/60 uppercase">Segundo Pago</p>
                                                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 rounded-xl px-3 py-2 border border-purple-100/50 dark:border-purple-900/30">
                                                            <button onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency_secondary')} className="text-[9px] font-black text-purple-500">{entry.liq_anestesista_currency_secondary}</button>
                                                            <MoneyInput
                                                                className="flex-1 bg-transparent border-none text-xs text-slate-500 font-bold outline-none tabular-nums text-right"
                                                                value={entry.liq_anestesista_secondary}
                                                                onChange={(val) => updateEntry(entry.id, 'liq_anestesista_secondary', val)}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Actions Bar */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 pb-12 px-4">
                    {!isReadOnly && (
                        <div className="flex flex-wrap gap-4 w-full md:w-auto">
                            <button
                                onClick={addRow}
                                className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-900 text-slate-400 hover:text-emerald-500 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 transition-all shadow-sm active:scale-90"
                                title="Agregar Paciente"
                            >
                                <Plus size={24} />
                            </button>
                            
                            <button
                                onClick={() => setShowDailyCommentModal(true)}
                                className={`flex items-center gap-2 px-4 h-12 rounded-xl transition-all font-black border uppercase text-[9px] tracking-widest active:scale-95 ${dailyComment ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-500/30' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 hover:text-amber-500'}`}
                            >
                                <MessageSquare size={16} />
                                {dailyComment ? "Ver Nota" : "Nota Gral"}
                            </button>
                        </div>
                    )}

                    {!isReadOnly && (
                        <div className="flex gap-4 w-full md:w-auto">
                            <button
                                onClick={handleSaveOperation}
                                disabled={isSaving}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 h-12 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black shadow-lg shadow-emerald-500/20 active:scale-95 uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
                            >
                                {isSaving ? <Clock className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                {isSaving ? "Guardar" : "Guardar Operación"}
                            </button>
                            <button
                                onClick={handleCerrarCaja}
                                disabled={isSaving}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-lg shadow-blue-500/20 active:scale-95 uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
                            >
                                {isSaving ? <Clock className="animate-spin" size={16} /> : <Save size={16} />}
                                {isSaving ? "Procesando..." : "Cerrar Caja"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* --- MODALS SECTION --- */}
            {showDailyCommentModal && (
                <ModalPortal onClose={() => setShowDailyCommentModal(false)}>
                    <div className="premium-card p-1 border-none shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-lg flex flex-col">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100 dark:border-amber-500/20">
                                    <MessageSquare size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Nota General del Día</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Visible al cerrar la caja</p>
                                </div>
                            </div>
                            
                            <textarea
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-6 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-inner min-h-[200px] resize-none"
                                placeholder="Escribe aquí cualquier observación relevante para el cierre de hoy..."
                                value={dailyComment}
                                onChange={(e) => setDailyComment(e.target.value)}
                                autoFocus
                            />

                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setShowDailyCommentModal(false)}
                                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all hover:bg-slate-200 dark:hover:bg-slate-700"
                                >
                                    Cerrar
                                </button>
                                <button
                                    onClick={() => setShowDailyCommentModal(false)}
                                    className="flex-1 py-4 bg-amber-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all"
                                >
                                    Guardar Nota
                                </button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {commentModalId && (
                <ModalPortal onClose={() => setCommentModalId(null)}>
                    <div className="premium-card p-1 border-none shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-md flex flex-col">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-100 dark:border-blue-500/20">
                                    <MessageSquare size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Comentario del Paciente</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Detalles específicos del registro</p>
                                </div>
                            </div>
                            
                            <textarea
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-6 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-inner min-h-[150px] resize-none"
                                placeholder="Escribe detalles sobre este paciente..."
                                value={entries.find(e => e.id === commentModalId)?.comentario || ''}
                                onChange={(e) => updateEntry(commentModalId, 'comentario', e.target.value)}
                                autoFocus
                            />

                            <button
                                onClick={() => setCommentModalId(null)}
                                className="mt-8 w-full py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* --- MASTER ACTIVITY LOG (Confirmed History) --- */}
            <div className="premium-card p-1 bg-slate-50/50 dark:bg-slate-900/50 border-none shadow-md">
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 md:p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-6">
                            <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 flex items-center justify-center rounded-2xl text-slate-400 border border-slate-100 dark:border-slate-800">
                                <HistoryIcon size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight uppercase leading-none">Historial Confirmado</h3>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">Movimientos procesados hoy</p>
                            </div>
                        </div>
                        <div className="px-6 py-2.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl text-[11px] font-black uppercase border border-blue-100 dark:border-blue-500/20">
                            {history.length} OPERACIONES
                        </div>
                    </div>

                    <div className="space-y-4">
                        {history.length === 0 ? (
                            <div className="py-20 text-center bg-slate-50/50 dark:bg-slate-800/20 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800/50 flex flex-col items-center">
                                <div className="w-20 h-20 bg-white dark:bg-slate-950 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600 mb-4 shadow-inner border border-slate-100 dark:border-slate-800">
                                    <HistoryIcon size={40} />
                                </div>
                                <p className="text-slate-400 dark:text-slate-500 font-bold">No se registran movimientos confirmados todavía.</p>
                            </div>
                        ) : (
                            history.map((item) => (
                                <div key={item.id} className="p-2 rounded-[1.5rem] border border-slate-100 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-950 hover:border-blue-500/30 hover:shadow-md transition-all duration-300 group flex flex-col lg:flex-row lg:items-center gap-2">
                                    <div className="flex items-center gap-5 shrink-0">
                                        <div className="w-14 h-14 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-xl shadow-sm border border-slate-100 dark:border-slate-800 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            {item.paciente[0]}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-black text-slate-800 dark:text-slate-100 text-lg leading-none">{item.paciente}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase text-blue-500 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-100/50 dark:border-blue-500/20">{item.obra_social}</span>
                                                {item.dni && <span className="text-[10px] text-slate-400 font-bold opacity-60">DNI: {item.dni}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 px-4 border-l border-slate-100 dark:border-slate-800">
                                        {[1, 2, 3].map(n => item[`prof_${n}`] && (
                                            <div key={n} className="flex flex-col">
                                                <span className={`text-[8px] font-black uppercase tracking-widest mb-1 ${n===1?'text-blue-500':n===2?'text-indigo-500':'text-teal-500'}`}>{item[`prof_${n}`]}</span>
                                                <span className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">
                                                    {item[`liq_prof_${n}_currency`] === 'USD' ? 'U$D' : '$'} {(item[`liq_prof_${n}`] || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        ))}
                                        {item.anestesista && (
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-purple-500 uppercase tracking-widest mb-1">{item.anestesista}</span>
                                                <span className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">
                                                    {item.liq_anestesista_currency === 'USD' ? 'U$D' : '$'} {(item.liq_anestesista || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-4 justify-between lg:justify-end shrink-0 pl-4 lg:pl-0 border-l border-slate-100 dark:border-slate-800">
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cobro Total</p>
                                            <div className="flex items-center gap-3 font-mono">
                                                {item.pesos > 0 && <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">${item.pesos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
                                                {item.dolares > 0 && <span className="text-lg font-black text-blue-600 dark:text-blue-400">U$D {item.dolares.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
                                            </div>
                                        </div>

                                        {!isReadOnly && (
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                <button
                                                    onClick={() => requestHistoryAction(item, 'edit')}
                                                    className="p-3 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-all"
                                                >
                                                    <Edit2 size={20} />
                                                </button>
                                                <button
                                                    onClick={() => requestHistoryAction(item, 'delete')}
                                                    className="p-3 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* --- SECURITY & UTILS MODALS --- */}
            {showHistoryPinModal && (
                <ModalPortal onClose={() => { setShowHistoryPinModal(false); setHistoryPinInput(''); }}>
                    <div className="premium-card p-1 border-none shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="bg-white dark:bg-slate-900 rounded-[2.9rem] p-10 w-full max-w-sm flex flex-col items-center">
                            <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center text-white mb-8 shadow-xl shadow-blue-500/30">
                                <Shield size={40} />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tighter">SEGURIDAD</h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-10">Ingresa tu clave maestra</p>
                            
                            <input
                                type="password"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-3xl px-6 py-6 text-center text-4xl font-black tracking-[0.5em] focus:ring-4 focus:ring-blue-500/10 outline-none mb-10 text-slate-900 dark:text-white"
                                placeholder="••••"
                                maxLength={8}
                                value={historyPinInput}
                                onChange={(e) => setHistoryPinInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
                                autoFocus
                            />

                            <div className="flex gap-4 w-full">
                                <button
                                    onClick={() => { setShowHistoryPinModal(false); setHistoryPinInput(''); }}
                                    className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleVerifyPin}
                                    className="flex-1 py-4 bg-blue-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* Reminders Grid */}
            <div className="pt-20">
                <div className="flex items-center justify-between mb-10 px-4">
                    <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100 dark:border-amber-500/20">
                            <Bell size={28} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Recordatorios</h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Pendientes de gestión para hoy</p>
                        </div>
                    </div>
                    {!isReadOnly && (
                        <button
                            onClick={() => setIsAddingReminder(true)}
                            className="px-6 py-3 bg-white dark:bg-slate-800 text-blue-600 font-black rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-500/30 transition-all text-[10px] uppercase tracking-widest shadow-sm active:scale-95"
                        >
                            + NUEVO AVISO
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {isAddingReminder && (
                        <div className="premium-card p-4 bg-blue-50/50 dark:bg-blue-500/5 border-2 border-dashed border-blue-500/20 flex flex-col gap-4 animate-in zoom-in-95">
                            <input
                                className="input-premium py-2 text-sm"
                                placeholder="¿Qué necesitas recordar?..."
                                value={newReminder}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
                                onChange={(e) => setNewReminder(e.target.value)}
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button onClick={handleAddReminder} className="flex-1 py-3 bg-blue-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20">Guardar</button>
                                <button onClick={() => setIsAddingReminder(false)} className="px-4 py-3 text-slate-400 font-black"><X size={18} /></button>
                            </div>
                        </div>
                    )}
                    {reminders.map((rem) => (
                        <div key={rem.id} className={`premium-card p-4 transition-all duration-500 group ${rem.completed ? 'opacity-50 grayscale scale-95 hover:grayscale-0' : 'hover:-translate-y-1'}`}>
                            <div className="flex gap-4 items-start mb-4">
                                <button
                                    onClick={() => toggleReminderStatus(rem.id, rem.completed)}
                                    className={`mt-0.5 transition-all active:scale-75 ${rem.completed ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600 hover:text-blue-500'}`}
                                >
                                    {rem.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                </button>
                                <p className={`text-sm font-bold leading-snug ${rem.completed ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{rem.text}</p>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-slate-50 dark:border-slate-800">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    {rem.createdAt?.seconds ? new Date(rem.createdAt.seconds * 1000).toLocaleDateString() : 'Hoy'}
                                </span>
                                {!isReadOnly && (
                                    <button onClick={() => handleDeleteReminder(rem.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                            {rem.completed && (
                                <div className="absolute top-4 right-6 rotate-12">
                                    <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 border-2 border-emerald-600 dark:border-emerald-400 px-2 py-0.5 rounded-lg uppercase tracking-tighter shadow-sm bg-white dark:bg-slate-800">Listo</span>
                                </div>
                            )}
                        </div>
                    ))}
                    {reminders.length === 0 && !isAddingReminder && (
                        <div className="col-span-full py-12 text-center bg-slate-50/20 dark:bg-slate-800/10 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800/50">
                            <p className="text-sm text-sub-text font-bold opacity-40">No hay recordatorios registrados.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CajaForm;
