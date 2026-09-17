import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import apiService from '../services/apiService';
import {
  Plus, Trash2, CheckCircle2, Circle, Search,
  Calendar, Clock, AlertCircle, Stethoscope, User,
  Loader2, X, Edit2, Save
} from 'lucide-react';
import toast from 'react-hot-toast';

const RemindersView = () => {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('pending');
  const [newTask, setNewTask] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const [editingTask, setEditingTask] = useState(null);
  const [editText, setEditText] = useState('');

  // Fetch Manual Tasks (Reminders)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "reminders"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        type: 'task'
      }));
      setTasks(fetchedTasks);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching tasks:", error);
      // Fallback without order
      const qFallback = query(collection(db, "reminders"));
      onSnapshot(qFallback, (snapshot) => {
        const fetchedTasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          type: 'task'
        }));
        fetchedTasks.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setTasks(fetchedTasks);
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Fetch Upcoming Surgeries
  useEffect(() => {
    const fetchSurgeries = async () => {
      try {
        const allSurgeries = await apiService.getCollection("ordenes_internacion");
        const today = new Date().toISOString().split('T')[0];
        const upcoming = allSurgeries
          .filter(s => !s.suspendida && (s.fechaCirugia || s.fechaDocumento) >= today)
          .sort((a, b) => (a.fechaCirugia || a.fechaDocumento || '').localeCompare(b.fechaCirugia || b.fechaDocumento || ''));
        setSurgeries(upcoming);
      } catch (error) {
        console.error("Error fetching surgeries:", error);
      }
    };
    fetchSurgeries();
  }, []);

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    setIsAdding(true);
    try {
      await addDoc(collection(db, 'reminders'), {
        text: newTask.trim(),
        completed: false,
        userId: currentUser.uid,
        createdAt: new Date()
      });
      setNewTask('');
      toast.success("Tarea creada");
    } catch (error) {
      console.error("Error adding task:", error);
      toast.error("Error al crear tarea");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleTask = async (task) => {
    try {
      const { updateDoc, doc: docRef } = await import('firebase/firestore');
      await updateDoc(doc(db, 'reminders', task.id), {
        completed: !task.completed
      });
    } catch (error) {
      console.error("Error toggling task:", error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteDoc(doc(db, 'reminders', taskId));
      toast.success("Tarea eliminada");
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const handleEditTask = async (task) => {
    if (!editText.trim()) return;
    try {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'reminders', task.id), {
        text: editText.trim()
      });
      setEditingTask(null);
      setEditText('');
      toast.success("Tarea actualizada");
    } catch (error) {
      toast.error("Error al actualizar");
    }
  };

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.text?.toLowerCase().includes(searchTerm.toLowerCase());
    if (filter === 'pending') return !t.completed && matchesSearch;
    if (filter === 'completed') return t.completed && matchesSearch;
    return matchesSearch;
  });

  const pendingCount = tasks.filter(t => !t.completed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pendientes</h2>
        <p className="text-xs text-slate-400 font-medium mt-1">{pendingCount} tareas pendientes</p>
      </div>

      {/* Add Task */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Agregar nueva tarea..."
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTask()}
          />
          <button
            onClick={handleAddTask}
            disabled={isAdding || !newTask.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
          >
            {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Agregar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { id: 'pending', label: 'Pendientes', count: pendingCount },
          { id: 'completed', label: 'Completadas', count: tasks.filter(t => t.completed).length },
          { id: 'all', label: 'Todas', count: tasks.length }
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              filter === f.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Tasks List */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 size={48} className="text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">
              {filter === 'pending' ? 'No hay tareas pendientes' : 'No hay tareas'}
            </p>
          </div>
        ) : (
          filteredTasks.slice(0, visibleCount).map(task => (
            <div
              key={task.id}
              className={`flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-all group ${
                task.completed ? 'opacity-60' : ''
              }`}
            >
              <button
                onClick={() => handleToggleTask(task)}
                className="shrink-0"
              >
                {task.completed ? (
                  <CheckCircle2 size={20} className="text-emerald-500" />
                ) : (
                  <Circle size={20} className="text-slate-300 hover:text-blue-500 transition-colors" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                {editingTask === task.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleEditTask(task)}
                      autoFocus
                    />
                    <button onClick={() => handleEditTask(task)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg">
                      <Save size={14} />
                    </button>
                    <button onClick={() => { setEditingTask(null); setEditText(''); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className={`text-sm font-medium ${task.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                    {task.text}
                  </p>
                )}
              </div>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {editingTask !== task.id && (
                  <button
                    onClick={() => { setEditingTask(task.id); setEditText(task.text); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Load More */}
      {visibleCount < filteredTasks.length && (
        <div className="text-center">
          <button
            onClick={() => setVisibleCount(v => v + 15)}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold transition-colors"
          >
            Cargar más
          </button>
        </div>
      )}
    </div>
  );
};

export default RemindersView;
