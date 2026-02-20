import React, { useState } from 'react';
import { Save, Plus, Trash2, MessageSquare, Calendar, X, Bell, CheckCircle2, Circle } from 'lucide-react';
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
            anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS',
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
            anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS',
            coat_pesos: 0, coat_dolares: 0,
            comentario: ''
        }]);
    };

    const updateEntry = (id, field, value) => {
        setEntries(prevEntries => prevEntries.map(e => {
            if (e.id !== id) return e;

            const updated = { ...e, [field]: value };

            // AUTOCALCULATION LOGIC
            if (['pesos', 'dolares', 'porcentaje_prof_1', 'porcentaje_prof_2', 'porcentaje_prof_3', 'liq_prof_1_currency', 'liq_prof_2_currency', 'liq_prof_3_currency'].includes(field)) {

                // Get current values (or updated one)
                const payPesos = field === 'pesos' ? (value || 0) : (updated.pesos || 0);
                const payDolares = field === 'dolares' ? (value || 0) : (updated.dolares || 0);

                const pct1 = field === 'porcentaje_prof_1' ? (value || 0) : (updated.porcentaje_prof_1 || 0);
                const pct2 = field === 'porcentaje_prof_2' ? (value || 0) : (updated.porcentaje_prof_2 || 0);
                const pct3 = field === 'porcentaje_prof_3' ? (value || 0) : (updated.porcentaje_prof_3 || 0);

                const share1 = pct1 / 100;
                const share2 = pct2 / 100;
                const share3 = pct3 / 100;

                // Update Liq 1
                if (updated.liq_prof_1_currency === 'ARS') {
                    updated.liq_prof_1 = payPesos * share1;
                } else {
                    updated.liq_prof_1 = payDolares * share1;
                }
                // Auto-calc Secondary 1 if enabled
                if (updated.showSecondary_1) {
                    if (updated.liq_prof_1_currency_secondary === 'USD') {
                        updated.liq_prof_1_secondary = payDolares * share1;
                    } else {
                        updated.liq_prof_1_secondary = payPesos * share1;
                    }
                }

                // Update Liq 2
                if (updated.liq_prof_2_currency === 'ARS') {
                    updated.liq_prof_2 = payPesos * share2;
                } else {
                    updated.liq_prof_2 = payDolares * share2;
                }
                // Auto-calc Secondary 2 if enabled
                if (updated.showSecondary_2) {
                    if (updated.liq_prof_2_currency_secondary === 'USD') {
                        updated.liq_prof_2_secondary = payDolares * share2;
                    } else {
                        updated.liq_prof_2_secondary = payPesos * share2;
                    }
                }

                // Update Liq 3
                if (updated.liq_prof_3_currency === 'ARS') {
                    updated.liq_prof_3 = payPesos * share3;
                } else {
                    updated.liq_prof_3 = payDolares * share3;
                }
                // Auto-calc Secondary 3 if enabled
                if (updated.showSecondary_3) {
                    if (updated.liq_prof_3_currency_secondary === 'USD') {
                        updated.liq_prof_3_secondary = payDolares * share3;
                    } else {
                        updated.liq_prof_3_secondary = payPesos * share3;
                    }
                }

                // COAT = Total - (Share1 + Share2 + Share3)
                const coatShare = 1 - share1 - share2 - share3;

                updated.coat_pesos = payPesos * coatShare;
                updated.coat_dolares = payDolares * coatShare;
            }

            return updated;
        }));
    };

    const toggleCurrency = (id, field) => {
        setEntries(entries.map(e => {
            if (e.id === id) {
                const current = e[field];
                const newValue = current === 'ARS' ? 'USD' : 'ARS';
                updateEntry(id, field, newValue); // Use updateEntry to trigger recalcs
                return { ...e, [field]: newValue };
            }
            return e;
        }));
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
                porcentaje_prof_1: 100,
                pesos: 0, dolares: 0,
                liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
                liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
                liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
                anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS',
                coat_pesos: 0, coat_dolares: 0,
                comentario: ''
            }]);
            setDailyComment('');

        } catch (error) {
            console.error("Error saving data:", error);
            alert("Error al conectar con el servidor. No se pudo cerrar la caja.");
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Caja Diaria</h2>
                    <p className="text-sm text-slate-500">Ingrese los movimientos del día</p>
                </div>
                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                        <Calendar size={18} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-600">Fecha de Caja:</span>
                        <input
                            type="date"
                            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-200 outline-none"
                            value={globalDate}
                            onChange={(e) => setGlobalDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {showDailyCommentModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg">
                        <h3 className="font-bold text-lg mb-4">Comentario General del Día</h3>
                        <textarea
                            className="w-full h-32 border border-slate-300 rounded-xl p-3 focus:border-blue-500 outline-none resize-none"
                            placeholder="Ingrese observaciones generales para la planilla de hoy..."
                            value={dailyComment}
                            onChange={(e) => setDailyComment(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setShowDailyCommentModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-medium">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {commentModalId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg">
                        <h3 className="font-bold text-lg mb-4">Comentario del Paciente</h3>
                        <textarea
                            className="w-full h-32 border border-slate-300 rounded-xl p-3 focus:border-blue-500 outline-none resize-none"
                            value={entries.find(e => e.id === commentModalId)?.comentario || ''}
                            onChange={(e) => updateEntry(commentModalId, 'comentario', e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setCommentModalId(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200 hover:bg-blue-700">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 mb-6">
                <table className="w-full text-left border-collapse min-w-[1500px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                            <th className="px-3 py-3 border-b border-indigo-100">Paciente</th>
                            <th className="px-3 py-3 border-b border-indigo-100">DNI</th>
                            <th className="px-3 py-3 border-b border-indigo-100">Obra Soc.</th>
                            <th className="px-3 py-3 border-b bg-blue-50/50 text-blue-900 border-blue-100">Prof. 1</th>
                            <th className="px-3 py-3 border-b bg-indigo-50/50 text-indigo-900 border-indigo-100">Prof. 2</th>
                            <th className="px-3 py-3 border-b bg-teal-50/50 text-teal-900 border-teal-100">Prof. 3</th>
                            <th className="px-3 py-3 border-b text-slate-700">Pago $</th>
                            <th className="px-3 py-3 border-b text-emerald-700">Pago USD</th>
                            <th className="px-3 py-3 border-b bg-blue-50 text-blue-900 border-blue-100">Liq. P1</th>
                            <th className="px-3 py-3 border-b bg-indigo-50 text-indigo-900 border-indigo-100">Liq. P2</th>
                            <th className="px-3 py-3 border-b bg-teal-50 text-teal-900 border-teal-100">Liq. P3</th>
                            <th className="px-3 py-3 border-b bg-purple-50 text-purple-900 border-purple-100">Anest.</th>
                            <th className="px-3 py-3 border-b bg-purple-50 text-purple-900 border-purple-100">Liq. Anest.</th>
                            <th className="px-3 py-3 border-b bg-orange-50 text-orange-900 border-orange-100">Coat $</th>
                            <th className="px-3 py-3 border-b bg-orange-50 text-orange-900 border-orange-100">Coat USD</th>
                            <th className="px-3 py-3 border-b">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-100">
                        {entries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-2">
                                    <input className="w-full bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none transition-all" value={entry.paciente} onChange={(e) => updateEntry(entry.id, 'paciente', e.target.value)} placeholder="Nombre..." />
                                </td>
                                <td className="p-2">
                                    <input className="w-full bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none transition-all" value={entry.dni} onChange={(e) => updateEntry(entry.id, 'dni', e.target.value)} />
                                </td>
                                <td className="p-2">
                                    <input className="w-full bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none transition-all" value={entry.obra_social} onChange={(e) => updateEntry(entry.id, 'obra_social', e.target.value)} />
                                </td>

                                {/* Profesional 1 */}
                                <td className="p-2 bg-blue-50/10">
                                    <select className="w-full bg-transparent border-0 border-b border-transparent hover:border-blue-200 focus:border-blue-500 outline-none py-1 text-slate-700 font-medium" value={entry.prof_1} onChange={(e) => updateEntry(entry.id, 'prof_1', e.target.value)}>
                                        <option value="">Seleccionar</option>
                                        {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                    <div className="mt-1 flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400 font-bold">%</span>
                                        <input
                                            type="number"
                                            className="w-12 bg-transparent border-0 border-b border-transparent hover:border-blue-200 focus:border-blue-500 outline-none text-xs text-slate-500 font-medium"
                                            value={entry.porcentaje_prof_1}
                                            onChange={(e) => updateEntry(entry.id, 'porcentaje_prof_1', parseFloat(e.target.value) || 0)}
                                            placeholder="100"
                                        />
                                    </div>
                                </td>

                                {/* Profesional 2 */}
                                <td className="p-2 bg-indigo-50/10">
                                    <select className="w-full bg-transparent border-0 border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none py-1 text-slate-700 font-medium" value={entry.prof_2} onChange={(e) => updateEntry(entry.id, 'prof_2', e.target.value)}>
                                        <option value="">Seleccionar</option>
                                        {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                    <div className="mt-1 flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400 font-bold">%</span>
                                        <input
                                            type="number"
                                            className="w-12 bg-transparent border-0 border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none text-xs text-slate-500 font-medium"
                                            value={entry.porcentaje_prof_2}
                                            onChange={(e) => updateEntry(entry.id, 'porcentaje_prof_2', parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                        />
                                    </div>
                                </td>

                                {/* Profesional 3 */}
                                <td className="p-2 bg-teal-50/10">
                                    {!entry.showProf3 ? (
                                        <button
                                            onClick={() => updateEntry(entry.id, 'showProf3', true)}
                                            className="w-full h-full flex items-center justify-center py-2 text-teal-600 hover:bg-teal-50 rounded transition-all border border-dashed border-teal-200"
                                        >
                                            <Plus size={14} className="mr-1" /> Prof. 3
                                        </button>
                                    ) : (
                                        <div className="relative">
                                            <button
                                                onClick={() => updateEntry(entry.id, 'showProf3', false)}
                                                className="absolute -top-1 -right-1 text-teal-400 hover:text-red-500 transition-colors"
                                            >
                                                <X size={12} />
                                            </button>
                                            <select className="w-full bg-transparent border-0 border-b border-transparent hover:border-teal-200 focus:border-teal-500 outline-none py-1 text-slate-700 font-medium" value={entry.prof_3} onChange={(e) => updateEntry(entry.id, 'prof_3', e.target.value)}>
                                                <option value="">Seleccionar</option>
                                                {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                            </select>
                                            <div className="mt-1 flex items-center gap-1">
                                                <span className="text-[10px] text-slate-400 font-bold">%</span>
                                                <input
                                                    type="number"
                                                    className="w-12 bg-transparent border-0 border-b border-transparent hover:border-teal-200 focus:border-teal-500 outline-none text-xs text-slate-500 font-medium"
                                                    value={entry.porcentaje_prof_3}
                                                    onChange={(e) => updateEntry(entry.id, 'porcentaje_prof_3', parseFloat(e.target.value) || 0)}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </td>

                                {/* Pagos */}
                                <td className="p-2">
                                    <MoneyInput
                                        className="w-24 text-right bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none text-sm"
                                        value={entry.pesos}
                                        onChange={(val) => updateEntry(entry.id, 'pesos', val)}
                                    />
                                </td>
                                <td className="p-2">
                                    <MoneyInput
                                        className="w-24 text-right bg-slate-50/50 border border-emerald-200 rounded px-2 py-1.5 focus:bg-white focus:border-emerald-400 outline-none text-emerald-700 font-medium text-sm"
                                        value={entry.dolares}
                                        onChange={(val) => updateEntry(entry.id, 'dolares', val)}
                                    />
                                </td>

                                {/* Liq Prof 1 */}
                                <td className="p-2 bg-blue-50/20">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => toggleCurrency(entry.id, 'liq_prof_1_currency')} className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase">{entry.liq_prof_1_currency}</button>
                                            <MoneyInput
                                                className="w-20 text-right bg-transparent border-b border-blue-100 focus:border-blue-500 outline-none text-blue-800 font-bold text-sm"
                                                value={entry.liq_prof_1}
                                                onChange={(val) => updateEntry(entry.id, 'liq_prof_1', val)}
                                            />
                                            <button onClick={() => setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, showSecondary_1: !e.showSecondary_1 } : e))} className="ml-1 text-blue-300 hover:text-blue-600 transition-colors" title="Agregar segundo monto"><Plus size={14} /></button>
                                        </div>
                                        {entry.showSecondary_1 && (
                                            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-top-1 border-t border-blue-100 pt-1">
                                                <button onClick={() => toggleCurrency(entry.id, 'liq_prof_1_currency_secondary')} className="text-[10px] font-bold text-slate-400 hover:text-purple-600 uppercase">{entry.liq_prof_1_currency_secondary}</button>
                                                <MoneyInput
                                                    className="w-20 text-right bg-transparent border-b border-blue-100 focus:border-blue-500 outline-none text-slate-600 text-xs"
                                                    value={entry.liq_prof_1_secondary}
                                                    onChange={(val) => updateEntry(entry.id, 'liq_prof_1_secondary', val)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Liq Prof 2 */}
                                <td className="p-2 bg-indigo-50/20">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => toggleCurrency(entry.id, 'liq_prof_2_currency')} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 uppercase">{entry.liq_prof_2_currency}</button>
                                            <MoneyInput
                                                className="w-20 text-right bg-transparent border-b border-indigo-100 focus:border-indigo-500 outline-none text-indigo-800 font-bold text-sm"
                                                value={entry.liq_prof_2}
                                                onChange={(val) => updateEntry(entry.id, 'liq_prof_2', val)}
                                            />
                                            <button onClick={() => setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, showSecondary_2: !e.showSecondary_2 } : e))} className="ml-1 text-indigo-300 hover:text-indigo-600 transition-colors" title="Agregar segundo monto"><Plus size={14} /></button>
                                        </div>
                                        {entry.showSecondary_2 && (
                                            <div className="flex items-center gap-1 animate-in fade-in slide-in-from-top-1 border-t border-indigo-100 pt-1">
                                                <button onClick={() => toggleCurrency(entry.id, 'liq_prof_2_currency_secondary')} className="text-[10px] font-bold text-slate-400 hover:text-purple-600 uppercase">{entry.liq_prof_2_currency_secondary}</button>
                                                <MoneyInput
                                                    className="w-20 text-right bg-transparent border-b border-indigo-100 focus:border-indigo-500 outline-none text-slate-600 text-xs"
                                                    value={entry.liq_prof_2_secondary}
                                                    onChange={(val) => updateEntry(entry.id, 'liq_prof_2_secondary', val)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Liq Prof 3 */}
                                <td className="p-2 bg-teal-50/20">
                                    {entry.showProf3 && (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => toggleCurrency(entry.id, 'liq_prof_3_currency')} className="text-[10px] font-bold text-slate-400 hover:text-teal-600 uppercase">{entry.liq_prof_3_currency}</button>
                                                <MoneyInput
                                                    className="w-20 text-right bg-transparent border-b border-teal-100 focus:border-teal-500 outline-none text-teal-800 font-bold text-sm"
                                                    value={entry.liq_prof_3}
                                                    onChange={(val) => updateEntry(entry.id, 'liq_prof_3', val)}
                                                />
                                                <button onClick={() => setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, showSecondary_3: !e.showSecondary_3 } : e))} className="ml-1 text-teal-300 hover:text-teal-600 transition-colors" title="Agregar segundo monto"><Plus size={14} /></button>
                                            </div>
                                            {entry.showSecondary_3 && (
                                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-top-1 border-t border-teal-100 pt-1">
                                                    <button onClick={() => toggleCurrency(entry.id, 'liq_prof_3_currency_secondary')} className="text-[10px] font-bold text-slate-400 hover:text-purple-600 uppercase">{entry.liq_prof_3_currency_secondary}</button>
                                                    <MoneyInput
                                                        className="w-20 text-right bg-transparent border-b border-teal-100 focus:border-teal-500 outline-none text-slate-600 text-xs"
                                                        value={entry.liq_prof_3_secondary}
                                                        onChange={(val) => updateEntry(entry.id, 'liq_prof_3_secondary', val)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </td>

                                {/* Anestesista */}
                                <td className="p-2 bg-purple-50/10">
                                    <select className="w-24 bg-transparent border-0 border-b border-purple-100 focus:border-purple-500 outline-none text-xs" value={entry.anestesista || ''} onChange={(e) => updateEntry(entry.id, 'anestesista', e.target.value)}>
                                        <option value="">-</option>
                                        {anestesistas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </td>

                                {/* Liq Anest */}
                                <td className="p-2 bg-purple-50/20">
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency')} className="text-[10px] font-bold text-slate-400 hover:text-purple-600 uppercase">{entry.liq_anestesista_currency}</button>
                                        <MoneyInput
                                            className="w-20 text-right bg-transparent border-b border-purple-100 focus:border-purple-500 outline-none text-purple-800 font-bold text-sm"
                                            value={entry.liq_anestesista}
                                            onChange={(val) => updateEntry(entry.id, 'liq_anestesista', val)}
                                        />
                                    </div>
                                </td>

                                {/* COAT */}
                                <td className="p-2 bg-orange-50/20">
                                    <MoneyInput
                                        className="w-16 text-right bg-transparent border-b border-orange-100 focus:border-orange-500 outline-none text-orange-800 text-sm"
                                        value={entry.coat_pesos}
                                        onChange={(val) => updateEntry(entry.id, 'coat_pesos', val)}
                                    />
                                </td>
                                <td className="p-2 bg-orange-50/20">
                                    <MoneyInput
                                        className="w-16 text-right bg-transparent border-b border-orange-100 focus:border-orange-500 outline-none text-orange-800 text-sm"
                                        value={entry.coat_dolares}
                                        onChange={(val) => updateEntry(entry.id, 'coat_dolares', val)}
                                    />
                                </td>

                                {/* Actions */}
                                <td className="p-2 flex gap-1">
                                    <button onClick={() => setCommentModalId(entry.id)} className={`p-1.5 rounded-lg transition-all ${entry.comentario ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 hover:text-blue-500'}`}>
                                        <MessageSquare size={16} />
                                    </button>
                                    {!isReadOnly && (
                                        <button onClick={() => removeRow(entry.id)} className="p-1.5 bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                {!isReadOnly && (
                    <button onClick={() => setShowDailyCommentModal(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-all font-medium border border-amber-200">
                        <MessageSquare size={18} />
                        {dailyComment ? "Editar Comentario del Día *" : "Agregar Comentario del Día"}
                    </button>
                )}

                {!isReadOnly && (
                    <div className="flex gap-4">
                        <button onClick={addRow} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all font-medium whitespace-nowrap">
                            <Plus size={18} /> Agregar Fila
                        </button>
                        <button onClick={handleCerrarCaja} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium whitespace-nowrap shadow-lg shadow-blue-200">
                            <Save size={18} /> Cerrar Caja
                        </button>
                    </div>
                )}
            </div>

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
        </div>
    );
};

export default CajaForm;
