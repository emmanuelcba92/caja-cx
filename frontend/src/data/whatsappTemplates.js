import { formatDoctorDisplayName, shortDoctorName } from '../utils/doctorName';

export const DEFAULT_WA_TEMPLATES = [
  {
    id: 'mensaje_paciente',
    titulo: 'Mensaje Paciente (Autoriza Paciente)',
    categoria: 'Autorización',
    mensaje: 'Buen día, le escribe {usuario} del área de internaciones COAT.\n\n{paciente} tiene agendada una cirugía el día {fecha} con {profesional}. En el caso de su obra social, la autorización la gestiona el paciente.\n\nEnvío orden de internación para que presente en su obra social y pueda comenzar la gestión de autorización.'
  },
  {
    id: 'mensaje_institucional',
    titulo: 'Mensaje Institucional (Autoriza Institución)',
    categoria: 'Autorización',
    mensaje: 'Buen día, le escribe {usuario} del área de internaciones COAT.\n\n{paciente} tiene agendada una cirugía el día {fecha} con {profesional}.\n\nEn el caso de su obra social, la autorización la gestionamos nosotros.\n\nPara poder comenzar la gestión con su obra social le voy a solicitar que envíe estudios realizados de nariz, garganta y oído. Además indique número de afiliado de la obra social o envíe una foto/captura de la credencial.'
  },
  {
    id: 'confirmacion_turno',
    titulo: 'Confirmación de Turno Quirúrgico',
    categoria: 'Turnos',
    mensaje: 'Estimado/a {paciente}, nos comunicamos de Clínica COAT para confirmar su turno de cirugía con el/la Dr/a {profesional} programado para el día {fecha} a las {hora} hs. Por favor responda este mensaje para confirmar su asistencia. ¡Muchas gracias!'
  },
  {
    id: 'indicaciones_ayuno',
    titulo: 'Indicaciones de Ayuno y Preparación',
    categoria: 'Indicaciones',
    mensaje: 'Estimado/a {paciente}, le recordamos las indicaciones para su procedimiento ({procedimiento}) del día {fecha} con {profesional}:\n\n- Ayuno total de 8 horas previas (no ingerir sólidos ni líquidos, ni agua).\n- Concurrir con DNI, carnet de {obraSocial} y estudios prequirúrgicos completos.\n- Asistir con un acompañante adulto.\n\nAnte cualquier consulta quedamos a su disposición. Clínica COAT.'
  },
  {
    id: 'autorizacion_aprobada',
    titulo: 'Autorización Aprobada',
    categoria: 'Autorizaciones',
    mensaje: 'Estimado/a {paciente}, le informamos desde COAT que la autorización para su cirugía/estudio ({procedimiento}) ha sido APROBADA por {obraSocial}. Su fecha programada es el {fecha} con {profesional}.'
  },
  {
    id: 'recordatorio_previo',
    titulo: 'Recordatorio Previo de Cirugía',
    categoria: 'Recordatorios',
    mensaje: 'Hola {paciente}, le recordamos su turno quirúrgico con el/la Dr/a {profesional} el día {fecha} a las {hora} hs en COAT. Recuerde presentarse 30 minutos antes en recepción con DNI y carnet de {obraSocial}.'
  },
  {
    id: 'reprogramacion',
    titulo: 'Reprogramación de Turno',
    categoria: 'Turnos',
    mensaje: 'Estimado/a {paciente}, nos comunicamos de Clínica COAT para informarle que su turno con {profesional} ha sido reprogramado para el día {fecha} a las {hora} hs. Por favor responda este mensaje para confirmar su recepción. Disculpe las molestias.'
  }
];

export const WA_TEMPLATE_VARIABLES = [
  { tag: '{usuario}', desc: 'Nombre del usuario que escribe (ej: Emmanuel)' },
  { tag: '{paciente}', desc: 'Nombre del paciente en mayúsculas' },
  { tag: '{profesional}', desc: 'Profesional (ej: Dra Venier)' },
  { tag: '{fecha}', desc: 'Fecha de cirugía (ej: 1/10)' },
  { tag: '{hora}', desc: 'Hora del turno' },
  { tag: '{obraSocial}', desc: 'Obra Social o Particular' },
  { tag: '{procedimiento}', desc: 'Cirugía o estudio programado' },
  { tag: '{dni}', desc: 'DNI del paciente' },
  { tag: '{clinica}', desc: 'COAT' }
];

export const formatWhatsAppNumber = (rawPhone) => {
  if (!rawPhone) return '';
  let digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  if (digits.startsWith('549')) {
    return digits;
  }

  if (digits.startsWith('54') && digits.length >= 12) {
    return '549' + digits.substring(2);
  }

  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  if (digits.length === 10 && !digits.startsWith('54')) {
    return '549' + digits;
  }

  if (digits.length === 11 && digits.startsWith('9')) {
    return '54' + digits;
  }

  if (digits.length >= 8 && !digits.startsWith('54')) {
    return '549' + digits;
  }

  return digits;
};

export const interpolateTemplate = (templateText, surgery = {}, currentUser = null) => {
  if (!templateText) return '';
  
  // Format date like 1/10 (or DD/MM if preferred)
  let formattedDate = surgery.fecha || '';
  if (formattedDate && formattedDate.includes('-')) {
    const parts = formattedDate.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const month = parseInt(parts[1], 10);
      formattedDate = `${day}/${month}`;
    }
  }

  const hora = surgery.horaInicio || surgery.hora || '08:00';
  const paciente = (surgery.paciente || surgery.nombre || 'Paciente').toUpperCase();
  const dni = surgery.dni || '';
  
  // Doctor display name like "Dra Venier" or "Dr Rossi"
  const rawProf = surgery.nombreProfesional || surgery.profesional || '';
  const profesional = shortDoctorName(rawProf) || formatDoctorDisplayName(rawProf) || 'el profesional';
  
  // User name (e.g. Emmanuel)
  const usuario = surgery.usuario || currentUser?.profesionalName || currentUser?.nombre || 'Emmanuel';
  
  const obraSocial = surgery.obraSocial || 'Particular';
  const procedimiento = (surgery.codigosAuditados || surgery.codigos || surgery.diagnostico || surgery.procedimiento || 'Cirugía').split('\n')[0];
  const clinica = 'COAT';

  return templateText
    .replace(/\{usuario\}/gi, usuario)
    .replace(/\{paciente\}/gi, paciente)
    .replace(/\{dni\}/gi, dni)
    .replace(/\{profesional\}/gi, profesional)
    .replace(/\{fecha\}/gi, formattedDate)
    .replace(/\{hora\}/gi, hora)
    .replace(/\{obraSocial\}/gi, obraSocial)
    .replace(/\{procedimiento\}/gi, procedimiento)
    .replace(/\{clinica\}/gi, clinica);
};

export const getWhatsAppLink = (phone, text) => {
  const formatted = formatWhatsAppNumber(phone);
  if (!formatted) return '';
  return 'https://wa.me/' + formatted + '?text=' + encodeURIComponent(text || '');
};

export const STORAGE_WA_TEMPLATES_KEY = 'coat_whatsapp_templates_v2';

export const loadStoredTemplates = () => {
  try {
    const saved = localStorage.getItem(STORAGE_WA_TEMPLATES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error loading WhatsApp templates:', e);
  }
  return DEFAULT_WA_TEMPLATES;
};

export const saveStoredTemplates = (templates) => {
  try {
    localStorage.setItem(STORAGE_WA_TEMPLATES_KEY, JSON.stringify(templates));
  } catch (e) {
    console.error('Error saving WhatsApp templates:', e);
  }
};
