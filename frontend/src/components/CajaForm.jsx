import React, { useState } from 'react';
import { Save, Plus, Trash2, MessageSquare, Calendar, X, Bell, CheckCircle2, Circle, ChevronDown, ChevronUp, User, DollarSign, Percent, Building2 } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
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
    obraSocial: '',
    // Total cobrado
    total: 0,
    moneda: 'ARS', // 'ARS' | 'USD'
    // Profesionales (siempre 2 por defecto, opcionalmente 3)
    prof_1: '', liq_prof_1: 0, pct_prof_1: 50,
    prof_2: '', liq_prof_2: 0, pct_prof_2: 50,
    showProf3: false,
    prof_3: '', liq_prof_3: 0, pct_prof_3: 0,
    // Anestesista
    anestesista: '', liq_anestesista: 0,
    // COAT (calculado automático)
    coat: 0,
    // Comentario
    comentario: '',
    // UI
    collapsed: false,
});

// ─── Auto-calc: dado el entry actualizado, recalcula liq y coat ─────────────
const recalc = (entry) => {
    const total = entry.total || 0;
    const liq1 = total * ((entry.pct_prof_1 || 0) / 100);
    const liq2 = total * ((entry.pct_prof_2 || 0) / 100);
    const liq3 = entry.showProf3 ? total * ((entry.pct_prof_3 || 0) / 100) : 0;
    const anest = entry.liq_anestesista || 0; // anestesista: monto fijo, no porcentaje
    const coat = Math.max(0, total - liq1 - liq2 - liq3 - anest);
    return { ...entry, liq_prof_1: liq1, liq_prof_2: liq2, liq_prof_3: liq3, coat };
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

    const [entries, setEntries] = useState(() => {
        try {
            const saved = localStorage.getItem('cajaDiariaEntries_v2');
            if (saved) return JSON.parse(saved);
        } catch { }
        return [EMPTY_ENTRY()];
    });

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

    React.useEffect(() => {
        fetchProfs();
        const unsub = fetchReminders();
        return () => unsub();
    }, [viewingUid, catalogOwnerUid]);

    React.useEffect(() => {
        localStorage.setItem('cajaDiariaEntries_v2', JSON.stringify(entries));
    }, [entries]);

    // ── Entry mutations ────────────────────────────────────────────────────

    const updateEntry = (id, patch) => {
        setEntries(prev => prev.map(e => {
            if (e.id !== id) return e;
            const updated = { ...e, ...patch };
            // Si cambió algo que afecte el cálculo, recalcular
            const calcKeys = ['total', 'pct_prof_1', 'pct_prof_2', 'pct_prof_3', 'showProf3', 'liq_anestesista'];
            if (calcKeys.some(k => k in patch)) return recalc(updated);
            return updated;
        }));
    };

    const addRow = () => setEntries(prev => [...prev, EMPTY_ENTRY()]);
    const removeRow = (id) => { if (entries.length > 1) setEntries(prev => prev.filter(e => e.id !== id)); };

    // ── Cerrar Caja ────────────────────────────────────────────────────────

    const handleCerrarCaja = async () => {
        if (!window.confirm('¿Cerrás la caja? Se guardará en el historial y el formulario se limpiará.')) return;
        const ownerToUse = catalogOwnerUid || viewingUid;
        const docs = entries.map((e, i) => ({
            ...e,
            // Mapear al esquema legacy para compatibilidad con HistorialCaja
            pesos: e.moneda === 'ARS' ? e.total : 0,
            dolares: e.moneda === 'USD' ? e.total : 0,
            coat_pesos: e.moneda === 'ARS' ? e.coat : 0,
            coat_dolares: e.moneda === 'USD' ? e.coat : 0,
            liq_prof_1_currency: e.moneda, liq_prof_2_currency: e.moneda, liq_prof_3_currency: e.moneda,
            liq_anestesista_currency: e.moneda,
            fecha: globalDate,
            userId: ownerToUse,
            createdBy: currentUser?.email || 'unknown',
            createdAt: new Date(Date.now() + i).toISOString(),
        }));
        try {
            await Promise.all(docs.map(d => { const { id, collapsed, ...rest } = d; return addDoc(collection(db, 'caja'), rest); }));
            if (dailyComment.trim()) {
                await addDoc(collection(db, 'daily_comments'), {
                    date: globalDate, comment: dailyComment,
                    userId: ownerToUse, timestamp: new Date(),
                });
            }
            alert('¡Caja cerrada correctamente!');
            localStorage.removeItem('cajaDiariaEntries_v2');
            setEntries([EMPTY_ENTRY()]);
            setDailyComment('');
        } catch (err) {
            console.error(err);
            alert('Error al guardar. Intentá nuevamente.');
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

    // ── Grand totals ───────────────────────────────────────────────────────
    const totals = entries.reduce((acc, e) => {
        const isUSD = e.moneda === 'USD';
        acc.totalARS += isUSD ? 0 : (e.total || 0);
        acc.totalUSD += isUSD ? (e.total || 0) : 0;
        acc.coatARS += isUSD ? 0 : (e.coat || 0);
        acc.coatUSD += isUSD ? (e.coat || 0) : 0;
        return acc;
    }, { totalARS: 0, totalUSD: 0, coatARS: 0, coatUSD: 0 });

    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Caja Diaria</h2>
                    <p className="text-sm text-slate-500">Ingresá los movimientos del día</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Totales rápidos */}
                    {(totals.totalARS > 0 || totals.totalUSD > 0) && (
                        <div className="hidden md:flex items-center gap-4 text-xs font-bold text-slate-500">
                            {totals.totalARS > 0 && <span className="text-slate-700">Total: <span className="text-blue-700">{fmt(totals.totalARS)}</span></span>}
                            {totals.totalUSD > 0 && <span className="text-slate-700">Total: <span className="text-emerald-700">{fmt(totals.totalUSD, 'USD')}</span></span>}
                            {totals.coatARS > 0 && <span className="text-slate-700">COAT: <span className="text-orange-600">{fmt(totals.coatARS)}</span></span>}
                        </div>
                    )}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                        <Calendar size={16} className="text-slate-400" />
                        <input
                            type="date"
                            className="bg-transparent border-none text-sm font-bold text-slate-800 focus:outline-none"
                            value={globalDate}
                            onChange={e => setGlobalDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* ── Modales ────────────────────────────────────────────────── */}
            {showDailyCommentModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg">
                        <h3 className="font-bold text-lg mb-4">Comentario General del Día</h3>
                        <textarea
                            className="w-full h-32 border border-slate-300 rounded-xl p-3 focus:border-blue-500 outline-none resize-none"
                            placeholder="Observaciones generales del día..."
                            value={dailyComment}
                            onChange={e => setDailyComment(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setShowDailyCommentModal(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">Cerrar</button>
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
                            onChange={e => updateEntry(commentModalId, { comentario: e.target.value })}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setCommentModalId(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Cards de Pacientes ─────────────────────────────────────── */}
            <div className="space-y-4">
                {entries.map((entry, idx) => (
                    <PatientCard
                        key={entry.id}
                        entry={entry}
                        idx={idx}
                        surgeons={surgeons}
                        anestesistas={anestesistas}
                        isReadOnly={isReadOnly}
                        onUpdate={(patch) => updateEntry(entry.id, patch)}
                        onRemove={() => removeRow(entry.id)}
                        onComment={() => setCommentModalId(entry.id)}
                    />
                ))}
            </div>

            {/* ── Acciones ───────────────────────────────────────────────── */}
            {!isReadOnly && (
                <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                    <button
                        onClick={() => setShowDailyCommentModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-all font-medium border border-amber-200 text-sm"
                    >
                        <MessageSquare size={16} />
                        {dailyComment ? 'Editar Comentario del Día ✦' : 'Agregar Comentario del Día'}
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={addRow}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all font-semibold shadow-lg shadow-emerald-100 text-sm"
                        >
                            <Plus size={18} /> Agregar Paciente
                        </button>
                        <button
                            onClick={handleCerrarCaja}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold shadow-lg shadow-blue-200 text-sm"
                        >
                            <Save size={18} /> Cerrar Caja
                        </button>
                    </div>
                </div>
            )}

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
                            className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all"
                        >
                            <Plus size={16} /> Agregar
                        </button>
                    )}
                </div>

                {isAddingReminder && (
                    <div className="mb-4 flex gap-2">
                        <input
                            type="text"
                            className="flex-1 bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                            placeholder="Escribí un recordatorio..."
                            value={newReminder}
                            onKeyDown={e => e.key === 'Enter' && handleAddReminder()}
                            onChange={e => setNewReminder(e.target.value)}
                            autoFocus
                        />
                        <button onClick={handleAddReminder} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all">Guardar</button>
                        <button onClick={() => { setIsAddingReminder(false); setNewReminder(''); }} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-sm">Cancelar</button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {reminders.map(rem => (
                        <div key={rem.id} className={`group border rounded-2xl p-4 transition-all relative overflow-hidden ${rem.completed ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-amber-200 hover:shadow-sm'}`}>
                            <div className={`absolute top-0 left-0 w-1 h-full ${rem.completed ? 'bg-emerald-400' : 'bg-amber-300 opacity-0 group-hover:opacity-100'} transition-opacity`} />
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex gap-3 items-start flex-1">
                                    <button onClick={() => toggleReminderStatus(rem.id, rem.completed)} className={`mt-0.5 transition-colors ${rem.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-blue-500'}`}>
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

const PatientCard = ({ entry, idx, surgeons, anestesistas, isReadOnly, onUpdate, onRemove, onComment }) => {
    const collapsed = entry.collapsed;

    const monedaSymbol = entry.moneda === 'USD' ? 'USD' : '$';

    return (
        <div className={`bg-white rounded-2xl border shadow-sm transition-all ${entry.coat > 0 ? 'border-slate-200' : 'border-slate-200'}`}>

            {/* ─ Card Header ─ */}
            <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                onClick={() => onUpdate({ collapsed: !collapsed })}
            >
                {/* Número */}
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                </span>

                {/* Nombre (editable inline para no colapsar) */}
                <input
                    className="flex-1 font-semibold text-slate-800 bg-transparent border-none outline-none placeholder-slate-300 text-sm"
                    placeholder="Nombre del paciente..."
                    value={entry.paciente}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onUpdate({ paciente: e.target.value })}
                    readOnly={isReadOnly}
                />

                {/* Total badge */}
                {entry.total > 0 && (
                    <span className="hidden md:block text-xs font-bold text-slate-400">
                        Total: <span className="text-blue-700">{fmt(entry.total, entry.moneda)}</span>
                        {entry.coat > 0 && <> · COAT: <span className="text-orange-600">{fmt(entry.coat, entry.moneda)}</span></>}
                    </span>
                )}

                {/* Comentario badge */}
                {!isReadOnly && (
                    <button
                        onClick={e => { e.stopPropagation(); onComment(); }}
                        className={`p-1.5 rounded-lg transition-all ${entry.comentario ? 'bg-amber-100 text-amber-600' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                        title="Comentario"
                    >
                        <MessageSquare size={15} />
                    </button>
                )}

                {/* Delete */}
                {!isReadOnly && (
                    <button
                        onClick={e => { e.stopPropagation(); onRemove(); }}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Eliminar"
                    >
                        <Trash2 size={15} />
                    </button>
                )}

                {/* Chevron */}
                <span className="text-slate-300 ml-1">
                    {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </span>
            </div>

            {/* ─ Card Body ─ */}
            {!collapsed && (
                <div className="px-5 pb-5 space-y-5 border-t border-slate-100">

                    {/* Fila 1: Obra Social + Total + Moneda */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                        {/* Obra Social */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Building2 size={12} /> Obra Social
                            </label>
                            <input
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all"
                                placeholder="Ej: Swiss Medical"
                                value={entry.obraSocial}
                                onChange={e => onUpdate({ obraSocial: e.target.value })}
                                readOnly={isReadOnly}
                            />
                        </div>

                        {/* Total Abonado */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <DollarSign size={12} /> Total Abonado
                            </label>
                            <div className="flex gap-2">
                                <MoneyInput
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 font-semibold focus:border-blue-400 focus:bg-white outline-none transition-all text-right"
                                    value={entry.total}
                                    onChange={val => onUpdate({ total: val })}
                                    placeholder="0,00"
                                />
                                {/* Moneda toggle */}
                                <button
                                    onClick={() => onUpdate({ moneda: entry.moneda === 'ARS' ? 'USD' : 'ARS' })}
                                    className={`px-3 rounded-xl font-bold text-xs border transition-all ${entry.moneda === 'USD' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}
                                    title="Cambiar moneda"
                                >
                                    {entry.moneda === 'USD' ? 'USD' : '$'}
                                </button>
                            </div>
                        </div>

                        {/* COAT (read-only, calculado) */}
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">Monto COAT</label>
                            <div className="w-full bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5 text-sm font-bold text-orange-700 text-right">
                                {fmt(entry.coat, entry.moneda)}
                            </div>
                        </div>
                    </div>

                    {/* Separador */}
                    <div className="border-t border-slate-100" />

                    {/* Profesionales */}
                    <div className="space-y-3">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <User size={12} /> Distribución por Profesionales
                        </p>

                        {/* Prof 1 */}
                        <ProfRow
                            color="blue"
                            label="Prof. 1"
                            profValue={entry.prof_1}
                            pctValue={entry.pct_prof_1}
                            liqValue={entry.liq_prof_1}
                            moneda={entry.moneda}
                            surgeons={surgeons}
                            isReadOnly={isReadOnly}
                            onProfChange={v => onUpdate({ prof_1: v })}
                            onPctChange={v => onUpdate({ pct_prof_1: v })}
                            onLiqChange={v => onUpdate({ liq_prof_1: v })}
                        />

                        {/* Prof 2 */}
                        <ProfRow
                            color="indigo"
                            label="Prof. 2"
                            profValue={entry.prof_2}
                            pctValue={entry.pct_prof_2}
                            liqValue={entry.liq_prof_2}
                            moneda={entry.moneda}
                            surgeons={surgeons}
                            isReadOnly={isReadOnly}
                            onProfChange={v => onUpdate({ prof_2: v })}
                            onPctChange={v => onUpdate({ pct_prof_2: v })}
                            onLiqChange={v => onUpdate({ liq_prof_2: v })}
                        />

                        {/* Prof 3 (opcional) */}
                        {entry.showProf3 ? (
                            <div className="relative">
                                <ProfRow
                                    color="teal"
                                    label="Prof. 3"
                                    profValue={entry.prof_3}
                                    pctValue={entry.pct_prof_3}
                                    liqValue={entry.liq_prof_3}
                                    moneda={entry.moneda}
                                    surgeons={surgeons}
                                    isReadOnly={isReadOnly}
                                    onProfChange={v => onUpdate({ prof_3: v })}
                                    onPctChange={v => onUpdate({ pct_prof_3: v })}
                                    onLiqChange={v => onUpdate({ liq_prof_3: v })}
                                />
                                {!isReadOnly && (
                                    <button
                                        onClick={() => onUpdate({ showProf3: false, prof_3: '', pct_prof_3: 0, liq_prof_3: 0 })}
                                        className="absolute -top-1 -right-1 text-slate-400 hover:text-red-500 bg-white rounded-full border border-slate-200 p-0.5 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            !isReadOnly && (
                                <button
                                    onClick={() => onUpdate({ showProf3: true })}
                                    className="w-full flex items-center justify-center gap-2 py-2 text-teal-600 hover:bg-teal-50 rounded-xl border border-dashed border-teal-200 transition-all text-sm font-medium"
                                >
                                    <Plus size={14} /> Agregar Prof. 3
                                </button>
                            )
                        )}
                    </div>

                    {/* Separador */}
                    <div className="border-t border-slate-100" />

                    {/* Anestesista */}
                    <div className="space-y-2">
                        <p className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Anestesista</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <select
                                    className="w-full bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:border-purple-400 outline-none transition-all"
                                    value={entry.anestesista}
                                    onChange={e => onUpdate({ anestesista: e.target.value })}
                                    disabled={isReadOnly}
                                >
                                    <option value="">Sin anestesista</option>
                                    {anestesistas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                </select>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-400">{monedaSymbol}</span>
                                <MoneyInput
                                    className="w-full bg-purple-50 border border-purple-100 rounded-xl pl-8 pr-3 py-2.5 text-sm text-purple-800 font-semibold focus:border-purple-400 outline-none transition-all text-right"
                                    value={entry.liq_anestesista}
                                    onChange={val => onUpdate({ liq_anestesista: val })}
                                    placeholder="0,00"
                                />
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

// ─── ProfRow ──────────────────────────────────────────────────────────────────

const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', focus: 'focus:border-blue-400', text: 'text-blue-800', label: 'text-blue-500' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', focus: 'focus:border-indigo-400', text: 'text-indigo-800', label: 'text-indigo-500' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-100', focus: 'focus:border-teal-400', text: 'text-teal-800', label: 'text-teal-500' },
};

const ProfRow = ({ color, label, profValue, pctValue, liqValue, moneda, surgeons, isReadOnly, onProfChange, onPctChange, onLiqChange }) => {
    const c = colorMap[color] || colorMap.blue;
    const monedaSymbol = moneda === 'USD' ? 'USD' : '$';

    return (
        <div className={`grid grid-cols-[1fr_auto_1fr] gap-3 items-center p-3 ${c.bg} rounded-xl border ${c.border}`}>
            {/* Selector profesional */}
            <select
                className={`bg-white border ${c.border} rounded-lg px-2 py-2 text-sm text-slate-700 ${c.focus} outline-none transition-all`}
                value={profValue}
                onChange={e => onProfChange(e.target.value)}
                disabled={isReadOnly}
            >
                <option value="">Seleccionar profesional</option>
                {surgeons.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>

            {/* Porcentaje */}
            <div className={`flex items-center gap-1 bg-white border ${c.border} rounded-lg px-2 py-2`}>
                <Percent size={12} className={c.label} />
                <input
                    type="number"
                    min="0" max="100"
                    className={`w-12 text-sm font-bold ${c.text} bg-transparent outline-none text-center`}
                    value={pctValue}
                    onChange={e => onPctChange(parseFloat(e.target.value) || 0)}
                    readOnly={isReadOnly}
                />
            </div>

            {/* Monto liquidar */}
            <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${c.label}`}>{monedaSymbol}</span>
                <MoneyInput
                    className={`w-full bg-white border ${c.border} rounded-lg pl-8 pr-3 py-2 text-sm font-bold ${c.text} ${c.focus} outline-none transition-all text-right`}
                    value={liqValue}
                    onChange={onLiqChange}
                    placeholder="0,00"
                />
            </div>
        </div>
    );
};

export default CajaForm;
