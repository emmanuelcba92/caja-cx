import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Save, X, StickyNote, Pencil, Search } from 'lucide-react';

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
            // Fallback for missing index error on first run
            if (error.message.includes("requires an index")) {
                try {
                    const q2 = query(collection(db, "notes"), where("userId", "==", currentUser.uid));
                    const snap2 = await getDocs(q2);
                    const fetchedNotes2 = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    // Client side sort
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
        if (!title.trim()) return alert("El título es obligatorio");
        if (!currentUser?.uid) return;

        try {
            const noteData = {
                userId: currentUser.uid,
                title,
                content,
                updatedAt: new Date(),
            };

            if (currentNote) {
                // Update
                await updateDoc(doc(db, "notes", currentNote.id), noteData);
            } else {
                // Create
                await addDoc(collection(db, "notes"), {
                    ...noteData,
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
            alert("Error al guardar la nota");
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
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

    const startNewNote = () => {
        setCurrentNote(null);
        setTitle('');
        setContent('');
        setIsEditing(true);
    };

    const openNote = (note) => {
        setCurrentNote(note);
        setTitle(note.title);
        setContent(note.content);
        setIsEditing(true);
    };

    const filteredNotes = notes.filter(n =>
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isEditing) {
        return (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[calc(100vh-140px)] border border-slate-200">
                {/* Editor Header */}
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                    <button
                        onClick={() => setIsEditing(false)}
                        className="text-slate-500 hover:text-slate-700 flex items-center gap-2 font-medium"
                    >
                        <X size={20} /> Cancelar
                    </button>
                    <div className="font-bold text-slate-700">
                        {currentNote ? 'Editar Nota' : 'Nueva Nota'}
                    </div>
                    <button
                        onClick={handleSave}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
                    >
                        <Save size={18} /> Guardar
                    </button>
                </div>

                {/* Editor Body */}
                <div className="flex-1 flex flex-col p-6 overflow-hidden">
                    <input
                        type="text"
                        placeholder="Título de la nota..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="text-3xl font-bold text-slate-800 placeholder:text-slate-300 border-none outline-none bg-transparent mb-6 w-full"
                        autoFocus
                    />
                    <textarea
                        placeholder="Empieza a escribir..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="flex-1 resize-none border-none outline-none bg-transparent text-lg text-slate-600 placeholder:text-slate-300 leading-relaxed"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <StickyNote className="text-yellow-500" size={28} />
                        Mis Notas
                    </h2>
                    <p className="text-slate-400 text-sm">Espacio personal y privado.</p>
                </div>
                <button
                    onClick={startNewNote}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
                >
                    <Plus size={20} /> Nueva Nota
                </button>
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar en mis notas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-4">
                {filteredNotes.map(note => (
                    <div
                        key={note.id}
                        onClick={() => openNote(note)}
                        className="bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-2xl p-5 cursor-pointer transition-all group relative h-64 flex flex-col shadow-sm hover:shadow-md"
                    >
                        <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-1">{note.title}</h3>
                        <p className="text-slate-600 text-sm flex-1 whitespace-pre-wrap line-clamp-6 opacity-80">
                            {note.content}
                        </p>
                        <div className="mt-4 pt-3 border-t border-yellow-200/50 flex justify-between items-center text-xs text-slate-400">
                            <span>
                                {note.updatedAt?.seconds
                                    ? new Date(note.updatedAt.seconds * 1000).toLocaleDateString()
                                    : 'Reciente'}
                            </span>
                            <button
                                onClick={(e) => handleDelete(e, note.id)}
                                className="p-2 bg-white/50 rounded-lg text-red-400 hover:text-red-600 hover:bg-white transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}

                {filteredNotes.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                        <StickyNote size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No tienes notas guardadas.</p>
                        {searchTerm && <p className="text-sm">Intenta con otra búsqueda.</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesView;
