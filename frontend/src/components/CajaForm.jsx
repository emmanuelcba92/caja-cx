import React, { useState } from 'react';
import { Save, Plus, Trash2, MessageSquare, Calendar } from 'lucide-react';
import API_URL from '../config';

const CajaForm = () => {
    // Global Date State
    const [globalDate, setGlobalDate] = useState(new Date().toISOString().split('T')[0]);
    const [dailyComment, setDailyComment] = useState('');
    const [showDailyCommentModal, setShowDailyCommentModal] = useState(false);

    // Initial State with LocalStorage check
    const [entries, setEntries] = useState(() => {
        const saved = localStorage.getItem('cajaDiariaEntries');
        if (saved) {
            return JSON.parse(saved);
        }
        return [{
            id: 1,
            // fecha removed from here, will use globalDate on save
            paciente: '', dni: '', obra_social: '',
            prof_1: '', prof_2: '',
            pesos: 0, dolares: 0,
            liq_prof_1: 0, liq_prof_1_currency: 'ARS',
            liq_prof_2: 0, liq_prof_2_currency: 'ARS',
            anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS',
            coat_pesos: 0, coat_dolares: 0,
            comentario: ''
        }];
    });

    const [profesionales, setProfesionales] = useState([]);
    const [commentModalId, setCommentModalId] = useState(null);

    const fetchProfs = async () => {
        try {
            const response = await fetch(`${API_URL}/profesionales`);
            const result = await response.json();
            setProfesionales(result);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    React.useEffect(() => {
        fetchProfs();
        // Try recover daily comment from local storage if exists (optional, or fetch from backend if editing past dates)
    }, []);

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
            prof_1: '', prof_2: '',
            pesos: 0, dolares: 0,
            liq_prof_1: 0, liq_prof_1_currency: 'ARS',
            liq_prof_2: 0, liq_prof_2_currency: 'ARS',
            anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS',
            coat_pesos: 0, coat_dolares: 0,
            comentario: ''
        }]);
    };

    const updateEntry = (id, field, value) => {
        setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const toggleCurrency = (id, field) => {
        setEntries(entries.map(e => {
            if (e.id === id) {
                const current = e[field];
                return { ...e, [field]: current === 'ARS' ? 'USD' : 'ARS' };
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

        // Inject global date into entries
        const entriesWithDate = entries.map(e => ({ ...e, fecha: globalDate }));

        try {
            // 1. Save Entries
            const response = await fetch(`${API_URL}/guardar-caja`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: entriesWithDate })
            });

            // 2. Save Daily Comment
            if (dailyComment.trim()) {
                await fetch(`${API_URL}/daily-comment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: globalDate, comment: dailyComment })
                });
            }

            if (response.ok) {
                const data = await response.json();
                alert("Éxito: " + data.message);

                // Clear LocalStorage and Reset Form
                localStorage.removeItem('cajaDiariaEntries');
                setEntries([{
                    id: 1,
                    paciente: '', dni: '', obra_social: '',
                    prof_1: '', prof_2: '',
                    pesos: 0, dolares: 0,
                    liq_prof_1: 0, liq_prof_1_currency: 'ARS',
                    liq_prof_2: 0, liq_prof_2_currency: 'ARS',
                    anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS',
                    coat_pesos: 0, coat_dolares: 0,
                    comentario: ''
                }]);
                setDailyComment('');

            } else {
                const err = await response.json();
                alert("Error al cerrar caja: " + (err.message || "msg devuelto por servidor"));
            }
        } catch (error) {
            console.error("Error saving data:", error);
            alert("Error al conectar con el servidor. No se pudo cerrar la caja.");
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            {/* Header & Global Controls */}
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

            {/* Modal for Daily Comment */}
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

            {/* Modal for Row Comment */}
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
                <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                            <th className="px-3 py-3 border-b border-indigo-100">Paciente</th>
                            <th className="px-3 py-3 border-b border-indigo-100">DNI</th>
                            <th className="px-3 py-3 border-b border-indigo-100">Obra Soc.</th>
                            <th className="px-3 py-3 border-b bg-blue-50/50 text-blue-900 border-blue-100">Prof. 1</th>
                            <th className="px-3 py-3 border-b bg-indigo-50/50 text-indigo-900 border-indigo-100">Prof. 2</th>
                            <th className="px-3 py-3 border-b text-slate-700">Pago $</th>
                            <th className="px-3 py-3 border-b text-emerald-700">Pago USD</th>
                            <th className="px-3 py-3 border-b bg-blue-50 text-blue-900 border-blue-100">Liq. P1</th>
                            <th className="px-3 py-3 border-b bg-indigo-50 text-indigo-900 border-indigo-100">Liq. P2</th>
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
                                <td className="p-2"><input className="w-full bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none transition-all" value={entry.paciente} onChange={(e) => updateEntry(entry.id, 'paciente', e.target.value)} placeholder="Nombre..." /></td>
                                <td className="p-2"><input className="w-full bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none transition-all" value={entry.dni} onChange={(e) => updateEntry(entry.id, 'dni', e.target.value)} /></td>
                                <td className="p-2"><input className="w-full bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none transition-all" value={entry.obra_social} onChange={(e) => updateEntry(entry.id, 'obra_social', e.target.value)} /></td>

                                {/* Profesional 1 */}
                                <td className="p-2 bg-blue-50/10">
                                    <select className="w-full bg-transparent border-0 border-b border-transparent hover:border-blue-200 focus:border-blue-500 outline-none py-1 text-slate-700 font-medium" value={entry.prof_1} onChange={(e) => updateEntry(entry.id, 'prof_1', e.target.value)}>
                                        <option value="">Seleccionar</option>
                                        {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </td>

                                {/* Profesional 2 */}
                                <td className="p-2 bg-indigo-50/10">
                                    <select className="w-full bg-transparent border-0 border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none py-1 text-slate-700 font-medium" value={entry.prof_2} onChange={(e) => updateEntry(entry.id, 'prof_2', e.target.value)}>
                                        <option value="">Seleccionar</option>
                                        {profesionales.filter(p => p.categoria !== 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </td>

                                {/* Pagos */}
                                <td className="p-2"><input type="number" className="w-20 text-right bg-slate-50/50 border border-slate-200 rounded px-2 py-1.5 focus:bg-white focus:border-blue-400 outline-none" value={entry.pesos || ''} onChange={(e) => updateEntry(entry.id, 'pesos', parseFloat(e.target.value))} /></td>
                                <td className="p-2"><input type="number" className="w-20 text-right bg-slate-50/50 border border-emerald-200 rounded px-2 py-1.5 focus:bg-white focus:border-emerald-400 outline-none text-emerald-700 font-medium" value={entry.dolares || ''} onChange={(e) => updateEntry(entry.id, 'dolares', parseFloat(e.target.value))} /></td>

                                {/* Liq Prof 1 */}
                                <td className="p-2 bg-blue-50/20">
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => toggleCurrency(entry.id, 'liq_prof_1_currency')} className="text-[10px] font-bold text-slate-400 hover:text-blue-600 uppercase">{entry.liq_prof_1_currency}</button>
                                        <input type="number" className="w-16 text-right bg-transparent border-b border-blue-100 focus:border-blue-500 outline-none text-blue-800 font-bold" value={entry.liq_prof_1 || ''} onChange={(e) => updateEntry(entry.id, 'liq_prof_1', parseFloat(e.target.value))} />
                                    </div>
                                </td>

                                {/* Liq Prof 2 */}
                                <td className="p-2 bg-indigo-50/20">
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => toggleCurrency(entry.id, 'liq_prof_2_currency')} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 uppercase">{entry.liq_prof_2_currency}</button>
                                        <input type="number" className="w-16 text-right bg-transparent border-b border-indigo-100 focus:border-indigo-500 outline-none text-indigo-800 font-bold" value={entry.liq_prof_2 || ''} onChange={(e) => updateEntry(entry.id, 'liq_prof_2', parseFloat(e.target.value))} />
                                    </div>
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
                                        <input type="number" className="w-16 text-right bg-transparent border-b border-purple-100 focus:border-purple-500 outline-none text-purple-800 font-bold" value={entry.liq_anestesista || ''} onChange={(e) => updateEntry(entry.id, 'liq_anestesista', parseFloat(e.target.value))} />
                                    </div>
                                </td>

                                {/* COAT */}
                                <td className="p-2 bg-orange-50/20"><input type="number" className="w-16 text-right bg-transparent border-b border-orange-100 focus:border-orange-500 outline-none text-orange-800" value={entry.coat_pesos || ''} onChange={(e) => updateEntry(entry.id, 'coat_pesos', parseFloat(e.target.value))} /></td>
                                <td className="p-2 bg-orange-50/20"><input type="number" className="w-16 text-right bg-transparent border-b border-orange-100 focus:border-orange-500 outline-none text-orange-800" value={entry.coat_dolares || ''} onChange={(e) => updateEntry(entry.id, 'coat_dolares', parseFloat(e.target.value))} /></td>

                                {/* Actions */}
                                <td className="p-2 flex gap-1">
                                    <button onClick={() => setCommentModalId(entry.id)} className={`p-1.5 rounded-lg transition-all ${entry.comentario ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 hover:text-blue-500'}`}>
                                        <MessageSquare size={16} />
                                    </button>
                                    <button onClick={() => removeRow(entry.id)} className="p-1.5 bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all">
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <button onClick={() => setShowDailyCommentModal(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-all font-medium border border-amber-200">
                    <MessageSquare size={18} />
                    {dailyComment ? "Editar Comentario del Día *" : "Agregar Comentario del Día"}
                </button>

                <div className="flex gap-4">
                    <button onClick={addRow} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all font-medium whitespace-nowrap">
                        <Plus size={18} /> Agregar Fila
                    </button>
                    <button onClick={handleCerrarCaja} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium whitespace-nowrap shadow-lg shadow-blue-200">
                        <Save size={18} /> Cerrar Caja
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CajaForm;
