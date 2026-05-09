import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, limit, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { isLocalEnv } from '../firebase/config';
import { Bell, Clock, AlertCircle, Box, Stethoscope, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/apiService';

const NotificationBell = ({ onNavigateOrganizador }) => {
    const { currentUser } = useAuth();
    const [tasksCount, setTasksCount] = useState(0);
    const [surgeries, setSurgeries] = useState([]);
    const [materialStatus, setMaterialStatus] = useState({});
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Fetch Tasks Count
    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "reminders"), where("completed", "==", false));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setTasksCount(snapshot.docs.length);
        });
        return () => unsubscribe();
    }, [currentUser]);

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

    // Fetch Upcoming Surgeries for counts
    useEffect(() => {
        const fetchSurgeries = async () => {
            try {
                const items = await apiService.getCollection("ordenes_internacion");
                const today = new Date().toISOString().split('T')[0];
                const upcoming = items.filter(s => !s.suspendida && (s.fechaCirugia || s.fechaDocumento) >= today);
                setSurgeries(upcoming);
            } catch (error) {
                console.error("Error fetching surgeries for bell:", error);
            }
        };
        fetchSurgeries();
        // Refresh every 5 minutes or when needed
        const interval = setInterval(fetchSurgeries, 300000);
        return () => clearInterval(interval);
    }, []);

    const unauthorizedCount = surgeries.filter(s => !s.autorizada).length;
    const pendingMaterialCount = surgeries.filter(s => s.incluyeMaterial && !materialStatus[s.id]).length;
    const totalPending = tasksCount + unauthorizedCount + pendingMaterialCount;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2.5 rounded-xl transition-all ${isOpen ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
                <Bell size={24} />
                {totalPending > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white ring-2 ring-white dark:ring-slate-900 animate-in zoom-in">
                        {totalPending > 99 ? '99+' : totalPending}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-white/5 overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-200">
                    <div className="p-6 border-b border-slate-50 dark:border-white/5">
                        <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tight text-sm">Pendientes del Sistema</h4>
                    </div>

                    <div className="p-2 space-y-1">
                        {/* Tareas */}
                        <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <Clock size={20} />
                                </div>
                                <span className="font-bold text-sm text-slate-600 dark:text-slate-400">Tareas</span>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-black ${tasksCount > 0 ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                {tasksCount}
                            </span>
                        </div>

                        {/* Cirugías */}
                        <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                    <Stethoscope size={20} />
                                </div>
                                <span className="font-bold text-sm text-slate-600 dark:text-slate-400">Cirugías s/aut.</span>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-black ${unauthorizedCount > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                {unauthorizedCount}
                            </span>
                        </div>

                        {/* Material */}
                        <div className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <Box size={20} />
                                </div>
                                <span className="font-bold text-sm text-slate-600 dark:text-slate-400">Material pend.</span>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-black ${pendingMaterialCount > 0 ? 'bg-purple-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                {pendingMaterialCount}
                            </span>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-white/5">
                        <button 
                            onClick={() => {
                                setIsOpen(false);
                                if (onNavigateOrganizador) onNavigateOrganizador();
                            }}
                            className="w-full py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center gap-2"
                        >
                            Ver Organizador <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
