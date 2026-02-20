import React, { useState } from 'react';
import { Save, Plus, Trash2, MessageSquare, Calendar, X, Bell, CheckCircle2, Circle, LayoutDashboard, User, Edit2, Shield, Clock } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import MoneyInput from './MoneyInput';

const CajaForm = () => {
    const { viewingUid, permission, currentUser, catalogOwnerUid } = useAuth(); // Get permission ('owner', 'editor', 'viewer')
    const isReadOnly = permission === 'viewer';
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
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            const q = query(collection(db, "profesionales"), where("userId", "==", ownerToUse));
            const querySnapshot = await getDocs(q);
            const profs = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProfesionales(profs);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    const fetchHistory = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse || !globalDate) return;
        setLoadingHistory(true);
        try {
            const q = query(
                collection(db, "caja"),
                where("userId", "==", ownerToUse),
                where("fecha", "==", globalDate)
            );
            const querySnapshot = await getDocs(q);
            const entriesList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            entriesList.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            setHistory(entriesList);
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const fetchReminders = () => {
        if (!currentUser?.uid) return () => { };

        const q = query(collection(db, "reminders"), where("userId", "==", currentUser.uid));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const rems = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort by completed (pending first) then by date
            rems.sort((a, b) => {
                if (a.completed === b.completed) {
                    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
                }
                return a.completed ? 1 : -1;
            });
            setReminders(rems);
        }, (error) => {
            console.error("Error syncing reminders:", error);
        });

        return unsubscribe;
    };

    const handleAddReminder = async () => {
        if (!newReminder.trim() || !currentUser?.uid) return;

        try {
            await addDoc(collection(db, "reminders"), {
                text: newReminder,
                userId: currentUser.uid,
                completed: false,
                createdAt: new Date(),
                createdBy: currentUser?.email || 'unknown'
            });
            setNewReminder('');
            setIsAddingReminder(false);
            // State will be updated via onSnapshot
        } catch (error) {
            console.error("Error adding reminder:", error);
        }
    };

    const toggleReminderStatus = async (id, currentStatus) => {
        try {
            await updateDoc(doc(db, "reminders", id), {
                completed: !currentStatus,
                updatedAt: new Date()
            });
            setReminders(reminders.map(r => r.id === id ? { ...r, completed: !currentStatus } : r));
        } catch (error) {
            console.error("Error updating reminder:", error);
        }
    };

    const handleDeleteReminder = async (id) => {
        if (!window.confirm("¿Eliminar este recordatorio?")) return;
        try {
            await deleteDoc(doc(db, "reminders", id));
            setReminders(reminders.filter(r => r.id !== id));
        } catch (error) {
            console.error("Error deleting reminder:", error);
        }
    };

    React.useEffect(() => {
        fetchProfs();
        const unsubscribe = fetchReminders();
        return () => unsubscribe();
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

                // Only update amounts if they are currently linked to percentages
                // (In this system they always are, but we trigger the update here)
                if (updated.liq_prof_1_currency === 'ARS') updated.liq_prof_1 = payPesos * share1;
                else updated.liq_prof_1 = payDolares * share1;

                if (updated.liq_prof_2_currency === 'ARS') updated.liq_prof_2 = payPesos * share2;
                else updated.liq_prof_2 = payDolares * share2;

                if (updated.liq_prof_3_currency === 'ARS') updated.liq_prof_3 = payPesos * share3;
                else updated.liq_prof_3 = payDolares * share3;

                // Secondary calculations
                if (updated.showSecondary_1) {
                    updated.liq_prof_1_secondary = (updated.liq_prof_1_currency_secondary === 'USD' ? payDolares : payPesos) * share1;
                }
                if (updated.showSecondary_2) {
                    updated.liq_prof_2_secondary = (updated.liq_prof_2_currency_secondary === 'USD' ? payDolares : payPesos) * share2;
                }
                if (updated.showSecondary_3) {
                    updated.liq_prof_3_secondary = (updated.liq_prof_3_currency_secondary === 'USD' ? payDolares : payPesos) * share3;
                }
            }

            // 2. SALDO COAT = Pago - (Prof1 + Prof2 + Prof3 + Anestesista)
            // Trigger whenever payments, pro amounts, anesthetist fee, or currencies change
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
                checkSub(updated.liq_anestesista, updated.liq_anestesista_currency);

                // Check Secondaries
                if (updated.showSecondary_1) checkSub(updated.liq_prof_1_secondary, updated.liq_prof_1_currency_secondary);
                if (updated.showSecondary_2) checkSub(updated.liq_prof_2_secondary, updated.liq_prof_2_currency_secondary);
                if (updated.showSecondary_3) checkSub(updated.liq_prof_3_secondary, updated.liq_prof_3_currency_secondary);
                if (updated.showSecondaryAnes) checkSub(updated.liq_anestesista_secondary, updated.liq_anestesista_currency_secondary);

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
        if (!window.confirm("¿Estás seguro de cerrar la caja? Esto guardará los datos en el historial y limpiará el formulario.")) return;

        const entriesWithDate = entries.map((e, index) => ({
            ...e,
            fecha: globalDate,
            userId: viewingUid,
            createdBy: currentUser?.email || 'unknown',
            createdAt: new Date(Date.now() + index).toISOString()
        }));

        try {
            const promises = entriesWithDate.map(entry => {
                const { id, ...dataToSave } = entry;
                return addDoc(collection(db, "caja"), dataToSave);
            });

            await Promise.all(promises);

            if (dailyComment.trim()) {
                await addDoc(collection(db, "daily_comments"), {
                    date: globalDate,
                    comment: dailyComment,
                    userId: viewingUid,
                    timestamp: new Date()
                });
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
        }
    };

    const handleSaveOperation = async () => {
        if (isReadOnly) return;

        const entriesToSave = entries.filter(e => e.paciente.trim().length > 3);
        if (entriesToSave.length === 0) {
            alert("Completa al menos el nombre del paciente (mín. 4 letras).");
            return;
        }

        const ownerToUse = catalogOwnerUid || viewingUid;

        try {
            const promises = entriesToSave.map(async (e, index) => {
                const { id, ...dataToSave } = e;
                return addDoc(collection(db, "caja"), {
                    ...dataToSave,
                    fecha: globalDate,
                    userId: ownerToUse,
                    createdBy: currentUser?.email || 'unknown',
                    createdAt: new Date(Date.now() + index).toISOString()
                });
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
            alert("Operación guardada correctamente.");
        } catch (error) {
            console.error("Error saving operation:", error);
            alert("Error al guardar.");
        }
    };

    const handleVerifyPin = async () => {
        try {
            const settingsSnap = await getDoc(doc(db, "user_settings", currentUser.uid));
            let validPins = ['0511', 'admin', '1234'];
            if (settingsSnap.exists() && settingsSnap.data().adminPin) {
                validPins.push(settingsSnap.data().adminPin);
            }

            if (validPins.includes(historyPinInput)) {
                setIsPinVerified(true);
                setShowHistoryPinModal(false);
                setHistoryPinInput('');

                if (historyAction === 'delete') {
                    handleDeleteHistory(historyToEdit.id);
                } else if (historyAction === 'edit') {
                    const { id, fecha, userId, createdBy, createdAt, ...editableData } = historyToEdit;
                    setEntries([{ ...editableData, id: Date.now() }]);
                    // Scroll to top
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    alert("Cargado en el formulario.");
                }
            } else {
                alert("PIN Incorrecto.");
                setHistoryPinInput('');
            }
        } catch (error) {
            console.error("Error verifying PIN:", error);
        }
    };

    const [historyAction, setHistoryAction] = useState(null); // 'edit' or 'delete'

    const requestHistoryAction = (item, action) => {
        setHistoryToEdit(item);
        setHistoryAction(action);
        if (isPinVerified) {
            if (action === 'delete') handleDeleteHistory(item.id);
            else {
                const { id, fecha, userId, createdBy, createdAt, ...editableData } = item;
                setEntries([{ ...editableData, id: Date.now() }]);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } else {
            setShowHistoryPinModal(true);
        }
    };

    const handleDeleteHistory = async (id) => {
        if (!window.confirm("¿Seguro que deseas eliminar este registro?")) return;
        try {
            await deleteDoc(doc(db, "caja", id));
            fetchHistory();
            alert("Registro eliminado.");
        } catch (error) {
            console.error("Error deleting history item:", error);
            alert("Error al eliminar.");
        }
    };

    // Calculate Totals for Summary
    const totals = entries.reduce((acc, entry) => {
        acc.pesos += parseFloat(entry.pesos) || 0;
        acc.dolares += parseFloat(entry.dolares) || 0;
        return acc;
    }, { pesos: 0, dolares: 0 });

    return (
        <div className="space-y-6">
            {/* Header & Date Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200 text-white">
                            <LayoutDashboard size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Caja Diaria</h2>
                            <p className="text-sm font-medium text-slate-400">Control de gestión de ingresos y honorarios</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-sm border border-slate-200">
                            <Calendar size={18} className="text-blue-500" />
                            <input
                                type="date"
                                className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none focus:ring-0 cursor-pointer"
                                value={globalDate}
                                onChange={(e) => setGlobalDate(e.target.value)}
                            />
                        </div>

                        <div className="h-10 w-px bg-slate-200 mx-1" />

                        <div className="flex gap-2">
                            <div className="px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Pesos</p>
                                <p className="text-lg font-black text-emerald-700 tabular-nums">${totals.pesos.toLocaleString('es-AR')}</p>
                            </div>
                            <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-center">
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total USD</p>
                                <p className="text-lg font-black text-blue-700 tabular-nums">U$D {totals.dolares.toLocaleString('es-AR')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Daily Comment Modal Trigger */}
            {showDailyCommentModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <MessageSquare className="text-amber-500" /> Comentario General
                            </h3>
                            <button onClick={() => setShowDailyCommentModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                        </div>
                        <textarea
                            className="w-full h-40 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none transition-all text-slate-700 font-medium"
                            placeholder="Escribe aquí observaciones generales de la jornada..."
                            value={dailyComment}
                            onChange={(e) => setDailyComment(e.target.value)}
                        />
                        <div className="flex justify-end mt-6">
                            <button onClick={() => setShowDailyCommentModal(false)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg">Cerrar y Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single Patient Comment Modal */}
            {commentModalId && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-100 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <MessageSquare className="text-blue-500" /> Observaciones del Paciente
                            </h3>
                            <button onClick={() => setCommentModalId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                        </div>
                        <textarea
                            className="w-full h-40 border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none resize-none transition-all text-slate-700 font-medium"
                            placeholder="Añada detalles específicos sobre este movimiento..."
                            value={entries.find(e => e.id === commentModalId)?.comentario || ''}
                            onChange={(e) => updateEntry(commentModalId, 'comentario', e.target.value)}
                        />
                        <div className="flex justify-end mt-6">
                            <button onClick={() => setCommentModalId(null)} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Entries List - Card Style */}
            <div className="grid grid-cols-1 gap-4">
                {entries.map((entry, index) => (
                    <div key={entry.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group relative">
                        {/* Entry Header/Patient Data */}
                        <div className="bg-slate-50/50 p-6 border-b border-slate-100">
                            <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-slate-300 border border-slate-200 flex-shrink-0">
                                        {index + 1}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Paciente</label>
                                            <input
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-blue-50/50 focus:border-blue-400 outline-none transition-all"
                                                value={entry.paciente}
                                                onChange={(e) => updateEntry(entry.id, 'paciente', e.target.value)}
                                                placeholder="Nombre Completo..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">DNI</label>
                                            <input
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-50/50 focus:border-blue-400 outline-none transition-all"
                                                value={entry.dni}
                                                onChange={(e) => updateEntry(entry.id, 'dni', e.target.value)}
                                                placeholder="Documento..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Obra Social</label>
                                            <input
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-50/50 focus:border-blue-400 outline-none transition-all"
                                                value={entry.obra_social}
                                                onChange={(e) => updateEntry(entry.id, 'obra_social', e.target.value)}
                                                placeholder="Prepaga / OS..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCommentModalId(entry.id)}
                                        className={`p-3 rounded-2xl transition-all ${entry.comentario ? 'bg-amber-100 text-amber-600 shadow-inner' : 'bg-white border border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200'}`}
                                        title="Observations"
                                    >
                                        <MessageSquare size={20} />
                                    </button>
                                    {!isReadOnly && (
                                        <button
                                            onClick={() => removeRow(entry.id)}
                                            className="p-3 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 rounded-2xl transition-all"
                                            title="Delete Row"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Entry Body / Financials */}
                        <div className="p-6">
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">

                                {/* Payments Section */}
                                <div className="xl:col-span-3 space-y-4 pr-0 xl:pr-6 xl:border-r border-slate-100">
                                    <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                                        <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Pago del Paciente</label>
                                        <div className="space-y-3">
                                            <div className="relative group">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">$</span>
                                                <MoneyInput
                                                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-emerald-900 font-black text-lg focus:ring-4 focus:ring-emerald-100 outline-none transition-all"
                                                    value={entry.pesos}
                                                    onChange={(val) => updateEntry(entry.id, 'pesos', val)}
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <div className="relative group">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 font-bold">U$D</span>
                                                <MoneyInput
                                                    className="w-full pl-12 pr-4 py-2.5 bg-white border border-blue-200 rounded-xl text-blue-900 font-black text-lg focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                                    value={entry.dolares}
                                                    onChange={(val) => updateEntry(entry.id, 'dolares', val)}
                                                    placeholder="0,00"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-orange-50/30 p-4 rounded-2xl border border-orange-100/50">
                                        <label className="block text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2">Administración COAT</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-white p-2 rounded-xl border border-orange-100 focus-within:ring-2 focus-within:ring-orange-200 transition-all">
                                                <p className="text-[8px] font-bold text-orange-400 uppercase">Pesos</p>
                                                <MoneyInput
                                                    className="w-full bg-transparent border-none p-0 text-sm font-black text-orange-700 outline-none"
                                                    value={entry.coat_pesos}
                                                    onChange={(val) => updateEntry(entry.id, 'coat_pesos', val)}
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <div className="bg-white p-2 rounded-xl border border-orange-100 focus-within:ring-2 focus-within:ring-orange-200 transition-all">
                                                <p className="text-[8px] font-bold text-orange-400 uppercase">Dolares</p>
                                                <MoneyInput
                                                    className="w-full bg-transparent border-none p-0 text-sm font-black text-orange-700 outline-none"
                                                    value={entry.coat_dolares}
                                                    onChange={(val) => updateEntry(entry.id, 'coat_dolares', val)}
                                                    placeholder="0,00"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Professionals Distribution Section */}
                                <div className="xl:col-span-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            Honorarios Médicos <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-500 font-bold">{entry.showProf3 ? 3 : 2} PROFS</span>
                                        </label>
                                        {!entry.showProf3 && (
                                            <button
                                                onClick={() => updateEntry(entry.id, 'showProf3', true)}
                                                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg transition-colors border border-blue-100"
                                            >
                                                <Plus size={12} /> Añadir Prof. 3
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        {/* Prof 1 Row */}
                                        <div className="grid grid-cols-[1fr_80px_1fr] md:grid-cols-[2fr_100px_1.5fr] gap-3 items-end p-4 bg-blue-50/30 rounded-2xl border border-blue-100 group/row">
                                            <div>
                                                <label className="block text-[9px] font-bold text-blue-400 uppercase mb-1">Médico 1</label>
                                                <select
                                                    className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 outline-none"
                                                    value={entry.prof_1}
                                                    onChange={(e) => updateEntry(entry.id, 'prof_1', e.target.value)}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-blue-400 uppercase mb-1">%</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-black text-blue-700 text-center focus:ring-4 focus:ring-blue-100 outline-none"
                                                    value={entry.porcentaje_prof_1}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => updateEntry(entry.id, 'porcentaje_prof_1', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1">
                                                    <label className="block text-[9px] font-bold text-blue-400 uppercase mb-1">Liq. a Médicos</label>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => toggleCurrency(entry.id, 'liq_prof_1_currency')}
                                                            className="text-[10px] font-black text-white bg-blue-500 px-2 py-1.5 rounded-lg shadow-sm hover:bg-blue-600 uppercase"
                                                        >
                                                            {entry.liq_prof_1_currency}
                                                        </button>
                                                        <MoneyInput
                                                            className="flex-1 w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm font-black text-blue-900 focus:ring-4 focus:ring-blue-100 outline-none"
                                                            value={entry.liq_prof_1}
                                                            onChange={(val) => updateEntry(entry.id, 'liq_prof_1', val)}
                                                        />
                                                    </div>
                                                </div>
                                                <button onClick={() => updateEntry(entry.id, 'showSecondary_1', !entry.showSecondary_1)} className="p-2 text-blue-300 hover:text-blue-600 transition-colors"><Plus size={16} /></button>
                                            </div>
                                            {/* Sub-row for secondary currency if needed */}
                                            {entry.showSecondary_1 && (
                                                <div className="col-span-full pt-2 flex items-center gap-2 border-t border-blue-100/50 animate-in slide-in-from-top-1">
                                                    <span className="text-[10px] font-bold text-slate-400">Secundario:</span>
                                                    <button onClick={() => toggleCurrency(entry.id, 'liq_prof_1_currency_secondary')} className="text-[10px] font-bold text-blue-400 uppercase">{entry.liq_prof_1_currency_secondary}</button>
                                                    <MoneyInput
                                                        className="w-32 bg-transparent border-b border-blue-200 text-xs text-blue-800 font-bold outline-none"
                                                        value={entry.liq_prof_1_secondary}
                                                        onChange={(val) => updateEntry(entry.id, 'liq_prof_1_secondary', val)}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Prof 2 Row */}
                                        <div className="grid grid-cols-[1fr_80px_1fr] md:grid-cols-[2fr_100px_1.5fr] gap-3 items-end p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100 group/row">
                                            <div>
                                                <label className="block text-[9px] font-bold text-indigo-400 uppercase mb-1">Médico 2</label>
                                                <select
                                                    className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-indigo-100 outline-none"
                                                    value={entry.prof_2}
                                                    onChange={(e) => updateEntry(entry.id, 'prof_2', e.target.value)}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-bold text-indigo-400 uppercase mb-1">%</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-sm font-black text-indigo-700 text-center focus:ring-4 focus:ring-indigo-100 outline-none"
                                                    value={entry.porcentaje_prof_2}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => updateEntry(entry.id, 'porcentaje_prof_2', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 text-right">
                                                    <label className="block text-[9px] font-bold text-indigo-400 uppercase mb-1">Honorario</label>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => toggleCurrency(entry.id, 'liq_prof_2_currency')}
                                                            className="text-[10px] font-black text-white bg-indigo-500 px-2 py-1.5 rounded-lg shadow-sm hover:bg-indigo-600 uppercase"
                                                        >
                                                            {entry.liq_prof_2_currency}
                                                        </button>
                                                        <MoneyInput
                                                            className="flex-1 w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-sm font-black text-indigo-900 focus:ring-4 focus:ring-indigo-100 outline-none"
                                                            value={entry.liq_prof_2}
                                                            onChange={(val) => updateEntry(entry.id, 'liq_prof_2', val)}
                                                        />
                                                    </div>
                                                </div>
                                                <button onClick={() => updateEntry(entry.id, 'showSecondary_2', !entry.showSecondary_2)} className="p-2 text-indigo-300 hover:text-indigo-600 transition-colors"><Plus size={16} /></button>
                                            </div>
                                        </div>

                                        {/* Prof 3 Row (Conditional) */}
                                        {entry.showProf3 && (
                                            <div className="grid grid-cols-[1fr_80px_1fr] md:grid-cols-[2fr_100px_1.5fr] gap-3 items-end p-4 bg-teal-50/40 rounded-2xl border border-teal-100 group/row relative animate-in slide-in-from-right-2 duration-300">
                                                <button onClick={() => updateEntry(entry.id, 'showProf3', false)} className="absolute top-2 right-2 text-teal-200 hover:text-red-500 transition-colors"><X size={14} /></button>
                                                <div>
                                                    <label className="block text-[9px] font-bold text-teal-400 uppercase mb-1">Médico 3</label>
                                                    <select
                                                        className="w-full bg-white border border-teal-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-teal-100 outline-none"
                                                        value={entry.prof_3}
                                                        onChange={(e) => updateEntry(entry.id, 'prof_3', e.target.value)}
                                                    >
                                                        <option value="">Seleccionar...</option>
                                                        {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-bold text-teal-400 uppercase mb-1">%</label>
                                                    <input
                                                        type="number"
                                                        className="w-full bg-white border border-teal-200 rounded-xl px-3 py-2 text-sm font-black text-teal-700 text-center focus:ring-4 focus:ring-teal-100 outline-none"
                                                        value={entry.porcentaje_prof_3}
                                                        onFocus={(e) => e.target.select()}
                                                        onChange={(e) => updateEntry(entry.id, 'porcentaje_prof_3', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1">
                                                        <label className="block text-[9px] font-bold text-teal-400 uppercase mb-1">Honorario</label>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => toggleCurrency(entry.id, 'liq_prof_3_currency')}
                                                                className="text-[10px] font-black text-white bg-teal-500 px-2 py-1.5 rounded-lg shadow-sm hover:bg-teal-600 uppercase"
                                                            >
                                                                {entry.liq_prof_3_currency}
                                                            </button>
                                                            <MoneyInput
                                                                className="flex-1 w-full bg-white border border-teal-200 rounded-xl px-3 py-2 text-sm font-black text-teal-900 focus:ring-4 focus:ring-teal-100 outline-none"
                                                                value={entry.liq_prof_3}
                                                                onChange={(val) => updateEntry(entry.id, 'liq_prof_3', val)}
                                                            />
                                                        </div>
                                                    </div>
                                                    <button onClick={() => updateEntry(entry.id, 'showSecondary_3', !entry.showSecondary_3)} className="p-2 text-teal-300 hover:text-teal-600 transition-colors"><Plus size={16} /></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Anesthetist Section */}
                                <div className="xl:col-span-3 space-y-4 pl-0 xl:pl-6 xl:border-l border-slate-100">
                                    <div className="bg-purple-50/30 p-5 rounded-2xl border border-purple-100 space-y-4">
                                        <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" /> Anestesia</label>
                                        <div>
                                            <label className="block text-[9px] font-bold text-purple-400 uppercase mb-1">Profesional</label>
                                            <select
                                                className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-purple-100 outline-none"
                                                value={entry.anestesista || ''}
                                                onChange={(e) => updateEntry(entry.id, 'anestesista', e.target.value)}
                                            >
                                                <option value="">- No requiere -</option>
                                                {anestesistas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                <label className="block text-[9px] font-bold text-purple-400 uppercase mb-1">Honorario</label>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency')}
                                                        className="text-[10px] font-black text-white bg-purple-500 px-2 py-1.5 rounded-lg shadow-sm hover:bg-purple-600 uppercase"
                                                    >
                                                        {entry.liq_anestesista_currency}
                                                    </button>
                                                    <MoneyInput
                                                        className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-sm font-black text-purple-800 focus:ring-4 focus:ring-purple-100 outline-none"
                                                        value={entry.liq_anestesista}
                                                        onChange={(val) => updateEntry(entry.id, 'liq_anestesista', val)}
                                                    />
                                                </div>
                                            </div>
                                            <button onClick={() => updateEntry(entry.id, 'showSecondaryAnes', !entry.showSecondaryAnes)} className="p-2 text-purple-300 hover:text-purple-600 transition-colors mt-4"><Plus size={16} /></button>
                                        </div>
                                        {entry.showSecondaryAnes && (
                                            <div className="pt-2 flex items-center gap-2 border-t border-purple-100/50 animate-in slide-in-from-top-1">
                                                <span className="text-[10px] font-bold text-slate-400">Secundario:</span>
                                                <button onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency_secondary')} className="text-[10px] font-bold text-purple-400 uppercase">{entry.liq_anestesista_currency_secondary}</button>
                                                <MoneyInput
                                                    className="w-full bg-transparent border-b border-purple-200 text-xs text-purple-800 font-bold outline-none"
                                                    value={entry.liq_anestesista_secondary}
                                                    onChange={(val) => updateEntry(entry.id, 'liq_anestesista_secondary', val)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Actions Row */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-20">
                {!isReadOnly && (
                    <button
                        onClick={() => setShowDailyCommentModal(true)}
                        className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all font-bold border-2 ${dailyComment ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-amber-100' : 'bg-white text-slate-500 border-slate-100 hover:border-amber-200 hover:text-amber-600'} shadow-lg`}
                    >
                        <MessageSquare size={20} />
                        {dailyComment ? "Ver Comentario de Jornada *" : "Añadir Observación General"}
                    </button>
                )}

                {!isReadOnly && (
                    <div className="flex gap-4 w-full md:w-auto">
                        <button
                            onClick={addRow}
                            className="flex-none flex items-center justify-center p-4 bg-white text-slate-400 rounded-2xl border-2 border-slate-100 hover:border-emerald-200 hover:text-emerald-500 transition-all font-bold shadow-sm"
                            title="Agregar otra fila"
                        >
                            <Plus size={20} />
                        </button>
                        <button
                            onClick={handleSaveOperation}
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all font-black shadow-xl shadow-emerald-200 uppercase tracking-widest text-sm"
                        >
                            <CheckCircle2 size={20} /> Guardar Operación
                        </button>
                        <button
                            onClick={handleCerrarCaja}
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 px-10 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all font-black shadow-xl shadow-blue-200 uppercase tracking-widest text-sm"
                        >
                            <Save size={20} /> Guardar Jornada
                        </button>
                    </div>
                )}
            </div>

            {/* Today's History Section */}
            <div className="bg-slate-50/50 rounded-3xl p-8 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Historial del Día</h3>
                        <p className="text-xs text-slate-500 font-medium font-mono uppercase tracking-tighter">Pacientes ya confirmados</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-white px-3 py-1.5 rounded-full border border-slate-100 uppercase">
                        <User size={12} /> {history.length} Registros
                    </div>
                </div>

                <div className="space-y-3">
                    {history.length === 0 ? (
                        <div className="py-12 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                            <p className="text-sm text-slate-400 font-medium">Aún no hay operaciones guardadas para hoy.</p>
                        </div>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-blue-300 transition-all shadow-sm">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-bold shrink-0">
                                        {item.paciente[0]}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-slate-800 truncate">{item.paciente}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-black uppercase text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded tracking-tighter">{item.obra_social}</span>
                                            {item.dni && <span className="text-[10px] text-slate-400 font-mono">DNI: {item.dni}</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                                    <div className="flex flex-col gap-1 min-w-[200px]">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Liquidación Detallada</p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {/* Prof 1 */}
                                            {item.prof_1 && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-bold text-slate-500">{item.prof_1}:</span>
                                                    <span className="text-[11px] font-black text-blue-600">
                                                        {item.liq_prof_1_currency === 'USD' ? 'U$D' : '$'} {item.liq_prof_1?.toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Prof 2 */}
                                            {item.prof_2 && (
                                                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                                                    <span className="text-[10px] font-bold text-slate-500">{item.prof_2}:</span>
                                                    <span className="text-[11px] font-black text-indigo-600">
                                                        {item.liq_prof_2_currency === 'USD' ? 'U$D' : '$'} {item.liq_prof_2?.toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Prof 3 */}
                                            {item.prof_3 && (
                                                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                                                    <span className="text-[10px] font-bold text-slate-500">{item.prof_3}:</span>
                                                    <span className="text-[11px] font-black text-teal-600">
                                                        {item.liq_prof_3_currency === 'USD' ? 'U$D' : '$'} {item.liq_prof_3?.toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Anestesista */}
                                            {item.anestesista && (
                                                <div className="flex items-center gap-1.5 border-l border-slate-300 pl-4">
                                                    <span className="text-[10px] font-bold text-purple-500">Anest: {item.anestesista}</span>
                                                    <span className="text-[11px] font-black text-purple-600">
                                                        {item.liq_anestesista_currency === 'USD' ? 'U$D' : '$'} {item.liq_anestesista?.toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="h-8 w-px bg-slate-100 hidden md:block" />

                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Abonado Paciente</p>
                                        <div className="flex items-center gap-2 justify-end">
                                            {item.pesos > 0 && <span className="text-xs font-black text-emerald-600">${item.pesos.toLocaleString('es-AR')}</span>}
                                            {item.dolares > 0 && <span className="text-xs font-black text-blue-600">U$D {item.dolares.toLocaleString('es-AR')}</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="h-8 w-px bg-slate-100 hidden md:block" />

                                {!isReadOnly && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => requestHistoryAction(item, 'edit')}
                                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                            title="Cargar para editar"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => requestHistoryAction(item, 'delete')}
                                            className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                                            title="Eliminar"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* PIN MODAL for History */}
            {
                showHistoryPinModal && (
                    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-slate-100 animate-in zoom-in-95 duration-200">
                            <div className="flex justify-center mb-6">
                                <div className="p-4 bg-blue-50 rounded-2xl text-blue-600">
                                    <Shield size={32} />
                                </div>
                            </div>
                            <h3 className="text-xl font-black text-slate-800 text-center mb-2">PIN de Seguridad</h3>
                            <p className="text-xs text-slate-500 text-center mb-6 font-medium">Acción protegida. Ingresa tu PIN de administrador.</p>

                            <input
                                type="password"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-center text-3xl font-black tracking-[1em] focus:ring-2 focus:ring-blue-100 outline-none mb-6"
                                placeholder="****"
                                maxLength={8}
                                value={historyPinInput}
                                onChange={(e) => setHistoryPinInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
                                autoFocus
                            />

                            <div className="flex gap-4">
                                <button
                                    onClick={() => { setShowHistoryPinModal(false); setHistoryPinInput(''); }}
                                    className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleVerifyPin}
                                    className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all font-black uppercase tracking-widest text-xs"
                                >
                                    Verificar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* Reminders Section */}
            <div className="mt-10 pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-50 rounded-lg">
                            <Bell size={20} className="text-amber-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                Recordatorios
                                {reminders.filter(r => !r.completed).length > 0 && (
                                    <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                                )}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {reminders.filter(r => !r.completed).length} pendientes
                            </p>
                        </div>
                    </div>
                    {!isReadOnly && (
                        <button
                            onClick={() => setIsAddingReminder(true)}
                            className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all"
                        >
                            <Plus size={16} /> Agregar Recordatorio
                        </button>
                    )}
                </div>

                {isAddingReminder && (
                    <div className="mb-4 flex gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <input
                            type="text"
                            className="flex-1 bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                            placeholder="Escribe un recordatorio..."
                            value={newReminder}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
                            onChange={(e) => setNewReminder(e.target.value)}
                            autoFocus
                        />
                        <button
                            onClick={handleAddReminder}
                            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                        >
                            Guardar
                        </button>
                        <button
                            onClick={() => { setIsAddingReminder(false); setNewReminder(''); }}
                            className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-sm font-medium"
                        >
                            Cancelar
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {reminders.map((rem) => (
                        <div key={rem.id} className={`group border rounded-2xl p-4 transition-all relative overflow-hidden ${rem.completed ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-amber-200 hover:shadow-md'}`}>
                            <div className={`absolute top-0 left-0 w-1 h-full transition-opacity ${rem.completed ? 'bg-emerald-400' : 'bg-amber-200 opacity-0 group-hover:opacity-100'}`} />
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex gap-3 items-start flex-1">
                                    <button
                                        onClick={() => toggleReminderStatus(rem.id, rem.completed)}
                                        className={`mt-0.5 transition-colors ${rem.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-blue-500'}`}
                                    >
                                        {rem.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                    </button>
                                    <p className={`text-sm leading-relaxed ${rem.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{rem.text}</p>
                                </div>
                                {!isReadOnly && (
                                    <button
                                        onClick={() => handleDeleteReminder(rem.id)}
                                        className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="mt-3 flex justify-between items-center">
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                    {rem.createdAt?.seconds ? new Date(rem.createdAt.seconds * 1000).toLocaleDateString() : 'Reciente'}
                                </p>
                                {rem.completed && (
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase italic tracking-tighter">Realizado</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {reminders.length === 0 && !isAddingReminder && (
                        <div className="col-span-full py-8 text-center bg-slate-50/30 rounded-2xl border border-dashed border-slate-200">
                            <p className="text-sm text-slate-400">No hay recordatorios pendientes.</p>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
};

export default CajaForm;
