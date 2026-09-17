import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, X, Download, Users, Stethoscope, ClipboardList, DollarSign, MessageSquare, Link2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiService from '../services/apiService';

const SECTION_ICONS = {
  ordenes_internacion: ClipboardList,
  caja: DollarSign,
  profesionales: Stethoscope,
  pacientes: Users,
  deducciones: DollarSign,
  daily_comments: MessageSquare,
  notes: MessageSquare,
};

const SECTION_LABELS = {
  ordenes_internacion: 'Órdenes / Cirugías',
  caja: 'Caja (Historial)',
  profesionales: 'Profesionales',
  pacientes: 'Pacientes',
  deducciones: 'Deducciones',
  daily_comments: 'Comentarios Diarios',
  notes: 'Notas',
  recibos_libres: 'Recibos Libres',
  reminders: 'Recordatorios',
  authorized_emails: 'Emails Autorizados',
  roles: 'Roles de Usuarios',
  profiles: 'Perfiles de Usuarios',
  consentimientos: 'Consentimientos Informados',
  consent_mappings: 'Mapeos de Códigos a Consentimientos',
};

const PROFESIONALES_BASE = [
  { mp: '32558', nombre: 'MONICA LUCRECIA', apellido: 'BAFFICO', especialidad: 'ORL' },
  { mp: '21944', nombre: 'ESTEBAN', apellido: 'BRUERA', especialidad: 'ORL' },
  { mp: '20927', nombre: 'FEDERICO GASTON', apellido: 'CANDOLFI', especialidad: 'ORL' },
  { mp: '42750', nombre: 'CECILIA FRANZA', apellido: 'CARRANZA', especialidad: 'ORL' },
  { mp: '41671', nombre: 'MARIA SOL', apellido: 'CARRANZA', especialidad: 'ORL' },
  { mp: '70', nombre: 'CARLOS A.', apellido: 'CURET', especialidad: 'ORL' },
  { mp: '9981', nombre: 'CARLOS', apellido: 'CURET', especialidad: 'ORL' },
  { mp: '46762', nombre: 'FLORENCIA', apellido: 'FILLOY', especialidad: 'ORL' },
  { mp: '38191', nombre: 'GUIDO MANUEL', apellido: 'HOYOS', especialidad: 'ORL' },
  { mp: '23780', nombre: 'JUAN PABLO', apellido: 'JASIN', especialidad: 'ORL' },
  { mp: '45468', nombre: 'NAZARENA LUZ', apellido: 'MUSRI', especialidad: 'ORL' },
  { mp: '44518', nombre: 'SELENE', apellido: 'OJEDA', especialidad: 'ORL' },
  { mp: '40998', nombre: 'ARIEL', apellido: 'PAREDES', especialidad: 'ORL' },
  { mp: '69', nombre: 'CLAUDIA', apellido: 'ROMANI', especialidad: 'ORL' },
  { mp: '21911', nombre: 'FERNANDO', apellido: 'ROMERO ORELLANO', especialidad: 'ORL' },
  { mp: '44930', nombre: 'VALENTINA', apellido: 'TELECHTER', especialidad: 'ORL' },
  { mp: '25054', nombre: 'CARINA', apellido: 'VALERI', especialidad: 'ORL' },
  { mp: '39500', nombre: 'MELISA', apellido: 'VENIER', especialidad: 'ORL' },
  { mp: '1', nombre: 'MANUELA', apellido: 'ZALAZAR', especialidad: 'ORL' },
  { mp: '43805', nombre: 'MANUELA BELEN', apellido: 'ZALAZAR SERVINO', especialidad: 'ORL' },
  { mp: '19157', nombre: 'MARIO', apellido: 'ZERNOTTI', especialidad: 'ORL' },
  { mp: '40002', nombre: 'MAXIMO', apellido: 'ZERNOTTI', especialidad: 'ORL' },
  { mp: '17041', nombre: 'JORGE', apellido: 'NAVARRO PIRRA', especialidad: 'Otro' },
  { mp: '17704', nombre: 'ALBERTO GUSTAVO', apellido: 'CORBELL', especialidad: 'Otro' },
];

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(name) {
  return normalize(name)
    .replace(/\b(dr|dra|lic|dr\.|dra\.|lic\.)\b/g, '')
    .trim();
}

