import React, { useState, useEffect } from 'react';
import { db, isTestEnv } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Save, X, StickyNote, Pencil, Search, CheckCircle, Circle, Clock, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import apiService from '../services/apiService';

const NotesView = () => {
  const { currentUser } = useAuth();
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Fetch Notes
  const fetchNotes = async () => {
    if (!currentUser?.uid) return;
    if (isTestEnv) {
      const localNotes = await apiService.getCollection('notes');
      setNotes(localNotes || []);
      return;
    }
    setLoading(true);
    try {
      const q = query(
        collection(db, "notes"),
        where("userId", "==", currentUser.uid),
        orderBy("updatedAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const fetchedNotes = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotes(fetchedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      // Fallback without order
      try {
        const q2 = query(collection(db, "notes"), where("userId", "==", currentUser.uid));
        const snap2 = await getDocs(q2);
        const fetchedNotes2 = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetchedNotes2.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        setNotes(fetchedNotes2);
      } catch (e) {
        console.error("Fallback error", e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [currentUser?.uid]);

  const handleSave = async () => {
    if (!title.trim()) return;
    if (!currentUser?.uid) return;

    try {
      const noteData = {
        userId: currentUser.uid,
        title,
        content,
        updatedAt: new Date(),
      };

      if (isTestEnv) {
        if (currentNote) {
          await apiService.updateDocument('notes', currentNote.id, { ...noteData, updatedAt: new Date().toISOString() });
        } else {
          await apiService.addDocument('notes', { ...noteData, isRead: false, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
        }
      } else if (currentNote) {
        await updateDoc(doc(db, "notes", currentNote.id), noteData);
      } else {
        await addDoc(collection(db, "notes"), {
          ...noteData,
          isRead: false,
          createdAt: new Date()
        });
      }

      setIsEditing(false);
      setCurrentNote(null);
      setTitle('');
      setContent('');
      fetchNotes();
      toast.success(currentNote ? "Nota actualizada" : "Nota creada");
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("Error al guardar nota");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta nota?")) return;
    try {
      if (isTestEnv) {
        await apiService.deleteDocument('notes', id);
      } else {
        await deleteDoc(doc(db, "notes", id));
      }
      if (currentNote?.id === id) {
        setIsEditing(false);
        setCurrentNote(null);
        setTitle('');
        setContent('');
      }
      fetchNotes();
      toast.success("Nota eliminada");
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Error al eliminar");
    }
  };

  const handleEdit = (note) => {
    setCurrentNote(note);
    setTitle(note.title);
    setContent(note.content || '');
    setIsEditing(true);
  };

  const handleNew = () => {
    setCurrentNote(null);
    setTitle('');
    setContent('');
    setIsEditing(true);
  };

  const filteredNotes = notes.filter(n => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (n.title || '').toLowerCase().includes(term) || (n.content || '').toLowerCase().includes(term);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--text-main)] to-blue-600 bg-clip-text text-transparent">
            Notas
          </h2>
          <p className="text-xs text-[var(--text-sub)] font-medium mt-1">{notes.length} notas personales</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={16} /> Nueva Nota
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Buscar notas..."
          className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-main)] text-[var(--text-main)] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Editor */}
      {isEditing && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-widest">
              {currentNote ? 'Editar Nota' : 'Nueva Nota'}
            </h3>
            <button onClick={() => setIsEditing(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
              <X size={18} />
            </button>
          </div>
          <input
            type="text"
            placeholder="Título de la nota"
            className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-main)] text-[var(--text-main)] rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Escribí tu nota acá..."
            className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-main)] text-[var(--text-main)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px] resize-y"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border-main)] text-[var(--text-sub)] font-bold text-sm hover:bg-[var(--hover-main)]"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="card text-center py-16">
          <StickyNote size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-[var(--text-sub)] font-medium">
            {searchTerm ? 'No se encontraron notas' : 'No hay notas aún'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map(note => (
            <div
              key={note.id}
              className="card p-5 hover:shadow-md hover:border-blue-400 transition-all group cursor-pointer"
              onClick={() => handleEdit(note)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
                    <StickyNote size={16} />
                  </div>
                  <h4 className="font-bold text-[var(--text-main)] text-sm truncate">{note.title}</h4>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {note.content && (
                <p className="text-xs text-[var(--text-sub)] line-clamp-3 mb-3">{note.content}</p>
              )}

              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Clock size={10} />
                <span>
                  {note.updatedAt?.toDate
                    ? note.updatedAt.toDate().toLocaleDateString('es-AR')
                    : note.updatedAt
                      ? new Date(note.updatedAt).toLocaleDateString('es-AR')
                      : 'Sin fecha'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotesView;
