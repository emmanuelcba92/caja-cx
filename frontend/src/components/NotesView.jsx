import React, { useState, useEffect } from 'react';
import { db, isLocalEnv } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Save, X, StickyNote, Pencil, Search, CheckCircle, Circle, ArrowLeft, MoreHorizontal, Clock, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
            if (error.message.includes("requires an index")) {
                try {
                    const q2 = query(collection(db, "notes"), where("userId", "==", currentUser.uid));
                    const snap2 = await getDocs(q2);
                    const fetchedNotes2 = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    fetchedNotes2.sort((a, b) => b.updatedAt?.seconds - a.updatedAt?.seconds);
                    setNotes(fetchedNotes2);
                } catch (e) {
                    console.error("Fallback error", e);
                }
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

            if (currentNote) {
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
        } catch (error) {
            console.error("Error saving note:", error);
        }
    };

    const handleDelete = async (id) => {
        if (isLocalEnv) {
            alert("🔒 SEGURIDAD: No se permite eliminar notas de la nube desde local.");
            return;
        }
        if (!window.confirm("¿Eliminar esta nota?")) return;
        try {
            await deleteDoc(doc(db, "notes", id));
            if (currentNote?.id === id) {
                setIsEditing(false);
                setCurrentNote(null);
            }
            fetchNotes();
        } catch (error) {
            console.error("Error deleting note:", error);
        }
    };

    const toggleRead = async (e, note) => {
        e.stopPropagation();
        try {
            const newStatus = !note.isRead;
            await updateDoc(doc(db, "notes", note.id), { isRead: newStatus });
            setNotes(prev => prev.map(n => n.id === note.id ? { ...n, isRead: newStatus } : n));
        } catch (error) {
            console.error("Error toggling status:", error);
        }
    };

    const startNewNote = () => {
        setCurrentNote(null);
        setTitle('');
        setContent('');
        setIsEditing(true);
    };

    const openNote = async (note) => {
        setCurrentNote(note);
        setTitle(note.title);
        setContent(note.content);
        setIsEditing(true);

        if (note.isRead !== true) {
            try {
                await updateDoc(doc(db, "notes", note.id), { isRead: true });
                setNotes(prev => prev.map(n => n.id === note.id ? { ...n, isRead: true } : n));
            } catch (error) {
                console.error("Error marking note as read:", error);
            }
        }
    };

    const filteredNotes = notes.filter(n =>
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isEditing) {
        return (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-slate-950/40 backdrop-blur-md"
            >
                <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-full max-h-[85vh] rounded-[3.5rem] shadow-premium overflow-hidden flex flex-col border border-white/20 dark:border-slate-800/50">
                    {/* Editor Header */}
                    <div className="p-8 flex justify-between items-center border-b border-slate-50 dark:border-slate-800/50">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="w-12 h-12 flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-2xl transition-all"
                        >
                            <ArrowLeft size={22} />
                        </button>
                        
                        <div className="flex items-center gap-3">
                            <span className="px-4 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-500/20">
                                {currentNote ? 'Editando Nota' : 'Nota Personal'}
                            </span>
                        </div>

                        <button
                            onClick={handleSave}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                        >
                            <Save size={16} /> Guardar Nota
                        </button>
                    </div>

                    {/* Editor Body */}
                    <div className="flex-1 flex flex-col p-10 md:p-16 overflow-y-auto scrollbar-premium">
                        <input
                            type="text"
                            placeholder="Título de la nota..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white placeholder:text-slate-200 dark:placeholder:text-slate-800 border-none outline-none bg-transparent mb-10 w-full tracking-tighter"
                            autoFocus
                        />
                        <textarea
                            placeholder="Empieza a escribir tus ideas, pendientes o recordatorios..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="flex-1 resize-none border-none outline-none bg-transparent text-xl md:text-2xl text-slate-600 dark:text-slate-300 placeholder:text-slate-200 dark:placeholder:text-slate-800 leading-relaxed font-medium"
                        />
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="premium-card p-1 bg-slate-50/50 dark:bg-slate-900/50 border-none shadow-premium overflow-hidden">
                <div className="bg-white dark:bg-slate-900 rounded-[2.9rem] p-8 md:p-10 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-amber-500 rounded-[1.5rem] shadow-lg shadow-amber-500/20 flex items-center justify-center text-white flex-shrink-0">
                            <StickyNote size={32} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none mb-2">Mis Notas</h2>
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-100 dark:border-amber-500/20">
                                    Espacio Personal
                                </span>
                                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-sm">
                                    <Hash size={14} />
                                    <span>{notes.length} Notas guardadas</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar en mis notas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-6 h-14 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-amber-500/10 transition-all font-bold text-sm"
                            />
                        </div>
                        <button
                            onClick={startNewNote}
                            className="w-full md:w-auto px-8 h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            <Plus size={18} /> Nueva Nota
                        </button>
                    </div>
                </div>
            </div>

            {/* Notes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                <AnimatePresence mode="popLayout">
                    {filteredNotes.map((note, index) => (
                        <motion.div
                            key={note.id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2, delay: index * 0.05 }}
                            onClick={() => openNote(note)}
                            className={`premium-card p-1 group cursor-pointer border-none shadow-md hover:shadow-premium transition-all duration-500 ${!note.isRead ? 'bg-amber-100/50 dark:bg-amber-900/10' : 'bg-slate-50/50 dark:bg-slate-900/50'}`}
                        >
                            <div className="bg-white dark:bg-slate-900 rounded-[2.8rem] p-8 h-80 flex flex-col relative overflow-hidden">
                                {!note.isRead && (
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-[3rem] flex items-center justify-center">
                                        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shadow-glow shadow-amber-500/50" />
                                    </div>
                                )}

                                <div className="mb-6">
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white line-clamp-2 tracking-tight leading-tight group-hover:text-amber-500 transition-colors">
                                        {note.title}
                                    </h3>
                                </div>

                                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed flex-1 line-clamp-5 font-medium italic">
                                    {note.content}
                                </p>

                                <div className="mt-8 pt-6 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-300 dark:text-slate-600 font-black text-[9px] uppercase tracking-widest">
                                        <Clock size={12} />
                                        {note.updatedAt?.seconds
                                            ? new Date(note.updatedAt.seconds * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
                                            : 'Reciente'}
                                    </div>
                                    
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                        <button
                                            onClick={(e) => toggleRead(e, note)}
                                            className={`p-2.5 rounded-xl transition-all ${!note.isRead ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'text-slate-400 hover:text-blue-500 bg-slate-50 dark:bg-slate-800'}`}
                                        >
                                            {note.isRead ? <Circle size={18} /> : <CheckCircle size={18} />}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(note.id);
                                            }}
                                            className="p-2.5 text-slate-400 hover:text-red-500 bg-slate-50 dark:bg-slate-800 rounded-xl transition-all"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredNotes.length === 0 && (
                    <div className="col-span-full py-24 text-center bg-white dark:bg-slate-900 rounded-[3.5rem] border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center shadow-inner">
                        <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-200 dark:text-slate-700 mb-6">
                            <StickyNote size={48} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-2">No hay notas</h3>
                        <p className="text-slate-400 dark:text-slate-500 font-bold max-w-xs mx-auto">
                            {searchTerm ? 'No se encontraron notas que coincidan con tu búsqueda.' : 'Tu espacio personal está vacío. Crea una nota para empezar.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesView;

