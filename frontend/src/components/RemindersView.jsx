import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy, onSnapshot, limit, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/apiService';
import { 
    Plus, Trash2, CheckCircle2, Circle, Search, Filter, 
    Calendar, Clock, AlertCircle, Stethoscope, User,
    ChevronRight, ClipboardList, Loader2, X,
    LayoutGrid, List as ListIcon, Box, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const RemindersView = () => {
    const { currentUser } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [surgeries, setSurgeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('pending'); // 'all' | 'pending' | 'completed' | 'surgeries'
    const [newTask, setNewTask] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [materialStatus, setMaterialStatus] = useState({}); // { surgeryId: boolean }
    const DISPLAY_LIMIT = 15;

    // Fetch Material Statuses
    useEffect(() => {
        const q = query(collection(db, "material_requests"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const statuses = {};
            snapshot.docs.forEach(doc => {
                statuses[doc.id] = doc.data().requested;
            });
            setMaterialStatus(statuses);
        });
        return () => unsubscribe();
    }, []);

    // Fetch Manual Tasks (Reminders)
    useEffect(() => {
        if (!currentUser?.uid) return;

        // Try query with order first
        const q = query(
            collection(db, "reminders"),
            orderBy("createdAt", "desc"),
            limit(50) // Sensible limit for initial fetch
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log("Tasks snapshot received:", snapshot.docs.length);
            const fetchedTasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                type: 'task'
            }));
            setTasks(fetchedTasks);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching tasks with order:", error);
            
            // Fallback: query without order if index is missing
            if (error.message.includes("requires an index") || error.code === 'failed-precondition') {
                console.log("Falling back to unordered query for tasks...");
                const qFallback = query(
                    collection(db, "reminders")
                );
                
                onSnapshot(qFallback, (snapshot) => {
                    const fetchedTasks = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        type: 'task'
                    }));
                    // Manual sort
                    fetchedTasks.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                    setTasks(fetchedTasks);
                    setLoading(false);
                });
            } else {
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [currentUser?.uid]);

    // Fetch Upcoming Surgeries
    useEffect(() => {
        const fetchSurgeries = async () => {
            try {
                const allSurgeries = await apiService.getCollection("ordenes_internacion");
                const today = new Date().toISOString().split('T')[0];
                
                // Filter upcoming non-suspended surgeries
                const upcoming = allSurgeries
                    .filter(s => !s.suspendida && s.fechaCirugia >= today)
                    .map(s => ({
                        ...s,
                        type: 'surgery',
                        completed: false // Surgeries are always "pending" in this view unless we add logic for it
                    }))
                    .sort((a, b) => new Date(a.fechaCirugia) - new Date(b.fechaCirugia));
                
                setSurgeries(upcoming);
            } catch (error) {
                console.error("Error fetching surgeries:", error);
            }
        };

        fetchSurgeries();
    }, []);

    const handleAddTask = async (e) => {
        e.preventDefault();
        if (!newTask.trim() || !currentUser?.uid) return;

        try {
            await addDoc(collection(db, "reminders"), {
                userId: currentUser.uid,
                text: newTask.trim(),
                completed: false,
                createdAt: new Date(),
                category: 'General'
            });
            setNewTask('');
            setIsAdding(false);
            toast.success('Tarea anotada');
        } catch (error) {
            console.error("Error adding task:", error);
            toast.error('Error al guardar');
        }
    };

    const toggleTask = async (task) => {
        if (task.type === 'surgery') return; // Cannot toggle surgery status here

        try {
            const taskRef = doc(db, "reminders", task.id);
            await updateDoc(taskRef, {
                completed: !task.completed
            });
        } catch (error) {
            console.error("Error updating task:", error);
        }
    };

    const deleteTask = async (e, taskId) => {
        e.stopPropagation();
        try {
            await deleteDoc(doc(db, "reminders", taskId));
            toast.success('Tarea eliminada');
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };

    const toggleMaterial = async (e, surgeryId) => {
        e.stopPropagation();
        const currentStatus = materialStatus[surgeryId] || false;
        try {
            await updateDoc(doc(db, "material_requests", surgeryId), {
                requested: !currentStatus,
                updatedAt: new Date()
            }).catch(async (err) => {
                // If doc doesn't exist, create it
                if (err.code === 'not-found') {
                    await setDoc(doc(db, "material_requests", surgeryId), {
                        requested: !currentStatus,
                        updatedAt: new Date()
                    });
                }
            });
            toast.success(!currentStatus ? 'Material marcado como pedido' : 'Material marcado como pendiente');
        } catch (error) {
            console.error("Error updating material status:", error);
            toast.error('Error al actualizar material');
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}`;
    };

    const getCombinedData = () => {
        let combined = [];
        
        if (filter === 'surgeries') {
            combined = surgeries;
        } else if (filter === 'my-tasks') {
            combined = tasks.filter(t => t.userId === currentUser?.uid);
        } else if (filter === 'completed') {
            combined = tasks.filter(t => t.completed);
        } else if (filter === 'pending') {
            // Combine pending tasks and surgeries
            combined = [
                ...tasks.filter(t => !t.completed),
                ...surgeries
            ].sort((a, b) => {
                // Tasks without date go first, then by date
                const dateA = a.fechaCirugia || '0';
                const dateB = b.fechaCirugia || '0';
                if (dateA === '0' && dateB !== '0') return -1;
                if (dateA !== '0' && dateB === '0') return 1;
                return new Date(dateA) - new Date(dateB);
            });
        } else {
            combined = [...tasks, ...surgeries];
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            combined = combined.filter(item => 
                (item.text?.toLowerCase().includes(term)) ||
                (item.afiliado?.toLowerCase().includes(term)) ||
                (item.obraSocial?.toLowerCase().includes(term)) ||
                (item.profesional?.toLowerCase().includes(term)) ||
                (item.dni?.toString().includes(term))
            );
        }

        // Limit to DISPLAY_LIMIT if not showAll
        if (!showAll && combined.length > DISPLAY_LIMIT && !searchTerm) {
            return combined.slice(0, DISPLAY_LIMIT);
        }

        return combined;
    };

    const filteredData = getCombinedData();

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
            {/* Header / Stats */}
            <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 md:p-12 shadow-premium border border-slate-100 dark:border-white/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                                <ClipboardList size={28} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Organizador</h1>
                                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Gestión de Pendientes y Cirugías</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{tasks.filter(t => !t.completed).length}</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Tareas</span>
                            </div>
                            <div className="w-px h-8 bg-slate-100 dark:bg-white/10"></div>
                            <div className="flex flex-col">
                                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                    {surgeries.filter(s => !s.autorizada).length}
                                </span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">S/Autorizar</span>
                            </div>
                            <div className="w-px h-8 bg-slate-100 dark:bg-white/10"></div>
                            <div className="flex flex-col">
                                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                                    {surgeries.filter(s => s.incluyeMaterial && !materialStatus[s.id]).length}
                                </span>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Mat. Pendiente</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsAdding(true)}
                        className="h-16 px-8 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                        <Plus size={20} /> Anotar Pendiente
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por paciente, profesional o tarea..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-6 h-14 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-sm shadow-sm"
                    />
                </div>
                <div className="flex items-center bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm overflow-x-auto max-w-full">
                    {[
                        { id: 'pending', label: 'Pendientes', icon: Clock },
                        { id: 'my-tasks', label: 'Mis Tareas', icon: User },
                        { id: 'surgeries', label: 'Cirugías', icon: Stethoscope },
                        { id: 'completed', label: 'Hecho', icon: CheckCircle2 },
                        { id: 'all', label: 'Todo', icon: Filter }
                    ].map(btn => (
                        <button
                            key={btn.id}
                            onClick={() => setFilter(btn.id)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                filter === btn.id
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                        >
                            <btn.icon size={14} />
                            <span className="hidden sm:inline">{btn.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                    {filteredData.map((item) => (
                        <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={() => toggleTask(item)}
                            className={`group relative overflow-hidden bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer ${item.completed ? 'opacity-60' : ''}`}
                        >
                            {/* Type Indicator Bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${item.type === 'surgery' ? 'bg-amber-500' : 'bg-blue-600'}`}></div>

                            <div className="flex items-center gap-5">
                                <div className="flex-shrink-0">
                                    {item.type === 'surgery' ? (
                                        <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center">
                                            <Stethoscope size={20} />
                                        </div>
                                    ) : (
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${item.completed ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500' : 'bg-slate-50 dark:bg-white/5 text-slate-300 group-hover:text-blue-500'}`}>
                                            {item.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    {item.type === 'surgery' ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-[9px] font-black uppercase tracking-widest border border-amber-100 dark:border-amber-500/20">Cirugía</span>
                                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.obraSocial}</span>
                                            </div>
                                            <h3 className="text-base font-black text-slate-900 dark:text-white truncate uppercase tracking-tight">
                                                {item.afiliado}
                                            </h3>
                                            <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
                                                <span className="flex items-center gap-1.5"><User size={12} className="text-slate-400" /> {item.profesional}</span>
                                                {item.fechaCirugia && (
                                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded-md text-slate-700 dark:text-slate-300">
                                                        <Calendar size={12} /> {formatDate(item.fechaCirugia)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded text-[9px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-500/20">{item.category}</span>
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600">{item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Hoy'}</span>
                                            </div>
                                            <h3 className={`text-base font-bold text-slate-800 dark:text-slate-200 leading-tight ${item.completed ? 'line-through decoration-2' : ''}`}>
                                                {item.text}
                                            </h3>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {item.type === 'task' && (
                                        <button
                                            onClick={(e) => deleteTask(e, item.id)}
                                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}

                                    <div className="p-2 text-slate-200 dark:text-slate-800 group-hover:text-slate-400 transition-colors">
                                        <ChevronRight size={20} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredData.length === 0 && !loading && (
                    <div className="py-20 flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-slate-100 dark:border-white/5 shadow-inner">
                        <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center text-slate-200 dark:text-slate-800 mb-6">
                            <CheckCircle2 size={40} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Todo al día</h3>
                        <p className="text-slate-400 dark:text-slate-500 font-bold text-sm mt-1">No hay pendientes que coincidan con tu búsqueda.</p>
                    </div>
                )}

                {loading && (
                    <div className="py-20 flex flex-col items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                        <p className="text-slate-400 font-bold mt-4 animate-pulse">Organizando tus tareas...</p>
                    </div>
                )}
            </div>

            {/* Quick Add Modal */}
            <AnimatePresence>
                {isAdding && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-premium overflow-hidden border border-white/20 dark:border-slate-800/50"
                        >
                            <form onSubmit={handleAddTask}>
                                <div className="p-8 flex justify-between items-center border-b border-slate-50 dark:border-white/5">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Nueva Anotación</h3>
                                    <button 
                                        type="button"
                                        onClick={() => setIsAdding(false)}
                                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="p-8">
                                    <textarea
                                        autoFocus
                                        value={newTask}
                                        onChange={(e) => setNewTask(e.target.value)}
                                        placeholder="¿Qué tienes pendiente?"
                                        className="w-full h-32 bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl p-6 text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all resize-none"
                                    />
                                    <div className="mt-6 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAdding(false)}
                                            className="flex-1 h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!newTask.trim()}
                                            className="flex-[2] h-14 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all"
                                        >
                                            Guardar Pendiente
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RemindersView;
