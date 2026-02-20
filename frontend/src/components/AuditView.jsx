import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Search, Filter, CheckCircle2, Clock, XCircle, User, Calendar, ExternalLink, ShieldCheck, ClipboardList, FileHeart, Edit3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const AuditView = ({ onNavigate }) => {
    const { viewingUid, catalogOwnerUid, isSuperAdmin } = useAuth();
    const [orders, setOrders] = useState([]);
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // all | pendiente | auditada
    const [activeTab, setActiveTab] = useState('internacion'); // internacion | pedidos

    useEffect(() => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;

        // Listen for Internacion Orders
        const q1 = query(collection(db, "ordenes_internacion"), where("userId", "==", ownerToUse));
        const unsub1 = onSnapshot(q1, (snapshot) => {
            setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'internacion' })));
        });

        // Listen for Pedidos Medicos
        const q2 = query(collection(db, "pedidos_medicos"), where("userId", "==", ownerToUse));
        const unsub2 = onSnapshot(q2, (snapshot) => {
            setPedidos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'pedido' })));
            setLoading(false);
        });

        return () => {
            unsub1();
            unsub2();
        };
    }, [viewingUid, catalogOwnerUid]);

    const handleAudit = async (orderId, type) => {
        if (!window.confirm("¿Confirmar auditoría de esta orden?")) return;

        try {
            const collectionName = type === 'internacion' ? "ordenes_internacion" : "pedidos_medicos";
            await updateDoc(doc(db, collectionName, orderId), {
                status: 'auditada',
                auditedAt: new Date().toISOString(),
                // auditedBy: currentUser.email (could add this)
            });
        } catch (error) {
            console.error("Error auditing order:", error);
            alert("Error al auditar");
        }
    };

    const handleEdit = (item) => {
        const destination = item.type === 'internacion' ? 'ordenes' : 'pedidos';
        // We pass the item as payload. OrdenesView expects it in its draftData useEffect
        onNavigate(destination, item);
    };

    const allItems = [...orders, ...pedidos].filter(item => {
        const matchesSearch = item.afiliado?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.dni?.includes(searchTerm) ||
            item.profesional?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || (item.status === filterStatus || (filterStatus === 'pendiente' && !item.status));
        const matchesType = activeTab === 'all' || item.type === activeTab;

        return matchesSearch && matchesStatus && matchesType;
    }).sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt));

    const stats = {
        total: orders.length + pedidos.length,
        pendientes: [...orders, ...pedidos].filter(o => !o.status || o.status === 'pendiente').length,
        auditadas: [...orders, ...pedidos].filter(o => o.status === 'auditada').length
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header / Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                        <ShieldCheck className="text-blue-600" size={32} />
                        Panel de Auditoría
                    </h2>
                    <p className="text-slate-500 font-medium">Revisión y aprobación de prácticas quirúrgicas</p>
                </div>

                <div className="flex gap-4">
                    <div className="bg-amber-50 px-6 py-3 rounded-2xl border border-amber-100">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Pendientes</p>
                        <p className="text-2xl font-black text-amber-700">{stats.pendientes}</p>
                    </div>
                    <div className="bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Auditadas</p>
                        <p className="text-2xl font-black text-emerald-700">{stats.auditadas}</p>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
                <div className="flex-1 min-w-[300px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar paciente, DNI o profesional..."
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('internacion')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'internacion' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <ClipboardList size={16} /> Internación
                    </button>
                    <button
                        onClick={() => setActiveTab('pedidos')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${activeTab === 'pedidos' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <FileHeart size={16} /> Pedidos
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Todos
                    </button>
                </div>

                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                    <button
                        onClick={() => setFilterStatus('pendiente')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${filterStatus === 'pendiente' ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-slate-500'}`}
                    >
                        Pendientes
                    </button>
                    <button
                        onClick={() => setFilterStatus('auditada')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${filterStatus === 'auditada' ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                    >
                        Auditadas
                    </button>
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${filterStatus === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                        Ver Todas
                    </button>
                </div>
            </div>

            {/* Orders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {allItems.map((item) => (
                    <div
                        key={item.id}
                        className={`bg-white rounded-3xl p-6 border-2 transition-all group hover:shadow-2xl hover:-translate-y-1
                        ${item.status === 'auditada' ? 'border-emerald-100' : 'border-slate-100'}`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest
                                ${item.type === 'internacion' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}
                            >
                                {item.type === 'internacion' ? 'Orden de Internación' : 'Pedido de Prácticas'}
                            </div>
                            {item.status === 'auditada' ? (
                                <div className="flex items-center gap-1.5 text-emerald-600 font-black text-[10px] uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-lg">
                                    <CheckCircle2 size={14} /> Auditada
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-amber-600 font-black text-[10px] uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-lg">
                                    <Clock size={14} /> Pendiente
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase leading-tight">
                                    {item.afiliado}
                                </h3>
                                <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 font-medium">
                                    <span className="flex items-center gap-1.5"><User size={14} /> DNI: {item.dni || 'S/D'}</span>
                                    <span className="flex items-center gap-1.5"><Calendar size={14} /> {item.fechaCirugia ? format(parseISO(item.fechaCirugia), 'dd/MM/yyyy') : 'Sin fecha'}</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profesional & Obra Social</p>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-700">{item.profesional}</span>
                                    <span className="px-2 py-1 bg-white rounded-lg text-xs font-bold border border-slate-200 shadow-sm">{item.obraSocial}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prácticas / Códigos</p>
                                <div className="flex flex-wrap gap-2">
                                    {item.type === 'internacion' ? (
                                        item.codigosCirugia?.map((c, i) => c.codigo && (
                                            <span key={i} className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black border border-blue-100">
                                                {c.codigo}
                                            </span>
                                        ))
                                    ) : (
                                        item.practicas?.map((p, i) => p && (
                                            <span key={i} className="px-2 py-1 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-black border border-purple-100">
                                                {p}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                {item.status !== 'auditada' && (
                                    <button
                                        onClick={() => handleAudit(item.id, item.type)}
                                        className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 size={18} /> Aprobar
                                    </button>
                                )}
                                <button
                                    onClick={() => handleEdit(item)}
                                    className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition-all"
                                    title="Editar orden"
                                >
                                    <Edit3 size={20} />
                                </button>
                                <button className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all">
                                    <ExternalLink size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {loading && (
                <div className="py-24 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
                    <p className="text-slate-400 font-mono text-sm">Cargando órdenes...</p>
                </div>
            )}

            {!loading && allItems.length === 0 && (
                <div className="py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Filter className="text-slate-300" size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">No se encontraron órdenes</h3>
                    <p className="text-slate-500 mt-2">Prueba ajustando los filtros o el término de búsqueda.</p>
                </div>
            )}
        </div>
    );
};

export default AuditView;
