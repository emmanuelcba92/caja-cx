import React, { useState } from 'react';
import { Save, Plus, Trash2, MessageSquare, Calendar, X, Bell, CheckCircle2, Circle, LayoutDashboard, ChevronDown, ChevronUp, User, DollarSign, Percent, Building2, Lock, Edit2 } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import MoneyInput from './MoneyInput';

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (val, currency = 'ARS') => {
    if (!val && val !== 0) return currency === 'USD' ? 'USD 0,00' : '$ 0,00';
    const prefix = currency === 'USD' ? 'USD ' : '$ ';
    return prefix + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const EMPTY_ENTRY = () => ({
    id: Date.now() + Math.random(),
    paciente: '',
    dni: '', // Nuevo campo
    obraSocial: '',

    // Pagos duales
    total_ars: 0,
    total_usd: 0,

    // Profesionales
    prof_1: '', liq_prof_1_ars: 0, liq_prof_1_usd: 0, pct_prof_1: 50,
    prof_2: '', liq_prof_2_ars: 0, liq_prof_2_usd: 0, pct_prof_2: 50,
    showProf3: false,
    prof_3: '', liq_prof_3_ars: 0, liq_prof_3_usd: 0, pct_prof_3: 0,

    // Anestesista
    anestesista: '', liq_anestesista_ars: 0, liq_anestesista_usd: 0,

    // COAT Resultante
    coat_ars: 0,
    coat_usd: 0,

    comentario: '',
    collapsed: false,
});

// ─── Auto-calc ──────────────────────────────────────────────────────────────
const recalc = (updated) => {
    const e = { ...updated };

    // Calcula honorarios porcentuales sobre AMBAS monedas
    // Prof 1
    e.liq_prof_1_ars = e.total_ars * ((e.pct_prof_1 || 0) / 100);
    e.liq_prof_1_usd = e.total_usd * ((e.pct_prof_1 || 0) / 100);

    // Prof 2
    e.liq_prof_2_ars = e.total_ars * ((e.pct_prof_2 || 0) / 100);
    e.liq_prof_2_usd = e.total_usd * ((e.pct_prof_2 || 0) / 100);

    // Prof 3
    if (e.showProf3) {
        e.liq_prof_3_ars = e.total_ars * ((e.pct_prof_3 || 0) / 100);
        e.liq_prof_3_usd = e.total_usd * ((e.pct_prof_3 || 0) / 100);
    } else {
        e.liq_prof_3_ars = 0;
        e.liq_prof_3_usd = 0;
    }

    // El anestesista suele ser un monto fijo, pero si es mixto, 
    // asumimos que el usuario ingresa manualmente el monto en cada moneda si quiere.
    // Si no, lo dejamos como input manual en el UI (no calculado por porcentaje).

    // COAT Final
    e.coat_ars = Math.max(0, e.total_ars - e.liq_prof_1_ars - e.liq_prof_2_ars - e.liq_prof_3_ars - (e.liq_anestesista_ars || 0));
    e.coat_usd = Math.max(0, e.total_usd - e.liq_prof_1_usd - e.liq_prof_2_usd - e.liq_prof_3_usd - (e.liq_anestesista_usd || 0));

    return e;
};

// ─── Component ──────────────────────────────────────────────────────────────

const CajaForm = () => {
    const { viewingUid, permission, currentUser, catalogOwnerUid } = useAuth();
    const isReadOnly = permission === 'viewer';

    const [globalDate, setGlobalDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyComment, setDailyComment] = useState('');
    const [showDailyCommentModal, setShowDailyCommentModal] = useState(false);
    const [reminders, setReminders] = useState([]);
    const [newReminder, setNewReminder] = useState('');
    const [isAddingReminder, setIsAddingReminder] = useState(false);
    const [commentModalId, setCommentModalId] = useState(null);
    const [profesionales, setProfesionales] = useState([]);

    const [entries, setEntries] = useState([EMPTY_ENTRY()]); // Always 1 entry for the form
    const [historyEntries, setHistoryEntries] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // PIN & Edit States
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinAction, setPinAction] = useState(null); // { type: 'edit' | 'delete', item: ... }
    const [pinInput, setPinInput] = useState('');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    // ── Fetch ──────────────────────────────────────────────────────────────

    const fetchProfs = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            const q = query(collection(db, 'profesionales'), where('userId', '==', ownerToUse));
            const snap = await getDocs(q);
            const profs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProfesionales(profs);
        } catch (e) { console.error(e); }
    };

    const fetchReminders = () => {
        if (!currentUser?.uid) return () => { };
        const q = query(collection(db, 'reminders'), where('userId', '==', currentUser.uid));
        const unsub = onSnapshot(q, snap => {
            const rems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            rems.sort((a, b) => {
                if (a.completed === b.completed) return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
                return a.completed ? 1 : -1;
            });
            setReminders(rems);
        });
        return unsub;
    };

    const fetchHistory = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        setIsLoadingHistory(true);
        try {
            // Query by date and user
            const q = query(
                collection(db, 'caja'),
                where('userId', '==', ownerToUse),
                where('fecha', '==', globalDate)
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Start by newest created
            data.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setHistoryEntries(data);
        } catch (e) { console.error(e); }
        setIsLoadingHistory(false);
    };

    React.useEffect(() => {
        fetchProfs();
        fetchHistory(); // Fetch history when date/user changes
        const unsub = fetchReminders();
        return () => unsub();
    }, [viewingUid, catalogOwnerUid, globalDate]);

    // No local storage sync needed for single volatile entry essentially, 
    // or we can keep it but just for the current form-in-progress.
    React.useEffect(() => {
        localStorage.setItem('cajaDiariaCurrentForm', JSON.stringify(entries));
    }, [entries]);

    // Restore form on load if exists
    React.useEffect(() => {
        try {
            const saved = localStorage.getItem('cajaDiariaCurrentForm');
            if (saved) setEntries(JSON.parse(saved));
        } catch { }
    }, []);

    // ── Entry mutations ────────────────────────────────────────────────────

    const updateEntry = (id, patch) => {
        setEntries(prev => prev.map(e => {
            if (e.id !== id) return e;
            const updated = { ...e, ...patch };

            const fullCalcKeys = [
                'total_ars', 'total_usd',
                'pct_prof_1', 'pct_prof_2', 'pct_prof_3', 'showProf3'
            ];

            const partialCalcKeys = [
                'liq_prof_1_ars', 'liq_prof_1_usd',
                'liq_prof_2_ars', 'liq_prof_2_usd',
                'liq_prof_3_ars', 'liq_prof_3_usd',
                'liq_anestesista_ars', 'liq_anestesista_usd'
            ];

            if (fullCalcKeys.some(k => k in patch)) {
                return recalc(updated);
            }

            if (partialCalcKeys.some(k => k in patch)) {
                const coat_ars = Math.max(0, (updated.total_ars || 0) - (updated.liq_prof_1_ars || 0) - (updated.liq_prof_2_ars || 0) - (updated.liq_prof_3_ars || 0) - (updated.liq_anestesista_ars || 0));
                const coat_usd = Math.max(0, (updated.total_usd || 0) - (updated.liq_prof_1_usd || 0) - (updated.liq_prof_2_usd || 0) - (updated.liq_prof_3_usd || 0) - (updated.liq_anestesista_usd || 0));
                return { ...updated, coat_ars, coat_usd };
            }

            return updated;
        }));
    };

    const addRow = () => setEntries(prev => [...prev, EMPTY_ENTRY()]);
    const removeRow = (id) => { if (entries.length > 1) setEntries(prev => prev.filter(e => e.id !== id)); };

    // ── Cerrar Caja ────────────────────────────────────────────────────────

    // ── OPerations ─────────────────────────────────────────────────────────

    const handleGuardarOperacion = async () => {
        const entry = entries[0];
        if (!entry.paciente || (!entry.total_ars && !entry.total_usd)) {
            alert('Completá al menos el nombre del paciente y un monto.');
            return;
        }

        const ownerToUse = catalogOwnerUid || viewingUid;

        // Mapeamos a la estructura plana que usa Firestore
        const docData = {
            // Datos básicos
            paciente: entry.paciente,
            dni: entry.dni || '',
            obraSocial: entry.obraSocial,
            comentario: entry.comentario,

            // Montos Totales
            pesos: entry.total_ars || 0,
            dolares: entry.total_usd || 0,
            total: (entry.total_ars || 0) + (entry.total_usd || 0), // Referencial, suma simple
            moneda: (entry.total_usd > 0 && entry.total_ars === 0) ? 'USD' : 'ARS', // Legacy main currency

            // Montos COAT
            coat_pesos: entry.coat_ars || 0,
            coat_dolares: entry.coat_usd || 0,
            coat: (entry.coat_ars || 0) + (entry.coat_usd || 0), // Legacy

            // Profesionales (Guardamos el detalle completo si es posible, o simplificamos para legacy)
            // Legacy espera liq_prof_N y currency. Mapeamos ARS a primary y USD a secondary.
            liq_prof_1: entry.liq_prof_1_ars || 0,
            liq_prof_1_currency: 'ARS',
            liq_prof_1_secondary: entry.liq_prof_1_usd || 0,
            liq_prof_1_currency_secondary: 'USD',

            liq_prof_2: entry.liq_prof_2_ars || 0,
            liq_prof_2_currency: 'ARS',
            liq_prof_2_secondary: entry.liq_prof_2_usd || 0,
            liq_prof_2_currency_secondary: 'USD',

            liq_prof_3: entry.liq_prof_3_ars || 0,
            liq_prof_3_currency: 'ARS',
            liq_prof_3_secondary: entry.liq_prof_3_usd || 0,
            liq_prof_3_currency_secondary: 'USD',

            liq_anestesista: entry.liq_anestesista_ars || 0,
            liq_anestesista_currency: 'ARS',
            liq_anestesista_secondary: entry.liq_anestesista_usd || 0,
            liq_anestesista_currency_secondary: 'USD',

            // Campos planos adicionales por las dudas
            liq_prof_1_ars: entry.liq_prof_1_ars, liq_prof_1_usd: entry.liq_prof_1_usd,
            liq_prof_2_ars: entry.liq_prof_2_ars, liq_prof_2_usd: entry.liq_prof_2_usd,
            liq_prof_3_ars: entry.liq_prof_3_ars, liq_prof_3_usd: entry.liq_prof_3_usd,
            liq_anestesista_ars: entry.liq_anestesista_ars, liq_anestesista_usd: entry.liq_anestesista_usd,

            // Métadatos Professional (Nombres y Pct)
            prof_1: entry.prof_1, pct_prof_1: entry.pct_prof_1,
            prof_2: entry.prof_2, pct_prof_2: entry.pct_prof_2,
            prof_3: entry.prof_3, pct_prof_3: entry.pct_prof_3,
            showProf3: entry.showProf3,
            anestesista: entry.anestesista,

            // Meta sistema
            fecha: globalDate,
            userId: ownerToUse,
            createdBy: currentUser?.email || 'unknown',
            createdAt: new Date().toISOString(),
        };

        try {
            await addDoc(collection(db, 'caja'), docData);
            setEntries([EMPTY_ENTRY()]); // Reset form
            fetchHistory(); // Update list
            alert('Operación guardada exitosamente.');
        } catch (e) {
            console.error(e);
            alert('Error al guardar operación.');
        }
    };

    const handleGuardarJornada = async () => {
        // Maybe this just adds the daily comment?
        if (dailyComment.trim()) {
            const ownerToUse = catalogOwnerUid || viewingUid;
            try {
                await addDoc(collection(db, 'daily_comments'), {
                    date: globalDate, comment: dailyComment,
                    userId: ownerToUse, timestamp: new Date(),
                });
                alert('Jornada guardada (comentario registrado).');
                setDailyComment('');
            } catch (e) { console.error(e); }
        } else {
            alert('La jornada ya está actualizada con las operaciones guardadas. Agregá un comentario general si es necesario.');
        }
    };

    // ── PIN & Actions ──────────────────────────────────────────────────────

    const verifyPin = async () => {
        try {
            if (!viewingUid) return;
            const settingsRef = doc(db, "user_settings", viewingUid);
            const settingsSnap = await getDoc(settingsRef); // Import getDoc

            let valid = false;
            // Default PINs
            const defaultPins = ['0511', 'admin', '1234'];
            if (defaultPins.includes(pinInput)) valid = true;

            if (settingsSnap.exists() && settingsSnap.data().adminPin) {
                if (pinInput === settingsSnap.data().adminPin) valid = true;
            }

            if (valid) {
                setShowPinModal(false);
                setPinInput('');
                if (pinAction) {
                    if (pinAction.type === 'edit') {
                        setEditingItem(pinAction.item);
                        setEditModalOpen(true);
                    } else if (pinAction.type === 'delete') {
                        await deleteDoc(doc(db, 'caja', pinAction.item.id));
                        fetchHistory();
                    }
                }
                setPinAction(null);
            } else {
                alert('PIN Incorrecto');
            }
        } catch (error) {
            console.error("Error verifying PIN:", error);
            alert("Error al verificar PIN.");
        }
    };

    const requestEdit = (item) => {
        setPinAction({ type: 'edit', item });
        setShowPinModal(true);
    };

    const requestDelete = (item) => {
        if (!window.confirm('¿Borrar esta operación del historial?')) return;
        setPinAction({ type: 'delete', item });
        setShowPinModal(true);
    };

    const handleUpdateItem = async (updatedData) => {
        try {
            // Updated mapping logic (Same as handleGuardarOperacion)
            const processed = {
                ...updatedData,
                // Legacy Map: ARS -> primary, USD -> secondary
                liq_prof_1: updatedData.liq_prof_1_ars || 0,
                liq_prof_1_currency: 'ARS',
                liq_prof_1_secondary: updatedData.liq_prof_1_usd || 0,
                liq_prof_1_currency_secondary: 'USD',

                liq_prof_2: updatedData.liq_prof_2_ars || 0,
                liq_prof_2_currency: 'ARS',
                liq_prof_2_secondary: updatedData.liq_prof_2_usd || 0,
                liq_prof_2_currency_secondary: 'USD',

                liq_prof_3: updatedData.liq_prof_3_ars || 0,
                liq_prof_3_currency: 'ARS',
                liq_prof_3_secondary: updatedData.liq_prof_3_usd || 0,
                liq_prof_3_currency_secondary: 'USD',

                liq_anestesista: updatedData.liq_anestesista_ars || 0,
                liq_anestesista_currency: 'ARS',
                liq_anestesista_secondary: updatedData.liq_anestesista_usd || 0,
                liq_anestesista_currency_secondary: 'USD',

                // Legacy totals for display in HistorialCaja
                pesos: updatedData.total_ars || 0,
                dolares: updatedData.total_usd || 0,
                total: (updatedData.total_ars || 0) + (updatedData.total_usd || 0),
                coat_pesos: updatedData.coat_ars || 0,
                coat_dolares: updatedData.coat_usd || 0,
                coat: (updatedData.coat_ars || 0) + (updatedData.coat_usd || 0),
                moneda: (updatedData.total_usd > 0 && updatedData.total_ars === 0) ? 'USD' : 'ARS'
            };

            await updateDoc(doc(db, 'caja', editingItem.id), processed);
            setEditModalOpen(false);
            setEditingItem(null);
            fetchHistory();
            alert('Registro actualizado.');
        } catch (e) {
            console.error(e);
            alert('Error al actualizar.');
        }
    };

    // ── Reminders ──────────────────────────────────────────────────────────

    const handleAddReminder = async () => {
        if (!newReminder.trim() || !currentUser?.uid) return;
        try {
            await addDoc(collection(db, 'reminders'), {
                text: newReminder, userId: currentUser.uid,
                completed: false, createdAt: new Date(), createdBy: currentUser?.email || 'unknown',
            });
            setNewReminder(''); setIsAddingReminder(false);
        } catch (e) { console.error(e); }
    };

    const toggleReminderStatus = async (id, cur) => {
        try { await updateDoc(doc(db, 'reminders', id), { completed: !cur, updatedAt: new Date() }); } catch (e) { console.error(e); }
    };

    const handleDeleteReminder = async (id) => {
        if (!window.confirm('¿Eliminar este recordatorio?')) return;
        try { await deleteDoc(doc(db, 'reminders', id)); } catch (e) { console.error(e); }
    };

    // ── Derived data ───────────────────────────────────────────────────────

    const surgeons = profesionales.filter(p => p.categoria !== 'Anestesista');
    const anestesistas = profesionales.filter(p => p.categoria === 'Anestesista');

    // ── Grand totals (From History) ────────────────────────────────────────
    // ── Grand totals (From History) ────────────────────────────────────────
    const totals = historyEntries.reduce((acc, raw) => {
        // Normalize for calculation
        // Newer entries have coat_pesos/dolares directly or total_ars/usd
        // Older entries have 'pesos' or 'dolares' and 'coat_pesos'/'coat_dolares'

        const ars = (raw.coat_pesos || 0) + (raw.coat_ars || 0); // Handle both new/old naming if varies
        const usd = (raw.coat_dolares || 0) + (raw.coat_usd || 0);

        // Fallback for very old single currency legacy if needed (though map usually handles display)
        // Checks specific legacy fields if coat_pesos/dolares are missing but coat exist?
        // Usually safe to rely on coat_pesos/coat_dolares which are standard in DB now.

        acc.coatARS += ars;
        acc.coatUSD += usd;
        return acc;
    }, { coatARS: 0, coatUSD: 0 });

    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#0097A7] text-white rounded-2xl shadow-lg shadow-teal-100 hidden sm:block">
                        <LayoutDashboard size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">Caja Diaria</h2>
                        <p className="text-sm text-slate-500 font-medium tracking-tight">Control de gestión de ingresos y honorarios</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-3xl border border-slate-100 shadow-sm">
                    {/* Date Picker */}
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100 hover:border-teal-200 transition-all group">
                        <Calendar size={18} className="text-teal-600 group-hover:scale-110 transition-transform" />
                        <input
                            type="date"
                            className="bg-transparent border-none text-sm font-bold text-teal-900 focus:outline-none cursor-pointer"
                            value={globalDate}
                            onChange={e => setGlobalDate(e.target.value)}
                        />
                    </div>

                    {/* Totals Summary */}
                    <div className="flex gap-2">
                        <div className="bg-teal-50 border border-teal-100 px-4 py-2 rounded-2xl text-center min-w-[100px]">
                            <span className="block text-[8px] font-black text-teal-600 uppercase tracking-widest mb-0.5">Total Pesos</span>
                            <span className="text-sm font-black text-teal-800">$ {new Intl.NumberFormat('es-AR').format(totals.coatARS)}</span>
                        </div>
                        <div className="bg-teal-50 border border-teal-100 px-4 py-2 rounded-2xl text-center min-w-[100px]">
                            <span className="block text-[8px] font-black text-teal-600 uppercase tracking-widest mb-0.5">Total USD</span>
                            <span className="text-sm font-black text-teal-800">USD {new Intl.NumberFormat('es-AR').format(totals.coatUSD)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Modales ────────────────────────────────────────────────── */}
            {showDailyCommentModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg">
                        <h3 className="font-bold text-lg mb-4">Comentario General del Día</h3>
                        <textarea
                            className="w-full h-32 border border-slate-300 rounded-xl p-3 focus:border-teal-500 outline-none resize-none"
                            placeholder="Observaciones generales del día..."
                            value={dailyComment}
                            onChange={e => setDailyComment(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setShowDailyCommentModal(false)} className="px-4 py-2 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {commentModalId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg">
                        <h3 className="font-bold text-lg mb-4">Comentario del Paciente</h3>
                        <textarea
                            className="w-full h-32 border border-slate-300 rounded-xl p-3 focus:border-teal-500 outline-none resize-none"
                            value={entries.find(e => e.id === commentModalId)?.comentario || ''}
                            onChange={e => updateEntry(commentModalId, { comentario: e.target.value })}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setCommentModalId(null)} className="px-4 py-2 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIN Modal */}
            {showPinModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 bg-teal-50 rounded-full">
                                <Lock size={24} className="text-teal-600" />
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2 text-center">Acceso Restringido</h3>
                        <p className="text-xs text-slate-500 text-center mb-6">Ingresá tu PIN de seguridad para modificar el historial.</p>

                        <input
                            type="password"
                            className="w-full text-center text-3xl tracking-[0.5em] font-bold py-3 border-2 border-slate-200 rounded-xl mb-6 focus:border-teal-500 focus:outline-none transition-all placeholder:tracking-normal"
                            placeholder="PIN"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => { setShowPinModal(false); setPinInput(''); setPinAction(null); }} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-all">Cancelar</button>
                            <button onClick={verifyPin} className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 shadow-lg shadow-teal-200 transition-all">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal (Reuses PatientCard structure but handled independently) */}
            {editModalOpen && editingItem && (
                <div className="fixed inset-0 bg-black/50 z-[50] flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-slate-100 p-6 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">Editar Operación</h3>
                            <button onClick={() => setEditModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                                <X size={24} />
                            </button>
                        </div>

                        <PatientCard
                            entry={editingItem}
                            idx={0}
                            surgeons={surgeons}
                            anestesistas={anestesistas}
                            isReadOnly={false}
                            onUpdate={(patch) => {
                                // Real-time local update in the modal state
                                const updated = { ...editingItem, ...patch };

                                // Recalculate logic
                                const calcKeys = [
                                    'total_ars', 'total_usd',
                                    'pct_prof_1', 'pct_prof_2', 'pct_prof_3',
                                    'liq_anestesista_ars', 'liq_anestesista_usd'
                                ];
                                const needsRecalc = Object.keys(patch).some(key => calcKeys.includes(key));

                                if (needsRecalc && !('coat_ars' in patch || 'coat_usd' in patch)) {
                                    setEditingItem(recalc(updated));
                                } else {
                                    setEditingItem(updated);
                                }
                            }}
                            onRemove={() => { }}
                            onComment={() => { }} // Could implement comment modal inside edit if needed
                            hideCollapse={true}
                        />

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setEditModalOpen(false)} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-white rounded-xl transition-all">Cancelar</button>
                            <button onClick={() => handleUpdateItem(editingItem)} className="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 shadow-lg shadow-teal-100 transition-all">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Cards de Pacientes (Single Form) ───────────────────────── */}
            <div className="space-y-4">
                <PatientCard
                    key={entries[0].id}
                    entry={entries[0]}
                    idx={0}
                    surgeons={surgeons}
                    anestesistas={anestesistas}
                    isReadOnly={isReadOnly}
                    onUpdate={(patch) => updateEntry(entries[0].id, patch)}
                    onRemove={() => { }} // Remove functionality disabled for main form
                    onComment={() => setCommentModalId(entries[0].id)}
                    hideCollapse={true} // New prop to prevent collapsing the main form
                />
            </div>

            {/* ── Acciones ───────────────────────────────────────────────── */}
            {!isReadOnly && (
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-2">
                    <button
                        onClick={() => setShowDailyCommentModal(true)}
                        className={`flex items-center gap-2 px-6 py-4 rounded-2xl transition-all font-bold text-sm border-2 ${dailyComment ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-white text-slate-400 border-slate-100 hover:border-teal-200 hover:text-teal-600 shadow-sm'}`}
                    >
                        <MessageSquare size={20} />
                        {dailyComment ? 'Editar Observación General' : 'Añadir Observación General'}
                    </button>
                    <div className="flex gap-4 w-full md:w-auto">
                        <button
                            onClick={handleGuardarOperacion}
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-[#00897B] text-white rounded-2xl hover:bg-[#00796B] transition-all font-black uppercase tracking-widest shadow-xl shadow-teal-100 text-sm"
                        >
                            <CheckCircle2 size={20} /> Guardar Operación
                        </button>
                        <button
                            onClick={handleGuardarJornada}
                            className="flex-1 md:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-[#006064] text-white rounded-2xl hover:bg-[#004d40] transition-all font-black uppercase tracking-widest shadow-xl shadow-teal-200 text-sm"
                        >
                            <Save size={20} /> Guardar Jornada
                        </button>
                    </div>
                </div>
            )}

            {/* ── Historial del Día ─────────────────────────────────────── */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4 px-2">
                    <h3 className="text-lg font-bold text-slate-800">Historial del Día</h3>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{historyEntries.length} REGISTROS</span>
                </div>

                {isLoadingHistory ? (
                    <div className="text-center py-8 text-slate-400">Cargando historial...</div>
                ) : historyEntries.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                        <p className="text-sm text-slate-400">Aún no hay operaciones guardadas para hoy.</p>
                    </div>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Paciente / DNI</th>
                                    <th className="px-4 py-3">Obra Social</th>
                                    <th className="px-4 py-3">Profesionales</th>
                                    <th className="px-4 py-3 text-right">Pagó</th>
                                    <th className="px-4 py-3 text-right">COAT</th>
                                    <th className="px-4 py-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {historyEntries.map(raw => {
                                    // Normalize for display
                                    const item = (raw.total !== undefined) ? raw : {
                                        ...raw,
                                        moneda: (raw.dolares || 0) > 0 ? 'USD' : 'ARS',
                                        total: (raw.dolares || 0) > 0 ? raw.dolares : raw.pesos,
                                        coat: (raw.dolares || 0) > 0 ? raw.coat_dolares : raw.coat_pesos,
                                    };

                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700">{item.paciente}</div>
                                                <div className="text-[10px] text-slate-400 font-medium">{item.dni || '-'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 text-xs font-medium">{item.obraSocial || '-'}</td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-1">
                                                    {[
                                                        { name: item.prof_1, ars: item.liq_prof_1_ars, usd: item.liq_prof_1_usd },
                                                        { name: item.prof_2, ars: item.liq_prof_2_ars, usd: item.liq_prof_2_usd },
                                                        { name: item.prof_3, ars: item.liq_prof_3_ars, usd: item.liq_prof_3_usd },
                                                        { name: item.anestesista, ars: item.liq_anestesista_ars, usd: item.liq_anestesista_usd, label: 'Anest.' }
                                                    ].filter(p => p.name).map((p, i) => (
                                                        <div key={i} className="flex flex-col border-l-2 border-teal-100 pl-2">
                                                            <div className="text-[10px] font-bold text-teal-800 uppercase tracking-tighter">
                                                                {p.label || 'Prof.'}: {p.name}
                                                            </div>
                                                            <div className="text-[9px] text-slate-500 font-medium flex gap-2">
                                                                {p.ars > 0 && <span>ARS {fmt(p.ars).replace('$ ', '')}</span>}
                                                                {p.usd > 0 && <span>USD {fmt(p.usd, 'USD').replace('USD ', '')}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="text-teal-700 font-bold text-sm">
                                                    {(item.total_ars || 0) > 0 && <div>{fmt(item.total_ars)}</div>}
                                                    {(item.total_usd || 0) > 0 && <div>{fmt(item.total_usd, 'USD')}</div>}
                                                    {(!item.total_ars && !item.total_usd) && <span className="text-slate-300">0,00</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="text-orange-600 font-bold text-sm">
                                                    {(item.coat_ars || 0) > 0 && <div>{fmt(item.coat_ars)}</div>}
                                                    {(item.coat_usd || 0) > 0 && <div>{fmt(item.coat_usd, 'USD')}</div>}
                                                    {(!item.coat_ars && !item.coat_usd) && <span className="text-slate-300">0,00</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 flex justify-center gap-2">
                                                <button
                                                    onClick={() => requestEdit(item)}
                                                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                                                    title="Editar (Requiere PIN)"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => requestDelete(item)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Eliminar (Requiere PIN)"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Recordatorios ─────────────────────────────────────────── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mt-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 rounded-xl">
                            <Bell size={18} className="text-amber-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                Recordatorios
                                {reminders.filter(r => !r.completed).length > 0 && (
                                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                )}
                            </h3>
                            <p className="text-xs text-slate-500">{reminders.filter(r => !r.completed).length} pendientes</p>
                        </div>
                    </div>
                    {!isReadOnly && (
                        <button
                            onClick={() => setIsAddingReminder(true)}
                            className="text-sm font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-all"
                        >
                            <Plus size={16} /> Agregar
                        </button>
                    )}
                </div>

                {isAddingReminder && (
                    <div className="mb-4 flex gap-2">
                        <input
                            type="text"
                            className="flex-1 bg-white border border-teal-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-teal-100 outline-none"
                            placeholder="Escribí un recordatorio..."
                            value={newReminder}
                            onKeyDown={e => e.key === 'Enter' && handleAddReminder()}
                            onChange={e => setNewReminder(e.target.value)}
                            autoFocus
                        />
                        <button onClick={handleAddReminder} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-teal-700 transition-all">Guardar</button>
                        <button onClick={() => { setIsAddingReminder(false); setNewReminder(''); }} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-sm">Cancelar</button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {reminders.map(rem => (
                        <div key={rem.id} className={`group border rounded-2xl p-4 transition-all relative overflow-hidden ${rem.completed ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-orange-200 hover:shadow-sm'}`}>
                            <div className={`absolute top-0 left-0 w-1 h-full ${rem.completed ? 'bg-teal-400' : 'bg-orange-300 opacity-0 group-hover:opacity-100'} transition-opacity`} />
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex gap-3 items-start flex-1">
                                    <button onClick={() => toggleReminderStatus(rem.id, rem.completed)} className={`mt-0.5 transition-colors ${rem.completed ? 'text-teal-500' : 'text-slate-300 hover:text-teal-500'}`}>
                                        {rem.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                    </button>
                                    <p className={`text-sm leading-relaxed ${rem.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>{rem.text}</p>
                                </div>
                                {!isReadOnly && (
                                    <button onClick={() => handleDeleteReminder(rem.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-3 pl-7">
                                {rem.createdAt?.seconds ? new Date(rem.createdAt.seconds * 1000).toLocaleDateString() : 'Reciente'}
                            </p>
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

// ─── PatientCard ─────────────────────────────────────────────────────────────

// ─── PatientCard (Nueva Estructura) ──────────────────────────────────────────

const PatientCard = ({ entry, idx, surgeons, anestesistas, isReadOnly, onUpdate, onRemove, onComment, hideCollapse = false }) => {

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-8">

            {/* 1. Datos del Paciente */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Paciente</label>
                    <input
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50/50 transition-all placeholder:font-normal placeholder:text-slate-300"
                        placeholder="Nombre Completo..."
                        value={entry.paciente}
                        onChange={e => onUpdate({ paciente: e.target.value })}
                        readOnly={isReadOnly}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">DNI</label>
                    <input
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50/50 transition-all placeholder:font-normal placeholder:text-slate-300"
                        placeholder="Documento..."
                        value={entry.dni}
                        onChange={e => onUpdate({ dni: e.target.value })}
                        readOnly={isReadOnly}
                    />
                </div>
                <div className="flex gap-2">
                    <div className="space-y-1.5 flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Obra Social</label>
                        <input
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50/50 transition-all placeholder:font-normal placeholder:text-slate-300"
                            placeholder="Prepaga / OS..."
                            value={entry.obraSocial}
                            onChange={e => onUpdate({ obraSocial: e.target.value })}
                            readOnly={isReadOnly}
                        />
                    </div>
                    {!isReadOnly && !hideCollapse && (
                        <button onClick={onRemove} className="mt-7 p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100 transition-all">
                            <Trash2 size={20} />
                        </button>
                    )}
                    {!isReadOnly && (
                        <button onClick={onComment} className={`mt-7 p-3 rounded-xl border transition-all ${entry.comentario ? 'bg-orange-50 text-orange-600 border-orange-200' : 'text-slate-300 hover:text-teal-500 hover:bg-teal-50 border-transparent'}`}>
                            <MessageSquare size={20} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">

                {/* 2. Pago del Paciente (Left Column) */}
                <div className="w-full lg:w-64 space-y-6 flex-shrink-0">
                    <div className="bg-teal-50/50 rounded-2xl p-4 border border-teal-100/50 space-y-4">
                        <label className="text-[10px] font-bold text-teal-600/70 uppercase tracking-widest flex items-center gap-2">
                            Pago del Paciente
                        </label>

                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-teal-600">$</span>
                            <MoneyInput
                                className="w-full bg-white border-2 border-teal-100 rounded-xl pl-8 pr-4 py-3 text-lg font-bold text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-50 transition-all"
                                value={entry.total_ars}
                                onChange={val => onUpdate({ total_ars: val })}
                                placeholder="0,00"
                            />
                        </div>

                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-teal-600">USD</span>
                            <MoneyInput
                                className="w-full bg-white border-2 border-teal-100 rounded-xl pl-12 pr-4 py-3 text-lg font-bold text-slate-700 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-50 transition-all"
                                value={entry.total_usd}
                                onChange={val => onUpdate({ total_usd: val })}
                                placeholder="0,00"
                            />
                        </div>
                    </div>

                    {/* 5. COAT (Left Column Bottom) */}
                    <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100/50 space-y-3">
                        <label className="text-[10px] font-bold text-orange-600/70 uppercase tracking-widest">
                            Administración COAT
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white border border-orange-100 rounded-xl px-2 py-1 relative">
                                <span className="absolute top-1 left-2 text-[8px] font-bold text-orange-300">PESOS</span>
                                <MoneyInput
                                    className="w-full text-right px-1 pt-3 pb-1 text-base font-bold text-orange-600 outline-none rounded-xl"
                                    value={entry.coat_ars}
                                    onChange={val => onUpdate({ coat_ars: val })}
                                    placeholder="0,00"
                                    readOnly={isReadOnly}
                                />
                            </div>
                            <div className="bg-white border border-orange-100 rounded-xl px-2 py-1 relative">
                                <span className="absolute top-1 left-2 text-[8px] font-bold text-orange-300">DOLARES</span>
                                <MoneyInput
                                    className="w-full text-right px-1 pt-3 pb-1 text-base font-bold text-orange-600 outline-none rounded-xl"
                                    value={entry.coat_usd}
                                    onChange={val => onUpdate({ coat_usd: val })}
                                    placeholder="0,00"
                                    readOnly={isReadOnly}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Profesionales & Anestesia (Right Column) */}
                <div className="flex-1 space-y-6">

                    {/* Honorarios Médicos */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                Honorarios Médicos
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px]">{entry.showProf3 ? '3 PROFS' : '2 PROFS'}</span>
                            </label>

                            {!entry.showProf3 && !isReadOnly && (
                                <button
                                    onClick={() => onUpdate({ showProf3: true })}
                                    className="text-[10px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-600 hover:text-teal-700 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                                >
                                    <Plus size={10} /> Añadir Prof. 3
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            <ProfRow
                                label="Médico 1"
                                color="teal"
                                surgeons={surgeons}
                                prof={entry.prof_1} pct={entry.pct_prof_1}
                                liqArs={entry.liq_prof_1_ars} liqUsd={entry.liq_prof_1_usd}
                                onChangeProf={v => onUpdate({ prof_1: v })}
                                onChangePct={v => onUpdate({ pct_prof_1: v })}
                                onLiqChange={(v, currency) => currency === 'ars' ? onUpdate({ liq_prof_1_ars: v }) : onUpdate({ liq_prof_1_usd: v })}
                                isReadOnly={isReadOnly}
                            />
                            <ProfRow
                                label="Médico 2"
                                color="purple"
                                surgeons={surgeons}
                                prof={entry.prof_2} pct={entry.pct_prof_2}
                                liqArs={entry.liq_prof_2_ars} liqUsd={entry.liq_prof_2_usd}
                                onChangeProf={v => onUpdate({ prof_2: v })}
                                onChangePct={v => onUpdate({ pct_prof_2: v })}
                                onLiqChange={(v, currency) => currency === 'ars' ? onUpdate({ liq_prof_2_ars: v }) : onUpdate({ liq_prof_2_usd: v })}
                                isReadOnly={isReadOnly}
                            />
                            {entry.showProf3 && (
                                <div className="relative">
                                    <ProfRow
                                        label="Médico 3"
                                        color="orange"
                                        surgeons={surgeons}
                                        prof={entry.prof_3} pct={entry.pct_prof_3}
                                        liqArs={entry.liq_prof_3_ars} liqUsd={entry.liq_prof_3_usd}
                                        onChangeProf={v => onUpdate({ prof_3: v })}
                                        onChangePct={v => onUpdate({ pct_prof_3: v })}
                                        onLiqChange={(v, currency) => currency === 'ars' ? onUpdate({ liq_prof_3_ars: v }) : onUpdate({ liq_prof_3_usd: v })}
                                        isReadOnly={isReadOnly}
                                    />
                                    <button
                                        onClick={() => onUpdate({ showProf3: false, prof_3: '', pct_prof_3: 0, liq_prof_3_ars: 0, liq_prof_3_usd: 0 })}
                                        className="absolute -right-2 top-1/2 -translate-y-1/2 bg-white text-slate-300 hover:text-red-500 shadow-sm p-1 rounded-full border border-slate-100"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Anestesia */}
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                        <label className="text-[10px] font-bold text-purple-600 uppercase tracking-widest flex items-center gap-2">
                            <Circle size={8} className="fill-purple-500 text-purple-500" /> Anestesia
                        </label>
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 space-y-1">
                                <span className="text-[10px] font-bold text-slate-400 pl-1 uppercase">Profesional</span>
                                <select
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 transition-all"
                                    value={entry.anestesista}
                                    onChange={e => onUpdate({ anestesista: e.target.value })}
                                    disabled={isReadOnly}
                                >
                                    <option value="">- No requiere -</option>
                                    {anestesistas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 space-y-1">
                                <span className="text-[10px] font-bold text-slate-400 pl-1 uppercase">Monto Honorario</span>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-purple-500 text-white px-1.5 py-0.5 rounded">ARS</span>
                                        <MoneyInput
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-3 py-2 text-sm font-bold text-purple-700 outline-none focus:border-purple-400 transition-all text-right"
                                            value={entry.liq_anestesista_ars}
                                            onChange={val => onUpdate({ liq_anestesista_ars: val })}
                                            placeholder="0,00"
                                        />
                                    </div>
                                    <div className="relative flex-1">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-teal-500 text-white px-1.5 py-0.5 rounded">USD</span>
                                        <MoneyInput
                                            className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-3 py-2 text-sm font-bold text-teal-700 outline-none focus:border-teal-400 transition-all text-right"
                                            value={entry.liq_anestesista_usd}
                                            onChange={val => onUpdate({ liq_anestesista_usd: val })}
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
};

// ─── ProfRow ──────────────────────────────────────────────────────────────────
const ProfRow = ({ label, color, surgeons, prof, pct, liqArs, liqUsd, onChangeProf, onChangePct, isReadOnly }) => {

    // Color variants
    const colors = {
        teal: {
            focus: 'focus-within:border-teal-300 focus-within:ring-4 focus-within:ring-teal-50/50',
            tag: 'bg-teal-500 text-white'
        },
        orange: {
            focus: 'focus-within:border-orange-300 focus-within:ring-4 focus-within:ring-orange-50/50',
            tag: 'bg-orange-500 text-white'
        },
        purple: {
            focus: 'focus-within:border-purple-300 focus-within:ring-4 focus-within:ring-purple-50/50',
            tag: 'bg-purple-600 text-white'
        },
        slate: {
            focus: 'focus-within:border-slate-300 focus-within:ring-4 focus-within:ring-slate-50/50',
            tag: 'bg-slate-200 text-slate-600'
        },
    };
    const theme = colors[color] || colors.teal;

    return (
        <div className={`bg-slate-50/50 border border-slate-100 rounded-2xl p-2 flex flex-col sm:flex-row items-center gap-2 transition-all ${theme.focus}`}>

            {/* Label & Select */}
            <div className="flex-1 w-full min-w-[180px]">
                <div className="relative">
                    <span className="absolute left-3 top-[-6px] bg-white px-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest z-10">{label}</span>
                    <select
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-transparent transition-all pt-3"
                        value={prof}
                        onChange={e => onChangeProf(e.target.value)}
                        disabled={isReadOnly}
                    >
                        <option value="">Seleccionar...</option>
                        {surgeons.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                    </select>
                </div>
            </div>

            {/* Pct */}
            <div className="w-20">
                <div className="relative">
                    <span className="absolute left-1/2 -translate-x-1/2 top-[-6px] bg-white px-1 text-[9px] font-bold text-slate-400 uppercase z-10">%</span>
                    <input
                        type="number"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 text-center font-bold text-slate-700 outline-none"
                        value={pct}
                        onChange={e => onChangePct(parseFloat(e.target.value) || 0)}
                        readOnly={isReadOnly}
                    />
                </div>
            </div>

            {/* Liquidations (Manual) */}
            <div className="flex-1 flex gap-2 w-full">
                <div className="relative flex-1">
                    <span className={`absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded ${theme.tag}`}>ARS</span>
                    <MoneyInput
                        className="w-full bg-slate-50 border border-transparent rounded-xl pl-10 pr-2 py-2 text-sm font-bold text-slate-600 text-right focus:bg-white focus:border-teal-300 outline-none transition-all"
                        value={liqArs}
                        onChange={val => onLiqChange && onLiqChange(val, 'ars')}
                        placeholder="0,00"
                        readOnly={isReadOnly}
                    />
                </div>
                <div className="relative flex-1">
                    <span className={`absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded ${theme.tag}`}>USD</span>
                    <MoneyInput
                        className="w-full bg-slate-50 border border-transparent rounded-xl pl-10 pr-2 py-2 text-sm font-bold text-slate-600 text-right focus:bg-white focus:border-teal-300 outline-none transition-all"
                        value={liqUsd}
                        onChange={val => onLiqChange && onLiqChange(val, 'usd')}
                        placeholder="0,00"
                        readOnly={isReadOnly}
                    />
                </div>
            </div>

        </div>
    );
};

export default CajaForm;