function matchProfesional(nombreFromOrder, profList) {
  if (!nombreFromOrder) return null;
  const search = normalizeForMatch(nombreFromOrder);
  if (!search) return null;

  function profSearchStr(p) {
    if (p.apellido && p.nombre) {
      return normalizeForMatch([p.apellido, p.nombre].filter(Boolean).join(' '));
    }
    return normalizeForMatch(p.nombre);
  }

  for (const prof of profList) {
    if (profSearchStr(prof) === search) return prof;
  }

  for (const prof of profList) {
    if (normalizeForMatch(prof.nombre) === search) return prof;
  }

  const searchParts = search.split(' ').filter(Boolean);
  for (const prof of profList) {
    const profParts = profSearchStr(prof).split(' ').filter(Boolean);
    if (searchParts.length >= 2 && profParts.length >= 2) {
      const searchLastName = searchParts[searchParts.length - 1];
      const profLastName = profParts[profParts.length - 1];
      if (searchLastName === profLastName) {
        const searchFirstName = searchParts[0];
        const profFirstName = profParts[0];
        if (searchFirstName === profFirstName) return prof;
      }
    }
  }

  for (const prof of profList) {
    const full = profSearchStr(prof);
    if (full.includes(search) || search.includes(full)) return prof;
  }

  for (const prof of profList) {
    const nameNorm = normalizeForMatch(prof.nombre);
    if (nameNorm.includes(search) || search.includes(nameNorm)) return prof;
  }

  return null;
}

function mapOrdenToSurgery(orden, profList) {
  const codigos = (orden.codigosCirugia || [])
    .filter(c => c.codigo)
    .map(c => c.codigo)
    .join('\n');

  const fecha = orden.fechaCirugia || '';
  const finalEstado = orden.suspendida ? 'CANCELADA'
    : orden.status === 'auditada' ? 'AUTORIZADA'
    : 'SOLICITADA';

  const matchedProf = matchProfesional(orden.profesional, profList);

  return {
    id: Date.now() + Math.random(),
    emailProfesional: '',
    nombreProfesional: orden.profesional || '',
    professionalId: matchedProf ? matchedProf.id : null,
    fecha,
    duracion: '',
    paciente: orden.afiliado || '',
    edad: orden.edad || '',
    dni: orden.dni || '',
    nroAfiliado: orden.numeroAfiliado || '',
    contactoFamiliar: orden.telefono || '',
    esPacienteClinica: 'SI',
    obraSocial: orden.obraSocial || '',
    psicoprofilaxis: 'SI',
    codigos,
    materiales: orden.descripcionMaterial || '',
    requiereMaterial: orden.incluyeMaterial ? 'SI' : 'NO',
    justificacion: orden.diagnostico || '',
    anestesia: orden.tipoAnestesia || '',
    requierePresupuesto: 'NO',
    notasDoctor: orden.anotacionCalendario || '',
    habitacion: orden.salaCirugia || orden.habitacion || '',
    horaInicio: orden.horaCirugia || '',
    horaFin: '',
    estado: finalEstado,
    aprobacionMaterial: 'PENDIENTE',
    creador: orden.createdBy || 'Importado',
    creadorRol: 'Admin',
    fechaCreacion: orden.createdAt
      ? new Date(orden.createdAt).toLocaleDateString('es-AR')
      : new Date().toLocaleDateString('es-AR'),
    codigosAuditados: codigos,
    notasDirectora: '',
    motivoRechazo: '',
    motivoCancelacion: '',
    reactivada: false,
  };
}

