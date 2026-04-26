import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/apiService';
import { Search, User, CreditCard, Phone, Mail, Calendar, Filter, ChevronRight, Plus, Download, Trash2, Edit2, ShieldCheck, Heart, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PacientesView = (props) => {
    const { lowPerfMode = false } = props;
    const isLowPerf = (lowPerfMode || false);
    const [pacientes, setPacientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterObraSocial, setFilterObraSocial] = useState('todas');
    const [showForm, setShowForm] = useState(false);
    const [visibleCount, setVisibleCount] = useState(15);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        dni: '',
        nombre: '',
        obraSocial: '',
        numeroAfiliado: '',
        telefono: '',
        email: ''
    });

    useEffect(() => {
        fetchPacientes();
    }, []);

    const fetchPacientes = async () => {
        setLoading(true);
        try {
            const data = await apiService.getCollection('pacientes');
            setPacientes(data);
        } catch (error) {
            console.error("Error fetching patients:", error);
            toast.error("Error al cargar pacientes");
        } finally {
            setLoading(false);
        }
    };

    const obrasSociales = useMemo(() => {
        const unique = [...new Set(pacientes.map(p => p.obraSocial).filter(Boolean))];
        return ['todas', ...unique.sort()];
    }, [pacientes]);

    const filteredPacientes = useMemo(() => {
        return pacientes.filter(p => {
            const matchesSearch = 
                p.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                p.dni?.includes(searchTerm);
            const matchesFilter = filterObraSocial === 'todas' || p.obraSocial === filterObraSocial;
            return matchesSearch && matchesFilter;
        }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [pacientes, searchTerm, filterObraSocial]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.dni || !formData.nombre) {
            toast.error("DNI y Nombre son obligatorios");
            return;
        }

        try {
            // We use the DNI as the document ID to prevent duplicates and ensure consistency
            const patientId = formData.dni;
            await apiService.addDocument('pacientes', { 
                ...formData, 
                id: patientId,
                lastUpdate: new Date().toISOString(),
                createdAt: editingId ? undefined : new Date().toISOString()
            });
            
            toast.success(editingId ? "Paciente actualizado" : "Paciente registrado");
            setShowForm(false);
            setEditingId(null);
            setFormData({ dni: '', nombre: '', obraSocial: '', numeroAfiliado: '', telefono: '', email: '' });
            fetchPacientes();
        } catch (error) {
            console.error("Error saving patient:", error);
            toast.error("Error al guardar paciente");
        }
    };

    const handleEdit = (p) => {
        setFormData({
            dni: p.dni || '',
            nombre: p.nombre || '',
            obraSocial: p.obraSocial || '',
            numeroAfiliado: p.numeroAfiliado || '',
            telefono: p.telefono || '',
            email: p.email || ''
        });
        setEditingId(p.id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Estás seguro de eliminar este paciente?")) return;
        try {
            await apiService.deleteDocument('pacientes', id);
            toast.success("Paciente eliminado");
            fetchPacientes();
        } catch (error) {
            toast.error("No tienes permisos para borrar");
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header / Search Bar */}
            <div className="premium-card p-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-slate-200/50 dark:border-white/5 sticky top-0 z-20 shadow-2xl">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                            <Heart size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Base de Pacientes</h2>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest opacity-60">{pacientes.length} Registros en Total</p>
                        </div>
                    </div>

                    <div className="flex flex-1 max-w-2xl items-center gap-3">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o DNI..."
                                className="w-full pl-12 pr-4 py-3 bg-slate-100 dark:bg-white/5 border-none rounded-2xl text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setVisibleCount(15); // Reset when searching
                                }}
                            />
                        </div>
                        
                        <select
                            className="hidden md:block px-4 py-3 bg-slate-100 dark:bg-white/5 rounded-2xl text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest outline-none border-none focus:ring-4 focus:ring-indigo-500/10 cursor-pointer transition-all"
                            value={filterObraSocial}
                            onChange={(e) => setFilterObraSocial(e.target.value)}
                        >
                            {obrasSociales.map(os => (
                                <option key={os} value={os}>{os.toUpperCase()}</option>
                            ))}
                        </select>

                        <button 
                            onClick={() => setShowForm(true)}
                            className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                            title="Nuevo Paciente"
                        >
                            <Plus size={24} />
                        </button>

                                <button 
                                    onClick={async () => {
                                        if (!window.confirm("¿Deseas sincronizar todos los pacientes desde la base de datos de órdenes? Esto actualizará la lista actual.")) return;
                                        setLoading(true);
                                        try {
                                            const ordenes = await apiService.getCollection('ordenes_internacion');
                                            let count = 0;
                                            for (const order of ordenes) {
                                                if (order.dni && order.afiliado) {
                                                    const patientData = {
                                                        dni: order.dni,
                                                        nombre: order.afiliado,
                                                        obraSocial: order.obraSocial || '',
                                                        numeroAfiliado: order.numeroAfiliado || '',
                                                        telefono: order.telefono || '',
                                                        email: order.email || '',
                                                        lastUpdate: new Date().toISOString()
                                                    };
                                                    // We use updateDocument which uses setDoc internally when passed an ID
                                                    // This ensures we use DNI as the document ID
                                                    await apiService.updateDocument('pacientes', order.dni, patientData);
                                                    count++;
                                                }
                                            }
                                            toast.success(`Sincronización completada: ${count} pacientes.`);
                                            fetchPacientes();
                                        } catch (err) {
                                            console.error("Sync error:", err);
                                            toast.error("Error en la sincronización");
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    className="p-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                                    title="Sincronizar desde Órdenes"
                                >
                                    <RefreshCw size={24} />
                                </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-400">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="font-black uppercase tracking-widest text-[10px] animate-pulse">Sincronizando Base de Datos...</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredPacientes.slice(0, visibleCount).map((p) => (
                            <div key={p.id} className="premium-card group bg-white dark:bg-slate-900 border-none hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 overflow-hidden">
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
                                            <User size={28} />
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(p)} className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl hover:scale-110 transition-all">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(p.id)} className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl hover:scale-110 transition-all">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                {p.nombre || 'Sin Nombre'}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-[9px] font-black uppercase tracking-widest">
                                                    DNI {p.dni || '---'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 pt-4 border-t border-slate-50 dark:border-slate-800/50">
                                            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                                                <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center flex-shrink-0">
                                                    <ShieldCheck size={14} className="text-blue-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-50">Obra Social</p>
                                                    <p className="text-xs font-bold truncate uppercase">{p.obraSocial || 'Particular'}</p>
                                                </div>
                                            </div>
                                            {p.telefono && (
                                                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center flex-shrink-0">
                                                        <Phone size={14} className="text-emerald-500" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[8px] font-black uppercase tracking-widest opacity-50">Teléfono</p>
                                                        <p className="text-xs font-bold truncate">{p.telefono}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={12} className="text-slate-400" />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Act. {p.lastUpdate ? new Date(p.lastUpdate).toLocaleDateString() : '---'}</span>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 group-hover:translate-x-1 group-hover:text-indigo-500 transition-all" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Load More Button */}
                    {visibleCount < filteredPacientes.length && (
                        <div className="flex justify-center pt-8 pb-12">
                            <button 
                                onClick={() => setVisibleCount(prev => prev + 15)}
                                className="group relative px-8 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl text-sm font-black text-slate-700 dark:text-white uppercase tracking-widest hover:border-indigo-500 dark:hover:border-indigo-500 transition-all shadow-xl hover:shadow-indigo-500/10 active:scale-95 flex items-center gap-4"
                            >
                                <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white group-hover:rotate-180 transition-transform duration-500">
                                    <RefreshCw size={16} />
                                </div>
                                Ver más pacientes
                                <span className="text-[10px] opacity-40">({filteredPacientes.length - visibleCount} restantes)</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-white/10 animate-in zoom-in-95 duration-300">
                        <div className="p-8 pb-0 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {editingId ? 'Editar Paciente' : 'Nuevo Paciente'}
                                </h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1 opacity-60">Complete los datos del afiliado</p>
                            </div>
                            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">DNI / Documento</label>
                                    <div className="relative">
                                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                            value={formData.dni}
                                            onChange={(e) => setFormData({...formData, dni: e.target.value.replace(/\D/g, '')})}
                                            placeholder="Solo números"
                                            disabled={!!editingId}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                            value={formData.nombre}
                                            onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                                            placeholder="Apellido y Nombres"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Obra Social</label>
                                    <input
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                        value={formData.obraSocial}
                                        onChange={(e) => setFormData({...formData, obraSocial: e.target.value})}
                                        placeholder="Ej: OSDE, PAMI..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº Afiliado</label>
                                    <input
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                        value={formData.numeroAfiliado}
                                        onChange={(e) => setFormData({...formData, numeroAfiliado: e.target.value})}
                                        placeholder="Número de credencial"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                            value={formData.telefono}
                                            onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                                            placeholder="Cod. Área + Número"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                            value={formData.email}
                                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                                            placeholder="ejemplo@correo.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 uppercase tracking-widest text-sm mt-4 active:scale-[0.98]"
                            >
                                {editingId ? 'Guardar Cambios' : 'Registrar Paciente'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PacientesView;
