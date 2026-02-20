import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, getDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
    ChevronLeft, ChevronRight, User, Clock, CheckCircle2,
    AlertCircle, FileText, ArrowRight, Calendar as CalendarIcon,
    Home, Layout, Plus, MapPin, Search, Maximize2, Minimize2,
    CalendarDays, CalendarRange, Calendar as CalendarSingle,
    StickyNote, Save
} from 'lucide-react';
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays,
    parseISO, startOfDay, eachHourOfInterval, addWeeks, subWeeks,
    isSameWeek, setHours, setMinutes
} from 'date-fns';
import { es } from 'date-fns/locale';

const CalendarView = ({ onNavigate }) => {
    const { viewingUid, catalogOwnerUid, isSuperAdmin, currentUser } = useAuth();
    const [view, setView] = useState('month'); // 'month', 'week', 'day'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [tempNote, setTempNote] = useState('');

    // Business Hours
    const START_HOUR = 7;
    const END_HOUR = 21;
    const hours = eachHourOfInterval({
        start: setHours(startOfDay(new Date()), START_HOUR),
        end: setHours(startOfDay(new Date()), END_HOUR)
    });

    useEffect(() => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;

        const q = query(
            collection(db, "ordenes_internacion"),
            where("userId", "==", ownerToUse)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setEvents(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [viewingUid, catalogOwnerUid]);

    const getInitials = (name) => {
        if (!name) return '';
        return name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 3);
    };

    const getPracticesSummary = (event) => {
        if (event.type === 'pedido') {
            return event.practicas?.filter(p => p).join(', ') || '';
        }
        return event.codigosCirugia?.map(c => c.nombre || c.codigo).filter(n => n).join(', ') || '';
    };

    const handlePrev = () => {
        if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
        else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
        else setCurrentDate(addDays(currentDate, -1));
    };

    const handleNext = () => {
        if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
        else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
        else setCurrentDate(addDays(currentDate, 1));
    };

    const handleSaveNote = async () => {
        if (!selectedEvent) return;
        try {
            const collectionName = selectedEvent.type === 'pedido' ? "pedidos_medicos" : "ordenes_internacion";
            await updateDoc(doc(db, collectionName, selectedEvent.id), {
                anotacionCalendario: tempNote
            });
            setIsEditingNote(false);
            setSelectedEvent(prev => ({ ...prev, anotacionCalendario: tempNote }));
        } catch (error) {
            console.error("Error saving note:", error);
            alert("Error al guardar la anotación");
        }
    };

    const renderHeader = () => {
        let title = "";
        if (view === 'month') title = format(currentDate, 'MMMM yyyy', { locale: es });
        else if (view === 'week') {
            const start = startOfWeek(currentDate, { weekStartsOn: 1 });
            const end = addDays(start, 6);
            title = `${format(start, 'd')} - ${format(end, "d 'de' MMMM", { locale: es })}`;
        } else {
            title = format(currentDate, "eeee d 'de' MMMM", { locale: es });
        }

        return (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200 text-white">
                        <CalendarIcon size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 capitalize leading-tight">
                            {title}
                        </h2>
                        <p className="text-sm font-medium text-slate-500">Cronograma de Cirugías</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                        <button
                            onClick={() => setView('month')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <CalendarDays size={14} /> Mes
                        </button>
                        <button
                            onClick={() => setView('week')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <CalendarRange size={14} /> Semana
                        </button>
                        <button
                            onClick={() => setView('day')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'day' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <CalendarSingle size={14} /> Día
                        </button>
                    </div>

                    <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block" />

                    <div className="flex gap-2">
                        <button onClick={handlePrev} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                        >
                            Hoy
                        </button>
                        <button onClick={handleNext} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const handleSlotClick = (day, hour) => {
        const formattedDate = format(day, "yyyy-MM-dd");
        const formattedHour = format(hour, "HH:mm");
        onNavigate('ordenes', { fechaCirugia: formattedDate, horaCirugia: formattedHour });
    };

    const renderMonthView = () => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

        const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const grid = [];
        let day = startDate;

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                const cloneDay = day;
                const dayEvents = events.filter(e => e.fechaCirugia && isSameDay(parseISO(e.fechaCirugia), cloneDay));

                grid.push(
                    <div
                        key={day.toString()}
                        onClick={() => { setView('day'); setCurrentDate(cloneDay); }}
                        className={`min-h-[140px] bg-white border border-slate-50 p-2 transition-all relative group
                        ${!isSameMonth(day, monthStart) ? 'bg-slate-50/50 opacity-30 shadow-inner' : ''}
                        ${isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''}
                        hover:bg-slate-50 cursor-pointer`}
                    >
                        <div className="flex justify-between items-center mb-2">
                            <span className={`text-xs font-black w-7 h-7 flex items-center justify-center rounded-xl ${isSameDay(day, new Date()) ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                {format(day, "d")}
                            </span>
                            {dayEvents.length > 0 && (
                                <span className="text-[9px] font-black bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-500">{dayEvents.length}</span>
                            )}
                        </div>

                        <div className="space-y-1">
                            {dayEvents.slice(0, 4).map((event, idx) => {
                                const practices = getPracticesSummary(event);
                                const initials = getInitials(event.profesional);
                                // Format: [Initials] Name (Ins) - Proc | Note
                                const content = `[${initials}] ${event.afiliado} (${event.obraSocial}) - ${practices} ${event.anotacionCalendario ? '| ' + event.anotacionCalendario : ''}`;

                                return (
                                    <div
                                        key={idx}
                                        title={content}
                                        className={`text-[9px] px-2 py-1 rounded-lg truncate font-bold border ${event.status === 'auditada'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                            : 'bg-blue-50 text-blue-700 border-blue-100'}`}
                                    >
                                        <span className="opacity-60 mr-1">{event.horaCirugia}</span>
                                        {content}
                                    </div>
                                );
                            })}
                            {dayEvents.length > 4 && (
                                <p className="text-[9px] text-slate-400 font-black pl-1 italic">+ {dayEvents.length - 4} más</p>
                            )}
                        </div>
                    </div>
                );
                day = addDays(day, 1);
            }
        }

        return (
            <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-200">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                    {days.map(d => (
                        <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-4 border-r last:border-0 border-slate-100">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {grid}
                </div>
            </div>
        );
    };

    const renderTimeGrid = () => {
        const viewDays = view === 'week'
            ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), i))
            : [currentDate];

        return (
            <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-200 flex flex-col h-[700px]">
                {/* Fixed Header */}
                <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                    <div className="w-20 shrink-0 border-r border-slate-100" />
                    {viewDays.map((d, i) => (
                        <div key={i} className={`flex-1 text-center py-4 border-r last:border-0 border-slate-100 ${isSameDay(d, new Date()) ? 'bg-blue-50/50' : ''}`}>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{format(d, "eee", { locale: es })}</p>
                            <p className={`text-xl font-black ${isSameDay(d, new Date()) ? 'text-blue-600' : 'text-slate-800'}`}>{format(d, "d")}</p>
                        </div>
                    ))}
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto relative custom-scrollbar">
                    {hours.map((hour, hIdx) => (
                        <div key={hIdx} className="flex border-b border-slate-50 group">
                            <div className="w-20 shrink-0 border-r border-slate-100 p-2 text-right">
                                <span className="text-[10px] font-black text-slate-400 font-mono">{format(hour, "HH:mm")}</span>
                            </div>
                            {viewDays.map((d, dIdx) => {
                                const dayEvents = events.filter(e =>
                                    e.fechaCirugia &&
                                    isSameDay(parseISO(e.fechaCirugia), d) &&
                                    e.horaCirugia?.startsWith(format(hour, "HH"))
                                );

                                return (
                                    <div
                                        key={dIdx}
                                        onClick={(e) => {
                                            if (e.target === e.currentTarget) handleSlotClick(d, hour);
                                        }}
                                        className={`flex-1 border-r last:border-0 border-slate-50 min-h-[80px] relative p-1 transition-colors hover:bg-blue-50/20 ${isSameDay(d, new Date()) ? 'bg-blue-50/10' : ''}`}
                                    >
                                        {dayEvents.map(event => {
                                            const initials = getInitials(event.profesional);
                                            const practices = getPracticesSummary(event);

                                            return (
                                                <div
                                                    key={event.id}
                                                    onClick={() => {
                                                        setSelectedEvent(event);
                                                        setTempNote(event.anotacionCalendario || '');
                                                    }}
                                                    className={`mb-1 p-2 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg shadow-sm
                                                    ${event.status === 'auditada'
                                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            : 'bg-blue-50 text-blue-800 border-blue-200'}`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[9px] font-black uppercase tracking-tighter opacity-60 flex items-center gap-1">
                                                            <Clock size={10} /> {event.horaCirugia} hs
                                                        </span>
                                                        <div className="flex gap-1">
                                                            {event.salaCirugia && (
                                                                <span className="text-[9px] font-black bg-white/50 px-1 rounded flex items-center gap-0.5">
                                                                    <MapPin size={8} /> {event.salaCirugia}
                                                                </span>
                                                            )}
                                                            <span className="text-[9px] font-black bg-amber-500 text-white px-1.5 rounded-md uppercase tracking-tighter shadow-sm">{initials}</span>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className="text-xs font-black leading-tight">
                                                            {event.afiliado} <span className="opacity-50 font-bold">({event.obraSocial})</span>
                                                        </p>
                                                        <p className="text-[10px] font-bold text-slate-600 truncate uppercase tracking-tight">
                                                            {practices}
                                                        </p>
                                                        {event.anotacionCalendario && (
                                                            <p className="text-[9px] font-black text-blue-600 bg-blue-100/50 px-1.5 py-0.5 rounded-lg flex items-center gap-1 mt-1 truncate">
                                                                <StickyNote size={8} /> {event.anotacionCalendario}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {renderHeader()}

            {view === 'month' ? renderMonthView() : renderTimeGrid()}

            {/* Quick Event Info Sidebar/Modal */}
            {selectedEvent && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-end p-4 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md h-full md:h-auto md:max-h-[95vh] rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col animate-in slide-in-from-right duration-500">
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            <div className="flex justify-between items-start mb-8">
                                <div className={`px-4 py-1.5 rounded-2xl text-xs font-black uppercase tracking-widest ${selectedEvent.status === 'auditada' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {selectedEvent.status || 'pendiente'}
                                </div>
                                <button
                                    onClick={() => setSelectedEvent(null)}
                                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                                >
                                    <Plus className="rotate-45" size={24} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-3xl font-black text-slate-800 leading-tight mb-2">{selectedEvent.afiliado}</h3>
                                    <div className="flex flex-wrap items-center gap-4 text-slate-500 font-medium">
                                        <div className="flex items-center gap-2">
                                            <CalendarIcon size={16} />
                                            <span>{format(parseISO(selectedEvent.fechaCirugia), "eeee d 'de' MMMM", { locale: es })}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock size={16} />
                                            <span>{selectedEvent.horaCirugia} hs</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Obra Social</p>
                                        <p className="font-bold text-slate-700">{selectedEvent.obraSocial}</p>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quirófano / Sala</p>
                                        <p className="font-bold text-slate-700">{selectedEvent.salaCirugia || '-'}</p>
                                    </div>
                                </div>

                                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 group relative">
                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5"><StickyNote size={12} /> Anotación Especial</span>
                                        {!isEditingNote && (
                                            <button
                                                onClick={() => setIsEditingNote(true)}
                                                className="text-[9px] hover:underline"
                                            >
                                                Editar
                                            </button>
                                        )}
                                    </p>

                                    {isEditingNote ? (
                                        <div className="space-y-3">
                                            <textarea
                                                value={tempNote}
                                                onChange={(e) => setTempNote(e.target.value)}
                                                className="w-full bg-white border-2 border-amber-200 rounded-xl p-3 text-sm font-medium focus:ring-4 focus:ring-amber-100 outline-none"
                                                rows={3}
                                                autoFocus
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveNote}
                                                    className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-amber-200"
                                                >
                                                    <Save size={14} /> Guardar
                                                </button>
                                                <button
                                                    onClick={() => setIsEditingNote(false)}
                                                    className="px-4 py-2 text-slate-500 text-xs font-bold"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm font-bold text-slate-700 leading-relaxed">
                                            {selectedEvent.anotacionCalendario || <span className="opacity-40 italic font-medium">Sin anotaciones adicionales.</span>}
                                        </p>
                                    )}
                                </div>

                                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                            <User size={24} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Profesional</p>
                                            <p className="text-lg font-black text-slate-800">{selectedEvent.profesional}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnóstico / Práctica</p>
                                        <p className="text-sm font-bold text-slate-600 truncate">
                                            {getPracticesSummary(selectedEvent)}
                                        </p>
                                        <p className="text-xs font-medium text-slate-500 italic mt-2">"{selectedEvent.diagnostico || 'Sin diagnóstico especificado'}"</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 rounded-b-[2.5rem] border-t border-slate-100 flex gap-4">
                            <button
                                onClick={() => {
                                    onNavigate('ordenes', selectedEvent);
                                }}
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-slate-200 hover:bg-black transition-all flex items-center justify-center gap-2"
                            >
                                Editar Orden Completa <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarView;
