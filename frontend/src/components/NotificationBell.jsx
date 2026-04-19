import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, limit, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { isLocalEnv } from '../firebase/config';
import { Bell, Check, Trash2, X, Clock, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NotificationBell = () => {
    const { currentUser } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, "notifications"),
            where("userId", "==", currentUser.uid),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort client-side to avoid compound index requirement
            items.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt) : 0;
                const dateB = b.createdAt ? new Date(b.createdAt) : 0;
                return dateB - dateA;
            });
            setNotifications(items);
        });

        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAsRead = async (id) => {
        try {
            await updateDoc(doc(db, "notifications", id), { read: true });
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    };

    const markAllAsRead = async () => {
        try {
            const batch = writeBatch(db);
            notifications.filter(n => !n.read).forEach(n => {
                const ref = doc(db, "notifications", n.id);
                batch.update(ref, { read: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("Error marking all as read:", error);
        }
    };

    const removeNotification = async (id) => {
        if (isLocalEnv) {
             console.log("Notificación no eliminada (modo local)");
             return;
        }
        try {
            await deleteDoc(doc(db, "notifications", id));
        } catch (error) {
            console.error("Error deleting notification:", error);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
        return date.toLocaleDateString();
    };

    const getTypeStyles = (type) => {
        switch (type) {
            case 'auditoria': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30';
            case 'urgente': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30';
            default: return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2.5 rounded-xl transition-all ${isOpen ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
                <Bell size={24} />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-in zoom-in">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-200">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h4 className="font-black text-slate-800 dark:text-slate-100 tracking-tight">Notificaciones</h4>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                                Marcar todas como leídas
                            </button>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/50">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell size={32} className="mx-auto text-slate-200 dark:text-slate-700 mb-2" />
                                <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">No hay notificaciones aún</p>
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    className={`p-4 flex gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 group relative ${!n.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getTypeStyles(n.type)}`}>
                                        {n.type === 'auditoria' ? <Check size={20} /> : (n.type === 'urgente' ? <AlertCircle size={20} /> : <Info size={20} />)}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-6">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <p className={`text-sm font-bold truncate ${!n.read ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
                                                {n.title}
                                            </p>
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap flex items-center gap-1">
                                                <Clock size={10} /> {formatTime(n.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                            {n.message}
                                        </p>
                                        {!n.read && (
                                            <button
                                                onClick={() => markAsRead(n.id)}
                                                className="mt-2 text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                            >
                                                Marcar como leída
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => removeNotification(n.id)}
                                        className="absolute right-2 top-4 p-1.5 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {notifications.length > 0 && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                                Historial de Auditoría
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
