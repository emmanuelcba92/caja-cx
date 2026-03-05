import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, getDoc, doc, updateDoc } from 'firebase/firestore';
import { apiService } from '../services/apiService';
import { useAuth } from '../context/AuthContext';
import OrdenesView from './OrdenesView';
import {
    ChevronLeft, ChevronRight, User, Clock, CheckCircle2,
    AlertCircle, FileText, ArrowRight, Calendar as CalendarIcon,
    Home, Layout, Plus, MapPin, Search, Maximize2, Minimize2,
    CalendarDays, CalendarRange, Calendar as CalendarSingle,
    StickyNote, Save, Pencil, Trash2, X, Ban
} from 'lucide-react';
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays,
    parseISO, startOfDay, eachHourOfInterval, addWeeks, subWeeks,
    isSameWeek, setHours, setMinutes
} from 'date-fns';
import { es } from 'date-fns/locale';

const CalendarView = ({ onNavigate }) => {
    const { viewingUid, catalogOwnerUid, isSuperAdmin, currentUser, linkedProfesionalName } = useAuth();
    const [view, setView] = useState('month'); // 'month', 'week', 'day'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [tempNote, setTempNote] = useState('');
    const [draggingEvent, setDraggingEvent] = useState(null);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [orderDraft, setOrderDraft] = useState(null);

    // Business Hours
    const START_HOUR = 7;
    const END_HOUR = 21;
    const hours = eachHourOfInterval({
        start: setHours(startOfDay(new Date()), START_HOUR),
        end: setHours(startOfDay(new Date()), END_HOUR)
    });

    const fetchEvents = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        setLoading(true);
        try {
            const items = await apiService.getCollection("ordenes_internacion", { userId: ownerToUse });
            setEvents(items);
        } catch (error) {
            console.error("Error fetching calendar events:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, [viewingUid, catalogOwnerUid]);

    const getInitials = (name) => {
        if (!name) return '';
        // Remove common titles
        const cleanName = name.replace(/^(Dr\.|Dra\.|Dr|Dra|Lic\.|Lic)\s+/i, '').trim();
        const parts = cleanName.split(' ').filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return parts[0] ? parts[0].substring(0, 2).toUpperCase() : '';
    };

    const getPracticesSummary = (event) => {
        if (event.type === 'pedido') {
            return event.practicas?.filter(p => p).join(', ') || '';
        }
        return event.codigosCirugia?.map(c => c.codigo).filter(n => n).join(', ') || '';
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
            await apiService.updateDocument(collectionName, selectedEvent.id, {
                anotacionCalendario: tempNote
            });
            setIsEditingNote(false);
            setSelectedEvent(prev => ({ ...prev, anotacionCalendario: tempNote }));
            fetchEvents();
        } catch (error) {
            console.error("Error saving note:", error);
            alert("Error al guardar la anotación");
        }
    };

    const handleUpdateSala = async (sala) => {
        if (!selectedEvent) return;
        try {
            const collectionName = selectedEvent.type === 'pedido' ? "pedidos_medicos" : "ordenes_internacion";
            await apiService.updateDocument(collectionName, selectedEvent.id, {
                salaCirugia: sala
            });
            setSelectedEvent(prev => ({ ...prev, salaCirugia: sala }));
            fetchEvents();
        } catch (error) {
            console.error("Error updating sala:", error);
            alert("Error al actualizar la sala");
        }
    };

    const handleDragStart = (e, event) => {
        setDraggingEvent(event);
        e.dataTransfer.setData("text/plain", event.id);
        e.dataTransfer.effectAllowed = "move";
        // Ghost image styling or custom element if needed
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e, date, hour) => {
        e.preventDefault();
        if (!draggingEvent) return;

        const formattedDate = format(date, "yyyy-MM-dd");
        const formattedHour = hour ? format(hour, "HH:mm") : "";

        try {
            const collectionName = draggingEvent.type === 'pedido' ? "pedidos_medicos" : "ordenes_internacion";
            await apiService.updateDocument(collectionName, draggingEvent.id, {
                fechaCirugia: formattedDate,
                horaCirugia: formattedHour,
                ultimaModificacion: {
                    por: linkedProfesionalName || currentUser?.displayName || currentUser?.email || 'Administrador',
                    fecha: new Date().toISOString(),
                    accion: 'Reprogramó cirugía desde Calendario'
                }
            });
            setDraggingEvent(null);
            fetchEvents();
        } catch (error) {
            console.error("Error moving event:", error);
            alert("Error al mover el evento");
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

                    <div className="flex gap-2 items-center">
                        <button onClick={handlePrev} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                            <ChevronLeft size={20} />
                        </button>
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                            <button
                                onClick={() => setCurrentDate(new Date())}
                                className="px-4 py-1.5 hover:bg-slate-50 rounded-lg font-black text-xs uppercase tracking-widest transition-all"
                            >
                                Hoy
                            </button>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={format(currentDate, "yyyy-MM-dd")}
                                    onChange={(e) => {
                                        if (e.target.value) setCurrentDate(parseISO(e.target.value));
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                    title="Elegir fecha"
                                />
                                <div className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                                    <CalendarIcon size={18} />
                                </div>
                            </div>
                        </div>
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

        const dateDisplay = format(day, "dd/MM/yyyy");
        if (!window.confirm(`¿Desea crear una nueva orden para el día ${dateDisplay}?`)) return;

        setOrderDraft({ fechaCirugia: formattedDate, horaCirugia: formattedHour });
        setShowOrderModal(true);
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
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, cloneDay, null)}
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
                                const notation = event.anotacionCalendario ? `[${event.anotacionCalendario.trim()}] ` : '';
                                const edadStr = event.edad ? ` (${event.edad} años)` : '';
                                const content = `${notation}${event.afiliado}${edadStr}. ${event.obraSocial}. ${practices}. ${initials}`;

                                return (
                                    <div
                                        key={idx}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, event)}
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
                    {/* Eventos sin horario específico */}
                    <div className="flex border-b-2 border-slate-100 bg-slate-50/50 min-h-[60px]">
                        <div className="w-20 shrink-0 border-r border-slate-100 p-2 text-right flex items-center justify-end bg-slate-100/50">
                            <span className="text-[10px] font-black text-slate-500 leading-tight">SIN<br />HORA</span>
                        </div>
                        {viewDays.map((d, dIdx) => {
                            const dayEventsNoHour = events.filter(e =>
                                e.fechaCirugia &&
                                isSameDay(parseISO(e.fechaCirugia), d) &&
                                (!e.horaCirugia || e.horaCirugia === '')
                            );

                            return (
                                <div
                                    key={dIdx}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, d, null)}
                                    onClick={(e) => {
                                        if (e.target === e.currentTarget) {
                                            const dateDisplay = format(d, "dd/MM/yyyy");
                                            if (window.confirm(`¿Desea crear una nueva orden para el día ${dateDisplay}?`)) {
                                                setOrderDraft({ fechaCirugia: format(d, "yyyy-MM-dd") });
                                                setShowOrderModal(true);
                                            }
                                        }
                                    }}
                                    className={`flex-1 border-r last:border-0 border-slate-100 relative p-1 transition-colors hover:bg-blue-50/20 ${isSameDay(d, new Date()) ? 'bg-blue-50/10' : ''} flex flex-wrap gap-1 content-start`}
                                >
                                    {dayEventsNoHour.map(event => {
                                        const initials = getInitials(event.profesional);
                                        const practices = getPracticesSummary(event);

                                        return (
                                            <div
                                                key={event.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, event)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedEvent(event);
                                                    setTempNote(event.anotacionCalendario || '');
                                                }}
                                                className="p-2 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg shadow-sm bg-amber-50 text-amber-900 border-amber-200 min-w-[120px] flex-1 max-w-full"
                                            >
                                                <div className="flex items-center justify-between mb-1 text-[9px] font-black uppercase tracking-tighter">
                                                    <span className="opacity-60">Pendiente</span>
                                                </div>
                                                <div className="text-[10px] font-bold leading-tight break-words line-clamp-3">
                                                    {event.anotacionCalendario ? `[${event.anotacionCalendario.trim()}] ` : ''}
                                                    {event.afiliado}{event.edad ? ` (${event.edad} años)` : ''}. {event.obraSocial}. {practices}. {initials}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                    {hours.map((hour, hIdx) => (
                        <div key={hIdx} className="flex border-b border-slate-50 group">
                            <div className="w-20 shrink-0 border-r border-slate-100 p-2 text-right">
                                <span className="text-[10px] font-black text-slate-400 font-mono">{format(hour, "HH:mm")}</span>
                            </div>
                            {viewDays.map((d, dIdx) => {
                                const dayEvents = events.filter(e =>
                                    e.fechaCirugia &&
                                    isSameDay(parseISO(e.fechaCirugia), d)
                                );

                                const hourString = format(hour, "HH");
                                const is16 = hourString === '16';

                                const hourEvents = dayEvents.filter(e => {
                                    if (e.suspendida) return is16;
                                    return e.horaCirugia?.startsWith(hourString);
                                });

                                // Sort cancelled ones to the bottom of the 16:00 slot
                                const sortedEvents = [...hourEvents].sort((a, b) => {
                                    if (a.suspendida && !b.suspendida) return 1;
                                    if (!a.suspendida && b.suspendida) return -1;
                                    return 0;
                                });

                                return (
                                    <div
                                        key={dIdx}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, d, hour)}
                                        onClick={(e) => {
                                            if (e.target === e.currentTarget) handleSlotClick(d, hour);
                                        }}
                                        className={`flex-1 border-r last:border-0 border-slate-50 min-h-[80px] relative p-1 transition-colors hover:bg-blue-50/20 ${isSameDay(d, new Date()) ? 'bg-blue-50/10' : ''}`}
                                    >
                                        {sortedEvents.map(event => {
                                            const initials = getInitials(event.profesional);
                                            const practices = getPracticesSummary(event);

                                            return (
                                                <div
                                                    key={event.id}
                                                    draggable={!event.suspendida}
                                                    onDragStart={(e) => handleDragStart(e, event)}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedEvent(event);
                                                        setTempNote(event.anotacionCalendario || '');
                                                    }}
                                                    className={`mb-1 p-2 rounded-xl border-l-4 cursor-pointer transition-all hover:brightness-95 shadow-sm
                                                    ${view === 'day' ? 'w-full' : 'max-w-full'}
                                                    ${event.suspendida
                                                            ? 'bg-slate-100 text-slate-400 border-slate-300 opacity-60'
                                                            : event.status === 'auditada'
                                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-500'
                                                                : 'bg-blue-50 text-blue-800 border-blue-500'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`text-[9px] font-black uppercase tracking-tighter opacity-70 flex items-center gap-1 ${event.suspendida ? 'hidden' : ''}`}>
                                                            <Clock size={10} /> {event.horaCirugia}
                                                        </span>
                                                        {event.suspendida && (
                                                            <span className="text-[9px] font-black uppercase tracking-tighter text-red-400 flex items-center gap-1">
                                                                <Ban size={10} /> Cancelada
                                                            </span>
                                                        )}
                                                        <div className="flex gap-1">
                                                            {event.salaCirugia && !event.suspendida && (
                                                                <span className="text-[9px] font-black bg-white/60 px-1 rounded flex items-center gap-0.5">
                                                                    <MapPin size={8} /> {event.salaCirugia}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className={`text-[10px] font-bold leading-tight ${event.suspendida ? 'line-through opacity-60' : ''} ${view === 'day' ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>
                                                        {event.anotacionCalendario && !event.suspendida ? `[${event.anotacionCalendario.trim()}] ` : ''}
                                                        {event.afiliado}{event.edad ? ` (${event.edad} años)` : ''}. {event.obraSocial}. {practices}. {initials}
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

            {/* Google Calendar Style Quick Info Popup */}
            {selectedEvent && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedEvent(null)} />

                    <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                        {/* Header with color indicator */}
                        <div className={`h-2 ${selectedEvent.status === 'auditada' ? 'bg-emerald-500' : 'bg-blue-600'}`} />

                        <div className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-slate-800 leading-tight">
                                        {selectedEvent.afiliado}
                                        {selectedEvent.edad && <span className="text-sm font-medium text-slate-500 ml-2">({selectedEvent.edad} años)</span>}
                                    </h3>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        <Clock size={12} />
                                        <span>{selectedEvent.horaCirugia || 'Sin hora'} • {format(parseISO(selectedEvent.fechaCirugia), "d 'de' MMM", { locale: es })}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onNavigate('ordenes', selectedEvent)}
                                        className="p-2.5 bg-slate-100 text-slate-600 rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        title="Editar orden"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={() => setSelectedEvent(null)}
                                        className="p-2.5 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 transition-all"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Profesional a cargo</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedEvent.profesional}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">Obra Social</p>
                                        <p className="text-xs font-bold text-slate-700">{selectedEvent.obraSocial}</p>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                            <MapPin size={12} /> Quirófano / Sala
                                        </p>
                                        <div className="flex items-center gap-2">
                                            {['A', 'B', 'C'].map(s => (
                                                <button
                                                    key={s}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUpdateSala(s);
                                                    }}
                                                    className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all border-2 shadow-sm
                                                        ${selectedEvent.salaCirugia === s
                                                            ? 'bg-blue-600 text-white border-blue-600 scale-105'
                                                            : 'bg-white text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-500'
                                                        }`}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleUpdateSala('');
                                                }}
                                                className={`p-2.5 rounded-xl text-slate-300 border-2 border-slate-100 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all ${!selectedEvent.salaCirugia ? 'opacity-0 pointer-events-none' : ''}`}
                                                title="Limpiar sala"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-tighter mb-2 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5"><StickyNote size={10} /> Prácticas y Diagnóstico</span>
                                    </p>
                                    <p className="text-xs font-bold text-slate-600 leading-relaxed mb-1">
                                        {getPracticesSummary(selectedEvent)}
                                    </p>
                                    <p className="text-[10px] font-medium text-slate-400 italic">
                                        "{selectedEvent.diagnostico || 'Sin diagnóstico'}"
                                    </p>
                                </div>

                                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 group relative">
                                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-tighter mb-2 flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 uppercase select-none">Nota para Calendario (Citación)</span>
                                        {!isEditingNote && (
                                            <button
                                                onClick={() => {
                                                    setTempNote(selectedEvent.anotacionCalendario || '');
                                                    setIsEditingNote(true);
                                                }}
                                                className="text-[9px] hover:underline flex items-center gap-1"
                                            >
                                                <Pencil size={10} /> Editar
                                            </button>
                                        )}
                                    </p>

                                    {isEditingNote ? (
                                        <div className="space-y-3">
                                            <textarea
                                                value={tempNote}
                                                onChange={(e) => setTempNote(e.target.value)}
                                                placeholder="Ej: Citar 7:30 hs..."
                                                className="w-full bg-white border-2 border-amber-200 rounded-xl p-3 text-xs font-bold text-slate-700 focus:ring-4 focus:ring-amber-100 outline-none"
                                                rows={2}
                                                autoFocus
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSaveNote}
                                                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-amber-200"
                                                >
                                                    <Save size={12} /> Guardar Nota
                                                </button>
                                                <button
                                                    onClick={() => setIsEditingNote(false)}
                                                    className="px-3 py-1.5 text-slate-500 text-[10px] font-black uppercase"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs font-bold text-amber-900 leading-relaxed">
                                            {selectedEvent.anotacionCalendario || <span className="opacity-40 italic font-medium">Sin indicaciones de citación.</span>}
                                        </p>
                                    )}
                                </div>
                                {selectedEvent.ultimaModificacion && (
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-start gap-2">
                                        <Clock size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{selectedEvent.ultimaModificacion.accion}</p>
                                            <p className="text-xs font-bold text-slate-600">
                                                {selectedEvent.ultimaModificacion.por} <span className="font-normal text-[10px] text-slate-400">• {selectedEvent.ultimaModificacion.fecha ? format(parseISO(selectedEvent.ultimaModificacion.fecha), "dd/MM/yyyy HH:mm") : ''}</span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={() => onNavigate('ordenes', selectedEvent)}
                            className="w-full py-4 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest border-t border-slate-800 hover:bg-black transition-all flex items-center justify-center gap-2"
                        >
                            Ver Detalles Médicos <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}
            {/* NEW ORDER MODAL INLINE */}
            {showOrderModal && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-4xl max-h-[95vh] overflow-hidden relative">
                        <OrdenesView
                            modalMode
                            draftData={orderDraft}
                            onClose={() => {
                                setShowOrderModal(false);
                                setOrderDraft(null);
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarView;
