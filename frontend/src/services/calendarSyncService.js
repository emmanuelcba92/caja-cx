/**
 * Servicio de sincronización y generación de eventos para Google Calendar.
 */

/**
 * Formatear fecha y hora para estándar iCalendar (YYYYMMDDTHHmmss)
 */
export const formatToICSDate = (dateStr, timeStr) => {
  if (!dateStr) return '';
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = (timeStr || '08:00').replace(/:/g, '').substring(0, 4) + '00';
  return `${cleanDate}T${cleanTime}`;
};

/**
 * Genera la URL para agregar directamente a Google Calendar en 1 clic
 */
export const generateGoogleCalendarUrl = (surgery) => {
  if (!surgery) return '';
  const title = encodeURIComponent(`Cirugía: ${surgery.paciente || 'Paciente'} - COAT`);
  
  const startIso = formatToICSDate(surgery.fecha, surgery.horaInicio || '08:00');
  const endIso = formatToICSDate(surgery.fecha, surgery.horaFin || '09:00');
  const dates = `${startIso}/${endIso}`;

  const details = encodeURIComponent(
    `Paciente: ${surgery.paciente || ''}\n` +
    `DNI: ${surgery.dni || ''}\n` +
    `Obra Social: ${surgery.obraSocial || ''}\n` +
    `Cirujano: ${surgery.nombreProfesional || ''}\n` +
    (surgery.residente ? `Residente: ${surgery.residente}\n` : '') +
    `Diagnóstico: ${surgery.justificacion || ''}\n` +
    `Códigos: ${(surgery.codigosAuditados || surgery.codigos || '').split('\n').join(', ')}\n` +
    `Anestesia: ${surgery.anestesia || 'No especificada'}\n` +
    (surgery.notasDoctor ? `Notas: ${surgery.notasDoctor}\n` : '') +
    `\n---\nAgendado desde Sistema COAT`
  );

  const location = encodeURIComponent(surgery.habitacion ? `COAT - ${surgery.habitacion}` : 'Clínica COAT');
  const addEmail = surgery.emailProfesional ? `&add=${encodeURIComponent(surgery.emailProfesional)}` : '';

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}${addEmail}`;
};

/**
 * Genera el archivo .ics (estándar RFC 5545) que Google Calendar, Android y iPhone leen nativamente
 */
export const generateICSFile = (surgery) => {
  if (!surgery) return '';
  const uid = `coat-surgery-${surgery.id || Date.now()}@coat.com.ar`;
  const start = formatToICSDate(surgery.fecha, surgery.horaInicio || '08:00');
  const end = formatToICSDate(surgery.fecha, surgery.horaFin || '09:00');
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const summary = `Cirugía: ${surgery.paciente || 'Paciente'} - COAT`;
  const location = surgery.habitacion ? `COAT - ${surgery.habitacion}` : 'Clínica COAT';
  
  const description = [
    `Paciente: ${surgery.paciente || ''}`,
    `DNI: ${surgery.dni || ''}`,
    `Obra Social: ${surgery.obraSocial || ''}`,
    `Cirujano: ${surgery.nombreProfesional || ''}`,
    surgery.residente ? `Residente: ${surgery.residente}` : '',
    `Diagnóstico: ${surgery.justificacion || ''}`,
    `Anestesia: ${surgery.anestesia || ''}`,
    surgery.notasDoctor ? `Notas: ${surgery.notasDoctor}` : '',
  ].filter(Boolean).join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//COAT//Cirugias Calendar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    surgery.emailProfesional ? `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${surgery.nombreProfesional || 'Médico'}:mailto:${surgery.emailProfesional}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
};

/**
 * Descargar archivo .ics directamente
 */
export const downloadICS = (surgery) => {
  const icsContent = generateICSFile(surgery);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Cirugia_${(surgery.paciente || 'paciente').replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
