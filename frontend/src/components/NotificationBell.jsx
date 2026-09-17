import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { Bell, Clock, AlertCircle, Stethoscope, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/apiService';

const NotificationBell = ({ onNavigate }) => {
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

  // Fetch Upcoming Surgeries
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
    const interval = setInterval(fetchSurgeries, 300000);
    return () => clearInterval(interval);
  }, []);

  const unauthorizedCount = surgeries.filter(s => !s.autorizada).length;
  const pendingMaterialCount = surgeries.filter(s => s.incluyeMaterial && !materialStatus[s.id]).length;
  const totalPending = tasksCount + unauthorizedCount + pendingMaterialCount;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl transition-all ${isOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
      >
        <Bell size={24} />
        {totalPending > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white ring-2 ring-white animate-in zoom-in">
            {totalPending > 99 ? '99+' : totalPending}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-200">
          <div className="p-6 border-b border-slate-50">
            <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">Pendientes del Sistema</h4>
          </div>

          <div className="p-2 space-y-1">
            {/* Tareas */}
            <button
              onClick={() => { onNavigate?.('pendientes'); setIsOpen(false); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Clock size={20} />
                </div>
                <span className="font-bold text-sm text-slate-600">Tareas</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black ${tasksCount > 0 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {tasksCount}
                </span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
            </button>

            {/* Cirugías sin autorizar */}
            <button
              onClick={() => { onNavigate?.('ordenes'); setIsOpen(false); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <Stethoscope size={20} />
                </div>
                <span className="font-bold text-sm text-slate-600">Sin Autorizar</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black ${unauthorizedCount > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {unauthorizedCount}
                </span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
            </button>

            {/* Material pendiente */}
            <button
              onClick={() => { onNavigate?.('control'); setIsOpen(false); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                  <AlertCircle size={20} />
                </div>
                <span className="font-bold text-sm text-slate-600">Material</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black ${pendingMaterialCount > 0 ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {pendingMaterialCount}
                </span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
