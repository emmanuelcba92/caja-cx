import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { supabase } from '../supabase/config';
import {
    collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc
} from 'firebase/firestore';
import {
    FileText, Upload, Trash2, Link2, Search, Plus, ChevronDown,
    CheckCircle2, AlertCircle, RefreshCw, Eye, X, Baby, User, Hash, ClipboardList, Layers
} from 'lucide-react';
import { CODIGOS_CIRUGIA, MODULOS_SM } from '../data/codigos';

const CONSENT_TYPES = [
    { id: 'generico', label: 'Genérico (aplica a todos)', color: 'blue' },
    { id: 'adulto', label: 'Específico – Adulto', color: 'indigo' },
    { id: 'menor', label: 'Específico – Menor', color: 'purple' },
];

const ConsentimientosView = () => {
    const [consentimientos, setConsentimientos] = useState([]);
    const [mappings, setMappings] = useState({}); // { surgeryCode: { adultoId, menorId } }
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [toast, setToast] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [mappingModal, setMappingModal] = useState(null); // { code, name }
    const [newCodeInput, setNewCodeInput] = useState('');
    const [newCodeName, setNewCodeName] = useState('');
    const [selectedAdulto, setSelectedAdulto] = useState('');
    const [selectedMenor, setSelectedMenor] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const fileInputRef = useRef(null);

    const handleSearch = (value, field) => {
        if (field === 'codigo') setNewCodeInput(value);
        else setNewCodeName(value);

        if (value.length < 1) {
            setSuggestions([]);
            return;
        }

        const term = value.toLowerCase();
        
        // Search in Modules
        const smMatches = MODULOS_SM.filter(c => 
            c.codigo.toLowerCase().startsWith(term) || 
            c.nombre.toLowerCase().includes(term)
        ).map(m => ({ ...m, isModule: true }));

        // Search in General Codes
        const generalMatches = CODIGOS_CIRUGIA.filter(c => 
            c.codigo.toLowerCase().startsWith(term) || 
            c.nombre.toLowerCase().includes(term)
        );

        const combined = [...smMatches, ...generalMatches].slice(0, 10);
        setSuggestions(combined);
        setHighlightedIndex(0);
    };

    const selectSuggestion = (s) => {
        setNewCodeInput(s.codigo);
        setNewCodeName(s.nombre);
        setSuggestions([]);
    };

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [cSnap, mSnap] = await Promise.all([
                getDocs(collection(db, 'consentimientos')),
                getDocs(collection(db, 'consent_mappings')),
            ]);
            setConsentimientos(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            const map = {};
            mSnap.docs.forEach(d => {
                const data = d.data();
                map[data.code] = { docId: d.id, name: data.name, adultoId: data.adultoId || null, menorId: data.menorId || null };
            });
            setMappings(map);
        } catch (e) {
            showToast('Error cargando datos: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const pdfs = files.filter(f => f.type === 'application/pdf');
        if (pdfs.length === 0) {
            showToast('Solo se aceptan archivos PDF', 'error');
            return;
        }

        setUploading(true);
        let completed = 0;
        
        for (const file of pdfs) {
            try {
                const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const filePath = `consentimientos/${safeName}`;

                const { error } = await supabase.storage
                    .from('Cirugias')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (error) throw error;

                const { data: { publicUrl } } = supabase.storage
                    .from('Cirugias')
                    .getPublicUrl(filePath);

                await addDoc(collection(db, 'consentimientos'), {
                    nombre: file.name.replace('.pdf', ''),
                    fileName: safeName,
                    url: publicUrl,
                    path: filePath,
                    uploadedAt: new Date().toISOString(),
                });

                completed++;
                setUploadProgress(Math.round((completed / pdfs.length) * 100));
            } catch (err) {
                console.error(`Error subiendo ${file.name}:`, err);
                showToast(`Error con "${file.name}": ${err.message}`, 'error');
            }
        }

        showToast(`Se subieron ${completed} archivos correctamente`);
        fetchData();
        setUploading(false);
        setUploadProgress(0);
        e.target.value = '';
    };

    const handleDelete = async (consent) => {
        if (!window.confirm(`¿Eliminar "${consent.nombre}"? Esto no puede deshacerse.`)) return;
        try {
            if (consent.path) {
                await supabase.storage
                    .from('Cirugias')
                    .remove([consent.path]);
            }
            await deleteDoc(doc(db, 'consentimientos', consent.id));
            showToast(`"${consent.nombre}" eliminado`);
            fetchData();
        } catch (e) {
            showToast('Error al eliminar: ' + e.message, 'error');
        }
    };

    const openMappingModal = (code, name) => {
        const existing = mappings[code] || {};
        setMappingModal({ code, name });
        setSelectedAdulto(existing.adultoId || '');
        setSelectedMenor(existing.menorId || '');
    };

    const saveMappingModal = async () => {
        if (!mappingModal) return;
        const { code, name } = mappingModal;
        const existing = mappings[code];
        const data = { code, name, adultoId: selectedAdulto || null, menorId: selectedMenor || null };
        try {
            if (existing?.docId) {
                await updateDoc(doc(db, 'consent_mappings', existing.docId), data);
            } else {
                await addDoc(collection(db, 'consent_mappings'), data);
            }
            showToast('Mapeo guardado correctamente');
            setMappingModal(null);
            fetchData();
        } catch (e) {
            showToast('Error al guardar: ' + e.message, 'error');
        }
    };

    const addNewMapping = async () => {
        const code = newCodeInput.trim();
        const name = newCodeName.trim() || `Combo: ${code}`; // Default name if empty
        
        if (!code) {
            showToast('Ingresá al menos un código', 'error');
            return;
        }
        
        const data = { code, name, adultoId: null, menorId: null };
        try {
            await addDoc(collection(db, 'consent_mappings'), data);
            showToast(`Regla para ${code} agregada`);
            setNewCodeInput('');
            setNewCodeName('');
            fetchData();
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    };

    const deleteMapping = async (code) => {
        const m = mappings[code];
        if (!m?.docId || !window.confirm(`¿Eliminar mapeo del código ${code}?`)) return;
        await deleteDoc(doc(db, 'consent_mappings', m.docId));
        showToast('Mapeo eliminado');
        fetchData();
    };

    const getConsentName = (id) => consentimientos.find(c => c.id === id)?.nombre || '—';

    const filteredConsents = consentimientos
        .filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const mappingEntries = Object.entries(mappings)
        .filter(([code]) =>
            code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mappings[code]?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));

    if (loading) return (
        <div className="flex items-center justify-center p-20 gap-4 text-slate-400">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="font-medium animate-pulse">Cargando consentimientos...</p>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-[9999] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-white text-sm font-bold animate-in slide-in-from-top-4 duration-300 ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                    {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    {toast.msg}
                </div>
            )}

            {/* Mapping Modal */}
            {mappingModal && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/60 animate-in fade-in duration-200">
                    <div className="fixed inset-0" onClick={() => setMappingModal(null)} />
                    <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 w-full max-w-lg border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <button onClick={() => setMappingModal(null)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400">
                            <X size={18} />
                        </button>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">
                            Mapeo de Consentimiento
                        </h3>
                        <p className="text-xs text-slate-400 mb-6">
                            Código: <span className="font-bold text-blue-500">{mappingModal.code}</span> — {mappingModal.name}
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                    <User size={12} className="text-indigo-500" /> Consentimiento Adulto
                                </label>
                                <select
                                    value={selectedAdulto}
                                    onChange={e => setSelectedAdulto(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Sin asignar</option>
                                    {consentimientos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                    <Baby size={12} className="text-purple-500" /> Consentimiento Menor
                                </label>
                                <select
                                    value={selectedMenor}
                                    onChange={e => setSelectedMenor(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    <option value="">Sin asignar</option>
                                    {consentimientos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setMappingModal(null)} className="flex-1 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-black text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                                Cancelar
                            </button>
                            <button onClick={saveMappingModal} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-500/20">
                                Guardar Mapeo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header + Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Buscar consentimientos o códigos..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                    {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                    {uploading ? `Subiendo ${uploadProgress}%` : 'Subir PDF'}
                </button>
                <input ref={fileInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleUpload} />
            </div>

            {/* Upload progress bar */}
            {uploading && (
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300 rounded-full" style={{ width: `${uploadProgress}%` }} />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-250px)]">
                {/* PDF Library */}
                <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl flex flex-col min-h-0">
                    <div className="flex items-center gap-3 mb-6 shrink-0">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Biblioteca de PDFs</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{filteredConsents.length} archivos subidos</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                        {filteredConsents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                                <FileText size={48} className="opacity-20" />
                                <p className="text-sm font-medium">Sin resultados</p>
                            </div>
                        ) : (
                            filteredConsents.map(c => (
                                <div key={c.id} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 group hover:border-blue-200 dark:hover:border-blue-500/30 transition-all">
                                    <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <FileText size={18} className="text-red-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate uppercase">{c.nombre}</p>
                                        <p className="text-[10px] text-slate-400 font-mono truncate">{c.fileName}</p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <a href={c.url} target="_blank" rel="noreferrer"
                                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-xl transition-colors" title="Ver PDF">
                                            <Eye size={14} />
                                        </a>
                                        <button onClick={() => handleDelete(c)}
                                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 rounded-xl transition-colors" title="Eliminar">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Code Mappings */}
                <div className="premium-card p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl flex flex-col min-h-0">
                    <div className="flex items-center gap-3 mb-6 shrink-0">
                        <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl">
                            <Link2 size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Asignación por Código</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                                {mappingEntries.length} configurados 
                                <span className="ml-2 text-indigo-500 lowercase font-medium tracking-normal">(usá "+" para combos, ej: 030202+030401)</span>
                            </p>
                        </div>
                    </div>

                    {/* Add new mapping with Autocomplete */}
                    <div className="relative shrink-0 mb-6">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    placeholder="Código"
                                    value={newCodeInput}
                                    onChange={(e) => handleSearch(e.target.value, 'codigo')}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                                />
                            </div>
                            <div className="relative flex-[3]">
                                <input
                                    type="text"
                                    placeholder="Descripción del procedimiento"
                                    value={newCodeName}
                                    onChange={(e) => handleSearch(e.target.value, 'nombre')}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                                />
                            </div>
                            <button
                                onClick={addNewMapping}
                                disabled={!newCodeInput}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                            >
                                <Plus size={20} />
                            </button>
                        </div>

                        {/* Suggestions Popover */}
                        {suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Sugerencias del Sistema</span>
                                    <button onClick={() => setSuggestions([])} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="max-h-64 overflow-y-auto py-1 custom-scrollbar">
                                    {suggestions.map((s, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => selectSuggestion(s)}
                                            className={`w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 ${idx === highlightedIndex ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.isModule ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {s.isModule ? <Layers size={18} /> : <ClipboardList size={18} />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase truncate">{s.nombre}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded uppercase tracking-wider">{s.codigo}</span>
                                                    {s.isModule && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded uppercase tracking-wider">Módulo Swiss</span>}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                        {mappingEntries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                                <Link2 size={40} className="opacity-20" />
                                <p className="text-sm font-medium">Sin códigos configurados</p>
                            </div>
                        ) : (
                            mappingEntries.map(([code, mapping]) => (
                                <div key={code} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all group">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-lg font-mono">{code}</span>
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate uppercase">{mapping.name}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                    <User size={10} className="text-indigo-400 shrink-0" />
                                                    <span className="truncate">{mapping.adultoId ? getConsentName(mapping.adultoId) : <em className="text-slate-300">Sin asignar</em>}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                    <Baby size={10} className="text-purple-400 shrink-0" />
                                                    <span className="truncate">{mapping.menorId ? getConsentName(mapping.menorId) : <em className="text-slate-300">Sin asignar</em>}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openMappingModal(code, mapping.name)} className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-500 rounded-xl transition-colors" title="Asignar PDFs">
                                                <Link2 size={14} />
                                            </button>
                                            <button onClick={() => deleteMapping(code)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 rounded-xl transition-colors" title="Eliminar">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConsentimientosView;
