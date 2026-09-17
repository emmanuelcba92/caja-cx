import React, { useMemo, useCallback, useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { Home, PlusCircle, Calendar as CalendarIcon, ExternalLink, Download, Share2, Check } from 'lucide-react';
import { SEED_SURGERIES } from './data/seedData';
import { generateGoogleCalendarUrl, downloadICS } from './services/calendarSyncService';

const STATUS_COLORS = {
  SOLICITADA: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  CODIFICADA: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  ENVIADA: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  AUTORIZADA: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  RECHAZADA: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
  CANCELADA: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
};

function CalendarioView({ 
  surgeries: surgeriesProp, 
  onOpenForm, 
  onEditSurgery, 
  onDragSurgery, 
  currentUser, 
  restrictDrag, 
  onNewSurgery,
  enableGoogleCalendarSync: enableGoogleCalendarSyncProp
}) {
  const enableGoogleCalendarSync = enableGoogleCalendarSyncProp !== undefined 
    ? enableGoogleCalendarSyncProp 
    : (() => {
        try { return localStorage.getItem('enable_google_calendar_sync') !== 'false'; } catch { return true; }
      })();
  const [calendarViewMode, setCalendarViewMode] = useState('app'); // 'app' | 'google'
  const googleCalendarEmbedUrl = "https://calendar.google.com/calendar/embed?src=978c1c21162645dd21e602d914ca7ac143f1388f8654aab9969df4496cdb2e73%40group.calendar.google.com&ctz=America%2FArgentina%2FCordoba";

  const [surgeries, setSurgeries] = useState(() => {
    if (surgeriesProp) return surgeriesProp;
    try {
      const saved = localStorage.getItem('surgeries_proto');
      if (saved) return JSON.parse(saved);
    } catch {}
    return SEED_SURGERIES;
  });
  const events = useMemo(() => {
    return (surgeries || []).map(s => {
      const colors = STATUS_COLORS[s.estado] || STATUS_COLORS.SOLICITADA;
      const startTime = s.horaInicio ? `${s.fecha}T${s.horaInicio}` : `${s.fecha}T08:00`;
      const endTime = s.horaFin ? `${s.fecha}T${s.horaFin}` : `${s.fecha}T09:00`;
      
      const codes = (s.codigosAuditados || s.codigos || '').split('\n').filter(c => c.trim()).join(', ');
      const age = s.edad ? `${s.edad}A` : '';
      
      let titleParts = [];
      const isEstudio = s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia;
      if (isEstudio) titleParts.push('[ESTUDIO]');
      if (s.habitacion) titleParts.push(s.habitacion);
      titleParts.push(s.paciente);
      if (s.obraSocial) titleParts.push(s.obraSocial);
      if (age) titleParts.push(age);
      if (codes) titleParts.push(codes);
      if (s.nombreProfesional) titleParts.push(s.nombreProfesional);

      const canDrag = !restrictDrag || s.creador === currentUser?.nombre;

      return {
        id: String(s.id),
        title: titleParts.join(' · '),
        start: startTime,
        end: endTime,
        backgroundColor: 'transparent',
        borderColor: colors.border.replace('border-', ''),
        textColor: colors.text.replace('text-', ''),
        editable: canDrag,
        eventStartEditable: canDrag,
        extendedProps: {
          surgery: s,
          colors: colors,
          canDrag: canDrag,
        },
      };
    });
  }, [surgeries, restrictDrag, currentUser]);

  const handleDateSelect = useCallback((info) => {
    const dateStr = info.startStr.split('T')[0];
    const timeStr = info.startStr.split('T')[1]?.substring(0, 5) || '';
    onOpenForm(dateStr, timeStr);
  }, [onOpenForm]);

  const handleEventClick = useCallback((info) => {
    info.jsEvent.preventDefault();
    const surgery = info.event.extendedProps.surgery;
    if (onEditSurgery && surgery) {
      onEditSurgery(surgery);
    }
  }, [onEditSurgery]);

  const handleEventDrop = useCallback((info) => {
    const surgery = info.event.extendedProps.surgery;
    if (!surgery || !onDragSurgery) return;
    const newStart = info.event.start;
    const newEnd = info.event.end;
    const newFecha = newStart.toISOString().split('T')[0];
    const newHoraInicio = `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`;
    const newHoraFin = newEnd ? `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}` : '';
    onDragSurgery(surgery.id, newFecha, newHoraInicio, newHoraFin);
  }, [onDragSurgery]);

  const eventContent = (eventInfo) => {
    const { surgery, colors, canDrag } = eventInfo.event.extendedProps;
    const time = eventInfo.timeText;
    
    return (
      <div className={`flex flex-col px-1.5 py-1 rounded-lg text-[10px] leading-tight ${colors.bg} ${colors.text} ${colors.border} border min-h-[36px] ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}>
        <div className="flex items-center gap-1 font-bold truncate">
          <span className="whitespace-nowrap">{time}</span>
          {surgery.habitacion && (
            <span className="flex items-center gap-0.5 bg-white/50 px-1 rounded text-[9px] font-bold">
              <Home size={9} /> {surgery.habitacion}
            </span>
          )}
        </div>
        <p className="font-bold truncate">{surgery.paciente}</p>
        <div className="flex items-center gap-1 text-[9px] flex-wrap opacity-80">
          {surgery.obraSocial && <span>{surgery.obraSocial}</span>}
          {surgery.edad && <span>{surgery.edad}A</span>}
        </div>
        {(surgery.codigosAuditados || surgery.codigos) && (
          <p className="text-[9px] truncate opacity-70">{(surgery.codigosAuditados || surgery.codigos).split('\n').filter(c=>c.trim()).join(', ')}</p>
        )}
        <div className="flex items-center justify-between mt-1 pt-1 border-t border-black/5">
          {surgery.nombreProfesional && (
            <p className="text-[9px] truncate opacity-80 font-medium flex-1">
              {surgery.nombreProfesional}{surgery.residente ? ` (Res: ${surgery.residente})` : ''}
            </p>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const url = generateGoogleCalendarUrl(surgery);
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
            }}
            className="p-0.5 ml-1 bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-600 rounded transition-all shadow-xs"
            title="Abrir / Sincronizar con Google Calendar"
          >
            <ExternalLink size={10} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-140px)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
            <CalendarIcon size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Calendario de Cirugías</h3>
            <p className="text-[11px] text-slate-400">Haga clic en un casillero o use el botón para programar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de Vista: Calendario COAT vs Google Calendar */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setCalendarViewMode('app')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                calendarViewMode === 'app'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Calendario COAT
            </button>
            <button
              onClick={() => setCalendarViewMode('google')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                calendarViewMode === 'google'
                  ? 'bg-white text-emerald-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ExternalLink size={12} />
              <span>Google Calendar</span>
            </button>
          </div>

          {enableGoogleCalendarSync && (
            <button
              onClick={() => {
                const mySurgeries = (surgeries || []).filter(s => {
                  if (!currentUser) return true;
                  const myName = (currentUser.nombre || '').toLowerCase();
                  const myEmail = (currentUser.email || '').toLowerCase();
                  return (
                    (s.nombreProfesional || '').toLowerCase().includes(myName) ||
                    (s.emailProfesional || '').toLowerCase() === myEmail ||
                    (s.creador || '').toLowerCase().includes(myName)
                  );
                });

                if (mySurgeries.length === 0) {
                  alert("No hay cirugías programadas para sincronizar en este momento.");
                  return;
                }

                // Generar y descargar el archivo ICS con todas las cirugías del profesional
                const uid = `coat-all-${Date.now()}@coat.com.ar`;
                const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                
                const eventsICS = mySurgeries.map(s => {
                  const start = s.fecha ? `${s.fecha.replace(/-/g, '')}T${(s.horaInicio || '08:00').replace(/:/g, '').substring(0, 4)}00` : '';
                  const end = s.fecha ? `${s.fecha.replace(/-/g, '')}T${(s.horaFin || '09:00').replace(/:/g, '').substring(0, 4)}00` : '';
                  return [
                    'BEGIN:VEVENT',
                    `UID:surgery-${s.id}-${uid}`,
                    `DTSTAMP:${now}`,
                    `DTSTART:${start}`,
                    `DTEND:${end}`,
                    `SUMMARY:Cirugía: ${s.paciente || 'Paciente'} - COAT`,
                    `DESCRIPTION:Paciente: ${s.paciente}\\nDNI: ${s.dni || ''}\\nObra Social: ${s.obraSocial || ''}\\nCirujano: ${s.nombreProfesional || ''}\\nDiagnóstico: ${s.justificacion || ''}`,
                    `LOCATION:${s.habitacion ? `COAT - ${s.habitacion}` : 'Clínica COAT'}`,
                    'STATUS:CONFIRMED',
                    'END:VEVENT'
                  ].join('\r\n');
                }).join('\r\n');

                const icsFile = [
                  'BEGIN:VCALENDAR',
                  'VERSION:2.0',
                  'PRODID:-//COAT//Cirugias Calendar//ES',
                  'CALSCALE:GREGORIAN',
                  eventsICS,
                  'END:VCALENDAR'
                ].join('\r\n');

                const blob = new Blob([icsFile], { type: 'text/calendar;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Agenda_Cirugias_COAT.ics`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              title="Descargar agenda para importar en Google Calendar"
            >
              <CalendarIcon size={14} className="text-emerald-600" />
              <span>Importar en Google Calendar</span>
            </button>
          )}
          {onNewSurgery && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onNewSurgery('CIRUGIA')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                title="Crear nueva solicitud de cirugía"
              >
                <PlusCircle size={14} />
                <span>Nueva Cirugía</span>
              </button>
              <button
                onClick={() => onNewSurgery('ESTUDIO')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                title="Crear nueva solicitud de estudio bajo anestesia"
              >
                <PlusCircle size={14} />
                <span>Nuevo Estudio</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-1">
        {calendarViewMode === 'google' ? (
          <div className="w-full h-full flex flex-col bg-white rounded-xl overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium">
              <span>Vista en tiempo real de Google Calendar (Modo solo lectura)</span>
              <a 
                href={googleCalendarEmbedUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
              >
                Abrir en Google Calendar <ExternalLink size={12} />
              </a>
            </div>
            <iframe 
              src={googleCalendarEmbedUrl} 
              style={{ border: 0, width: '100%', height: '100%' }} 
              frameBorder="0" 
              scrolling="no"
              title="Google Calendar de la Clínica"
            />
          </div>
        ) : (
          <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale={esLocale}
          selectable={true}
          selectMirror={true}
          selectLongPressDelay={500}
          unselectCancel={'.fc-event'}
          editable={true}
          eventStartEditable={true}
          eventDurationEditable={true}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,dayGridMonth'
          }}
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          scrollTime="08:00:00"
          slotDuration="00:30:00"
          slotLabelInterval="01:00:00"
          allDaySlot={false}
          expandRows={true}
          height="100%"
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={eventContent}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric', month: 'short' }}
            buttonText={{
              today: 'Hoy',
              month: 'Mes',
              week: 'Semana',
              day: 'Día',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default CalendarioView;