function mapCajaEntry(entry) {
  return {
    id: entry.id ? parseInt(String(entry.id).replace(/\D/g, ''), 10) || Date.now() + Math.random() : Date.now() + Math.random(),
    fecha: entry.fecha || '',
    paciente: entry.paciente || '',
    dni: entry.dni || '',
    obra_social: entry.obra_social || entry.obraSocial || '',
    prof_1: entry.prof_1 || '',
    prof_2: entry.prof_2 || '',
    prof_3: entry.prof_3 || '',
    porcentaje_prof_1: entry.porcentaje_prof_1 || 0,
    showPercent_1: entry.showPercent_1 || false,
    porcentaje_prof_2: entry.porcentaje_prof_2 || 0,
    showPercent_2: entry.showPercent_2 || false,
    porcentaje_prof_3: entry.porcentaje_prof_3 || 0,
    showPercent_3: entry.showPercent_3 || false,
    showProf3: entry.showProf3 || false,
    pesos: entry.pesos || 0,
    dolares: entry.dolares || 0,
    liq_prof_1: entry.liq_prof_1 || 0,
    liq_prof_1_currency: entry.liq_prof_1_currency || 'ARS',
    liq_prof_1_secondary: entry.liq_prof_1_secondary || 0,
    liq_prof_1_currency_secondary: entry.liq_prof_1_currency_secondary || 'USD',
    showSecondary_1: entry.showSecondary_1 || false,
    liq_prof_2: entry.liq_prof_2 || 0,
    liq_prof_2_currency: entry.liq_prof_2_currency || 'ARS',
    liq_prof_2_secondary: entry.liq_prof_2_secondary || 0,
    liq_prof_2_currency_secondary: entry.liq_prof_2_currency_secondary || 'USD',
    showSecondary_2: entry.showSecondary_2 || false,
    liq_prof_3: entry.liq_prof_3 || 0,
    liq_prof_3_currency: entry.liq_prof_3_currency || 'ARS',
    liq_prof_3_secondary: entry.liq_prof_3_secondary || 0,
    liq_prof_3_currency_secondary: entry.liq_prof_3_currency_secondary || 'USD',
    showSecondary_3: entry.showSecondary_3 || false,
    anestesista: entry.anestesista || '',
    liq_anestesista: entry.liq_anestesista || 0,
    liq_anestesista_currency: entry.liq_anestesista_currency || 'ARS',
    liq_anestesista_secondary: entry.liq_anestesista_secondary || 0,
    liq_anestesista_currency_secondary: entry.liq_anestesista_currency_secondary || 'USD',
    showSecondaryAnes: entry.showSecondaryAnes || false,
    isTransfer: entry.isTransfer || false,
    coat_pesos: entry.coat_pesos || 0,
    coat_dolares: entry.coat_dolares || 0,
    comentario: entry.comentario || '',
    creadoPor: entry.createdBy || 'Importado',
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function parseProfName(fullName) {
  const prefixes = ['dr', 'dra', 'lic', 'dr(a)'];
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return { prefijo: '', nombre: '', apellido: '' };

  const firstLower = parts[0].toLowerCase().replace(/\./g, '');
  if (prefixes.includes(firstLower) && parts.length > 1) {
    return {
      prefijo: parts[0],
      nombre: parts.slice(1).join(' '),
      apellido: parts.slice(1).join(' '),
    };
  }
  return {
    prefijo: '',
    nombre: fullName.trim(),
    apellido: parts[0],
  };
}

function mapProfesionalFromJSON(prof) {
  const raw = prof.nombre || '';
  const prefixes = ['dr', 'dra', 'lic', 'dr(a)'];
  const parts = raw.trim().split(/\s+/);
  const firstLower = (parts[0] || '').toLowerCase().replace(/\./g, '');

  if (prefixes.includes(firstLower) && parts.length > 1) {
    return {
      id: Date.now() + Math.random(),
      prefijo: parts[0],
      nombre: parts.slice(1).join(' '),
      apellido: parts.slice(1).join(' '),
      email: prof.email || '',
      especialidad: prof.categoria || prof.especialidad || 'ORL',
      mp: prof.mp || '',
      me: prof.me || '',
      firma: prof.firmaUrl || '',
    };
  }

  return {
    id: Date.now() + Math.random(),
    prefijo: '',
    nombre: raw.trim(),
    apellido: '',
    email: prof.email || '',
    especialidad: prof.categoria || prof.especialidad || 'ORL',
    mp: prof.mp || '',
    me: prof.me || '',
    firma: prof.firmaUrl || '',
  };
}

function mapDeduction(ded) {
  return {
    id: Date.now() + Math.random(),
    profesional: ded.profesional || '',
    date: ded.date || '',
    desc: ded.desc || ded.descripcion || '',
    amount: Math.abs(ded.amount || 0),
    currency: ded.currency || 'ARS',
  };
}

export default function DataImporter({ onDataImported }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedSections, setSelectedSections] = useState({});

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Solo se aceptan archivos JSON');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        processImportData(data);
      } catch {
        toast.error('Archivo JSON inválido');
      }
    };
    reader.readAsText(file);
  };

  const processImportData = (data) => {
    let collections = {};

    if (data.data && typeof data.data === 'object') {
      collections = data.data;
    } else if (Array.isArray(data)) {
      collections = { caja: data };
    } else if (data.ordenes || data.caja || data.profesionales) {
      collections = data;
    } else {
      collections = { caja: Object.values(data).flat() };
    }

    const summary = {};
    const defaults = {};
    for (const [key, items] of Object.entries(collections)) {
      if (Array.isArray(items) && items.length > 0) {
        summary[key] = items.length;
        defaults[key] = true;
      }
    }

    setPreview({ collections, summary });
    setSelectedSections(defaults);
  };

  const toggleSection = (key) => {
    setSelectedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setResult(null);

    const { collections } = preview;
    const imported = {};
    const errors = [];
    let matchedCount = 0;
    let unmatchedOrders = [];

    try {
      const existingProfs = JSON.parse(localStorage.getItem('professionals_proto') || '[]');
      const existingProfsNormalized = existingProfs.map(p => ({
        ...p,
        _normalized: normalizeForMatch(p.nombre),
      }));

      const baseProfsWithId = PROFESIONALES_BASE.map(p => {
        const existing = existingProfs.find(ep => ep.mp === p.mp);
        if (existing) return existing;
        return {
          id: Date.now() + Math.random(),
          prefijo: 'Dr',
          nombre: p.nombre,
          apellido: p.apellido,
          email: '',
          especialidad: p.especialidad,
          mp: p.mp,
          me: '',
          firma: '',
        };
      });

      const allProfs = [...existingProfs, ...baseProfsWithId.filter(bp => !existingProfs.find(ep => ep.mp === bp.mp))];

      if (selectedSections.profesionales && collections.profesionales) {
        const jsonProfs = collections.profesionales.map(mapProfesionalFromJSON);
        jsonProfs.forEach(jp => {
          const jpSearch = jp.apellido
            ? normalizeForMatch([jp.apellido, jp.nombre].join(' '))
            : normalizeForMatch(jp.nombre);
          const exists = allProfs.some(ap => {
            const apSearch = ap.apellido
              ? normalizeForMatch([ap.apellido, ap.nombre].join(' '))
              : normalizeForMatch(ap.nombre);
            return apSearch === jpSearch || normalizeForMatch(ap.nombre) === normalizeForMatch(jp.nombre);
          });
          if (!exists) allProfs.push(jp);
        });
      }

      localStorage.setItem('professionals_proto', JSON.stringify(allProfs));
      imported.profesionales = allProfs.length;

      if (selectedSections.ordenes_internacion && collections.ordenes_internacion) {
        const existing = JSON.parse(localStorage.getItem('surgeries_proto') || '[]');
        const mapped = collections.ordenes_internacion.map(orden => {
          const surgery = mapOrdenToSurgery(orden, allProfs);
          if (surgery.professionalId) {
            matchedCount++;
          } else {
            unmatchedOrders.push(orden.profesional || '(sin nombre)');
          }
          return surgery;
        });
        const merged = [...existing, ...mapped];
        localStorage.setItem('surgeries_proto', JSON.stringify(merged));
        imported.ordenes_internacion = mapped.length;
      }

      if (selectedSections.caja && collections.caja) {
        const existing = JSON.parse(localStorage.getItem('caja_proto') || '[]');
        const mapped = collections.caja.map(mapCajaEntry);
        const merged = [...existing, ...mapped];
        localStorage.setItem('caja_proto', JSON.stringify(merged));
        imported.caja = mapped.length;
      }

      if (selectedSections.pacientes && collections.pacientes) {
        const existing = JSON.parse(localStorage.getItem('coat_pacientes') || '[]');
        const existingMap = new Map(existing.map(p => [p.dni || p.id, p]));
        collections.pacientes.forEach(p => {
          existingMap.set(p.dni || p.id, p);
        });
        const mergedPacientes = Array.from(existingMap.values());
        localStorage.setItem('coat_pacientes', JSON.stringify(mergedPacientes));
        imported.pacientes = collections.pacientes.length;
      }

      if (selectedSections.deducciones && collections.deducciones) {
        const existing = JSON.parse(localStorage.getItem('deducciones_liquidacion') || '[]');
        const mapped = collections.deducciones.map(mapDeduction);
        const merged = [...existing, ...mapped];
        localStorage.setItem('deducciones_liquidacion', JSON.stringify(merged));
        imported.deducciones = mapped.length;
      }

      if (selectedSections.daily_comments && collections.daily_comments) {
        const existing = JSON.parse(localStorage.getItem('daily_comments_proto') || '{}');
        const merged = { ...existing };
        collections.daily_comments.forEach(c => {
          if (c.date && c.comment) merged[c.date] = c.comment;
        });
        localStorage.setItem('daily_comments_proto', JSON.stringify(merged));
        imported.daily_comments = collections.daily_comments.length;
      }

      if (selectedSections.recibos_libres && collections.recibos_libres) {
        const existing = JSON.parse(localStorage.getItem('coat_recibos_libres') || '[]');
        const merged = [...existing, ...collections.recibos_libres];
        localStorage.setItem('coat_recibos_libres', JSON.stringify(merged));
        imported.recibos_libres = collections.recibos_libres.length;
      }

      if (selectedSections.reminders && collections.reminders) {
        const existing = JSON.parse(localStorage.getItem('reminders_caja') || '[]');
        const merged = [...existing, ...collections.reminders];
        localStorage.setItem('reminders_caja', JSON.stringify(merged));
        imported.reminders = collections.reminders.length;
      }

      if (selectedSections.notes && collections.notes) {
        const existing = JSON.parse(localStorage.getItem('coat_notes') || '[]');
        const merged = [...existing, ...collections.notes];
        localStorage.setItem('coat_notes', JSON.stringify(merged));
        imported.notes = collections.notes.length;
      }

      if (selectedSections.authorized_emails && collections.authorized_emails) {
        const existing = JSON.parse(localStorage.getItem('coat_authorized_emails') || '[]');
        const merged = [...existing, ...collections.authorized_emails];
        localStorage.setItem('coat_authorized_emails', JSON.stringify(merged));
        imported.authorized_emails = collections.authorized_emails.length;
      }

      if (selectedSections.roles && collections.roles) {
        const existing = JSON.parse(localStorage.getItem('coat_roles') || '[]');
        const merged = [...existing, ...collections.roles];
        localStorage.setItem('coat_roles', JSON.stringify(merged));
        imported.roles = collections.roles.length;
      }

      if (selectedSections.profiles && collections.profiles) {
        const existing = JSON.parse(localStorage.getItem('users_proto') || '[]');
        const mappedProfiles = collections.profiles.map(p => ({
          id: p.id || p.uid || Date.now() + Math.random(),
          nombre: p.displayName || p.nombre || p.email,
          email: p.email || '',
          rol: p.role || 'Medico'
        }));
        const merged = [...existing, ...mappedProfiles];
        localStorage.setItem('users_proto', JSON.stringify(merged));
        imported.profiles = mappedProfiles.length;
      }

      if (selectedSections.consentimientos && collections.consentimientos) {
        const existing = JSON.parse(localStorage.getItem('coat_consentimientos') || '[]');
        const merged = [...existing, ...collections.consentimientos];
        localStorage.setItem('coat_consentimientos', JSON.stringify(merged));
        imported.consentimientos = collections.consentimientos.length;
      }

      if (selectedSections.consent_mappings && collections.consent_mappings) {
        const existing = JSON.parse(localStorage.getItem('coat_consent_mappings') || '[]');
        const merged = [...existing, ...collections.consent_mappings];
        localStorage.setItem('coat_consent_mappings', JSON.stringify(merged));
        imported.consent_mappings = collections.consent_mappings.length;
      }

      localStorage.removeItem('data_cleared');
      setResult({ success: true, imported, matchedCount, unmatchedOrders, errors });
      toast.success('Importación completada');

      if (onDataImported) onDataImported();
    } catch (err) {
      setResult({ success: false, imported, matchedCount, unmatchedOrders, errors: [...errors, err.message] });
      toast.error('Error durante la importación');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setPreview(null);
    setResult(null);
    setSelectedSections({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearAll = async () => {
    if (!window.confirm('Esto eliminará TODOS los datos (usuarios, profesionales, cirugías, caja). ¿Continuar?')) return;

    setImporting(true);
    toast.loading('Eliminando datos...', { id: 'clear' });

    try {
      const localStorageKeys = [
        'surgeries_proto', 'caja_proto', 'cajaDiariaEntries',
        'professionals_proto', 'obras_sociales_proto', 'users_proto',
        'current_user_proto', 'daily_comments_proto', 'deducciones_liquidacion',
        'os_code_presupuesto', 'restrict_calendar_drag'
      ];
      localStorageKeys.forEach(k => localStorage.removeItem(k));

      const apiCollections = [
        'users', 'profesionales', 'pacientes',
        'ordenes_internacion', 'pedidos_medicos',
        'caja', 'daily_comments', 'deducciones',
        'recibos_libres', 'reminders', 'notes',
        'liquidaciones', 'authorized_emails',
        'consentimientos', 'consent_mappings',
        'material_requests', 'audit_logs'
      ];
      for (const col of apiCollections) {
        try { await apiService.clearCollection(col); } catch {}
      }

      localStorage.setItem('data_cleared', 'true');

      toast.success('Todos los datos eliminados. Recargando...', { id: 'clear' });
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      toast.error('Error al eliminar: ' + err.message, { id: 'clear' });
      setImporting(false);
    }
  };

  const sectionKeys = preview ? Object.keys(preview.summary) : [];

  return (
    <div className="space-y-4">
      {!preview && !result && (
        <div>
          <button
            onClick={handleClearAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-100 transition-all mb-4"
          >
            <Trash2 size={14} />
            Limpiar todos los datos de prueba
          </button>
          <div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-xs text-blue-700 font-semibold mb-1">Profesionales incluidos ({PROFESIONALES_BASE.length})</p>
            <p className="text-[10px] text-blue-500">
              Se cargan automáticamente y se asocian a las órdenes por nombre.
            </p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Importá datos del sistema anterior (exportación JSON del Admin). Se fusionarán con los datos actuales.
          </p>
          <label className="flex items-center justify-center gap-2 w-full px-4 py-8 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer text-sm font-semibold text-slate-600">
            <Upload size={18} className="text-indigo-500" />
            Seleccionar archivo JSON
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}

      {preview && !result && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">
              Datos encontrados ({Object.values(preview.summary).reduce((a, b) => a + b, 0)} registros)
            </h4>
            <button onClick={handleReset} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">
              Cancelar
            </button>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 mb-3">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold">
              <Link2 size={14} />
              Asociación automática de profesionales
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">
              {PROFESIONALES_BASE.length} profesionales predefinidos. Las órdenes se asocian por nombre del profesional.
            </p>
          </div>

          <div className="space-y-2 mb-4">
            {sectionKeys.map(key => {
              const Icon = SECTION_ICONS[key] || FileText;
              const label = SECTION_LABELS[key] || key;
              const count = preview.summary[key];
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                    selectedSections[key]
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-white border-slate-200 opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedSections[key]}
                    onChange={() => toggleSection(key)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <Icon size={16} className={selectedSections[key] ? 'text-indigo-500' : 'text-slate-400'} />
                  <span className="flex-1 text-sm font-semibold text-slate-700">{label}</span>
                  <span className="text-xs font-bold text-slate-400">{count} registros</span>
                </label>
              );
            })}
          </div>

          <button
            onClick={handleImport}
            disabled={importing || Object.values(selectedSections).every(v => !v)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {importing ? (
              <>
                <span className="animate-spin">⏳</span>
                Importando...
              </>
            ) : (
              <>
                <Download size={16} />
                Importar seleccionados
              </>
            )}
          </button>
        </div>
      )}

      {result && (
        <div>
          {result.success ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                <CheckCircle2 size={18} />
                Importación exitosa
              </div>
              {Object.entries(result.imported).map(([key, count]) => (
                <div key={key} className="text-xs text-emerald-600">
                  <span className="font-bold">{SECTION_LABELS[key] || key}:</span> {count} registros importados
                </div>
              ))}
              {result.matchedCount > 0 && (
                <div className="text-xs text-emerald-600">
                  <span className="font-bold">Órdenes asociadas a profesional:</span> {result.matchedCount}
                </div>
              )}
              {result.unmatchedOrders && result.unmatchedOrders.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200">
                  <p className="text-xs font-bold text-amber-600 mb-1">
                    Órdenes sin profesional detectado ({result.unmatchedOrders.length}):
                  </p>
                  <div className="max-h-24 overflow-y-auto text-[10px] text-amber-500 space-y-0.5">
                    {[...new Set(result.unmatchedOrders)].map((name, i) => (
                      <div key={i}>• {name}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <AlertCircle size={18} />
                Error en la importación
              </div>
              {result.errors.map((err, i) => (
                <div key={i} className="text-xs text-rose-600">{err}</div>
              ))}
            </div>
          )}

          <button
            onClick={handleReset}
            className="w-full mt-3 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
