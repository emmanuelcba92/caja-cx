import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './context/AuthContext';
import { 
  User, 
  ShieldCheck, 
  ClipboardList, 
  PlusCircle, 
  Filter, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Send, 
  FileText,
  Calendar as CalendarIcon,
  Clock,
  Pencil,
  Trash2,
  Printer,
  DollarSign,
  LogOut,
  Settings,
  UserPlus,
  Users as UsersIcon,
  Package,
  LayoutDashboard,
  LayoutGrid,
  Table2,
  BarChart3,
  HelpCircle,
  Sparkles,
  Loader2,
  Camera,
  Paperclip,
  Eye,
  Bookmark,
  BookmarkPlus,
  FolderHeart,
  Star,
  AlertTriangle,
  FileCheck,
  Key,
  EyeOff,
  Search,
  ChevronDown,
  Check,
  MessageCircle,
  MessageSquare,
  Pin
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from './firebase/config';
import CajaView from './CajaView';
import ProfesionalesView from './ProfesionalesView';
import CalendarioView from './CalendarioView';
import PrintConsole from './components/PrintConsole';
import ConsentimientosAdmin from './components/ConsentimientosAdmin';
import PacientesView from './components/PacientesView';
import ReciboLibreView from './components/ReciboLibreView';
import RemindersView from './components/RemindersView';
import NotesView from './components/NotesView';
import AdminView from './components/AdminView';
import AccessManager from './components/AccessManager';
import DataImporter from './components/DataImporter.jsx';
import ConsentimientosView from './components/ConsentimientosView';
import QuirofanoReportModal from './components/QuirofanoReportModal';
import WhatsAppModal from './components/WhatsAppModal';
import WhatsAppTemplatesAdmin from './components/WhatsAppTemplatesAdmin';
import { SURGICAL_TEMPLATES } from './data/surgicalTemplates';
import { DEFAULT_OBRAS_SOCIALES } from './data/obrasSociales';
import { getCodeName, expandCodes, searchCodes, CLINICAL_NOMENCLADOR, MODULOS_SM, CODIGOS_IOSFA, ESTUDIOS_BAJO_ANESTESIA } from './data/clinicalCodes';
import { SEED_USERS, SEED_SURGERIES, SEED_PROFESSIONALS } from './data/seedData';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import apiService from './services/apiService';
import { parseEmailToOrder } from './services/aiService';
import { formatDoctorDisplayName, getCleanUsername, parseDoctorNameParts } from './utils/doctorName';

export const buildStudyOrderLines = (surgery, codesLines) => {
  const isEstudio = surgery.tipoProcedimiento === 'ESTUDIO' || !!surgery.estudioBajoAnestesia;
  if (!isEstudio) return null;

  const rawCodes = (surgery.codigosAuditados || surgery.codigos || '').split('\n').map(c => c.trim()).filter(Boolean);
  const isDiseOnly = rawCodes.length > 0 && rawCodes.every(c => c.toUpperCase() === 'DISE' || c.toUpperCase().includes('DISE'));

  const convenios = surgery.conveniosEstudios || {};
  const lines = [];

  const getConvenioConfig = (keyName) => {
    if (!keyName) return {};
    if (convenios[keyName]) return convenios[keyName];
    const lowerKey = keyName.toLowerCase().trim();
    for (const [k, v] of Object.entries(convenios)) {
      const kLower = k.toLowerCase().trim();
      if (kLower === lowerKey || lowerKey.includes(kLower) || kLower.includes(lowerKey)) return v;
    }
    const est = ESTUDIOS_BAJO_ANESTESIA.find(e => e.name.toLowerCase() === lowerKey || e.code.toLowerCase() === lowerKey);
    if (est) {
      if (convenios[est.name]) return convenios[est.name];
      if (convenios[est.code]) return convenios[est.code];
    }
    return {};
  };

  codesLines.forEach((name) => {
    const cfg = getConvenioConfig(name);
    const isConvenido = cfg.convenido !== false;
    const valor = cfg.valor ? String(cfg.valor).replace('$', '').trim() : '';

    let tag = '';
    if (isConvenido) {
      tag = '(practica nomenclada: Valor convenio)';
    } else {
      tag = valor ? `(practica no nomenclada: Valor $${valor})` : '(practica no nomenclada)';
    }
    lines.push(`${name} ${tag}`);
  });

  if (!isDiseOnly) {
    const cfgInternacion = getConvenioConfig('INTERNACION_BREVE') || {};
    const intConvenido = cfgInternacion.convenido !== false;
    const intValor = cfgInternacion.valor ? String(cfgInternacion.valor).replace('$', '').trim() : '';
    const tagInternacion = intConvenido ? '(valor convenio)' : (intValor ? `(Valor $${intValor})` : '(no convenido)');
    lines.push(`Internación breve, uso de quirófano ${tagInternacion}`);

    const cfgMed = getConvenioConfig('MEDICAMENTOS_DESCARTABLES') || {};
    const medConvenido = cfgMed.convenido !== false;
    const medValor = cfgMed.valor ? String(cfgMed.valor).replace('$', '').trim() : '';
    const tagMed = medConvenido ? '(valor convenio)' : (medValor ? `(Valor $${medValor})` : '(no convenido)');
    lines.push(`Medicamentos y descartables ${tagMed}`);
  }

  return lines;
};

export const parseDurationToMinutes = (dur) => {
  if (!dur) return 60;
  if (typeof dur === 'number') return dur;
  const str = String(dur).toLowerCase().trim();
  const colonMatch = str.match(/^(\d+):(\d+)/);
  if (colonMatch) return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
  const hoursMatch = str.match(/^(\d+(?:[.,]\d+)?)\s*(?:hs?|horas?)/);
  if (hoursMatch) return Math.round(parseFloat(hoursMatch[1].replace(',', '.')) * 60);
  const minMatch = str.match(/^(\d+)\s*(?:min|m)/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const num = parseInt(str, 10);
  if (!isNaN(num)) return num <= 12 ? num * 60 : num;
  return 60;
};

export const addMinutesToTime = (timeStr, minutes) => {
  if (!timeStr) return '09:00';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return '09:00';
  const totalMin = h * 60 + (isNaN(m) ? 0 : m) + minutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

export const timeToMinutes = (timeStr) => {
  if (!timeStr) return 8 * 60;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  return (isNaN(h) ? 8 : h) * 60 + (isNaN(m) ? 0 : m);
};

export const extractShortCodes = (surgery) => {
  if (!surgery) return [];
  const rawCodes = surgery.codigosAuditados || surgery.codigos || '';
  let list = [];
  if (Array.isArray(rawCodes)) {
    list = rawCodes.map(c => (typeof c === 'object' ? (c.codigo || c.code || '') : String(c)));
  } else if (typeof rawCodes === 'string' && rawCodes.trim()) {
    list = rawCodes
      .split(/[\n,;]+/)
      .map(c => c.trim())
      .filter(Boolean);
  } else if (Array.isArray(surgery.codigosCirugia) && surgery.codigosCirugia.length > 0) {
    list = surgery.codigosCirugia.map(c => (typeof c === 'object' ? (c.codigo || c.code || '') : String(c)));
  }

  return list.map(item => {
    const trimmed = String(item).trim();
    const match = trimmed.match(/^([A-Za-z0-9.]+)/);
    return match ? match[1] : trimmed;
  }).filter(Boolean);
};

const CardInlineField = ({ label, value, placeholder, isUppercase = false, isSala = false, onSave }) => {
  const [localVal, setLocalVal] = useState(value || '');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalVal(value || '');
  }, [value]);

  const commitSave = (valToSave) => {
    const finalVal = isUppercase ? String(valToSave || '').toUpperCase().trim() : String(valToSave || '').trim();
    if (finalVal !== String(value || '').trim()) {
      onSave(finalVal);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 1800);
    }
  };

  const handleBlur = () => {
    commitSave(localVal);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
      isSala 
        ? 'bg-amber-50/80 border-amber-300 text-amber-950 focus-within:ring-2 focus-within:ring-amber-400 focus-within:bg-white shadow-2xs' 
        : 'bg-slate-50 border-slate-200 text-slate-700 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:bg-white shadow-2xs'
    }`}>
      <span className={`font-black uppercase select-none shrink-0 ${isSala ? 'text-[11px] text-amber-800' : 'text-[10px] text-slate-500'}`}>
        {label}:
      </span>
      <input
        type="text"
        value={localVal}
        onChange={(e) => setLocalVal(isUppercase ? e.target.value.toUpperCase() : e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`bg-transparent outline-none border-none p-0 min-w-[70px] max-w-[130px] font-black ${
          isSala 
            ? 'text-[13px] text-amber-950 uppercase tracking-wide placeholder:text-amber-300 font-extrabold' 
            : 'text-xs text-slate-800 placeholder:text-slate-400'
        }`}
        title={`Click para editar ${label}`}
      />
      {isSaved && <Check size={12} className="text-emerald-600 shrink-0 stroke-[3]" />}
    </div>
  );
};

const STATUS = {
  SOLICITADA: { label: 'Solicitada', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  CODIFICADA: { label: 'Codificada', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  ENVIADA: { label: 'Enviada', color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  AUTORIZADA: { label: 'Autorizada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  RECHAZADA: { label: 'Rechazada', color: 'bg-rose-100 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  CANCELADA: { label: 'Cancelada', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-500' },
};

const ROLES = {
  MEDICO: 'Medico',
  DIRECTORA: 'Directora',
  SECRE: 'Secre',
  SECRE_ESTUDIOS: 'Secre Estudios',
  ADMIN: 'Admin',
  RESIDENTE: 'Residente',
};

function HelpTooltip({ children, content }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
        aria-label="Ayuda campos"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <HelpCircle size={16} />
      </button>
      {isOpen && createPortal(
        <div className="fixed z-[100] w-96 bg-white border border-slate-200 rounded-lg shadow-lg p-4">
          <h4 className="font-bold text-slate-800 mb-3">{children}</h4>
          <div className="space-y-2 text-sm text-slate-600">{content}</div>
        </div>,
        document.body
      )}
    </div>
  );
}

const DEFAULT_USERS = [
  { id: 1, nombre: 'Dr. Pérez', rol: ROLES.MEDICO, professionalId: null },
  { id: 2, nombre: 'Dra. García', rol: ROLES.DIRECTORA, professionalId: null },
  { id: 3, nombre: 'Lucía', rol: ROLES.SECRE, professionalId: null },
  { id: 4, nombre: 'Admin', rol: ROLES.ADMIN, professionalId: null },
];

const PREDEFINED_MATERIALS = [
  'Tubo de ventilación transtimpánico',
  'Tubo de ventilación transtimpánico pediátrico',
  'Pistón de teflón',
];

const formatMaterialLine = (name, qty) => {
  const num = qty === 1 ? '1 (un)' : '2 (dos)';
  const word = qty === 1 ? name : name.replace(/o$/, 'os');
  return `${num} ${word}`;
};

function LoginScreen({ users, onLogin, onNewUser }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <img src="/coat_logo.png" alt="Logo COAT" className="h-24 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-black">Cirugías COAT</h1>
          <p className="text-slate-500 text-sm mt-1">Seleccioná tu usuario para continuar</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-700 text-sm flex items-center gap-2">
              <UsersIcon size={16} className="text-indigo-500" />
              Usuarios
            </h2>
          </div>
          <div className="p-2 space-y-1">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => onLogin(u)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-indigo-50 transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold group-hover:bg-indigo-200 transition-colors">
                  {u.nombre.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-700 text-sm">{u.nombre}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{u.rol}</p>
                </div>
                <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  u.rol === ROLES.ADMIN ? 'bg-rose-100 text-rose-600' :
                  u.rol === ROLES.DIRECTORA ? 'bg-indigo-100 text-indigo-600' :
                  u.rol === ROLES.SECRE ? 'bg-amber-100 text-amber-600' :
                  u.rol === ROLES.RESIDENTE ? 'bg-teal-100 text-teal-700' :
                  'bg-emerald-100 text-emerald-600'
                }`}>
                  {u.rol}
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-100">
            <button
              onClick={onNewUser}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all text-sm font-semibold"
            >
              <UserPlus size={16} />
              Crear nuevo usuario
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditLogPanel() {
  const [logs, setLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
  });
  const [search, setSearch] = useState('');

  const filtered = logs.filter(l => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (l.usuario || '').toLowerCase().includes(term) || (l.accion || '').toLowerCase().includes(term) || (l.detalle || '').toLowerCase().includes(term);
  });

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const accionColors = {
    CREAR: 'bg-emerald-100 text-emerald-700',
    EDITAR: 'bg-blue-100 text-blue-700',
    ELIMINAR: 'bg-rose-100 text-rose-700',
    ESTADO: 'bg-purple-100 text-purple-700',
    CODIFICAR: 'bg-indigo-100 text-indigo-700',
    MATERIAL: 'bg-amber-100 text-amber-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest">Historial de Auditoría ({filtered.length})</h4>
        <div className="flex items-center gap-2">
          <input className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-slate-400" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => setLogs(JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'))} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors" title="Actualizar">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
          </button>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mb-3">Registros inmutables — no se pueden eliminar</p>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-slate-400 text-xs">No hay registros de auditoría.</p>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-2 font-bold text-slate-500">Fecha</th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Usuario</th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Acción</th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDate(l.fecha)}</td>
                  <td className="px-4 py-2 font-bold text-slate-700">{l.usuario}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${accionColors[l.accion] || 'bg-slate-100 text-slate-600'}`}>
                      {l.accion}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{l.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProfessionalSearchSelect({
  professionals,
  selectedId,
  onSelect,
  placeholder = "Buscar médico por apellido (ej: Valeriani, Romani)...",
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedProf = useMemo(() => {
    return professionals.find(p => String(p.id) === String(selectedId));
  }, [professionals, selectedId]);

  // Lista procesada con apellido desglosado
  const processedProfs = useMemo(() => {
    return professionals.map(p => {
      const parsed = parseDoctorNameParts(p.nombre, p.prefijo, p.nombreOnly, p.apellido);
      const apellido = (p.apellido || parsed.apellido || '').trim();
      const cleanNombre = (p.nombre || '').trim();
      return {
        ...p,
        parsedApellido: apellido,
        parsedNombrePila: (p.nombrePila || parsed.nombrePila || '').trim(),
        displayName: cleanNombre
      };
    });
  }, [professionals]);

  // Filtrado optimizado por apellido (y también nombre si aplica)
  const filteredProfs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return processedProfs;

    return processedProfs.filter(p => {
      const ape = (p.parsedApellido || '').toLowerCase();
      const nom = (p.displayName || '').toLowerCase();
      // Prioridad: que coincida con el apellido
      return ape.includes(q) || nom.includes(q);
    }).sort((a, b) => {
      const qLower = q.toLowerCase();
      const aStartsApe = (a.parsedApellido || '').toLowerCase().startsWith(qLower);
      const bStartsApe = (b.parsedApellido || '').toLowerCase().startsWith(qLower);
      if (aStartsApe && !bStartsApe) return -1;
      if (!aStartsApe && bStartsApe) return 1;
      return (a.parsedApellido || a.displayName).localeCompare(b.parsedApellido || b.displayName);
    });
  }, [processedProfs, searchQuery]);

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Botón trigger */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-sm transition-all bg-white ${
          isOpen ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-300 hover:border-slate-400'
        } ${required && !selectedProf ? 'border-amber-400 bg-amber-50/20' : ''}`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          <Search size={15} className={selectedProf ? 'text-indigo-600' : 'text-slate-400'} />
          {selectedProf ? (
            <div className="truncate">
              <span className="font-bold text-slate-800">{selectedProf.nombre}</span>
              {selectedProf.especialidad && (
                <span className="ml-2 text-xs text-slate-400 font-normal">({selectedProf.especialidad})</span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 text-sm">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
      </button>

      {/* Dropdown flotante */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-[150] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Barra de búsqueda integrada con foco automático */}
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search size={16} className="text-indigo-500 ml-1 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent px-2 py-1 text-sm outline-none placeholder:text-slate-400 text-slate-800"
              placeholder="Escribí el apellido del médico (ej: Valeriani)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setIsOpen(false);
                if (e.key === 'Enter' && filteredProfs.length > 0) {
                  e.preventDefault();
                  onSelect(filteredProfs[0]);
                  setIsOpen(false);
                  setSearchQuery('');
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Opciones filtradas */}
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
            {/* Opción deseleccionar */}
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
                setSearchQuery('');
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-100 transition-colors"
            >
              -- Sin seleccionar / Quitar selección --
            </button>

            {filteredProfs.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400">
                No se encontraron médicos con el apellido "{searchQuery}".
              </div>
            ) : (
              filteredProfs.map(prof => {
                const isSelected = String(prof.id) === String(selectedId);
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => {
                      onSelect(prof);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 truncate">
                        {prof.parsedApellido ? (
                          <span className="font-bold text-slate-900">
                            {prof.parsedApellido}
                            <span className="font-normal text-slate-600 text-xs ml-1">
                              ({prof.nombre})
                            </span>
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-800">{prof.nombre}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        {prof.especialidad && <span>{prof.especialidad}</span>}
                        {prof.mp && <span>• MP: {prof.mp}</span>}
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={16} className="text-indigo-600 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPanel({ users, setUsers, currentUser, onClose, inline, obrasSociales, setObrasSociales, userRole, professionals, setProfessionals }) {
  const [adminSubTab, setAdminSubTab] = useState('usuarios');
  const [newNombre, setNewNombre] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [newRol, setNewRol] = useState(ROLES.MEDICO);
  const [newProfessionalId, setNewProfessionalId] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [editRol, setEditRol] = useState(ROLES.MEDICO);
  const [editProfessionalId, setEditProfessionalId] = useState(null);
  const [newOS, setNewOS] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedOSForCodes, setSelectedOSForCodes] = useState('');
  const [osCodePresupuesto, setOsCodePresupuesto] = useState(() => {
    try { return JSON.parse(localStorage.getItem('os_code_presupuesto') || '{}'); } catch { return {}; }
  });
  const [restrictCalendarDrag, setRestrictCalendarDrag] = useState(() => {
    try { return localStorage.getItem('restrict_calendar_drag') !== 'false'; } catch { return true; }
  });
  const [enableGoogleCalendarSync, setEnableGoogleCalendarSync] = useState(() => {
    try { return localStorage.getItem('enable_google_calendar_sync') !== 'false'; } catch { return true; }
  });
  const [enableNotifications, setEnableNotifications] = useState(() => {
    try { return localStorage.getItem('enable_system_notifications') !== 'false'; } catch { return true; }
  });

  useEffect(() => { localStorage.setItem('os_code_presupuesto', JSON.stringify(osCodePresupuesto)); }, [osCodePresupuesto]);
  useEffect(() => { localStorage.setItem('restrict_calendar_drag', JSON.stringify(restrictCalendarDrag)); }, [restrictCalendarDrag]);
  useEffect(() => { localStorage.setItem('enable_google_calendar_sync', JSON.stringify(enableGoogleCalendarSync)); }, [enableGoogleCalendarSync]);
  useEffect(() => { localStorage.setItem('enable_system_notifications', JSON.stringify(enableNotifications)); }, [enableNotifications]);

  const toggleCodePresupuesto = (os, code) => {
    setOsCodePresupuesto(prev => {
      const key = `${os}||${code}`;
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
  };

  const isMedico = userRole === ROLES.MEDICO;

  const roleToDbRole = (r) => {
    if (r === ROLES.ADMIN) return 'admin';
    if (r === ROLES.DIRECTORA) return 'direccion_medica';
    if (r === ROLES.SECRE) return 'secre';
    if (r === ROLES.RESIDENTE) return 'residente';
    return 'medico';
  };

  const handleCreate = async () => {
    setError('');
    setSuccessMsg('');
    const trimmedInput = newNombre.trim();
    if (!trimmedInput) { setError('Ingrese un usuario o email'); return; }
    if (!newPassword || newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    const effectiveEmail = trimmedInput.includes('@') ? trimmedInput.toLowerCase() : `${trimmedInput.toLowerCase()}@coat.com.ar`;
    const cleanUser = getCleanUsername(trimmedInput);

    if (users.find(u => (u.email || '').toLowerCase() === effectiveEmail || (u.nombre || '').toLowerCase() === trimmedInput.toLowerCase())) {
      setError('Ya existe un usuario con ese email o nombre');
      return;
    }

    setIsSubmittingUser(true);
    let secondaryApp = null;
    try {
      // 1. Crear en Firebase Authentication usando una app secundaria para no cerrar la sesión del admin
      const secondaryAppName = `SecondaryAuth_${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      try {
        await createUserWithEmailAndPassword(secondaryAuth, effectiveEmail, newPassword);
        await signOut(secondaryAuth);
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          console.warn('El usuario ya existe en Firebase Auth, procediendo a vincular/actualizar permisos.');
        } else {
          throw authErr;
        }
      }

      // 2. Guardar en Firestore authorized_emails
      const docId = effectiveEmail.replace(/[.@]/g, '_');
      const profObj = professionals.find(p => String(p.id) === String(newProfessionalId));
      const profName = profObj ? profObj.nombre : (trimmedInput.includes('@') ? cleanUser : trimmedInput);

      const userDocData = {
        email: effectiveEmail,
        username: cleanUser,
        role: roleToDbRole(newRol),
        profesionalName: profName,
        professionalId: newProfessionalId || null,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.email || 'admin'
      };

      await apiService.setDocument('authorized_emails', docId, userDocData);

      // 3. Actualizar estado local
      const newUser = {
        id: docId,
        username: cleanUser,
        nombre: profName,
        profesionalName: profName,
        email: effectiveEmail,
        rol: newRol,
        professionalId: newProfessionalId || null
      };

      setUsers(prev => [...prev.filter(u => (u.email || '').toLowerCase() !== effectiveEmail), newUser]);
      setNewNombre('');
      setNewPassword('');
      setNewRol(ROLES.MEDICO);
      setNewProfessionalId(null);
      setSuccessMsg(`Usuario ${cleanUser} (${effectiveEmail}) creado y guardado con éxito.`);
    } catch (err) {
      console.error('Error al crear usuario:', err);
      let msg = err.message || 'Error al crear usuario';
      if (msg.includes('auth/email-already-in-use')) msg = 'El email ya se encuentra registrado en el sistema.';
      if (msg.includes('auth/weak-password')) msg = 'La contraseña es muy débil (mínimo 6 caracteres).';
      setError(msg);
    } finally {
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); } catch {}
      }
      setIsSubmittingUser(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editNombre.trim()) { setError('Ingrese un nombre'); return; }
    if (!editingUser) return;
    try {
      const docId = editingUser.id || (editingUser.email ? editingUser.email.replace(/[.@]/g, '_') : null);
      const profObj = professionals.find(p => String(p.id) === String(editProfessionalId));
      const profName = profObj ? profObj.nombre : editNombre.trim();

      if (docId) {
        await apiService.updateDocument('authorized_emails', docId, {
          role: roleToDbRole(editRol),
          profesionalName: profName,
          professionalId: editProfessionalId || null
        });
      }

      setUsers(users.map(u => u.id === editingUser.id ? {
        ...u,
        nombre: editNombre.trim(),
        profesionalName: profName,
        rol: editRol,
        professionalId: editProfessionalId
      } : u));
      setEditingUser(null);
      setError('');
    } catch (err) {
      console.error('Error actualizando usuario en Firestore:', err);
      setError('Error al actualizar usuario: ' + err.message);
    }
  };

  const handleDelete = async (userToDelete) => {
    const userId = typeof userToDelete === 'object' ? userToDelete.id : userToDelete;
    const targetUser = typeof userToDelete === 'object' ? userToDelete : users.find(u => u.id === userId);
    if (!targetUser) return;

    if (targetUser.id === currentUser.id || targetUser.email === currentUser.email) {
      setError('No puedes eliminar tu propio usuario');
      return;
    }
    if (window.confirm(`¿Eliminar al usuario ${targetUser.nombre || targetUser.email}? Ya no podrá acceder al sistema.`)) {
      try {
        const docId = targetUser.id || targetUser.email?.replace(/[.@]/g, '_');
        if (docId) {
          await apiService.deleteDocument('authorized_emails', docId);
        }
        setUsers(users.filter(u => u.id !== targetUser.id));
        setError('');
      } catch (err) {
        console.error('Error eliminando usuario de Firestore:', err);
        setError('Error al eliminar usuario de Firestore');
      }
    }
  };

  const content = (
    <>
      <div className="p-6 overflow-y-auto space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium border border-rose-200">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
            {successMsg}
          </div>
        )}

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
             <button onClick={() => setAdminSubTab('usuarios')}
               className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                 adminSubTab === 'usuarios' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
               }`}
             >
               Usuarios
             </button>
              <button onClick={() => setAdminSubTab('profesionales')}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  adminSubTab === 'profesionales' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Profesionales
              </button>
              <button onClick={() => setAdminSubTab('obrasSociales')}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  adminSubTab === 'obrasSociales' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Obras Sociales
              </button>
          {!isMedico && (
            <button onClick={() => setAdminSubTab('codigosOS')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                adminSubTab === 'codigosOS' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Códigos por OS
            </button>
          )}
          <button onClick={() => setAdminSubTab('historial')}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              adminSubTab === 'historial' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Historial
          </button>
          {!isMedico && (
            <button onClick={() => setAdminSubTab('consentimientos')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                adminSubTab === 'consentimientos' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Consentimientos
            </button>
          )}
          {!isMedico && (
            <button onClick={() => setAdminSubTab('mensajesWA')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                adminSubTab === 'mensajesWA' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Mensajes WhatsApp
            </button>
          )}
          {!isMedico && (
            <button onClick={() => setAdminSubTab('config')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                adminSubTab === 'config' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Configuración
            </button>
          )}
          {!isMedico && (
            <button onClick={() => setAdminSubTab('importar')}
              className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                adminSubTab === 'importar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Importar
            </button>
          )}
        </div>

        {adminSubTab === 'usuarios' && (
        <>
        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
          <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">Crear nuevo usuario</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm bg-white"
              placeholder="Usuario o Email (ej: juan o juan@coat.com.ar)"
              value={newNombre}
              onChange={e => setNewNombre(e.target.value)}
              disabled={isSubmittingUser}
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm bg-white"
                placeholder="Contraseña (mínimo 6 caracteres)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={isSubmittingUser}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap gap-2">
            <select
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm bg-white"
              value={newRol}
              onChange={e => setNewRol(e.target.value)}
              disabled={isSubmittingUser}
            >
              {Object.values(ROLES).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm bg-white"
              value={newProfessionalId || ''}
              onChange={e => setNewProfessionalId(e.target.value || null)}
              disabled={isSubmittingUser}
            >
              <option value="">Sin profesional vinculado</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button
              onClick={handleCreate}
              disabled={isSubmittingUser}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              {isSubmittingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {isSubmittingUser ? 'Guardando...' : 'Crear Usuario'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            * El usuario podrá iniciar sesión con su nombre de usuario o su correo y la contraseña asignada aquí.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-3">Usuarios existentes ({users.length})</h4>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                u.id === currentUser.id || u.email === currentUser?.email ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-slate-200'
              }`}>
                {editingUser?.id === u.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <input
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        value={editNombre}
                        onChange={e => setEditNombre(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-1">
                        <select
                          className="flex-1 px-2 py-1 rounded-lg border border-slate-300 text-[10px]"
                          value={editRol}
                          onChange={e => setEditRol(e.target.value)}
                        >
                          {Object.values(ROLES).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select
                          className="flex-1 px-2 py-1 rounded-lg border border-slate-300 text-[10px]"
                          value={editProfessionalId || ''}
                          onChange={e => setEditProfessionalId(e.target.value || null)}
                        >
                          <option value="">Sin profesional</option>
                          {professionals.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                    <button onClick={handleSaveEdit} className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Guardar cambios">
                      <CheckCircle2 size={16} />
                    </button>
                    <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors" title="Cancelar">
                      <XCircle size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                      {getCleanUsername(u.nombre || u.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-700 text-sm truncate">
                          {getCleanUsername(u.nombre || u.email)}
                        </p>
                        {(u.id === currentUser?.id || u.email === currentUser?.email) && (
                          <span className="text-[10px] text-indigo-500 font-semibold">(vos)</span>
                        )}
                      </div>
                      {u.email && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {u.email}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      u.rol === ROLES.ADMIN ? 'bg-rose-100 text-rose-600' :
                      u.rol === ROLES.DIRECTORA ? 'bg-indigo-100 text-indigo-600' :
                      u.rol === ROLES.SECRE ? 'bg-amber-100 text-amber-600' :
                      u.rol === ROLES.RESIDENTE ? 'bg-teal-100 text-teal-700' :
                      'bg-emerald-100 text-emerald-600'
                    }`}>
                      {u.rol}
                    </span>
                    <button
                      onClick={() => { setEditingUser(u); setEditNombre(u.nombre || u.profesionalName || ''); setEditRol(u.rol); setEditProfessionalId(u.professionalId || null); }}
                      className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                      title="Editar rol / datos"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Eliminar usuario"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        </>
        )}

         {adminSubTab === 'obrasSociales' && (
           <div>
             <h4 className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-3">Obras Sociales ({obrasSociales.length})</h4>
             <div className="flex gap-2 mb-3">
               <input
                 className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
                 placeholder="Agregar obra social..."
                 value={newOS}
                 onChange={e => setNewOS(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter' && newOS.trim()) { setObrasSociales([...obrasSociales, newOS.trim()]); setNewOS(''); } }}
                 list="os-admin-list"
               />
               <datalist id="os-admin-list">
                 {DEFAULT_OBRAS_SOCIALES.filter(os => !obrasSociales.includes(os)).map(os => <option key={os} value={os} />)}
               </datalist>
               <button
                 onClick={() => { if (newOS.trim()) { setObrasSociales([...obrasSociales, newOS.trim()]); setNewOS(''); } }}
                 className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-md"
               >
                 <PlusCircle size={14} /> Agregar
               </button>
             </div>
             <div className="flex flex-wrap gap-2">
               {obrasSociales.map(os => (
                 <div key={os} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
                   {os}
                   <button
                     onClick={() => { if (window.confirm(`¿Eliminar "${os}"?`)) setObrasSociales(obrasSociales.filter(o => o !== os)); }}
                     className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                   >
                     <XCircle size={14} />
                   </button>
                 </div>
               ))}
             </div>
           </div>
         )}
         {adminSubTab === 'profesionales' && (
           <ProfesionalesView professionals={professionals} setProfessionals={setProfessionals} />
         )}

        {adminSubTab === 'codigosOS' && !isMedico && (
        <div>
          <h4 className="text-xs font-black text-purple-600 uppercase tracking-widest mb-3">Códigos Quirúrgicos por Obra Social</h4>
          <p className="text-[10px] text-slate-400 mb-3">Marque los códigos que requieren presupuesto para cada obra social</p>
          <div className="mb-4">
            <select className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500" value={selectedOSForCodes} onChange={e => setSelectedOSForCodes(e.target.value)}>
              <option value="">Seleccionar obra social...</option>
              {obrasSociales.map(os => <option key={os} value={os}>{os}</option>)}
            </select>
          </div>
          {selectedOSForCodes && (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-bold text-slate-500">Código</th>
                    <th className="text-left px-4 py-2 font-bold text-slate-500">Nombre</th>
                    <th className="text-center px-4 py-2 font-bold text-slate-500 w-32">Por Presupuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedOSForCodes.toUpperCase().includes('IOSFA') && CLINICAL_NOMENCLADOR.map(c => (
                    <tr key={c.code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 font-bold text-indigo-700">{c.code}</td>
                      <td className="px-4 py-2 text-slate-600">{c.name}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => toggleCodePresupuesto(selectedOSForCodes, c.code)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            osCodePresupuesto[`${selectedOSForCodes}||${c.code}`]
                              ? 'bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {osCodePresupuesto[`${selectedOSForCodes}||${c.code}`] ? 'SI' : 'NO'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {selectedOSForCodes.toUpperCase().includes('SWISS') && MODULOS_SM.map(m => {
                    const includedNames = (m.includes || []).map(code => {
                      const found = CLINICAL_NOMENCLADOR.find(c => c.code === code);
                      return found ? `${code} ${found.name}` : code;
                    }).join(', ');
                    return (
                    <tr key={`sm-${m.code}`} className="border-b border-slate-100 last:border-0 bg-purple-50/50 hover:bg-purple-50 transition-colors">
                      <td className="px-4 py-2 font-bold text-purple-700">{m.code}</td>
                      <td className="px-4 py-2 text-slate-600 font-medium">
                        {m.name}
                        {includedNames && <span className="text-slate-400 font-normal text-[10px] ml-1">({includedNames})</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => toggleCodePresupuesto(selectedOSForCodes, m.code)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            osCodePresupuesto[`${selectedOSForCodes}||${m.code}`]
                              ? 'bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {osCodePresupuesto[`${selectedOSForCodes}||${m.code}`] ? 'SI' : 'NO'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                  {selectedOSForCodes.toUpperCase().includes('IOSFA') && CODIGOS_IOSFA.map(c => (
                    <tr key={`iosfa-${c.code}`} className="border-b border-slate-100 last:border-0 bg-emerald-50/50 hover:bg-emerald-50 transition-colors">
                      <td className="px-4 py-2 font-bold text-emerald-700">{c.code} <span className="text-emerald-500 font-normal">({c.generalCode})</span></td>
                      <td className="px-4 py-2 text-slate-600 font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => toggleCodePresupuesto(selectedOSForCodes, c.code)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            osCodePresupuesto[`${selectedOSForCodes}||${c.code}`]
                              ? 'bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {osCodePresupuesto[`${selectedOSForCodes}||${c.code}`] ? 'SI' : 'NO'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {adminSubTab === 'historial' && (
        <AuditLogPanel />
        )}

        {adminSubTab === 'consentimientos' && !isMedico && (
        <ConsentimientosAdmin />
        )}

        {adminSubTab === 'config' && !isMedico && (
        <div>
          <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-4">Configuración del Sistema</h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p className="font-bold text-slate-700 text-sm">Restringir arrastre en calendario</p>
                <p className="text-xs text-slate-500 mt-0.5">Si está activado, cada médico solo puede mover sus propias cirugías en el calendario. Directora y Admin siempre pueden mover todo.</p>
              </div>
              <button
                onClick={() => setRestrictCalendarDrag(!restrictCalendarDrag)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  restrictCalendarDrag ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  restrictCalendarDrag ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-700 text-sm">Sincronización con Google Calendar</p>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">Google Calendar / Gmail</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Permite a los profesionales sincronizar y agregar sus cirugías en 1 clic directamente a su cuenta de Gmail y Google Calendar personal.</p>
              </div>
              <button
                onClick={() => setEnableGoogleCalendarSync(!enableGoogleCalendarSync)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enableGoogleCalendarSync ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableGoogleCalendarSync ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-700 text-sm">Notificaciones del Sistema</p>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">Alertas y Avisos</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Activa o desactiva las alertas sonoras y notificaciones emergentes de cirugías nuevas, cambios de estado y recordatorios.</p>
              </div>
              <button
                onClick={() => {
                  const nextVal = !enableNotifications;
                  setEnableNotifications(nextVal);
                  if (nextVal && 'Notification' in window && Notification.permission !== 'granted') {
                    Notification.requestPermission();
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enableNotifications ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableNotifications ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
        )}

        {adminSubTab === 'mensajesWA' && !isMedico && (
          <div>
            <WhatsAppTemplatesAdmin />
          </div>
        )}

        {adminSubTab === 'importar' && !isMedico && (
          <div>
            <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-3">Importar datos del sistema anterior</h4>
            <DataImporter onDataImported={() => window.location.reload()} />
          </div>
        )}
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-slate-700 flex items-center gap-2">
            <Settings size={18} className="text-indigo-600" />
            Panel de Administración
          </h3>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-indigo-600" />
            <h3 className="font-bold text-slate-800">Panel de Administración</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <XCircle size={20} className="text-slate-400" />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}

const AUDIT_KEY = 'cirugiascoat_audit_log';

const addAuditLog = (accion, detalle, usuario) => {
  try {
    const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    log.unshift({
      id: Date.now() + Math.random(),
      fecha: new Date().toISOString(),
      usuario: usuario || 'Sistema',
      accion,
      detalle,
    });
    if (log.length > 500) log.length = 500;
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
  } catch {}
};

function MetricsPanel({ surgeries }) {
  const [osFilter, setOsFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const monthlyData = useMemo(() => {
    const data = {};
    surgeries.forEach(s => {
      let d;
      if (s.fechaCreacion) {
        const parts = s.fechaCreacion.split('/');
        if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        else d = new Date(s.fechaCreacion);
      } else {
        d = new Date(s.fecha);
      }
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!data[key]) data[key] = { label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, total: 0, realizadas: 0, canceladas: 0, rechazadas: 0 };
      data[key].total++;
      if (s.estado === 'AUTORIZADA') data[key].realizadas++;
      if (s.estado === 'CANCELADA') data[key].canceladas++;
      if (s.estado === 'RECHAZADA') data[key].rechazadas++;
    });
    return Object.entries(data).sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v);
  }, [surgeries]);

  const osOptions = useMemo(() => {
    const set = new Set(surgeries.map(s => s.obraSocial).filter(Boolean));
    return [...set].sort();
  }, [surgeries]);

  const filteredSurgeries = useMemo(() => {
    let filtered = surgeries;
    if (osFilter) {
      filtered = filtered.filter(s => s.obraSocial === osFilter);
    }
    if (startDate) {
      filtered = filtered.filter(s => s.fecha >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(s => s.fecha <= endDate);
    }
    return filtered;
  }, [surgeries, osFilter, startDate, endDate]);

  const topCodes = useMemo(() => {
    const counts = {};
    filteredSurgeries.forEach(s => {
      const codes = (s.codigosAuditados || s.codigos || '').split(/\n/).filter(c => c.trim());
      codes.forEach(c => { const code = c.trim(); counts[code] = (counts[code] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, count, name: getCodeName(code) }));
  }, [filteredSurgeries]);

  const osStats = useMemo(() => {
    const stats = {};
    filteredSurgeries.forEach(s => {
      const os = s.obraSocial || 'Sin OS';
      if (!stats[os]) stats[os] = { total: 0, realizadas: 0, canceladas: 0, rechazadas: 0 };
      stats[os].total++;
      if (s.estado === 'AUTORIZADA') stats[os].realizadas++;
      if (s.estado === 'CANCELADA') stats[os].canceladas++;
      if (s.estado === 'RECHAZADA') stats[os].rechazadas++;
    });
    return Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
  }, [filteredSurgeries]);

  const maxTotal = Math.max(...monthlyData.map(m => m.total), 1);

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cirugías Realizadas');

    const formatDateForExcel = (dateStr) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    };

    worksheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Nombre del paciente', key: 'paciente', width: 30 },
      { header: 'Obra social', key: 'obraSocial', width: 20 },
      { header: 'Códigos solicitados', key: 'codigos', width: 30 },
      { header: 'Profesional', key: 'nombreProfesional', width: 25 },
    ];

    filteredSurgeries.forEach(s => {
      worksheet.addRow({
        fecha: formatDateForExcel(s.fecha),
        paciente: s.paciente,
        obraSocial: s.obraSocial,
        codigos: (s.codigosAuditados || s.codigos || '').replace(/\n/g, ', '),
        nombreProfesional: s.nombreProfesional,
      });
    });

    // Style the header
    worksheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    let filename = 'Cirugias';
    if (startDate && endDate) {
      filename += `_${startDate}_a_${endDate}`;
    } else if (startDate) {
      filename += `_${startDate}`;
    } else if (endDate) {
      filename += `_hasta_${endDate}`;
    }
    
    saveAs(blob, `${filename}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" />
            <h3 className="font-bold text-slate-700 text-lg">Métricas</h3>
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-md"
          >
            <FileText size={16} />
            Descargar Excel
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Obra Social</label>
            <select className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white outline-none" value={osFilter} onChange={e => setOsFilter(e.target.value)}>
              <option value="">Todas las OS</option>
              {osOptions.map(os => <option key={os} value={os}>{os}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Desde</label>
            <input
              type="date"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white outline-none"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Hasta</label>
            <input
              type="date"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white outline-none"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setOsFilter(''); setStartDate(''); setEndDate(''); }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1.5"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        {/* Monthly chart */}
        <div className="mb-8">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cirugías por Mes</h4>
          <div className="space-y-2">
            {monthlyData.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 w-20 shrink-0">{m.label}</span>
                <div className="flex-1 flex items-center gap-1 h-7">
                  <div className="h-full bg-emerald-400 rounded-l" style={{ width: `${(m.realizadas / maxTotal) * 100}%`, minWidth: m.realizadas > 0 ? '4px' : '0' }} title={`Realizadas: ${m.realizadas}`} />
                  <div className="h-full bg-amber-400" style={{ width: `${((m.total - m.realizadas - m.canceladas - m.rechazadas) / maxTotal) * 100}%`, minWidth: (m.total - m.realizadas - m.canceladas - m.rechazadas) > 0 ? '4px' : '0' }} title={`En proceso: ${m.total - m.realizadas - m.canceladas - m.rechazadas}`} />
                  <div className="h-full bg-rose-400" style={{ width: `${(m.rechazadas / maxTotal) * 100}%`, minWidth: m.rechazadas > 0 ? '4px' : '0' }} title={`Rechazadas: ${m.rechazadas}`} />
                  <div className="h-full bg-slate-400 rounded-r" style={{ width: `${(m.canceladas / maxTotal) * 100}%`, minWidth: m.canceladas > 0 ? '4px' : '0' }} title={`Canceladas: ${m.canceladas}`} />
                </div>
                <span className="text-xs font-bold text-slate-600 w-8 text-right">{m.total}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" /> Realizadas</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> En proceso</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-400 inline-block" /> Rechazadas</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-400 inline-block" /> Canceladas</span>
          </div>
        </div>

        {/* OS filter + Stats */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Obra Social</h4>
            <select className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-white outline-none" value={osFilter} onChange={e => setOsFilter(e.target.value)}>
              <option value="">Todas las OS</option>
              {osOptions.map(os => <option key={os} value={os}>{os}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {osStats.map(([os, stats]) => (
              <div key={os} className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-slate-700 text-sm mb-2">{os}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-400">Total:</span> <span className="font-bold text-slate-700">{stats.total}</span></div>
                  <div><span className="text-emerald-500">Realizadas:</span> <span className="font-bold text-emerald-700">{stats.realizadas}</span></div>
                  <div><span className="text-rose-500">Rechazadas:</span> <span className="font-bold text-rose-700">{stats.rechazadas}</span></div>
                  <div><span className="text-slate-400">Canceladas:</span> <span className="font-bold text-slate-600">{stats.canceladas}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top codes */}
        {topCodes.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Códigos más solicitados {osFilter ? `(${osFilter})` : '(todas las OS)'}
            </h4>
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200">
                  <th className="text-left px-4 py-2 font-bold text-slate-500">#</th>
                  <th className="text-left px-4 py-2 font-bold text-slate-500">Código</th>
                  <th className="text-left px-4 py-2 font-bold text-slate-500">Nombre</th>
                  <th className="text-right px-4 py-2 font-bold text-slate-500">Pedidos</th>
                </tr></thead>
                <tbody>
                  {topCodes.map((c, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 text-slate-400 font-bold">{i + 1}</td>
                      <td className="px-4 py-2 font-bold text-indigo-700">{c.code}</td>
                      <td className="px-4 py-2 text-slate-600">{c.name}</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-700">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { MetricsPanel };



export default function SurgeryApp({ initialTab, lowPerfMode }) {
  const { currentUser: authUser, userRole: authRole, isSuperAdmin, logout } = useAuth();
  
  // Map Firebase Auth user to legacy format for SurgeryApp compatibility
  const [currentUser, setCurrentUser] = useState(() => {
    if (authUser) {
      const roleMap = { admin: 'Admin', secre: 'Secre', secre_estudios: 'Secre Estudios', medico: 'Medico', direccion_medica: 'Directora', coat: 'Admin', residente: 'Residente' };
      const rawName = authUser.displayName || getCleanUsername(authUser.email);
      return { id: authUser.uid, nombre: rawName, rol: roleMap[authRole] || 'Admin', email: authUser.email };
    }
    const saved = localStorage.getItem('current_user_proto');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          nombre: parsed.profesionalName || getCleanUsername(parsed.nombre || parsed.email)
        };
      } catch (e) {}
    }
    return null;
  });
  const [users, setUsers] = useState(() => {
    const cleared = localStorage.getItem('data_cleared');
    const saved = localStorage.getItem('users_proto');
    if (saved) return JSON.parse(saved);
    if (cleared) return [];
    localStorage.setItem('users_proto', JSON.stringify(SEED_USERS));
    return SEED_USERS;
  });
  const [surgeries, setSurgeries] = useState(() => {
    const cleared = localStorage.getItem('data_cleared');
    const saved = localStorage.getItem('surgeries_proto');
    if (saved) return JSON.parse(saved);
    if (cleared) return [];
    localStorage.setItem('surgeries_proto', JSON.stringify(SEED_SURGERIES));
    return SEED_SURGERIES;
  });
  const [obrasSociales, setObrasSociales] = useState(() => {
    const cleared = localStorage.getItem('data_cleared');
    const saved = localStorage.getItem('obras_sociales_proto');
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = [...new Set([...DEFAULT_OBRAS_SOCIALES, ...parsed])];
      return merged;
    }
    if (cleared) return [...DEFAULT_OBRAS_SOCIALES];
    localStorage.setItem('obras_sociales_proto', JSON.stringify(DEFAULT_OBRAS_SOCIALES));
    return DEFAULT_OBRAS_SOCIALES;
  });
  const [professionals, setProfessionals] = useState(() => {
    const cleared = localStorage.getItem('data_cleared');
    const saved = localStorage.getItem('professionals_proto');
    if (saved) return JSON.parse(saved);
    if (cleared) return [];
    localStorage.setItem('professionals_proto', JSON.stringify(SEED_PROFESSIONALS));
    return SEED_PROFESSIONALS;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showNewUserLogin, setShowNewUserLogin] = useState(false);

  const userRole = currentUser?.rol || null;
  const isSecreEstudios = userRole === ROLES.SECRE_ESTUDIOS;

  const [formData, setFormData] = useState({ 
    emailProfesional: '', 
    nombreProfesional: '', 
    professionalId: null,
    residente: '',
    tipoProcedimiento: isSecreEstudios ? 'ESTUDIO' : 'CIRUGIA',
    estudioBajoAnestesia: isSecreEstudios,
    fechaSolicitud: new Date().toISOString().slice(0, 10),
    fecha: '', 
    duracion: '1:00 hs', 
    paciente: '', 
    edad: '', 
    dni: '', 
    nroAfiliado: '',
    contactoFamiliar: '', 
    esPacienteClinica: 'SI', 
    obraSocial: '', 
    psicoprofilaxis: 'SI', 
    codigos: '', 
    materiales: '', 
    requiereMaterial: 'NO',
    justificacion: '', 
     anestesia: '', 
     requierePresupuesto: 'NO',
     notasDoctor: '',
    habitacion: '',
    horaInicio: '',
    horaFin: '',
    adjuntos: [],
  });

  const [periodoFilter, setPeriodoFilter] = useState('todas'); // 'proximas' | 'realizadas' | 'canceladas' | 'todas'
  const [statusFilter, setStatusFilter] = useState('');
  const [encargadoFilter, setEncargadoFilter] = useState('Auditadas');
  const [directoraFilter, setDirectoraFilter] = useState('Sin auditar');
  const [currentTab, setCurrentTab] = useState('Solicitud');
  const [searchTerm, setSearchTerm] = useState('');
  const [obraSocialFilter, setObraSocialFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [materialFilter, setMaterialFilter] = useState('TODOS');
  const [profFilter, setProfFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('TODOS'); // 'TODOS' | 'CIRUGIA' | 'ESTUDIO'
  const [selectedSurgery, setSelectedSurgery] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectMotivo, setRejectMotivo] = useState('');
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [auditCodes, setAuditCodes] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [printSurgery, setPrintSurgery] = useState(null);
  const [printModalData, setPrintModalData] = useState(null);
  const [editModalData, setEditModalData] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [codeInputs, setCodeInputs] = useState(['', '']);
  const [codeSuggestions, setCodeSuggestions] = useState({});
  const [activeCodeField, setActiveCodeField] = useState(null);
  const [editCodeInputs, setEditCodeInputs] = useState(['', '']);
  const [editCodeSuggestions, setEditCodeSuggestions] = useState({});
  const [editActiveCodeField, setEditActiveCodeField] = useState(null);
  const [materialSelections, setMaterialSelections] = useState({});
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [quirofanoModalDate, setQuirofanoModalDate] = useState(null);
  const [whatsAppModalSurgery, setWhatsAppModalSurgery] = useState(null);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showManageTemplatesModal, setShowManageTemplatesModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pacientesList, setPacientesList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('coat_pacientes') || '[]');
    } catch {
      return [];
    }
  });
  const [dniFoundMessage, setDniFoundMessage] = useState('');
  const [editDniFoundMessage, setEditDniFoundMessage] = useState('');

  const canCreate = userRole && (userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE || userRole === ROLES.DIRECTORA || userRole === ROLES.ADMIN || userRole === ROLES.SECRE_ESTUDIOS);
  const canAudit = userRole && (userRole === ROLES.DIRECTORA || userRole === ROLES.ADMIN);
  const canManageStatus = userRole === ROLES.SECRE || userRole === ROLES.SECRE_ESTUDIOS || userRole === ROLES.ADMIN;
  const canCancelOwn = userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE || userRole === ROLES.SECRE_ESTUDIOS;
  const isAdmin = userRole === ROLES.ADMIN;

  useEffect(() => {
    if (authUser) {
      const roleMap = { admin: 'Admin', secre: 'Secre', secre_estudios: 'Secre Estudios', medico: 'Medico', direccion_medica: 'Directora', coat: 'Admin', residente: 'Residente' };
      const matchingUser = (users || []).find(u => u.email?.toLowerCase() === authUser.email?.toLowerCase());
      const displayName = matchingUser?.profesionalName || authUser.displayName || getCleanUsername(authUser.email);
      setCurrentUser({ id: authUser.uid, nombre: displayName, rol: roleMap[authRole] || 'Admin', email: authUser.email });
    } else {
      setCurrentUser(null);
    }
  }, [authUser, authRole, users]);

  useEffect(() => {
    localStorage.setItem('users_proto', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('surgeries_proto', JSON.stringify(surgeries));
  }, [surgeries]);

  useEffect(() => {
    const joined = codeInputs.filter(c => c.trim()).join('\n');
    setFormData(prev => ({ ...prev, codigos: joined }));
  }, [codeInputs]);

  // Guardar borrador local en tiempo real si el usuario está escribiendo una nueva solicitud
  useEffect(() => {
    if (!isEditing && (formData.paciente || formData.dni || formData.justificacion)) {
      try {
        localStorage.setItem('draft_surgery_form', JSON.stringify(formData));
      } catch (e) {}
    }
  }, [formData, isEditing]);

  // Recuperar borrador si existe al inicio
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('draft_surgery_form');
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && !formData.paciente && (parsed.paciente || parsed.dni)) {
          setFormData(prev => ({ ...prev, ...parsed }));
          if (parsed.codigos) {
            const arr = parsed.codigos.split('\n').filter(c => c.trim());
            if (arr.length > 0) setCodeInputs(arr);
          }
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (editModalData) {
      const joined = editCodeInputs.filter(c => c.trim()).join('\n');
      setEditModalData(prev => prev ? { ...prev, codigos: joined } : prev);
    }
  }, [editCodeInputs]);

  useEffect(() => {
    localStorage.setItem('obras_sociales_proto', JSON.stringify(obrasSociales));
  }, [obrasSociales]);

  useEffect(() => {
    localStorage.setItem('professionals_proto', JSON.stringify(professionals));
  }, [professionals]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('current_user_proto', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('current_user_proto');
    }
  }, [currentUser]);

  // Cargar datos reales de Firestore (ordenes_internacion, profesionales, authorized_emails)
  useEffect(() => {
    const fetchRealData = async () => {
      try {
        // 1. Profesionales de Firestore
        const profsFromDb = await apiService.getCollection('profesionales');
        if (profsFromDb && profsFromDb.length > 0) {
          const formattedProfs = profsFromDb.map(p => {
            const cleanName = formatDoctorDisplayName(p.nombre || `${p.prefijo || ''} ${p.nombreOnly || ''} ${p.apellido || ''}`);
            return {
              id: p.id,
              nombre: cleanName || p.nombre,
              rawNombre: p.nombre,
              prefijo: p.prefijo || (cleanName.startsWith('Dra') ? 'Dra' : 'Dr'),
              nombrePila: p.nombreOnly || '',
              apellido: p.apellido || '',
              especialidad: (p.categoria || p.especialidad) === 'ORL' ? 'Otorrinolaringología' : (p.categoria || p.especialidad || 'Otorrinolaringología'),
              mp: p.mp || '',
              me: p.me || '',
              firma: p.firmaUrl || p.firma || ''
            };
          });
          setProfessionals(formattedProfs);
        }

        // 2. Órdenes de Internación de Firestore
        const ordersFromDb = await apiService.getCollection('ordenes_internacion');
        if (ordersFromDb && ordersFromDb.length > 0) {
          const mappedSurgeries = ordersFromDb.map(orden => {
            const codigosList = (orden.codigosCirugia || [])
              .filter(c => c && c.codigo)
              .map(c => c.codigo);
            const codigos = codigosList.join('\n');
            // Determinar estado sincronizado con app original
            let computedEstado = 'CODIFICADA';
            if (orden.suspendida) {
              computedEstado = 'CANCELADA';
            } else if (orden.autorizada || orden.status === 'autorizada') {
              computedEstado = 'AUTORIZADA';
            } else if (orden.enviada || orden.status === 'enviada') {
              computedEstado = 'ENVIADA';
            } else if (orden.estado && orden.estado !== 'SOLICITADA') {
              computedEstado = orden.estado;
            }

            const cleanProf = formatDoctorDisplayName(orden.profesional || orden.nombreProfesional || '');

            return {
              id: orden.id,
              emailProfesional: orden.emailProfesional || '',
              nombreProfesional: cleanProf,
              professionalId: orden.professionalId || null,
              tipoProcedimiento: orden.tipoProcedimiento || (orden.estudioBajoAnestesia ? 'ESTUDIO' : 'CIRUGIA'),
              conveniosEstudios: orden.conveniosEstudios || {},
              estudioBajoAnestesia: orden.tipoProcedimiento === 'ESTUDIO' || !!orden.estudioBajoAnestesia,
              fechaSolicitud: orden.fechaSolicitud || (orden.createdAt ? orden.createdAt.slice(0, 10) : (orden.fechaCirugia || orden.fecha || '')),
              fecha: orden.fechaCirugia || orden.fecha || '',
              duracion: orden.duracion || '1:00 hs',
              paciente: orden.afiliado || orden.paciente || '',
              edad: orden.edad || '',
              dni: orden.dni || '',
              nroAfiliado: orden.numeroAfiliado || orden.nroAfiliado || '',
              contactoFamiliar: orden.telefono || orden.contactoFamiliar || '',
              esPacienteClinica: orden.esPacienteClinica || 'SI',
              obraSocial: orden.obraSocial || '',
              psicoprofilaxis: orden.psicoprofilaxis || 'SI',
              codigos: codigos || orden.codigos || '',
              materiales: orden.descripcionMaterial || orden.materiales || '',
              requiereMaterial: orden.incluyeMaterial ? 'SI' : (orden.requiereMaterial || 'NO'),
              justificacion: orden.diagnostico || orden.justificacion || '',
              anestesia: orden.tipoAnestesia || orden.anestesia || '',
              requierePresupuesto: orden.requierePresupuesto || 'NO',
              notasDoctor: orden.anotacionCalendario || orden.notasDoctor || '',
              habitacion: orden.salaCirugia || orden.habitacion || '',
              horaInicio: orden.horaCirugia || orden.horaInicio || '',
              horaFin: orden.horaFin || ((orden.horaCirugia || orden.horaInicio) ? addMinutesToTime(orden.horaCirugia || orden.horaInicio, parseDurationToMinutes(orden.duracion || '1:00 hs')) : ''),
              estado: computedEstado,
              enviada: !!orden.enviada,
              autorizada: !!orden.autorizada,
              suspendida: !!orden.suspendida,
              aprobacionMaterial: orden.aprobacionMaterial || 'PENDIENTE',
              creador: orden.createdBy || orden.creador || 'Sistema',
              creadorRol: orden.creadorRol || 'Admin',
              fechaCreacion: orden.createdAt || new Date().toISOString(),
              codigosAuditados: codigos || orden.codigosAuditados || orden.codigos || '',
              notasDirectora: orden.notasDirectora || '',
              motivoRechazo: orden.motivoRechazo || '',
              motivoCancelacion: orden.motivoCancelacion || '',
              reactivada: orden.reactivada || false,
              adjuntos: Array.isArray(orden.adjuntos) ? orden.adjuntos : (orden.adjuntoUrl ? [orden.adjuntoUrl] : []),
              residente: orden.residente || '',
              modifiedBy: orden.modifiedBy || orden.updatedBy || '',
              modifiedAt: orden.modifiedAt || orden.updatedAt || '',
              pinned: !!orden.pinned || !!orden.isPinned || !!orden.fijado,
              horaIngreso: orden.horaIngreso || orden.horarioIngreso || '',
              ordenIngreso: orden.ordenIngreso || orden.orden || '',
            };
          });
          setSurgeries(mappedSurgeries);
        }

        // 2b. Pacientes de Firestore
        try {
          const pacientesFromDb = await apiService.getCollection('pacientes');
          if (pacientesFromDb && pacientesFromDb.length > 0) {
            setPacientesList(pacientesFromDb);
            localStorage.setItem('coat_pacientes', JSON.stringify(pacientesFromDb));
          }
        } catch (pErr) {
          console.error("Error al cargar colección de pacientes:", pErr);
        }

        // 3. Usuarios de Firestore (authorized_emails / profiles)
        const usersFromDb = await apiService.getCollection('authorized_emails');
        if (usersFromDb && usersFromDb.length > 0) {
          const roleMap = { admin: 'Admin', secre: 'Secre', medico: 'Medico', direccion_medica: 'Directora', coat: 'Admin', residente: 'Residente' };
          const uniqueByEmail = new Map();
          usersFromDb.forEach(u => {
            const emailKey = (u.email || '').toLowerCase().trim();
            if (emailKey && !uniqueByEmail.has(emailKey)) {
              const username = u.username || getCleanUsername(u.email);
              const displayName = u.profesionalName || username;
              uniqueByEmail.set(emailKey, {
                id: u.id,
                username: username,
                nombre: displayName,
                profesionalName: u.profesionalName || '',
                email: u.email,
                rol: roleMap[u.role] || 'Medico',
                professionalId: null
              });
            }
          });
          const mappedUsers = Array.from(uniqueByEmail.values());
          setUsers(mappedUsers);
          localStorage.setItem('users_proto', JSON.stringify(mappedUsers));
        }
      } catch (err) {
        console.error("Error al sincronizar datos reales desde Firestore:", err);
      }
    };

    fetchRealData();
  }, []);

  // Cargar plantillas personalizadas del usuario actual (Firestore con fallback en localStorage)
  useEffect(() => {
    const loadUserTemplates = async () => {
      const userKey = (currentUser?.email || authUser?.email || '').toLowerCase().trim();
      if (!userKey) {
        setCustomTemplates([]);
        return;
      }

      // 1. Cargar caché local inmediato
      try {
        const cached = localStorage.getItem(`custom_templates_${userKey}`);
        if (cached) {
          setCustomTemplates(JSON.parse(cached));
        }
      } catch (e) {}

      // 2. Cargar desde Firestore
      try {
        const templatesFromDb = await apiService.getCollection('user_surgical_templates', [
          { field: 'userEmail', op: '==', value: userKey }
        ]);
        if (templatesFromDb) {
          setCustomTemplates(templatesFromDb);
          localStorage.setItem(`custom_templates_${userKey}`, JSON.stringify(templatesFromDb));
        }
      } catch (err) {
        console.warn("No se pudieron cargar plantillas de Firestore, usando caché local:", err);
      }
    };

    loadUserTemplates();
  }, [currentUser?.email, authUser?.email]);

  const handleSaveCustomTemplate = async () => {
    const userKey = (currentUser?.email || authUser?.email || '').toLowerCase().trim();
    if (!newTemplateName.trim()) {
      alert("Por favor, ingrese un nombre para su plantilla.");
      return;
    }

    const codigosArr = codeInputs.filter(c => c && c.trim());
    const newTemplate = {
      name: newTemplateName.trim(),
      userEmail: userKey,
      diagnostico: formData.justificacion || '',
      anestesia: formData.anestesia || 'General',
      duracion: formData.duracion || '1:00 hs',
      requiereMaterial: formData.requiereMaterial || 'NO',
      materiales: formData.materiales || '',
      codigos: codigosArr.length > 0 ? codigosArr : (formData.codigos ? formData.codigos.split('\n').filter(Boolean) : []),
      notasDoctor: formData.notasDoctor || '',
      category: 'ORL - Personalizada',
      createdAt: new Date().toISOString()
    };

    try {
      let savedId = `local_${Date.now()}`;
      try {
        savedId = await apiService.addDocument('user_surgical_templates', newTemplate);
      } catch (dbErr) {
        console.warn("Error guardando en Firestore, guardando localmente:", dbErr);
      }
      
      const createdTemplate = { ...newTemplate, id: savedId };
      const updatedList = [createdTemplate, ...customTemplates];
      setCustomTemplates(updatedList);
      if (userKey) {
        localStorage.setItem(`custom_templates_${userKey}`, JSON.stringify(updatedList));
      }
      setShowSaveTemplateModal(false);
      setNewTemplateName('');
      alert(`¡Plantilla "${createdTemplate.name}" guardada con éxito!`);
    } catch (err) {
      alert("Error al guardar plantilla: " + err.message);
    }
  };

  const handleDeleteCustomTemplate = async (templateId) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta plantilla personal?")) return;
    const userKey = (currentUser?.email || authUser?.email || '').toLowerCase().trim();

    try {
      if (!templateId.startsWith('local_')) {
        try {
          await apiService.deleteDocument('user_surgical_templates', templateId);
        } catch (dbErr) {
          console.warn("Error al borrar de Firestore:", dbErr);
        }
      }
      const filtered = customTemplates.filter(t => t.id !== templateId);
      setCustomTemplates(filtered);
      if (userKey) {
        localStorage.setItem(`custom_templates_${userKey}`, JSON.stringify(filtered));
      }
    } catch (err) {
      alert("Error al eliminar plantilla: " + err.message);
    }
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    setFormData(prev => ({ ...prev, nombreProfesional: user.nombre }));
    if (user.rol === ROLES.SECRE) setCurrentTab('Gestión');
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    setPrintSurgery(null);
    await logout();
  };

  const handlePrint = (surgery) => {
    const isParticular = surgery.obraSocial?.toLowerCase() === 'particular';
    if (!isParticular && !surgery.nroAfiliado) {
      window.alert('Debe ingresar el Número de Afiliado antes de imprimir o descargar la orden.');
      return;
    }
    const cleanSurgeryProf = formatDoctorDisplayName(surgery.nombreProfesional || '');
    const prof = (professionals || []).find(p => {
      if (surgery.professionalId && p.id === surgery.professionalId) return true;
      const sProf = (surgery.nombreProfesional || '').toLowerCase().trim();
      const sClean = cleanSurgeryProf.toLowerCase().trim();
      if (!sProf && !sClean) return false;
      const pNom = (p.nombre || '').toLowerCase().trim();
      const pRaw = (p.rawNombre || '').toLowerCase().trim();
      const pApe = (p.apellido || '').toLowerCase().trim();
      const pPila = (p.nombrePila || '').toLowerCase().trim();
      
      if (pNom && (pNom === sProf || pNom === sClean || pNom.includes(sProf) || sProf.includes(pNom) || pNom.includes(sClean) || sClean.includes(pNom))) return true;
      if (pRaw && (pRaw === sProf || pRaw.includes(sProf) || sProf.includes(pRaw))) return true;
      if (pApe && (sProf.includes(pApe) || sClean.includes(pApe))) return true;
      if (pPila && pApe && sClean.includes(pPila) && sClean.includes(pApe)) return true;
      return false;
    });
    const finalProfName = formatDoctorDisplayName(prof?.nombre || surgery.nombreProfesional || '');
    const enrichedSurgery = {
      ...surgery,
      nombreProfesional: finalProfName,
      especialidad: surgery.especialidad || (prof?.especialidad === 'ORL' ? 'Otorrinolaringología' : (prof?.especialidad || 'Otorrinolaringología')),
      mp: surgery.mp || prof?.mp || '',
      me: surgery.me || prof?.me || '',
      firmaUrl: surgery.firmaUrl || prof?.firma || ''
    };
    setPrintModalData(enrichedSurgery);
  };

  const handleSetNroAfiliado = (surgery) => {
    const value = window.prompt('Ingrese el Número de Afiliado:', surgery.nroAfiliado || '');
    if (value !== null) {
      setSurgeries(surgeries.map(s => s.id === surgery.id ? { ...s, nroAfiliado: value } : s));
    }
  };

  const handleUpdateSurgeryPhone = async (surgeryId, newPhone) => {
    setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, contactoFamiliar: newPhone, telefono: newPhone } : s));
    try {
      await apiService.updateDocument('ordenes_internacion', String(surgeryId), {
        contactoFamiliar: newPhone,
        telefono: newPhone
      });
    } catch (err) {
      console.error('Error updating surgery phone:', err);
    }
  };

  const handleUpdateSurgeryAdmission = async (surgeryId, admissionData) => {
    setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, ...admissionData } : s));
    if (typeof surgeryId === 'string' && !surgeryId.startsWith('local_')) {
      try {
        await apiService.updateDocument('ordenes_internacion', String(surgeryId), {
          ...admissionData,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error updating surgery admission:', err);
      }
    }
  };

  const handleUpdateSurgeryQuickField = async (surgeryId, updates) => {
    const cleanUpdates = { ...updates };
    if (cleanUpdates.habitacion !== undefined) {
      cleanUpdates.habitacion = String(cleanUpdates.habitacion || '').trim().toUpperCase();
    }
    if (cleanUpdates.nroAfiliado !== undefined) {
      cleanUpdates.nroAfiliado = String(cleanUpdates.nroAfiliado || '').trim();
    }

    setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, ...cleanUpdates } : s));

    if (typeof surgeryId === 'string' && !surgeryId.startsWith('local_')) {
      try {
        const firestoreUpdates = {
          updatedAt: new Date().toISOString()
        };
        if (cleanUpdates.nroAfiliado !== undefined) {
          firestoreUpdates.numeroAfiliado = cleanUpdates.nroAfiliado;
        }
        if (cleanUpdates.habitacion !== undefined) {
          firestoreUpdates.salaCirugia = cleanUpdates.habitacion;
          firestoreUpdates.habitacion = cleanUpdates.habitacion;
        }
        await apiService.updateDocument('ordenes_internacion', String(surgeryId), firestoreUpdates);

        const currentSurgery = surgeries.find(s => s.id === surgeryId);
        if (currentSurgery?.dni && cleanUpdates.nroAfiliado !== undefined) {
          const cleanDni = String(currentSurgery.dni).replace(/\D/g, '');
          if (cleanDni) {
            apiService.updateDocument('pacientes', cleanDni, {
              numeroAfiliado: cleanUpdates.nroAfiliado,
              lastUpdate: new Date().toISOString()
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Error updating surgery quick field:', err);
      }
    }
  };

  const resetForm = (tipo = 'CIRUGIA') => {
    setIsEditing(false);
    setEditingId(null);
    setCodeInputs(['', '']);
    setCodeSuggestions({});
    setActiveCodeField(null);
    setMaterialSelections({});
    const isResidente = currentUser?.rol === ROLES.RESIDENTE;
    const isSecreEstudiosUser = currentUser?.rol === ROLES.SECRE_ESTUDIOS;
    const effectiveTipo = isSecreEstudiosUser ? 'ESTUDIO' : tipo;
    const isEstudio = effectiveTipo === 'ESTUDIO';
    setFormData({ 
      emailProfesional: '', 
      nombreProfesional: (isResidente || isSecreEstudiosUser) ? '' : (currentUser?.nombre || ''), 
      professionalId: null,
      residente: isResidente ? (currentUser?.nombre || '') : '',
      tipoProcedimiento: isEstudio ? 'ESTUDIO' : 'CIRUGIA',
      estudioBajoAnestesia: isEstudio,
      fechaSolicitud: new Date().toISOString().slice(0, 10),
      fecha: '', 
      duracion: '1:00 hs', 
      paciente: '', 
      edad: '', 
      dni: '', 
      nroAfiliado: '',
      contactoFamiliar: '', 
      esPacienteClinica: 'SI', 
      obraSocial: '', 
      psicoprofilaxis: 'SI', 
      codigos: '', 
      materiales: '', 
      requiereMaterial: 'NO',
      justificacion: '', 
      anestesia: '', 
      requierePresupuesto: 'NO',
      notasDoctor: '',
      habitacion: '',
      horaInicio: '',
      horaFin: '',
      horaIngreso: '',
      ordenIngreso: '',
      adjuntos: [],
    });
    setShowCreateModal(false);
    try { localStorage.removeItem('draft_surgery_form'); } catch (e) {}
  };

  const handleOpenNewSurgery = (tipo = 'CIRUGIA') => {
    const isSecreEstudiosUser = currentUser?.rol === ROLES.SECRE_ESTUDIOS;
    resetForm(isSecreEstudiosUser ? 'ESTUDIO' : tipo);
    setShowCreateModal(true);
  };

 const handleCloseCreateModal = () => {
   resetForm();
   setShowCreateModal(false);
 };

 const getNextAvailableTime = (date, excludeId = null) => {
   if (!date) return '08:00';
   const daySurgeries = (surgeries || []).filter(s => 
     s.fecha === date && 
     s.id !== excludeId && 
     s.estado !== 'CANCELADA' && 
     s.estado !== 'RECHAZADA'
   );
   if (daySurgeries.length === 0) {
     return '08:00';
   }
   let latestEndMin = 8 * 60; // 08:00
   for (const s of daySurgeries) {
     const startMin = timeToMinutes(s.horaInicio || '08:00');
     const durMin = parseDurationToMinutes(s.duracion || '1:00 hs');
     const endMin = s.horaFin ? timeToMinutes(s.horaFin) : (startMin + durMin);
     if (endMin > latestEndMin) {
       latestEndMin = endMin;
     }
   }
   const h = Math.floor(latestEndMin / 60) % 24;
   const m = latestEndMin % 60;
   return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
 };

  // Búsqueda automática de paciente por DNI
  const handleDniSearchAndFill = (inputDni, isEdit = false) => {
    const rawVal = inputDni || '';
    const cleanDni = rawVal.replace(/\D/g, '');

    if (isEdit) {
      setEditModalData(prev => ({ ...prev, dni: rawVal }));
      setEditDniFoundMessage('');
    } else {
      setFormData(prev => ({ ...prev, dni: rawVal }));
      setDniFoundMessage('');
    }

    if (cleanDni.length >= 6) {
      // 1. Buscar en pacientesList (colección pacientes)
      const pMatch = (pacientesList || []).find(p => {
        const pDni = String(p.dni || p.id || '').replace(/\D/g, '');
        return pDni === cleanDni;
      });

      // 2. Buscar en cirugías previas (más recientes primero)
      const sMatch = [...surgeries].reverse().find(s => {
        const sDni = String(s.dni || '').replace(/\D/g, '');
        return sDni === cleanDni;
      });

      const foundName = pMatch?.nombre || sMatch?.paciente || sMatch?.afiliado || '';
      const foundOS = pMatch?.obraSocial || sMatch?.obraSocial || '';
      const foundAfiliado = pMatch?.numeroAfiliado || sMatch?.nroAfiliado || '';
      const foundTelefono = pMatch?.telefono || sMatch?.contactoFamiliar || '';
      const foundEdad = sMatch?.edad || '';

      if (foundName || foundOS || foundAfiliado) {
        const msg = foundName ? `✓ Paciente encontrado: ${foundName}` : '✓ Datos encontrados en la base';
        if (isEdit) {
          setEditDniFoundMessage(msg);
          setEditModalData(prev => ({
            ...prev,
            paciente: foundName || prev.paciente,
            obraSocial: foundOS || prev.obraSocial,
            nroAfiliado: foundAfiliado || prev.nroAfiliado,
            contactoFamiliar: foundTelefono || prev.contactoFamiliar,
            edad: foundEdad || prev.edad,
            esPacienteClinica: 'SI'
          }));
        } else {
          setDniFoundMessage(msg);
          setFormData(prev => ({
            ...prev,
            paciente: foundName || prev.paciente,
            obraSocial: foundOS || prev.obraSocial,
            nroAfiliado: foundAfiliado || prev.nroAfiliado,
            contactoFamiliar: foundTelefono || prev.contactoFamiliar,
            edad: foundEdad || prev.edad,
            esPacienteClinica: 'SI'
          }));
        }
      } else {
        // Fallback: consulta directa por docId en Firestore
        apiService.getDocument('pacientes', cleanDni).then(pDoc => {
          if (pDoc && (pDoc.nombre || pDoc.paciente)) {
            const docName = pDoc.nombre || pDoc.paciente || '';
            const docOS = pDoc.obraSocial || pDoc.obra_social || '';
            const docAfiliado = pDoc.numeroAfiliado || pDoc.nroAfiliado || '';
            const docTel = pDoc.telefono || pDoc.contactoFamiliar || '';
            const msg = docName ? `✓ Paciente encontrado: ${docName}` : '✓ Datos encontrados en la base';

            if (isEdit) {
              setEditDniFoundMessage(msg);
              setEditModalData(prev => ({
                ...prev,
                paciente: docName || prev.paciente,
                obraSocial: docOS || prev.obraSocial,
                nroAfiliado: docAfiliado || prev.nroAfiliado,
                contactoFamiliar: docTel || prev.contactoFamiliar,
                esPacienteClinica: 'SI'
              }));
            } else {
              setDniFoundMessage(msg);
              setFormData(prev => ({
                ...prev,
                paciente: docName || prev.paciente,
                obraSocial: docOS || prev.obraSocial,
                nroAfiliado: docAfiliado || prev.nroAfiliado,
                contactoFamiliar: docTel || prev.contactoFamiliar,
                esPacienteClinica: 'SI'
              }));
            }
          }
        }).catch(() => {});
      }
    }
  };

  const handleDateChange = (date) => {
   const dur = formData.duracion || '1:00 hs';
   const durMin = parseDurationToMinutes(dur);
   const autoStartTime = getNextAvailableTime(date, isEditing ? editingId : null);
   const autoEndTime = addMinutesToTime(autoStartTime, durMin);
   setFormData(prev => ({
     ...prev,
     fecha: date,
     horaInicio: autoStartTime,
     horaFin: autoEndTime
   }));
 };

 const handleTimeChange = (time) => {
   const dur = formData.duracion || '1:00 hs';
   const durMin = parseDurationToMinutes(dur);
   const newEndTime = time ? addMinutesToTime(time, durMin) : '';
   setFormData(prev => ({
     ...prev,
     horaInicio: time,
     horaFin: newEndTime
   }));
 };

 const handleDurationChange = (dur) => {
   const durMin = parseDurationToMinutes(dur);
   const currentStart = formData.horaInicio || (formData.fecha ? getNextAvailableTime(formData.fecha, isEditing ? editingId : null) : '08:00');
   const newEndTime = addMinutesToTime(currentStart, durMin);
   setFormData(prev => ({
     ...prev,
     duracion: dur,
     horaInicio: prev.horaInicio || currentStart,
     horaFin: newEndTime
   }));
 };

  const formatPrintDateNumeric = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getTodayDateString = (dateStr) => {
    if (dateStr && typeof dateStr === 'string') {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return `Córdoba, ${d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      }
    }
    const today = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return `Córdoba, ${today.toLocaleDateString('es-ES', options)}`;
  };

  const checkCupo = (date) => {
    // Sin límite de cirugías por día
    return false;
  };

  const handleAiParse = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await parseEmailToOrder(aiText, professionals);
      if (!result) throw new Error('No se recibieron datos de la IA.');

      // Match profesional
      let matchedProf = null;
      if (result.profesional) {
        const extracted = result.profesional;
        const normalized = extracted.toLowerCase().replace(/^(dr\.|dra\.|lic\.|dr|dra|lic)\s+/i, '').trim();
        matchedProf = professionals.find(p => {
          const name = p.nombre.toLowerCase();
          const nameWithoutPrefix = name.replace(/^(dr\.|dra\.|lic\.)\s+/i, '').trim();
          return name === extracted.toLowerCase() ||
                 nameWithoutPrefix === normalized ||
                 (normalized.length > 4 && nameWithoutPrefix.includes(normalized)) ||
                 (normalized.length > 4 && normalized.includes(nameWithoutPrefix));
        });
      }

      // Convertir códigos a string con salto de línea
      let codigosStr = '';
      if (result.codigosCirugia && Array.isArray(result.codigosCirugia)) {
        codigosStr = result.codigosCirugia.map(c => c.codigo || c.nombre || '').filter(Boolean).join('\n');
      }

      const matchedUser = matchedProf ? users.find(u => u.email && u.nombre?.toLowerCase() === matchedProf.nombre?.toLowerCase()) : null;

      setFormData(prev => ({
        ...prev,
        professionalId: matchedProf ? matchedProf.id : prev.professionalId,
        nombreProfesional: matchedProf ? matchedProf.nombre : (result.profesional || prev.nombreProfesional),
        emailProfesional: matchedProf?.email || matchedUser?.email || prev.emailProfesional,
        paciente: result.afiliado ? result.afiliado.toUpperCase() : prev.paciente,
        obraSocial: result.obraSocial || prev.obraSocial,
        nroAfiliado: result.numeroAfiliado || prev.nroAfiliado,
        dni: result.dni || prev.dni,
        edad: result.edad ? String(result.edad) : prev.edad,
        contactoFamiliar: result.telefono || prev.contactoFamiliar,
        justificacion: result.diagnostico || prev.justificacion,
        habitacion: result.salaCirugia || result.habitacion || prev.habitacion,
        anestesia: result.tipoAnestesia ? (result.tipoAnestesia.charAt(0).toUpperCase() + result.tipoAnestesia.slice(1)) : prev.anestesia,
        fecha: result.fechaCirugia || prev.fecha,
        horaInicio: result.horaCirugia || prev.horaInicio,
        requiereMaterial: result.incluyeMaterial ? 'SI' : prev.requiereMaterial,
        materiales: result.descripcionMaterial || prev.materiales,
        notasDoctor: result.anotacionCalendario || prev.notasDoctor,
        codigos: codigosStr || prev.codigos
      }));

      // Actualizar inputs de código si vinieron
      if (codigosStr) {
        const arr = codigosStr.split('\n').filter(c => c.trim());
        setCodeInputs(arr.length > 0 ? arr : ['', '']);
      }

      setShowAiModal(false);
      setAiText('');
      alert('¡Formulario completado exitosamente con IA!');
    } catch (err) {
      console.error('Error al procesar con IA:', err);
      setAiError(err.message || 'Error al procesar el email con IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const isCupoFull = checkCupo(formData.fecha);

  const handleCreateSurgery = (e) => {
    e.preventDefault();
    
    if (!formData.professionalId && (!formData.emailProfesional || !formData.nombreProfesional)) {
      setError('Debe seleccionar un profesional o ingresar sus datos manualmente.');
      return;
    }

    // Verificar si el usuario que carga es egomez o administradora
    const userEmail = (currentUser?.email || authUser?.email || '').toLowerCase();
    const isEgomez = userEmail.includes('egomez') || (currentUser?.nombre || '').toLowerCase().includes('egomez') || currentUser?.rol === ROLES.DIRECTORA || currentUser?.rol === ROLES.ADMIN;

    // Estructura de códigos para Firestore
    const codigosArray = (formData.codigos || '').split('\n').filter(c => c.trim()).map(c => ({
      codigo: c.trim(),
      nombre: getCodeName(c.trim()) || ''
    }));

    if (isEditing) {
      const dur = formData.duracion || '1:00 hs';
      const durMin = parseDurationToMinutes(dur);
      const computedHoraFin = formData.horaFin || (formData.horaInicio ? addMinutesToTime(formData.horaInicio, durMin) : '');
      const existingSurgery = surgeries.find(s => s.id === editingId);
      const effectiveResidente = formData.residente || (currentUser?.rol === ROLES.RESIDENTE ? currentUser.nombre : (existingSurgery?.residente || ''));
      const updatedItem = {
        ...formData,
        residente: effectiveResidente,
        duracion: dur,
        horaFin: computedHoraFin,
        estado: isEgomez && (!formData.estado || formData.estado === 'SOLICITADA') ? 'CODIFICADA' : (formData.estado || 'CODIFICADA'),
        codigosAuditados: isEgomez ? (formData.codigos || '') : (formData.codigosAuditados || formData.codigos || '')
      };
      setSurgeries(surgeries.map(s => s.id === editingId ? { ...s, ...updatedItem } : s));
      const edited = surgeries.find(s => s.id === editingId);
      addAuditLog('EDITAR', `Solicitud editada para: ${edited?.paciente || formData.paciente}`, currentUser.nombre);

      if (formData.dni && formData.paciente) {
        const cleanDni = String(formData.dni).replace(/\D/g, '');
        if (cleanDni) {
          const patientPayload = {
            id: cleanDni,
            dni: formData.dni,
            nombre: formData.paciente,
            obraSocial: formData.obraSocial || '',
            numeroAfiliado: formData.nroAfiliado || '',
            telefono: formData.contactoFamiliar || '',
            lastUpdate: new Date().toISOString()
          };
          apiService.setDocument('pacientes', cleanDni, patientPayload).catch(() => {});
        }
      }

      // Persistir a Firestore
      if (typeof editingId === 'string' && !editingId.startsWith('local_')) {
        apiService.updateDocument('ordenes_internacion', editingId, {
          afiliado: formData.paciente,
          profesional: formData.nombreProfesional,
          emailProfesional: formData.emailProfesional,
          professionalId: formData.professionalId,
          obraSocial: formData.obraSocial,
          numeroAfiliado: formData.nroAfiliado,
          dni: formData.dni,
          edad: formData.edad,
          telefono: formData.contactoFamiliar,
          fechaSolicitud: formData.fechaSolicitud || new Date().toISOString().slice(0, 10),
        fechaCirugia: formData.fecha,
          horaCirugia: formData.horaInicio,
          horaFin: computedHoraFin,
          horaIngreso: formData.horaIngreso || '',
          ordenIngreso: formData.ordenIngreso || '',
          duracion: dur,
          diagnostico: formData.justificacion,
          tipoAnestesia: formData.anestesia,
          incluyeMaterial: formData.requiereMaterial === 'SI',
          descripcionMaterial: formData.materiales,
          anotacionCalendario: formData.notasDoctor,
          salaCirugia: formData.habitacion,
          codigosCirugia: codigosArray,
          adjuntos: formData.adjuntos || [],
          residente: effectiveResidente,
          conveniosEstudios: formData.conveniosEstudios || {},
          status: isEgomez ? 'auditada' : 'pendiente',
          auditedAt: isEgomez ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString()
        }).catch(e => console.error("Error al actualizar en Firestore:", e));
      }
    } else {
      const dur = formData.duracion || '1:00 hs';
      const durMin = parseDurationToMinutes(dur);
      let assignedHoraInicio = formData.horaInicio;
      let assignedHoraFin = formData.horaFin;
      if (!assignedHoraInicio && formData.fecha) {
        assignedHoraInicio = getNextAvailableTime(formData.fecha);
        assignedHoraFin = addMinutesToTime(assignedHoraInicio, durMin);
      } else if (assignedHoraInicio && !assignedHoraFin) {
        assignedHoraFin = addMinutesToTime(assignedHoraInicio, durMin);
      } else if (!assignedHoraInicio) {
        assignedHoraInicio = '08:00';
        assignedHoraFin = addMinutesToTime(assignedHoraInicio, durMin);
      }

      const newSurgery = {
        ...formData,
        id: `ord_${Date.now()}`,
        residente: formData.residente || (currentUser?.rol === ROLES.RESIDENTE ? currentUser.nombre : ''),
        tipoProcedimiento: formData.tipoProcedimiento || 'CIRUGIA',
        estudioBajoAnestesia: formData.tipoProcedimiento === 'ESTUDIO' || !!formData.estudioBajoAnestesia,
        conveniosEstudios: formData.conveniosEstudios || {},
        duracion: dur,
        estado: isEgomez ? 'CODIFICADA' : 'SOLICITADA',
        codigosAuditados: isEgomez ? (formData.codigos || '') : '',
        aprobacionMaterial: 'PENDIENTE',
        creador: currentUser.nombre,
        creadorRol: currentUser.rol,
        fechaSolicitud: formData.fechaSolicitud || new Date().toISOString().slice(0, 10),
        fechaCreacion: new Date().toLocaleDateString(),
        horaInicio: assignedHoraInicio,
        horaFin: assignedHoraFin,
        horaIngreso: formData.horaIngreso || '',
        ordenIngreso: formData.ordenIngreso || '',
        pinned: false,
      };
      setSurgeries([newSurgery, ...surgeries]);
      addAuditLog('CREAR', `Solicitud creada para: ${newSurgery.paciente} (${isEgomez ? 'Auditada' : 'Pendiente'})`, currentUser.nombre);

      // Guardar o sincronizar paciente en la colección 'pacientes'
      if (formData.dni && formData.paciente) {
        const cleanDni = String(formData.dni).replace(/\D/g, '');
        if (cleanDni) {
          const patientPayload = {
            id: cleanDni,
            dni: formData.dni,
            nombre: formData.paciente,
            obraSocial: formData.obraSocial || '',
            numeroAfiliado: formData.nroAfiliado || '',
            telefono: formData.contactoFamiliar || '',
            lastUpdate: new Date().toISOString()
          };
          apiService.setDocument('pacientes', cleanDni, patientPayload).catch(e => console.error("Error al registrar paciente en pacientes:", e));
          
          // Actualizar estado local de pacientes
          setPacientesList(prev => {
            const next = prev.filter(p => String(p.dni || p.id).replace(/\D/g, '') !== cleanDni);
            const updated = [...next, patientPayload];
            try { localStorage.setItem('coat_pacientes', JSON.stringify(updated)); } catch {}
            return updated;
          });
        }
      }

      // Persistir a Firestore en ordenes_internacion
      apiService.addDocument('ordenes_internacion', {
        afiliado: formData.paciente,
        profesional: formData.nombreProfesional,
        emailProfesional: formData.emailProfesional,
        professionalId: formData.professionalId,
        residente: formData.residente || (currentUser?.rol === ROLES.RESIDENTE ? currentUser.nombre : ''),
        tipoProcedimiento: formData.tipoProcedimiento || 'CIRUGIA',
        estudioBajoAnestesia: formData.tipoProcedimiento === 'ESTUDIO' || !!formData.estudioBajoAnestesia,
        conveniosEstudios: formData.conveniosEstudios || {},
        obraSocial: formData.obraSocial,
        numeroAfiliado: formData.nroAfiliado,
        dni: formData.dni,
        edad: formData.edad,
        telefono: formData.contactoFamiliar,
        fechaCirugia: formData.fecha,
        horaCirugia: assignedHoraInicio,
        horaFin: assignedHoraFin,
        horaIngreso: formData.horaIngreso || '',
        ordenIngreso: formData.ordenIngreso || '',
        duracion: dur,
        diagnostico: formData.justificacion,
        tipoAnestesia: formData.anestesia,
        incluyeMaterial: formData.requiereMaterial === 'SI',
        descripcionMaterial: formData.materiales,
        anotacionCalendario: formData.notasDoctor,
        salaCirugia: formData.habitacion,
        codigosCirugia: codigosArray,
        adjuntos: formData.adjuntos || [],
        status: isEgomez ? 'auditada' : 'pendiente',
        auditedAt: isEgomez ? new Date().toISOString() : null,
        createdBy: currentUser?.email || authUser?.email || currentUser?.nombre,
        creadorRol: currentUser?.rol || 'Admin',
        createdAt: new Date().toISOString()
      }).then(newDocId => {
        // Actualizar ID local con el ID de Firestore generado
        if (newDocId) {
          setSurgeries(prev => prev.map(s => s.id === newSurgery.id ? { ...s, id: newDocId } : s));
        }
      }).catch(e => console.error("Error al guardar orden en Firestore:", e));
    }
    resetForm();
  };

  const handleOpenFormFromCalendar = (fecha, horaInicio) => {
    const assignedHora = horaInicio || getNextAvailableTime(fecha);
    const dur = '1:00 hs';
    const assignedFin = addMinutesToTime(assignedHora, parseDurationToMinutes(dur));
    setFormData(prev => ({
      ...prev,
      fecha,
      horaInicio: assignedHora,
      horaFin: assignedFin,
      duracion: dur
    }));
    setShowCreateModal(true);
  };

  const handleDragSurgery = (id, newFecha, newHoraInicio, newHoraFin) => {
    let changedDateSurgery = null;
    let didResetStatus = false;

    setSurgeries(prev => prev.map(s => {
      if (s.id !== id) return s;
      const dateChanged = s.fecha !== newFecha;
      const shouldReset = dateChanged && (s.estado === 'ENVIADA' || s.estado === 'AUTORIZADA');
      
      const updated = { 
        ...s, 
        fecha: newFecha, 
        horaInicio: newHoraInicio, 
        horaFin: newHoraFin 
      };

      if (shouldReset) {
        updated.estado = 'CODIFICADA';
        updated.enviada = false;
        updated.autorizada = false;
        didResetStatus = true;
      }
      changedDateSurgery = updated;
      return updated;
    }));

    addAuditLog('EDITAR', `Cirugía reprogramada al ${newFecha} ${newHoraInicio}${didResetStatus ? ' (Estado reiniciado a CODIFICADA)' : ''}`, currentUser.nombre);

    if (id && typeof id === 'string' && !id.startsWith('local_')) {
      const updatePayload = {
        fechaCirugia: newFecha,
        horaCirugia: newHoraInicio,
        horaFin: newHoraFin,
        updatedAt: new Date().toISOString()
      };
      if (didResetStatus) {
        updatePayload.estado = 'CODIFICADA';
        updatePayload.enviada = false;
        updatePayload.autorizada = false;
        updatePayload.status = 'auditada';
      }
      apiService.updateDocument('ordenes_internacion', id, updatePayload)
        .catch(err => console.error("Error al actualizar reprogramación en Firestore:", err));
    }
  };

  const handleEdit = (s) => {
    setIsEditing(true);
    setEditingId(s.id);
    setShowCreateModal(true);
    const cod = s.codigos || '';
    const arr = cod.split(/\n/).filter(c => c.trim());
    setCodeInputs(arr.length > 0 ? arr : ['', '']);
    const dur = s.duracion || '1:00 hs';
    const hInicio = s.horaInicio || '';
    const hFin = s.horaFin || (hInicio ? addMinutesToTime(hInicio, parseDurationToMinutes(dur)) : '');
    setFormData({
      emailProfesional: s.emailProfesional || '',
      nombreProfesional: s.nombreProfesional || '',
      professionalId: s.professionalId || null,
      residente: s.residente || (currentUser?.rol === ROLES.RESIDENTE ? currentUser.nombre : ''),
      tipoProcedimiento: s.tipoProcedimiento || (s.estudioBajoAnestesia ? 'ESTUDIO' : 'CIRUGIA'),
      conveniosEstudios: s.conveniosEstudios ? { ...s.conveniosEstudios } : {},
      estudioBajoAnestesia: s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia,
      fecha: s.fecha || '',
      duracion: dur,
      paciente: s.paciente || '',
      edad: s.edad || '',
      dni: s.dni || '',
      nroAfiliado: s.nroAfiliado || '',
      contactoFamiliar: s.contactoFamiliar || '',
      esPacienteClinica: s.esPacienteClinica || 'SI',
      obraSocial: s.obraSocial || '',
      psicoprofilaxis: s.psicoprofilaxis || 'SI',
      codigos: s.codigos || '',
      materiales: s.materiales || '',
      requiereMaterial: s.requiereMaterial || 'NO',
      justificacion: s.justificacion || '',
      anestesia: s.anestesia || '',
      requierePresupuesto: s.requierePresupuesto || 'NO',
      notasDoctor: s.notasDoctor || '',
      habitacion: s.habitacion || '',
      horaInicio: hInicio,
      horaFin: hFin,
      horaIngreso: s.horaIngreso || s.horarioIngreso || '',
      ordenIngreso: s.ordenIngreso || s.orden || '',
      adjuntos: Array.isArray(s.adjuntos) ? s.adjuntos : (s.adjuntoUrl ? [s.adjuntoUrl] : []),
    });
  };

   const openEditModal = (s) => {
    setEditDniFoundMessage('');
    setEditModalData({
      ...s,
      conveniosEstudios: s.conveniosEstudios ? { ...s.conveniosEstudios } : {},
      fechaSolicitud: s.fechaSolicitud || (s.fechaCreacion ? s.fechaCreacion.slice(0, 10) : s.fecha) || new Date().toISOString().slice(0, 10),
      residente: s.residente || (currentUser?.rol === ROLES.RESIDENTE ? currentUser.nombre : ''),
      horaIngreso: s.horaIngreso || s.horarioIngreso || '',
      ordenIngreso: s.ordenIngreso || s.orden || '',
      adjuntos: Array.isArray(s.adjuntos) ? s.adjuntos : (s.adjuntoUrl ? [s.adjuntoUrl] : [])
    });
    const cod = s.codigos || '';
    const arr = cod.split(/\n/).filter(c => c.trim());
    setEditCodeInputs(arr.length > 0 ? arr : ['', '']);
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Está seguro de que desea eliminar esta solicitud?')) {
      const deleted = surgeries.find(s => s.id === id);
      setSurgeries(surgeries.filter(s => s.id !== id));
      addAuditLog('ELIMINAR', `Solicitud eliminada para: ${deleted?.paciente || 'desconocido'}`, currentUser.nombre);
      try {
        await apiService.deleteDocument('ordenes_internacion', id);
      } catch (err) {
        console.error("Error al eliminar orden de Firestore:", err);
      }
      if (editingId === id) resetForm();
    }
  };

  const updateStatus = (id, newStatus, motivo) => {
    const surgery = surgeries.find(s => s.id === id);
    const isEnviada = newStatus === 'ENVIADA';
    const isAutorizada = newStatus === 'AUTORIZADA';
    const isCancelada = newStatus === 'CANCELADA';

    setSurgeries(surgeries.map(s => {
      if (s.id !== id) return s;
      const updated = { 
        ...s, 
        estado: newStatus,
        enviada: isEnviada || (isAutorizada ? true : s.enviada),
        autorizada: isAutorizada,
        suspendida: isCancelada
      };
      if (newStatus === 'RECHAZADA' && motivo) updated.motivoRechazo = motivo;
      if (newStatus === 'CANCELADA' && motivo) updated.motivoCancelacion = motivo;
      if (newStatus === 'ENVIADA' && (s.estado === 'RECHAZADA' || s.estado === 'CANCELADA')) {
        updated.motivoRechazo = '';
        updated.motivoCancelacion = '';
        updated.reactivada = true;
      }
      return updated;
    }));

    const label = { ENVIADA: 'Enviada', AUTORIZADA: 'Autorizada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada', SOLICITADA: 'Reactivada' }[newStatus] || newStatus;
    addAuditLog('ESTADO', `${label}: ${surgery?.paciente || 'N/A'}${motivo ? ` (${motivo})` : ''}`, currentUser.nombre);

    // Sincronizar directamente con Firestore para que la app anterior lo refleje de inmediato
    if (typeof id === 'string' && !id.startsWith('local_')) {
      const updatePayload = {
        estado: newStatus,
        updatedAt: new Date().toISOString()
      };
      if (newStatus === 'ENVIADA') {
        updatePayload.enviada = true;
        updatePayload.status = 'enviada';
      } else if (newStatus === 'AUTORIZADA') {
        updatePayload.autorizada = true;
        updatePayload.enviada = true;
        updatePayload.status = 'auditada';
      } else if (newStatus === 'CANCELADA') {
        updatePayload.suspendida = true;
        if (motivo) updatePayload.motivoCancelacion = motivo;
      } else if (newStatus === 'RECHAZADA') {
        if (motivo) updatePayload.motivoRechazo = motivo;
      }

      apiService.updateDocument('ordenes_internacion', id, updatePayload)
        .catch(err => console.error("Error al sincronizar estado con Firestore:", err));
    }
  };

  const handleTogglePinSurgery = async (id) => {
    const surgery = surgeries.find(s => s.id === id);
    if (!surgery) return;
    const newPinned = !surgery.pinned;

    setSurgeries(prev => prev.map(s => s.id === id ? { ...s, pinned: newPinned } : s));

    addAuditLog('PIN', `${newPinned ? 'Fijó' : 'Desfijó'} el pedido de: ${surgery.paciente || 'N/A'}`, currentUser?.nombre || 'Usuario');

    if (typeof id === 'string' && !id.startsWith('local_')) {
      try {
        await apiService.updateDocument('ordenes_internacion', id, {
          pinned: newPinned,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error al actualizar fijado en Firestore:", err);
      }
    }
  };

  const assignCodes = (id, codes) => {
    const surgery = surgeries.find(s => s.id === id);
    setSurgeries(surgeries.map(s => s.id === id ? { ...s, estado: 'CODIFICADA', codigosAuditados: codes } : s));
    addAuditLog('CODIFICAR', `Códigos asignados a: ${surgery?.paciente || 'N/A'}`, currentUser.nombre);
  };

  const toggleMaterialApproval = (id) => {
    const surgery = surgeries.find(s => s.id === id);
    setSurgeries(surgeries.map(s => {
      if (s.id !== id) return s;
      const current = s.aprobacionMaterial || 'PENDIENTE';
      const next = current === 'PENDIENTE' ? 'APROBADO' : current === 'APROBADO' ? 'NO REQUIERE' : 'PENDIENTE';
      return { ...s, aprobacionMaterial: next };
    }));
    const current = surgery?.aprobacionMaterial || 'PENDIENTE';
    const next = current === 'PENDIENTE' ? 'APROBADO' : current === 'APROBADO' ? 'NO REQUIERE' : 'PENDIENTE';
    addAuditLog('MATERIAL', `Material ${next}: ${surgery?.paciente || 'N/A'}`, currentUser.nombre);
  };

  const handleSaveEditModal = (data) => {
    const dur = data.duracion || '1:00 hs';
    const durMin = parseDurationToMinutes(dur);
    const hFin = data.horaFin || (data.horaInicio ? addMinutesToTime(data.horaInicio, durMin) : '');
    const existingSurgery = surgeries.find(s => s.id === data.id);
    const effectiveResidente = data.residente || (currentUser?.rol === ROLES.RESIDENTE ? currentUser.nombre : (existingSurgery?.residente || ''));
    
    // Convertir editCodeInputs a string codigos
    const finalCodigos = (editCodeInputs || []).filter(c => c && c.trim()).join('\n');
    const nowIso = new Date().toISOString();
    const modifiedUserName = currentUser?.nombre || authUser?.email || 'Usuario';
    
    // Detectar si cambió la fecha o algún código
    const normalizeCodes = (str) => (str || '').split('\n').map(c => c.trim()).filter(Boolean).sort().join('|');
    const oldCodesNorm = normalizeCodes(existingSurgery?.codigos);
    const newCodesNorm = normalizeCodes(finalCodigos);
    const dateChanged = existingSurgery && existingSurgery.fecha !== data.fecha;
    const codesChanged = existingSurgery && oldCodesNorm !== newCodesNorm;
    
    // Si cambió la fecha o los códigos y estaba enviada/autorizada, vuelve automáticamente a CODIFICADA
    let nextEstado = data.estado;
    let nextEnviada = data.enviada;
    let nextAutorizada = data.autorizada;
    let resetNotice = '';

    if ((dateChanged || codesChanged) && (data.estado === 'ENVIADA' || data.estado === 'AUTORIZADA' || existingSurgery?.estado === 'ENVIADA' || existingSurgery?.estado === 'AUTORIZADA')) {
      nextEstado = 'CODIFICADA';
      nextEnviada = false;
      nextAutorizada = false;
      const reasons = [];
      if (dateChanged) reasons.push('reprogramación de fecha');
      if (codesChanged) reasons.push('modificación de códigos');
      resetNotice = ` (Estado restablecido a CODIFICADA por ${reasons.join(' y ')})`;
    }

    const fullData = { 
      ...data, 
      estado: nextEstado,
      enviada: nextEnviada,
      autorizada: nextAutorizada,
      codigos: finalCodigos,
      codigosAuditados: finalCodigos,
      duracion: dur, 
      horaFin: hFin, 
      residente: effectiveResidente,
      horaIngreso: data.horaIngreso || '',
      ordenIngreso: data.ordenIngreso || '',
      modifiedBy: modifiedUserName,
      modifiedAt: nowIso
    };

    setSurgeries(surgeries.map(s => s.id === fullData.id ? { ...s, ...fullData } : s));
    addAuditLog('EDITAR', `Solicitud editada para: ${fullData.paciente || 'N/A'}${resetNotice}`, currentUser.nombre);
    setEditModalData(null);

    if (fullData.dni && fullData.paciente) {
      const cleanDni = String(fullData.dni).replace(/\D/g, '');
      if (cleanDni) {
        const patientPayload = {
          id: cleanDni,
          dni: fullData.dni,
          nombre: fullData.paciente,
          obraSocial: fullData.obraSocial || '',
          numeroAfiliado: fullData.nroAfiliado || '',
          telefono: fullData.contactoFamiliar || '',
          lastUpdate: new Date().toISOString()
        };
        apiService.setDocument('pacientes', cleanDni, patientPayload).catch(() => {});
      }
    }

    // Persistir cambios a Firestore
    if (fullData.id && typeof fullData.id === 'string' && !fullData.id.startsWith('local_')) {
      const codigosArray = (fullData.codigos || '').split('\n').filter(c => c.trim()).map(c => ({
        codigo: c.trim(),
        nombre: getCodeName(c.trim()) || ''
      }));

      const firestoreUpdate = {
        afiliado: fullData.paciente,
        profesional: fullData.nombreProfesional,
        emailProfesional: fullData.emailProfesional,
        professionalId: fullData.professionalId,
        obraSocial: fullData.obraSocial,
        numeroAfiliado: fullData.nroAfiliado,
        dni: fullData.dni,
        edad: fullData.edad,
        telefono: fullData.contactoFamiliar,
        fechaSolicitud: fullData.fechaSolicitud || existingSurgery?.fechaSolicitud || new Date().toISOString().slice(0, 10),
        fechaCirugia: fullData.fecha,
        horaCirugia: fullData.horaInicio,
        horaFin: fullData.horaFin,
        horaIngreso: fullData.horaIngreso || '',
        ordenIngreso: fullData.ordenIngreso || '',
        duracion: fullData.duracion,
        diagnostico: fullData.justificacion,
        tipoAnestesia: fullData.anestesia,
        incluyeMaterial: fullData.requiereMaterial === 'SI',
        descripcionMaterial: fullData.materiales,
        anotacionCalendario: fullData.notasDoctor,
        salaCirugia: fullData.habitacion,
        codigosCirugia: codigosArray,
        adjuntos: fullData.adjuntos || [],
        residente: effectiveResidente,
        tipoProcedimiento: fullData.tipoProcedimiento || 'CIRUGIA',
      conveniosEstudios: fullData.conveniosEstudios || {},
        estudioBajoAnestesia: fullData.tipoProcedimiento === 'ESTUDIO' || !!fullData.estudioBajoAnestesia,
        modifiedBy: modifiedUserName,
        modifiedAt: nowIso,
        updatedAt: nowIso
      };

      if (resetNotice) {
        firestoreUpdate.estado = 'CODIFICADA';
        firestoreUpdate.enviada = false;
        firestoreUpdate.autorizada = false;
        firestoreUpdate.status = 'auditada';
      }

      apiService.updateDocument('ordenes_internacion', fullData.id, firestoreUpdate)
        .catch(err => console.error("Error al actualizar orden desde modal en Firestore:", err));
    }
  };

  const isSurgeryCreatedOrAssignedToUser = (s, user) => {
    if (!s || !user) return false;
    const normalize = (str) => (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(dr|dra|lic|dr\(a\))\.?\s+/i, '')
      .trim();

    const userNom = normalize(user.nombre);
    const userEmail = (user.email || '').toLowerCase().trim();
    const userClean = normalize(getCleanUsername(user.email || user.nombre || ''));

    // Lista de identificadores del usuario (nombre, apellido, username)
    const userTokens = [
      userNom,
      userClean,
      ...userNom.split(/\s+/).filter(t => t.length >= 3),
      ...userClean.split(/\s+/).filter(t => t.length >= 3)
    ].filter(Boolean);

    const matchesUser = (fieldVal) => {
      if (!fieldVal) return false;
      const normField = normalize(fieldVal);
      if (!normField) return false;
      return userTokens.some(tok => normField === tok || normField.includes(tok) || tok.includes(normField));
    };

    // Comparar residente (máxima prioridad para roles residentes)
    if (s.residente && matchesUser(s.residente)) return true;

    // Comparar creador / createdBy
    if (s.creador && matchesUser(s.creador)) return true;
    if (s.createdBy) {
      const cb = (s.createdBy || '').toLowerCase().trim();
      if (userEmail && cb === userEmail) return true;
      if (matchesUser(cb)) return true;
    }

    // Comparar email profesional
    const emailProf = (s.emailProfesional || '').toLowerCase().trim();
    if (emailProf && userEmail && emailProf === userEmail) return true;

    // Comparar nombre profesional
    if (s.nombreProfesional && matchesUser(s.nombreProfesional)) return true;

    return false;
  };

  const getFilteredSurgeries = () => {
    if (!surgeries || !Array.isArray(surgeries)) return [];
    if (!userRole) return [];
    let filtered;

    if (userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE) {
      // Médicos y Residentes ven solo sus cirugías
      filtered = surgeries.filter(s => isSurgeryCreatedOrAssignedToUser(s, currentUser));
    } else if (userRole === ROLES.DIRECTORA) {
      if (currentTab === 'Solicitud') {
        // Directora en Solicitud ve únicamente sus propias cirugías
        filtered = surgeries.filter(s => isSurgeryCreatedOrAssignedToUser(s, currentUser));
      } else if (currentTab === 'Auditoría') {
        // En Auditoría, la directora ve todas las cirugías para auditar
        if (directoraFilter === 'Sin auditar') filtered = surgeries.filter(s => s.estado === 'SOLICITADA');
        else if (directoraFilter === 'Auditadas') filtered = surgeries.filter(s => s.estado !== 'SOLICITADA');
        else filtered = surgeries;
      } else if (currentTab === 'Gestión') {
        filtered = surgeries.filter(s => s.estado !== 'SOLICITADA');
      } else {
        filtered = surgeries;
      }
    } else if (userRole === ROLES.ADMIN) {
      // Admin ve todo en Solicitud y demás apartados
      if (currentTab === 'Auditoría') {
        if (directoraFilter === 'Sin auditar') filtered = surgeries.filter(s => s.estado === 'SOLICITADA');
        else if (directoraFilter === 'Auditadas') filtered = surgeries.filter(s => s.estado !== 'SOLICITADA');
        else filtered = surgeries;
      } else if (currentTab === 'Gestión') {
        filtered = surgeries.filter(s => s.estado !== 'SOLICITADA');
      } else {
        filtered = surgeries;
      }
    } else if (userRole === ROLES.SECRE_ESTUDIOS) {
      filtered = surgeries.filter(s => s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia);
    } else if (userRole === ROLES.SECRE) {
      if (encargadoFilter === 'Pendientes') filtered = surgeries.filter(s => s.estado === 'SOLICITADA');
      else if (encargadoFilter === 'Auditadas') filtered = surgeries.filter(s => s.estado !== 'SOLICITADA');
      else filtered = surgeries;
    } else filtered = surgeries;

    // Filtro de Período (Próximas / Esta semana / Realizadas / Canceladas / Todas)
    const todayStr = new Date().toISOString().split('T')[0];
    if (periodoFilter === 'proximas') {
      filtered = filtered.filter(s => {
        const d = s.fecha || '';
        return d >= todayStr && s.estado !== 'CANCELADA';
      });
    } else if (periodoFilter === 'esta_semana') {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      filtered = filtered.filter(s => {
        const d = s.fecha || '';
        return d >= todayStr && d <= in7Days && s.estado !== 'CANCELADA';
      });
    } else if (periodoFilter === 'realizadas') {
      filtered = filtered.filter(s => {
        const d = s.fecha || '';
        return d < todayStr && s.estado !== 'CANCELADA';
      });
    } else if (periodoFilter === 'canceladas') {
      filtered = filtered.filter(s => s.estado === 'CANCELADA');
    }

    // Filtro por Estado específico (Solicitada, Codificada, Enviada, Autorizada, Rechazada, Cancelada)
    if (statusFilter) {
      filtered = filtered.filter(s => s.estado === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(s =>
        (s.paciente || '').toLowerCase().includes(term) ||
        (s.dni || '').toLowerCase().includes(term) ||
        (s.nombreProfesional || '').toLowerCase().includes(term) ||
        (s.residente || '').toLowerCase().includes(term)
      );
    }

    if (obraSocialFilter) {
      filtered = filtered.filter(s => s.obraSocial === obraSocialFilter);
    }

    if (dateFilter) {
      filtered = filtered.filter(s => s.fecha === dateFilter);
    }

    if (materialFilter !== 'TODOS') {
      const needsMaterial = materialFilter === 'SI';
      filtered = filtered.filter(s => (s.requiereMaterial === 'SI') === needsMaterial);
    }

    if (tipoFilter !== 'TODOS') {
      const wantEstudio = tipoFilter === 'ESTUDIO';
      filtered = filtered.filter(s => (s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia) === wantEstudio);
    }

    if (profFilter) {
      const pf = profFilter.toLowerCase();
      filtered = filtered.filter(s => 
        (s.nombreProfesional || '').toLowerCase().includes(pf) ||
        (s.residente || '').toLowerCase().includes(pf)
      );
    }

    // Ordenar por fijados primero, luego por fecha descendente
    return filtered.sort((a, b) => {
      const pinA = a.pinned ? 1 : 0;
      const pinB = b.pinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return (b.fecha || '').localeCompare(a.fecha || '');
    });
  };


  const canEditSurgery = (s) => {
    if (isAdmin) return true;
    if (userRole === ROLES.SECRE_ESTUDIOS) {
      return s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia;
    }
    if (userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE || userRole === ROLES.DIRECTORA) {
      return s.creador === currentUser?.nombre || isSurgeryCreatedOrAssignedToUser(s, currentUser);
    }
    if (userRole === ROLES.SECRE) return true;
    return false;
  };

  /**
   * Semáforo de riesgo operativo:
   * Retorna 'urgente' (<72hs y no autorizada/enviada), 'alerta' (<7 días y sin enviar), o null.
   */
  const getUrgencyAlert = (surgery) => {
    if (!surgery.fecha || surgery.estado === 'AUTORIZADA' || surgery.estado === 'CANCELADA') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = surgery.fecha.split('-').map(Number);
    if (!y || !m || !d) return null;
    const surgDate = new Date(y, m - 1, d);
    const diffDays = Math.ceil((surgDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return null; // Ya pasó
    if (diffDays <= 3 && surgery.estado !== 'AUTORIZADA') {
      return { level: 'urgente', text: `¡En ${diffDays === 0 ? 'el día' : diffDays + ' d'}! Sin autorizar`, color: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' };
    }
    if (diffDays <= 7 && (surgery.estado === 'SOLICITADA' || surgery.estado === 'CODIFICADA')) {
      return { level: 'alerta', text: `En ${diffDays} días (Sin enviar)`, color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    return null;
  };

  // --- LOGIN SCREEN ---
  // Skip login screen when rendered inside new Auth system (authUser handles login)
  if (!currentUser && !authUser) {
    if (showNewUserLogin) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="text-center mb-6">
              <h2 className="font-bold text-slate-700">Crear nuevo usuario</h2>
              <p className="text-xs text-slate-500 mt-1">Ingresá tu nombre y elegí un rol</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Ej: Dr. López"
                  value={formData.nombreProfesional}
                  onChange={e => setFormData(prev => ({ ...prev, nombreProfesional: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rol</label>
                <select
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={formData.rol || ROLES.MEDICO}
                  onChange={e => setFormData(prev => ({ ...prev, rol: e.target.value }))}
                >
                  {Object.values(ROLES).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button
                onClick={() => {
                  if (!formData.nombreProfesional.trim()) { window.alert('Ingrese un nombre'); return; }
                  const newUser = { id: Date.now(), nombre: formData.nombreProfesional.trim(), rol: formData.rol || ROLES.MEDICO };
                  setUsers([...users, newUser]);
                  handleLogin(newUser);
                }}
                className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-md"
              >
                Crear e ingresar
              </button>
              <button
                onClick={() => { setShowNewUserLogin(false); setFormData(prev => ({ ...prev, nombreProfesional: '', rol: ROLES.MEDICO })); }}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 font-semibold"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <LoginScreen users={users} onLogin={handleLogin} onNewUser={() => setShowNewUserLogin(true)} />;
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 print:hidden">
      {/* HEADER */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <img src="/coat_logo.png" alt="Logo COAT" className="h-10 w-auto" />
              <span className="text-lg font-bold tracking-tight text-black">Cirugías COAT</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                  {getCleanUsername(currentUser?.nombre)?.charAt(0)?.toUpperCase()}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-700 leading-tight">{getCleanUsername(currentUser?.nombre)}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{currentUser?.rol}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all border border-slate-200"
                title="Cerrar sesión"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        {/* TAB BAR */}
        {(userRole === ROLES.DIRECTORA || userRole === ROLES.ADMIN || userRole === ROLES.SECRE || userRole === ROLES.SECRE_ESTUDIOS || userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE) && (
          <div className="mb-6 flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
            {userRole === ROLES.DIRECTORA && (
              <>
                <button onClick={() => setCurrentTab('Solicitud')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Solicitud' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Solicitud</button>
                <button onClick={() => { setCurrentTab('Auditoría'); setDirectoraFilter('Sin auditar'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Auditoría' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Auditoría</button>
                <button onClick={() => setCurrentTab('Pacientes')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Pacientes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Pacientes</button>
                <button onClick={() => setCurrentTab('Calendario')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Calendario' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarIcon size={14} className="inline mr-1" />Calendario</button>
                <button onClick={() => setCurrentTab('Notas')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Notas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Notas</button>
                <button onClick={() => setCurrentTab('Métricas')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Métricas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><BarChart3 size={14} className="inline mr-1" />Métricas</button>
              </>
            )}
            {userRole === ROLES.ADMIN && (
              <>
                <button onClick={() => { setCurrentTab('Solicitud'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Solicitud' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Solicitud</button>
                <button onClick={() => { setCurrentTab('Auditoría'); setDirectoraFilter('Sin auditar'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Auditoría' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Auditoría</button>
                <button onClick={() => { setCurrentTab('Gestión'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Gestión' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Gestión</button>
                <button onClick={() => { setCurrentTab('Pacientes'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Pacientes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Pacientes</button>
                <button onClick={() => { setCurrentTab('Calendario'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Calendario' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarIcon size={14} className="inline mr-1" />Calendario</button>
                <button onClick={() => { setCurrentTab('Caja'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Caja' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><LayoutDashboard size={14} className="inline mr-1" />Caja</button>
                <button onClick={() => { setCurrentTab('Notas'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Notas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Notas</button>
                <button onClick={() => { setCurrentTab('Métricas'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Métricas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><BarChart3 size={14} className="inline mr-1" />Métricas</button>
                <button onClick={() => { setCurrentTab('Administración'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Administración' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Administración</button>
              </>
            )}
            {userRole === ROLES.SECRE && (
              <>
                <button onClick={() => { setCurrentTab('Gestión'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Gestión' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Gestión</button>
                <button onClick={() => { setCurrentTab('Pacientes'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Pacientes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Pacientes</button>
                <button onClick={() => { setCurrentTab('Calendario'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Calendario' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarIcon size={14} className="inline mr-1" />Calendario</button>
                <button onClick={() => { setCurrentTab('Caja'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Caja' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><LayoutDashboard size={14} className="inline mr-1" />Caja</button>
                <button onClick={() => { setCurrentTab('Notas'); }} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Notas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Notas</button>
              </>
            )}
            {userRole === ROLES.SECRE_ESTUDIOS && (
              <>
                <button onClick={() => setCurrentTab('Solicitud')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Solicitud' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Estudios</button>
                <button onClick={() => setCurrentTab('Pacientes')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Pacientes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Pacientes</button>
                <button onClick={() => setCurrentTab('Calendario')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Calendario' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarIcon size={14} className="inline mr-1" />Calendario</button>
              </>
            )}
            {(userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE) && (
              <>
                <button onClick={() => setCurrentTab('Solicitud')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Solicitud' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Solicitud</button>
                <button onClick={() => setCurrentTab('Pacientes')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Pacientes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Pacientes</button>
                <button onClick={() => setCurrentTab('Calendario')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Calendario' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><CalendarIcon size={14} className="inline mr-1" />Calendario</button>
                <button onClick={() => setCurrentTab('Notas')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${currentTab === 'Notas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Notas</button>
              </>
            )}
          </div>
        )}

        {/* CAJA TAB */}
        {currentTab === 'Caja' && (
          <CajaView currentUser={currentUser} professionals={professionals} surgeries={surgeries} />
        )}

        {/* CALENDARIO TAB */}
        {currentTab === 'Calendario' && (userRole === ROLES.DIRECTORA || userRole === ROLES.ADMIN || userRole === ROLES.SECRE || userRole === ROLES.SECRE_ESTUDIOS || userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE) && (
          <CalendarioView 
            surgeries={userRole === ROLES.SECRE_ESTUDIOS ? surgeries.filter(s => s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia) : surgeries} 
            onOpenForm={handleOpenFormFromCalendar}
            onNewSurgery={canCreate ? () => handleOpenNewSurgery(userRole === ROLES.SECRE_ESTUDIOS ? 'ESTUDIO' : 'CIRUGIA') : undefined}
            onEditSurgery={(s) => openEditModal(s)}
            onDragSurgery={handleDragSurgery}
            currentUser={currentUser}
            restrictDrag={userRole === ROLES.SECRE || userRole === ROLES.SECRE_ESTUDIOS || (userRole === ROLES.MEDICO && restrictCalendarDrag)}
          />
        )}

        {/* PACIENTES TAB */}
        {currentTab === 'Pacientes' && (
          <PacientesView />
        )}

        {/* NOTAS TAB */}
        {currentTab === 'Notas' && (
          <NotesView />
        )}

        {/* MÉTRICAS TAB */}
        {currentTab === 'Métricas' && (userRole === ROLES.DIRECTORA || userRole === ROLES.ADMIN) && (
          <MetricsPanel surgeries={surgeries} />
        )}

        {/* ADMINISTRACIÓN TAB (Admin only) */}
        {isAdmin && currentTab === 'Administración' ? (
          <AdminPanel 
            users={users} 
            setUsers={setUsers} 
            currentUser={currentUser} 
            inline 
            obrasSociales={obrasSociales} 
            setObrasSociales={setObrasSociales} 
            userRole={userRole}
            professionals={professionals}
            setProfessionals={setProfessionals}
          />
        ) : (
          <>
            {/* MODAL DE SOLICITUD (NUEVA O EDITAR) */}
            {canCreate && (showCreateModal || isEditing) && createPortal(
              <div 
                className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
              >
                <div 
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-200"
                >
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm">
                        <PlusCircle size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">
                          {isEditing 
                            ? (formData.tipoProcedimiento === 'ESTUDIO' ? 'Editar Solicitud de Estudio' : 'Editar Solicitud de Cirugía') 
                            : (formData.tipoProcedimiento === 'ESTUDIO' ? 'Nueva Solicitud de Estudio' : 'Nueva Solicitud de Cirugía')}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {isEditing 
                            ? 'Modifique los campos y guarde los cambios' 
                            : (formData.tipoProcedimiento === 'ESTUDIO' ? 'Complete los datos clínicos para programar el estudio bajo anestesia' : 'Complete los datos clínicos para programar la cirugía')}
                        </p>
                      </div>
                      <HelpTooltip content={[
                        <p key="1"><strong>Profesional:</strong> Quién realiza la cirugía. Se autocompleta email.</p>,
                        <p key="2"><strong>Paciente:</strong> Nombre completo del paciente.</p>,
                        <p key="3"><strong>Edad / DNI:</strong> Edad en años y documento sin puntos.</p>,
                        <p key="4"><strong>Obra Social:</strong> Cobertura médica. Escriba o seleccione de la lista.</p>,
                        <p key="5"><strong>Códigos:</strong> Prácticas a realizar. Busque por código o nombre.</p>,
                        <p key="6"><strong>Materiales:</strong> Insumos requeridos (opcional).</p>,
                        <p key="7"><strong>Requiere Material:</strong> SI si necesita autorización de materiales.</p>,
                        <p key="8"><strong>Anestesia:</strong> Tipo de anestesia (General, Local, etc.).</p>,
                        <p key="9"><strong>Psicoprofilaxis:</strong> SI/NO según preparación previa.</p>,
                        <p key="10"><strong>Duración:</strong> Horas estimadas de cirugía.</p>,
                        <p key="11"><strong>Requiere Presupuesto:</strong> SI si necesita cotización previa.</p>,
                        <p key="12"><strong>Notas del Dr.:</strong> Comentarios clínicos para auditoría.</p>
                      ]}>?</HelpTooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Deshabilitado temporalmente: Combo / Plantillas ORL y Personalizadas
                      <div className="relative flex items-center gap-1">
                        <select
                          className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-1 hover:border-indigo-400 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 max-w-[155px] truncate"
                          defaultValue=""
                          onChange={(e) => {
                            const templateId = e.target.value;
                            if (!templateId) return;
                            
                            const allTemplates = [...customTemplates, ...SURGICAL_TEMPLATES];
                            const tmpl = allTemplates.find(t => t.id === templateId);
                            if (tmpl) {
                              const cods = Array.isArray(tmpl.codigos) ? tmpl.codigos : (tmpl.codigos ? tmpl.codigos.split('\n') : []);
                              setFormData(prev => ({
                                ...prev,
                                justificacion: tmpl.diagnostico || '',
                                anestesia: tmpl.anestesia || 'General',
                                duracion: tmpl.duracion || '1:00 hs',
                                requiereMaterial: tmpl.requiereMaterial || 'NO',
                                materiales: tmpl.materiales || '',
                                codigos: cods.join('\n'),
                                notasDoctor: tmpl.notasDoctor || ''
                              }));
                              setCodeInputs(cods.length > 0 ? cods : ['', '']);
                            }
                            e.target.value = '';
                          }}
                          title="Cargar plantilla de cirugía ORL"
                        >
                          <option value="">⚡ Plantillas ORL...</option>
                          {customTemplates.length > 0 && (
                            <optgroup label="⭐ Mis Plantillas">
                              {customTemplates.map(t => (
                                <option key={t.id} value={t.id}>
                                  ⭐ {t.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="🏥 Plantillas Generales ORL">
                            {SURGICAL_TEMPLATES.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setNewTemplateName('');
                            setShowSaveTemplateModal(true);
                          }}
                          className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg transition-all"
                          title="Guardar datos actuales como mi plantilla personal"
                        >
                          <BookmarkPlus size={14} />
                        </button>

                        {customTemplates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowManageTemplatesModal(true)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
                            title="Administrar mis plantillas personalizadas"
                          >
                            <Settings size={14} />
                          </button>
                        )}
                      </div>
                      */}

                      <button
                        type="button"
                        onClick={() => { setShowAiModal(true); setAiError(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all"
                        title="Autocompletar formulario pegando un email con IA"
                      >
                        <Sparkles size={14} className="animate-pulse" />
                        <span>IA Auto-fill</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCloseCreateModal}
                        className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                        title="Cerrar ventana"
                      >
                        <XCircle size={22} />
                      </button>
                    </div>
                  </div>

                  {/* MODAL DE IA PARA PEGAR EMAIL */}
                  {showAiModal && createPortal(
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-indigo-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50 via-purple-50 to-white dark:from-slate-800 dark:to-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                              <Sparkles size={18} />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                                Asistente IA <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase">Parser de Cirugía</span>
                              </h3>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Pega el texto completo del email para autocompletar el formulario
                              </p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => { setShowAiModal(false); setAiText(''); setAiError(''); }}
                            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                          >
                            <XCircle size={20} />
                          </button>
                        </div>

                        <div className="p-6 space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                              Texto del Email:
                            </label>
                            <textarea
                              rows={10}
                              value={aiText}
                              onChange={(e) => setAiText(e.target.value)}
                              placeholder="Pega aquí el contenido del mail de solicitud de cirugía (médico, paciente, obra social, fecha, diagnósticos, códigos, etc.)..."
                              className="w-full p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all custom-scrollbar"
                              disabled={aiLoading}
                              autoFocus
                            />
                          </div>

                          {aiError && (
                            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400">
                              <AlertCircle size={16} className="shrink-0" />
                              <span>{aiError}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => { setShowAiModal(false); setAiText(''); setAiError(''); }}
                              disabled={aiLoading}
                              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleAiParse}
                              disabled={!aiText.trim() || aiLoading}
                              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                              {aiLoading ? (
                                <>
                                  <Loader2 size={16} className="animate-spin" />
                                  <span>Analizando con IA...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={16} />
                                  <span>Autocompletar Formulario</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}

                  {/* MODAL PARA GUARDAR PLANTILLA PERSONALIZADA */}
                  {showSaveTemplateModal && createPortal(
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-200 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                              <BookmarkPlus size={18} />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800 text-sm">Guardar como Plantilla Personal</h3>
                              <p className="text-[10px] text-slate-500">Quedará disponible en tu lista privada de cirugías</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowSaveTemplateModal(false)}
                            className="p-1 hover:bg-slate-200/50 rounded-full text-slate-400"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>

                        <div className="p-6 space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Nombre de la Plantilla:
                            </label>
                            <input
                              type="text"
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value)}
                              placeholder="Ej: Septum + Cornetes con Láser..."
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveCustomTemplate();
                                }
                              }}
                            />
                          </div>

                          {/* Resumen de los datos a guardar */}
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] space-y-1.5 text-slate-600">
                            <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">Datos que se guardarán:</p>
                            <p><strong>Diagnóstico:</strong> {formData.justificacion || '<Vacío>'}</p>
                            <p><strong>Códigos:</strong> {codeInputs.filter(Boolean).join(' + ') || formData.codigos || '<Sin códigos>'}</p>
                            <p><strong>Anestesia:</strong> {formData.anestesia || 'General'} | <strong>Duración:</strong> {formData.duracion || '1:00 hs'}</p>
                            <p><strong>Materiales:</strong> {formData.materiales || (formData.requiereMaterial === 'SI' ? 'Sí' : 'No')}</p>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowSaveTemplateModal(false)}
                              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveCustomTemplate}
                              disabled={!newTemplateName.trim()}
                              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50 transition-all active:scale-95"
                            >
                              <Save size={14} />
                              <span>Guardar Plantilla</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}

                  {/* MODAL PARA ADMINISTRAR / ELIMINAR PLANTILLAS PERSONALIZADAS */}
                  {showManageTemplatesModal && createPortal(
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                          <div className="flex items-center gap-2">
                            <Settings size={18} className="text-slate-600" />
                            <h3 className="font-bold text-slate-800 text-sm">Administrar Mis Plantillas ORL</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowManageTemplatesModal(false)}
                            className="p-1 hover:bg-slate-200 rounded-full text-slate-400"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>

                        <div className="p-6 max-h-[400px] overflow-y-auto space-y-3 custom-scrollbar">
                          {customTemplates.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-6">No tienes plantillas personalizadas guardadas aún.</p>
                          ) : (
                            customTemplates.map(t => (
                              <div key={t.id} className="p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 transition-all">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <Star size={13} className="text-amber-500 fill-amber-500 shrink-0" />
                                    <h4 className="font-bold text-xs text-slate-800 truncate">{t.name}</h4>
                                  </div>
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.diagnostico}</p>
                                  <p className="text-[10px] text-indigo-600 font-mono mt-0.5">
                                    {(Array.isArray(t.codigos) ? t.codigos : [t.codigos]).filter(Boolean).join(' • ')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomTemplate(t.id)}
                                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                  title="Eliminar plantilla"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setShowManageTemplatesModal(false)}
                            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                  
                  <form onSubmit={handleCreateSurgery} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                      {/* SECCIÓN: PROFESIONAL */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-1">
                        <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                          {userRole === ROLES.RESIDENTE || formData.residente ? 'Profesional a Cargo (Firma y Sello)' : 'Datos del Profesional'}
                        </h4>
                        {(userRole === ROLES.RESIDENTE || formData.residente) && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                            Residente: {formData.residente || currentUser?.nombre}
                          </span>
                        )}
                      </div>

                      {(userRole === ROLES.RESIDENTE || formData.residente) && (
                        <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl text-xs text-teal-800 flex items-start gap-2">
                          <User size={16} className="text-teal-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Carga de cirugía como Residente</p>
                            <p className="text-[11px] text-teal-700">
                              Seleccioná el <strong>médico a cargo</strong> con quien realizarás la intervención. La orden quirúrgica se emitirá con su firma, sello y matrícula.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            {userRole === ROLES.RESIDENTE || formData.residente ? 'Seleccionar Médico a Cargo *' : 'Seleccionar Profesional'}
                          </label>
                          <ProfessionalSearchSelect
                            professionals={professionals}
                            selectedId={formData.professionalId}
                            required={userRole === ROLES.RESIDENTE}
                            placeholder={userRole === ROLES.RESIDENTE ? "Buscar médico a cargo por apellido (ej: Valeriani, Romani)..." : "Buscar profesional por apellido..."}
                            onSelect={prof => {
                              if (!prof) {
                                setFormData({
                                  ...formData,
                                  professionalId: null,
                                  nombreProfesional: '',
                                  emailProfesional: ''
                                });
                                return;
                              }
                              const matchedUser = users.find(u => 
                                u.email && u.nombre?.toLowerCase() === prof.nombre?.toLowerCase()
                              );
                              setFormData({
                                ...formData,
                                professionalId: prof.id,
                                nombreProfesional: prof.nombre,
                                emailProfesional: prof.email || matchedUser?.email || formData.emailProfesional || ''
                              });
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Profesional</label>
                          <input 
                            type="email" className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            placeholder="email@clinica.com"
                            value={formData.emailProfesional} onChange={e => setFormData({...formData, emailProfesional: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre y Apellido</label>
                          <input 
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            placeholder="Dr/a. Nombre Apellido"
                            value={formData.nombreProfesional} onChange={e => setFormData({...formData, nombreProfesional: e.target.value})}
                          />
                        </div>
                        </div>
                      </div>
                    </div>

                    {/* SECCIÓN: PACIENTE */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-1">Datos del Paciente</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre y Apellido</label>
                          <input 
                            required className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={formData.paciente} onChange={e => setFormData({...formData, paciente: e.target.value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Edad</label>
                            <input 
                              type="number" required className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              value={formData.edad} onChange={e => setFormData({...formData, edad: e.target.value})}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-bold text-slate-500 uppercase">DNI</label>
                              {dniFoundMessage && (
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 animate-in fade-in">
                                  {dniFoundMessage}
                                </span>
                              )}
                            </div>
                            <input 
                              required 
                              placeholder="Ej: 36430598"
                              className={`w-full px-3 py-2 rounded-lg border focus:ring-2 outline-none transition-all ${
                                dniFoundMessage ? 'border-emerald-400 bg-emerald-50/20 focus:ring-emerald-500' : 'border-slate-300 focus:ring-indigo-500'
                              }`}
                              value={formData.dni} 
                              onChange={e => handleDniSearchAndFill(e.target.value, false)}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Busca y autocompleta automáticamente en la base de pacientes</p>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contacto Familiar</label>
                          <input 
                            required className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={formData.contactoFamiliar} onChange={e => setFormData({...formData, contactoFamiliar: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿Es paciente de la clínica?</label>
                          <select 
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={formData.esPacienteClinica} onChange={e => setFormData({...formData, esPacienteClinica: e.target.value})}
                          >
                            <option value="SI">SÍ</option>
                            <option value="NO">NO</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* SECCIÓN: CIRUGÍA */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-1">
                        <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                          {formData.tipoProcedimiento === 'ESTUDIO' ? 'Detalles del Estudio bajo Anestesia' : 'Detalles de la Cirugía'}
                        </h4>
                        {userRole !== ROLES.SECRE_ESTUDIOS ? (
                          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                            <button
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, tipoProcedimiento: 'CIRUGIA', estudioBajoAnestesia: false }))}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${formData.tipoProcedimiento !== 'ESTUDIO' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                              Cirugía
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, tipoProcedimiento: 'ESTUDIO', estudioBajoAnestesia: true }))}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${formData.tipoProcedimiento === 'ESTUDIO' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                              Estudio bajo Anestesia
                            </button>
                          </div>
                        ) : (
                          <span className="px-3 py-1 text-xs font-bold rounded-md bg-purple-600 text-white shadow-sm">
                            Estudio bajo Anestesia
                          </span>
                        )}
                      </div>

                      {formData.tipoProcedimiento === 'ESTUDIO' && (
                        <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                          <p className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
                            Seleccionar Estudio (clic para agregar o quitar):
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ESTUDIOS_BAJO_ANESTESIA.map(est => {
                              const isAdded = codeInputs.some(c => c.trim().toLowerCase() === est.name.toLowerCase() || c.trim() === est.code);
                              return (
                                <button
                                  key={est.code}
                                  type="button"
                                  onClick={() => {
                                    if (isAdded) {
                                      const next = codeInputs.filter(c => c.trim().toLowerCase() !== est.name.toLowerCase() && c.trim() !== est.code);
                                      setCodeInputs(next.length > 0 ? next : ['']);
                                    } else {
                                      const emptyIdx = codeInputs.findIndex(c => !c.trim());
                                      if (emptyIdx !== -1) {
                                        const next = [...codeInputs];
                                        next[emptyIdx] = est.name;
                                        setCodeInputs(next);
                                      } else {
                                        setCodeInputs([...codeInputs, est.name]);
                                      }
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                    isAdded 
                                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                                      : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100/70'
                                  }`}
                                >
                                  {isAdded ? '✓ ' : '+ '} {est.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Solicitud</label>
                            <div className="relative">
                              <CalendarIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                type="date" className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                value={formData.fechaSolicitud || ''} onChange={e => setFormData(prev => ({ ...prev, fechaSolicitud: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                              {formData.tipoProcedimiento === 'ESTUDIO' ? 'Fecha Estudio' : 'Fecha Cirugía'}
                            </label>
                            <div className="relative">
                              <CalendarIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                type="date" required className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                value={formData.fecha} onChange={e => handleDateChange(e.target.value)}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-xs font-bold text-slate-500 uppercase">Hora Inicio</label>
                              {formData.horaFin && (
                                <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                  Hasta: {formData.horaFin} hs
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input 
                                type="time" className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                value={formData.horaInicio} onChange={e => handleTimeChange(e.target.value)}
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Auto: 08:00 hs o al finalizar la anterior</p>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duración Estimada</label>
                            <select
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm bg-white"
                              value={formData.duracion || '1:00 hs'}
                              onChange={e => handleDurationChange(e.target.value)}
                            >
                              <option value="0:30 hs">30 min (0:30 hs)</option>
                              <option value="0:45 hs">45 min (0:45 hs)</option>
                              <option value="1:00 hs">1 hora (1:00 hs)</option>
                              <option value="1:15 hs">1h 15m (1:15 hs)</option>
                              <option value="1:30 hs">1h 30m (1:30 hs)</option>
                              <option value="1:45 hs">1h 45m (1:45 hs)</option>
                              <option value="2:00 hs">2 horas (2:00 hs)</option>
                              <option value="2:30 hs">2h 30m (2:30 hs)</option>
                              <option value="3:00 hs">3 horas (3:00 hs)</option>
                              <option value="3:30 hs">3h 30m (3:30 hs)</option>
                              <option value="4:00 hs">4 horas (4:00 hs)</option>
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">Determina el turno de la siguiente cirugía</p>
                          </div>
                        </div>

                        {/* Horario de Ingreso y Orden para WhatsApp */}
                        <div className="p-3 bg-gradient-to-r from-amber-50/80 to-indigo-50/50 border border-amber-200/80 rounded-xl space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Clock size={15} className="text-amber-600 shrink-0" />
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">Horario de Ingreso del Paciente (Para WhatsApp)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="07:10"
                                  className="w-20 px-2 py-1 text-xs font-black text-amber-900 bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-center shadow-xs"
                                  value={formData.horaIngreso || ''}
                                  onChange={e => setFormData(prev => ({ ...prev, horaIngreso: e.target.value }))}
                                />
                                <span className="text-xs font-bold text-slate-500">hs</span>
                              </div>
                              <input
                                type="text"
                                placeholder="Orden (ej: 1° turno)"
                                className="w-28 px-2 py-1 text-xs font-bold text-indigo-900 bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                                value={formData.ordenIngreso || ''}
                                onChange={e => setFormData(prev => ({ ...prev, ordenIngreso: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-500 mr-1">Rápido:</span>
                            {['07:10', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'].map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, horaIngreso: t }))}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${formData.horaIngreso === t ? 'bg-amber-500 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-amber-50'}`}
                              >
                                {t} hs
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Obra Social</label>
                            <input list="os-list"
                              required className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                              value={formData.obraSocial} onChange={e => setFormData({...formData, obraSocial: e.target.value})}
                            />
                            <datalist id="os-list">
                              {obrasSociales.map(os => <option key={os} value={os} />)}
                            </datalist>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{formData.obraSocial?.toLowerCase() === 'particular' ? 'Honorarios Prof.' : 'Nº Afiliado'}</label>
                            <input 
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                              value={formData.nroAfiliado} onChange={e => setFormData({...formData, nroAfiliado: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SALA</label>
                            <input 
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm uppercase font-bold text-slate-800 placeholder:normal-case placeholder:font-normal"
                              placeholder="Ej: SALA 1, Q1..."
                              value={formData.habitacion || ''} onChange={e => setFormData({...formData, habitacion: e.target.value.toUpperCase()})}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿Informó sobre psicoprofilaxis?</label>
                          <select 
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            value={formData.psicoprofilaxis} onChange={e => setFormData({...formData, psicoprofilaxis: e.target.value})}
                          >
                            <option value="SI">SÍ</option>
                            <option value="NO">NO</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                            {formData.tipoProcedimiento === 'ESTUDIO' ? 'Estudios a Solicitar' : 'Códigos a Autorizar'}
                          </label>
                          <div className="space-y-2">
                            {codeInputs.map((val, idx) => (
                               <div key={idx} className="flex items-start gap-2">
                                 <span className="text-xs font-bold text-slate-400 w-16 shrink-0 mt-2">Código {idx + 1}</span>
                                 <div className="flex-1 space-y-1">
                                   <div className="relative">
                                     <input
                                       type="text"
                                       className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                       value={val}
                                       placeholder="Escriba código o nombre..."
                                       onChange={(e) => {
                                         const newVal = e.target.value;
                                         const newInputs = [...codeInputs];
                                         newInputs[idx] = newVal;
                                         setCodeInputs(newInputs);
                                         const isSM = formData.obraSocial?.toUpperCase().includes('SWISS');
                                         const matches = searchCodes(newVal, isSM, formData.tipoProcedimiento || 'CIRUGIA');
                                         setCodeSuggestions({ ...codeSuggestions, [idx]: matches });
                                         setActiveCodeField(idx);
                                       }}
                                       onKeyDown={(e) => {
                                         if (e.key === 'Enter' && codeSuggestions[idx]?.length > 0 && activeCodeField === idx) {
                                           e.preventDefault();
                                           const s = codeSuggestions[idx][0];
                                           const newInputs = [...codeInputs];
                                           newInputs[idx] = s.code;
                                           setCodeInputs(newInputs);
                                           setCodeSuggestions({});
                                         }
                                       }}
                                       onFocus={() => {
                                         setActiveCodeField(idx);
                                         if (val.trim().length >= 2) {
                                           const isSM = formData.obraSocial?.toUpperCase().includes('SWISS');
                                           const matches = searchCodes(val, isSM, formData.tipoProcedimiento || 'CIRUGIA');
                                           setCodeSuggestions({ ...codeSuggestions, [idx]: matches });
                                         }
                                       }}
                                       onBlur={() => setTimeout(() => { setCodeSuggestions({}); setActiveCodeField(null); }, 200)}
                                     />
                                     {codeSuggestions[idx]?.length > 0 && activeCodeField === idx && (
                                       <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                         {codeSuggestions[idx].map((s, si) => (
                                           <button
                                             key={si}
                                             type="button"
                                             className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-xs border-b border-slate-100 last:border-0"
                                             onMouseDown={(e) => {
                                               e.preventDefault();
                                               const newInputs = [...codeInputs];
                                               newInputs[idx] = s.code;
                                               setCodeInputs(newInputs);
                                               setCodeSuggestions({});
                                             }}
                                           >
                                              <div className="flex items-center gap-1 flex-wrap">
                                                 {s.parentModule ? (
                                                   <>
                                                     <span className="font-bold text-indigo-700">{s.parentModule.code} {s.parentModule.name}</span>
                                                     <span className="text-slate-400">-</span>
                                                     <span className="font-bold text-slate-700">{s.code}</span>
                                                     <span className="text-slate-600">{s.name}</span>
                                                   </>
                                                 ) : s.type === 'iosfa' && s.generalCode ? (
                                                   <>
                                                     <span className="font-bold text-emerald-700">{s.code}</span>
                                                     <span className="text-slate-400">({s.generalCode})</span>
                                                     <span className="text-slate-600">{s.name}</span>
                                                     <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1 rounded font-bold">IOSFA</span>
                                                   </>
                                                 ) : (
                                                   <>
                                                     <span className="font-bold text-indigo-700">{s.code}</span>
                                                     <span className="text-slate-600">{s.name}</span>
                                                   </>
                                                 )}
                                                 {s.type === 'modulo' && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1 rounded font-bold">MÓDULO</span>}
                                               </div>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    {val.trim() && (
                                      <div className="text-[10px] text-indigo-500 font-medium px-1 leading-tight">
                                        {(() => {
                                          const isSM = formData.obraSocial?.toUpperCase().includes('SWISS');
                                          const isIOSFA = formData.obraSocial?.toUpperCase().includes('IOSFA');
                                          const expanded = expandCodes(val.trim(), isSM, isIOSFA);
                                          return expanded.length > 0 ? expanded[0] : `${val.trim()} — ${getCodeName(val.trim())}`;
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                  {idx >= 2 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newInputs = codeInputs.filter((_, i) => i !== idx);
                                        setCodeInputs(newInputs);
                                      }}
                                      className="text-red-400 hover:text-red-600 p-1"
                                    >
                                      <XCircle size={16} />
                                    </button>
                                  )}
                                </div>
                             ))}
                            <button
                              type="button"
                              onClick={() => setCodeInputs([...codeInputs, ''])}
                              className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-700 mt-1"
                            >
                              <PlusCircle size={14} /> Agregar código
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={formData.requiereMaterial === 'SI'}
                              onChange={e => setFormData({...formData, requiereMaterial: e.target.checked ? 'SI' : 'NO', materiales: e.target.checked ? formData.materiales : ''})}
                            />
                            <span className="text-xs font-bold text-slate-500 uppercase">Requiere Material</span>
                          </label>
                        </div>
                        {formData.requiereMaterial === 'SI' && (
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Materiales a Solicitar OS</label>
                            <div className="space-y-1.5 mb-2">
                              {PREDEFINED_MATERIALS.map(mat => {
                                const qty = materialSelections[mat] || 0;
                                return (
                                  <div key={mat} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = qty === 0 ? 1 : qty === 1 ? 2 : 0;
                                        const updated = { ...materialSelections, [mat]: next };
                                        if (next === 0) delete updated[mat];
                                        setMaterialSelections(updated);
                                        const lines = Object.entries(updated).filter(([,q]) => q > 0).map(([name, q]) => formatMaterialLine(name, q));
                                        setFormData({...formData, materiales: lines.join('\n')});
                                      }}
                                      className={`w-7 h-7 rounded-lg border text-xs font-bold transition-all ${
                                        qty === 0 ? 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300' :
                                        qty === 1 ? 'bg-blue-50 border-blue-200 text-blue-600' :
                                        'bg-blue-100 border-blue-300 text-blue-700'
                                      }`}
                                    >
                                      {qty === 0 ? '+' : qty}
                                    </button>
                                    <span className={`text-xs font-medium ${qty > 0 ? 'text-slate-800' : 'text-slate-400'}`}>{mat}</span>
                                    {qty > 0 && (
                                      <span className="text-[10px] text-blue-500 font-medium">{formatMaterialLine(mat, qty)}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <textarea 
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-16 text-xs"
                              value={formData.materiales} onChange={e => setFormData({...formData, materiales: e.target.value})}
                              placeholder="Agregar otro material no incluido..."
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Justificación Pedido CX</label>
                          <textarea 
                            required className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-20"
                            value={formData.justificacion} onChange={e => setFormData({...formData, justificacion: e.target.value})}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anestesia</label>
                            <input 
                              required className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              value={formData.anestesia} onChange={e => setFormData({...formData, anestesia: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿Requiere Presupuesto?</label>
                            <select 
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              value={formData.requierePresupuesto} onChange={e => setFormData({...formData, requierePresupuesto: e.target.value})}
                            >
                              <option value="NO">NO</option>
                              <option value="SI">SÍ</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas del médico</label>
                          <textarea
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-20"
                            value={formData.notasDoctor} onChange={e => setFormData({...formData, notasDoctor: e.target.value})}
                          />
                        </div>

                        {/* SECCIÓN: ADJUNTAR FOTO DE ORDEN / ESTUDIOS */}
                        <div className="pt-2 border-t border-slate-100">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Camera size={14} className="text-indigo-600" />
                              <span>Foto de Orden Médica / Carnet OS</span>
                            </span>
                            {uploadingFile && <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Subiendo...</span>}
                          </label>
                          <div className="space-y-2">
                            <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl cursor-pointer bg-slate-50/50 hover:bg-indigo-50/30 transition-all">
                              <Paperclip size={16} className="text-indigo-600" />
                              <span className="text-xs font-semibold text-slate-600">Adjuntar foto o archivo (cámara / galería)</span>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                disabled={uploadingFile}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setUploadingFile(true);
                                  try {
                                    const path = `ordenes_adjuntos/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                                    const url = await apiService.uploadFile(path, file);
                                    setFormData(prev => ({
                                      ...prev,
                                      adjuntos: [...(prev.adjuntos || []), url]
                                    }));
                                  } catch (err) {
                                    alert("Error al subir archivo: " + err.message);
                                  } finally {
                                    setUploadingFile(false);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>

                            {/* Miniaturas de adjuntos cargados */}
                            {formData.adjuntos?.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {formData.adjuntos.map((url, idx) => (
                                  <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                                    <img src={url} alt="adjunto" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(url)} />
                                    <button
                                      type="button"
                                      onClick={() => setFormData(prev => ({ ...prev, adjuntos: prev.adjuntos.filter((_, i) => i !== idx) }))}
                                      className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 opacity-80 hover:opacity-100 transition-opacity"
                                      title="Quitar"
                                    >
                                      <XCircle size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* MODAL FOOTER */}
                  <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCloseCreateModal}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-md bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-200"
                    >
                      <CheckCircle2 size={16} /> {isEditing ? 'Actualizar Solicitud' : 'Guardar Solicitud'}
                    </button>
                  </div>
                </form>

              </div>
            </div>,
            document.body
          )}

          {currentTab !== 'Caja' && currentTab !== 'Métricas' && currentTab !== 'Calendario' && currentTab !== 'Pacientes' && currentTab !== 'Notas' && (
          <div className="w-full">
            {/* TABLA / TARJETAS A ANCHO COMPLETO */}
            <section className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                      <FileText size={20} />
                    </div>
                    <h3 className="font-bold text-slate-700">
                      {userRole === ROLES.SECRE_ESTUDIOS
                        ? 'Estudios Bajo Anestesia'
                        : (userRole === ROLES.MEDICO || userRole === ROLES.RESIDENTE || userRole === ROLES.DIRECTORA) && currentTab === 'Solicitud'
                          ? 'Mis Solicitudes de Cirugía' 
                          : (currentTab === 'Auditoría' ? 'Auditoría Médica' : currentTab === 'Gestión' ? 'Gestión de Casos' : 'Solicitudes y Casos')}
                    </h3>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg ml-2">
                      <button onClick={() => setViewMode('cards')} className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista tarjetas"><LayoutGrid size={16} /></button>
                      <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista tabla"><Table2 size={16} /></button>
                    </div>

                    {/* Botones Nueva Cirugía / Nuevo Estudio */}
                    {canCreate && (
                      <div className="flex items-center gap-1.5 ml-2">
                        {userRole !== ROLES.SECRE_ESTUDIOS && (
                          <button
                            onClick={() => handleOpenNewSurgery('CIRUGIA')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                            title="Crear nueva solicitud de cirugía"
                          >
                            <PlusCircle size={14} />
                            <span>Nueva Cirugía</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenNewSurgery('ESTUDIO')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                          title="Crear nueva solicitud de estudio bajo anestesia"
                        >
                          <PlusCircle size={14} />
                          <span>Nuevo Estudio</span>
                        </button>
                      </div>
                    )}

                    {/* Sub-filtros para Auditoría (Admin y Directora) */}
                    {currentTab === 'Auditoría' && (userRole === ROLES.DIRECTORA || userRole === ROLES.ADMIN) && (
                      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 ml-2">
                        <button
                          onClick={() => setDirectoraFilter('Todas')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${directoraFilter === 'Todas' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Todas ({surgeries.length})
                        </button>
                        <button
                          onClick={() => setDirectoraFilter('Auditadas')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${directoraFilter === 'Auditadas' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Auditadas / En curso ({surgeries.filter(s => s.estado !== 'SOLICITADA').length})
                        </button>
                        <button
                          onClick={() => setDirectoraFilter('Sin auditar')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${directoraFilter === 'Sin auditar' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          <span>Sin auditar</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${surgeries.filter(s => s.estado === 'SOLICITADA').length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                            {surgeries.filter(s => s.estado === 'SOLICITADA').length}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Sub-filtros para Secretaría (Gestión) */}
                    {currentTab === 'Gestión' && userRole === ROLES.SECRE && (
                      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 ml-2">
                        <button
                          onClick={() => setEncargadoFilter('Auditadas')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${encargadoFilter === 'Auditadas' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Auditadas para Enviar/Autorizar
                        </button>
                        <button
                          onClick={() => setEncargadoFilter('Pendientes')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${encargadoFilter === 'Pendientes' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Pendientes Auditoría
                        </button>
                        <button
                          onClick={() => setEncargadoFilter('Todas')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${encargadoFilter === 'Todas' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Todas
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Search */}
                    <div className="relative">
                      <input
                        className="w-40 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                        placeholder="Buscar paciente, DNI o Dr..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                      />
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    </div>

                    {/* Filtro Período: Próximas / Esta semana / Realizadas / Canceladas / Todas */}
                    <select
                      className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 outline-none px-2.5 py-1.5 rounded-lg cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={periodoFilter}
                      onChange={e => setPeriodoFilter(e.target.value)}
                    >
                      <option value="todas">Período: Todos</option>
                      <option value="esta_semana">⚡ Esta semana (próximos 7 días)</option>
                      <option value="proximas">🗓️ Todas las próximas</option>
                      <option value="realizadas">✅ Historial (Realizadas)</option>
                      <option value="canceladas">❌ Canceladas / No realizadas</option>
                    </select>

                    {/* Filtro Estado (Solicitada, Codificada, etc.) */}
                    <select
                      className="text-xs font-semibold text-slate-600 outline-none px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                    >
                      <option value="">Todos los estados</option>
                      {Object.keys(STATUS).map(stKey => (
                        <option key={stKey} value={stKey}>{STATUS[stKey].label}</option>
                      ))}
                    </select>

                    {/* Professional Filter - Desplegable con todos los profesionales */}
                    <select
                      className="text-xs font-semibold text-slate-600 outline-none px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={profFilter}
                      onChange={e => setProfFilter(e.target.value)}
                    >
                      <option value="">Todos los profesionales</option>
                      {professionals.map(p => (
                        <option key={p.id} value={p.nombre}>{p.nombre}</option>
                      ))}
                    </select>

                    {/* OS Filter */}
                    <select
                      className="text-xs font-semibold text-slate-600 outline-none px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={obraSocialFilter}
                      onChange={e => setObraSocialFilter(e.target.value)}
                    >
                      <option value="">Todas las OS</option>
                      {[...new Set(surgeries.map(s => s.obraSocial).filter(Boolean))].sort().map(os => (
                        <option key={os} value={os}>{os}</option>
                      ))}
                    </select>

                    {/* Date Filter */}
                    <input
                      type="date"
                      className="text-xs font-semibold text-slate-600 outline-none px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={dateFilter}
                      onChange={e => setDateFilter(e.target.value)}
                      title="Filtrar por fecha específica"
                    />

                    {/* Botón Imprimir Grilla Quirófano del día */}
                    <button
                      onClick={() => setQuirofanoModalDate(dateFilter || new Date().toISOString().split('T')[0])}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors shadow-sm active:scale-95"
                      title="Generar e imprimir grilla diaria para quirófano"
                    >
                      <Printer size={13} />
                      <span>Grilla Quirófano</span>
                    </button>

                    {/* Tipo Filter */}
                    <select
                      className="text-xs font-semibold text-slate-600 outline-none px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={tipoFilter}
                      onChange={e => setTipoFilter(e.target.value)}
                    >
                      <option value="TODOS">Tipo: Todos</option>
                      <option value="CIRUGIA">Solo Cirugías</option>
                      <option value="ESTUDIO">Solo Estudios</option>
                    </select>

                    {/* Material Filter */}
                    <select
                      className="text-xs font-semibold text-slate-600 outline-none px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer focus:ring-2 focus:ring-indigo-500"
                      value={materialFilter}
                      onChange={e => setMaterialFilter(e.target.value)}
                    >
                      <option value="TODOS">Material: Todos</option>
                      <option value="SI">Con material</option>
                      <option value="NO">Sin material</option>
                    </select>

                    {/* Botón limpiar filtros si alguno está activo */}
                    {(periodoFilter !== 'todas' || statusFilter || profFilter || obraSocialFilter || dateFilter || materialFilter !== 'TODOS' || searchTerm) && (
                      <button
                        onClick={() => {
                          setPeriodoFilter('todas');
                          setStatusFilter('');
                          setProfFilter('');
                          setObraSocialFilter('');
                          setDateFilter('');
                          setMaterialFilter('TODOS');
                          setTipoFilter('TODOS');
                          setSearchTerm('');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs font-bold transition-colors"
                        title="Limpiar filtros"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>

                {/* VISTA TABLA */}
                <div className={`overflow-x-auto ${viewMode !== 'table' ? 'hidden' : ''}`}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                        <th className="px-6 py-4">Paciente & Diagnóstico</th>
                        <th className="px-6 py-4">Profesional</th>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">Creador</th>
                        <th className="px-6 py-4">Estado</th>
                        <th className="px-6 py-4">Material</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getFilteredSurgeries().slice(0, visibleCount).map(s => (
                        <tr key={s.id} className={`group hover:bg-slate-50/80 transition-all ${s.pinned ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <div className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{s.paciente}</div>
                                {s.dni && (
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 font-mono">
                                    DNI {s.dni}
                                  </span>
                                )}
                                {s.nroAfiliado && (
                                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                                    AF: {s.nroAfiliado}
                                  </span>
                                )}
                                {s.pinned && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 shadow-xs shrink-0" title="Pedido fijado">
                                    <Pin size={10} className="fill-amber-500 text-amber-700" />
                                    Fijado
                                  </span>
                                )}
                                {(s.tipoProcedimiento === 'ESTUDIO' || s.estudioBajoAnestesia) && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                                    ESTUDIO
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const alertInfo = getUrgencyAlert(s);
                                return alertInfo ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${alertInfo.color}`}>
                                    <AlertTriangle size={10} />
                                    {alertInfo.text}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-1">
                              {userRole === ROLES.SECRE ? (s.requiereMaterial === 'SI' ? `Mat: ${s.materiales || 'Sin especificar'}` : 'No requiere material') : s.justificacion}
                            </div>
                            {s.adjuntos?.length > 0 && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                  <Camera size={11} /> {s.adjuntos.length} adjunto(s):
                                </span>
                                {s.adjuntos.map((imgUrl, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setPreviewImage(imgUrl)}
                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 underline font-medium"
                                  >
                                    Foto {i + 1}
                                  </button>
                                ))}
                              </div>
                            )}
                            {s.notasDoctor && (
                              <div className="text-xs text-amber-600 mt-1 line-clamp-1">
                                <span className="font-medium">Nota del médico:</span> {s.notasDoctor}
                              </div>
                            )}
                            {s.notasDirectora && (
                              <div className="text-xs text-indigo-600 mt-1 line-clamp-1">
                                <span className="font-medium">Nota de la directora:</span> {s.notasDirectora}
                              </div>
                            )}
                            {s.motivoRechazo && (
                              <div className="text-xs text-rose-600 mt-1 line-clamp-1">
                                <span className="font-medium">Rechazo:</span> {s.motivoRechazo}
                              </div>
                            )}
                            {s.motivoCancelacion && (
                              <div className="text-xs text-slate-500 mt-1 line-clamp-1">
                                <span className="font-medium">Cancelación:</span> {s.motivoCancelacion}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                              <User size={13} className="text-indigo-400" />
                              {s.nombreProfesional || 'Sin asignar'}
                            </div>
                            {s.residente && (
                              <div className="text-[10px] text-teal-700 font-semibold mt-0.5 flex items-center gap-1">
                                <span className="bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">Res: {s.residente}</span>
                              </div>
                            )}
                            {s.obraSocial && (
                              <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">
                                {s.obraSocial}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-slate-800 text-xs font-bold">
                              <CalendarIcon size={13} className="text-slate-400 shrink-0" />
                              <span>{s.fecha}</span>
                            </div>
                            {s.horaInicio && (
                              <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                Cx: {s.horaInicio} hs
                              </div>
                            )}
                            {s.horaIngreso && (
                              <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200" title="Horario de ingreso del paciente">
                                <Clock size={10} className="text-amber-600 shrink-0" />
                                <span>Ingreso: {s.horaIngreso} hs</span>
                                {s.ordenIngreso && <span className="text-indigo-600 font-bold ml-0.5">({s.ordenIngreso})</span>}
                              </div>
                            )}
                            {s.habitacion && (
                              <div className="block mt-1">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300" title="Sala">
                                  SALA {s.habitacion.toUpperCase()}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              {s.creadorRol === ROLES.DIRECTORA || s.creadorRol === ROLES.ADMIN ? (
                                <ShieldCheck size={14} className="text-indigo-500" />
                              ) : s.creadorRol === ROLES.RESIDENTE ? (
                                <User size={14} className="text-teal-600" />
                              ) : (
                                <User size={14} />
                              )}
                              <span>{s.creador}</span>
                              {s.creadorRol === ROLES.RESIDENTE && (
                                <span className="text-[9px] bg-teal-50 text-teal-700 px-1 py-0.2 rounded border border-teal-200 font-bold">Residente</span>
                              )}
                            </div>
                          </td>
                           <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${STATUS[s.estado].color}`}>
                                {STATUS[s.estado].label}
                              </span>
                              {s.reactivada && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border border-amber-200 bg-amber-50 text-amber-600">
                                  Reactivada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {s.requiereMaterial === 'SI' ? (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                (s.aprobacionMaterial || 'PENDIENTE') === 'APROBADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                (s.aprobacionMaterial || 'PENDIENTE') === 'NO REQUIERE' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                                'bg-amber-50 text-amber-600 border-amber-200'
                              }`}>
                                {s.aprobacionMaterial || 'PENDIENTE'}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-300 font-medium">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* BOTÓN CODIFICAR (Directora y Admin) */}
                              {canAudit && s.estado === 'SOLICITADA' && (
                                <button 
                                  onClick={() => { setSelectedSurgery(s); setAuditCodes(''); }}
                                  className="px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-all text-[11px] font-bold shadow-sm"
                                >
                                  Codificar
                                </button>
                              )}

                              {/* ACCIONES DE ESTADO DE GESTIÓN (Exclusivo Secretaría y Admin) */}
                              {canManageStatus && (
                                <>
                                  {s.estado === 'CODIFICADA' && (
                                    <button 
                                      onClick={() => updateStatus(s.id, 'ENVIADA')}
                                      className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-600 hover:bg-purple-100 transition-all border border-purple-200 text-[11px] font-bold"
                                    >
                                      Enviado
                                    </button>
                                  )}
                                  {(s.estado === 'CODIFICADA' || s.estado === 'ENVIADA') && (
                                    <>
                                      <button 
                                        onClick={() => updateStatus(s.id, 'AUTORIZADA')}
                                        className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all border border-emerald-200 text-[11px] font-bold flex items-center gap-1"
                                      >
                                        <CheckCircle2 size={13} />
                                        <span>Autorizado</span>
                                      </button>
                                      <button 
                                        onClick={() => setRejectModal(s)}
                                        className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all border border-rose-200 text-[11px] font-bold flex items-center gap-1"
                                      >
                                        <XCircle size={13} />
                                        <span>Rechazado</span>
                                      </button>
                                      <button 
                                        onClick={() => setCancelModal(s)}
                                        className="px-2.5 py-1 rounded-md bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all border border-slate-200 text-[11px] font-bold flex items-center gap-1"
                                      >
                                        <XCircle size={13} />
                                        <span>Cancelado</span>
                                      </button>
                                    </>
                                  )}
                                  {(s.estado === 'RECHAZADA' || s.estado === 'CANCELADA') && (
                                    <button 
                                      onClick={() => updateStatus(s.id, 'ENVIADA')}
                                      className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all border border-amber-200 text-[11px] font-bold"
                                    >
                                      Reactivar
                                    </button>
                                  )}
                                  {s.requiereMaterial === 'SI' && (
                                    <button
                                      onClick={() => toggleMaterialApproval(s.id)}
                                      className={`p-1.5 rounded-md transition-all border ${
                                        (s.aprobacionMaterial || 'PENDIENTE') === 'APROBADO' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100' :
                                        (s.aprobacionMaterial || 'PENDIENTE') === 'NO REQUIERE' ? 'bg-slate-100 text-slate-400 hover:bg-slate-200 border-slate-200' :
                                        'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200'
                                      }`}
                                      title={`Material: ${s.aprobacionMaterial || 'PENDIENTE'} (click para cambiar)`}
                                    >
                                      <Package size={15} />
                                    </button>
                                  )}
                                </>
                              )}

                              {/* FIJAR / DESFIJAR */}
                              <button
                                type="button"
                                onClick={() => handleTogglePinSurgery(s.id)}
                                className={`p-1.5 rounded-md transition-all border ${
                                  s.pinned
                                    ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 shadow-xs'
                                    : 'bg-slate-100 text-slate-400 hover:text-amber-600 hover:bg-amber-50 border-slate-200'
                                }`}
                                title={s.pinned ? 'Desfijar pedido' : 'Fijar pedido al inicio'}
                              >
                                <Pin size={15} className={s.pinned ? 'fill-amber-500 text-amber-700' : ''} />
                              </button>

                              {/* EDITAR (Unificado: Abre el formulario completo) */}
                              {(canEditSurgery(s) || isAdmin || canManageStatus) && (
                                <button 
                                  onClick={() => openEditModal(s)}
                                  className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all border border-indigo-200 text-[11px] font-bold flex items-center gap-1"
                                  title="Editar cirugía completa"
                                >
                                  <Pencil size={13} />
                                  <span>Editar</span>
                                </button>
                              )}

                              {/* WHATSAPP */}
                              <button 
                                onClick={() => setWhatsAppModalSurgery(s)}
                                className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition-all border border-emerald-200"
                                title="Enviar WhatsApp al paciente"
                              >
                                <MessageCircle size={15} />
                              </button>

                              {/* IMPRIMIR */}
                              {(canEditSurgery(s) || isAdmin || canManageStatus) && (
                                <button 
                                  onClick={() => handlePrint(s)}
                                  className="p-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all border border-slate-200"
                                  title="Imprimir Orden"
                                >
                                  <Printer size={15} />
                                </button>
                              )}

                              {/* ELIMINAR */}
                              {(canEditSurgery(s) || isAdmin) && (
                                <button 
                                  onClick={() => handleDelete(s.id)}
                                  className="p-1.5 rounded-md bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition-all border border-rose-200"
                                  title="Eliminar"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {getFilteredSurgeries().length === 0 && (
                        <tr>
                          <td colSpan="7" className="px-6 py-20 text-center">
                            <div className="flex flex-col items-center gap-3 text-slate-400">
                              <div className="p-4 bg-slate-50 rounded-full">
                                <FileText size={32} className="opacity-20" />
                              </div>
                              <p className="text-sm italic">No se encontraron registros para la vista actual.</p>
                              {canCreate && (
                                <div className="flex items-center justify-center gap-2 mt-2">
                                  <button
                                    onClick={() => handleOpenNewSurgery('CIRUGIA')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                                  >
                                    <PlusCircle size={14} />
                                    <span>Nueva Cirugía</span>
                                  </button>
                                  <button
                                    onClick={() => handleOpenNewSurgery('ESTUDIO')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                                  >
                                    <PlusCircle size={14} />
                                    <span>Nuevo Estudio</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* VISTA TARJETAS */}
                <div className={`p-3 space-y-3 ${viewMode !== 'cards' ? 'hidden' : ''}`}>
                  {getFilteredSurgeries().slice(0, visibleCount).map(s => {
                    const shortCodes = extractShortCodes(s);
                    return (
                      <div key={s.id} className={`bg-white rounded-xl border shadow-sm p-4 space-y-3 transition-all ${s.pinned ? 'border-amber-300 ring-1 ring-amber-300/50 bg-gradient-to-r from-amber-50/30 via-white to-white' : 'border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <p className="font-bold text-slate-800 text-sm truncate">{s.paciente}</p>
                                {s.dni && (
                                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-mono shrink-0">
                                    DNI {s.dni}
                                  </span>
                                )}
                                {s.pinned && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 shadow-xs shrink-0" title="Pedido fijado">
                                    <Pin size={10} className="fill-amber-500 text-amber-700" />
                                    Fijado
                                  </span>
                                )}
                                {(s.tipoProcedimiento === 'ESTUDIO' || s.estudioBajoAnestesia) && (
                                  <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                                    ESTUDIO
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const alertInfo = getUrgencyAlert(s);
                                return alertInfo ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${alertInfo.color}`}>
                                    <AlertTriangle size={10} />
                                    {alertInfo.text}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                              {userRole === ROLES.SECRE ? (s.requiereMaterial === 'SI' ? `Mat: ${s.materiales || 'Sin especificar'}` : 'No requiere material') : s.justificacion}
                            </p>
                            {s.adjuntos?.length > 0 && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                  <Camera size={11} /> {s.adjuntos.length} foto(s):
                                </span>
                                <div className="flex items-center gap-1.5 overflow-x-auto">
                                  {s.adjuntos.map((imgUrl, i) => (
                                    <img
                                      key={i}
                                      src={imgUrl}
                                      alt="orden"
                                      onClick={() => setPreviewImage(imgUrl)}
                                      className="w-8 h-8 rounded-md object-cover border border-slate-200 cursor-pointer hover:scale-105 transition-transform"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${STATUS[s.estado].color}`}>
                              {STATUS[s.estado].label}
                            </span>
                            {s.reactivada && (
                              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase border border-amber-200 bg-amber-50 text-amber-600">
                                Reactivada
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Fila con detalles, códigos y campos editables */}
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1 font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            <User size={12} className="text-indigo-500" />
                            {s.nombreProfesional || 'Sin profesional'}
                          </div>
                          {s.residente && (
                            <div className="flex items-center gap-1 font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-[10px]">
                              <span>Res:</span> {s.residente}
                            </div>
                          )}
                          {s.obraSocial && (
                            <span className="font-semibold text-slate-600 uppercase bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                              {s.obraSocial}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <CalendarIcon size={12} className="text-slate-400" />
                            <span>{s.fecha} {s.horaInicio ? `(${s.horaInicio} hs)` : ''}</span>
                          </div>
                          {s.horaIngreso && (
                            <div className="flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black" title="Horario de ingreso del paciente">
                              <Clock size={11} className="text-amber-600 shrink-0" />
                              <span>Ingreso: {s.horaIngreso} hs</span>
                              {s.ordenIngreso && <span className="text-indigo-600 font-bold ml-0.5">({s.ordenIngreso})</span>}
                            </div>
                          )}

                          {/* Códigos solicitados (solo el código numérico/identificador ej: 031301, 030409) */}
                          {shortCodes.length > 0 && (
                            <div className="flex items-center gap-1 bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded-lg flex-wrap">
                              <span className="text-[10px] font-bold text-indigo-900 uppercase">Códigos:</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {shortCodes.map((code, cIdx) => (
                                  <span key={cIdx} className="px-1.5 py-0.2 rounded bg-white text-indigo-700 border border-indigo-200 font-mono text-[11px] font-extrabold shadow-2xs">
                                    {code}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* N° AF editable directamente desde la tarjeta */}
                          <CardInlineField
                            label="N° AF"
                            value={s.nroAfiliado}
                            placeholder="N° Afiliado"
                            onSave={(val) => handleUpdateSurgeryQuickField(s.id, { nroAfiliado: val })}
                          />

                          {/* SALA editable directamente desde la tarjeta (en MAYÚSCULAS y +1pt tamaño) */}
                          <CardInlineField
                            label="SALA"
                            value={s.habitacion}
                            placeholder="SALA / Q1"
                            isUppercase={true}
                            isSala={true}
                            onSave={(val) => handleUpdateSurgeryQuickField(s.id, { habitacion: val })}
                          />

                          <div className="flex items-center gap-1 text-slate-400 text-[10px]">
                            <span>Por:</span> {s.creador}
                          </div>
                          {s.requiereMaterial === 'SI' && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                              (s.aprobacionMaterial || 'PENDIENTE') === 'APROBADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                              (s.aprobacionMaterial || 'PENDIENTE') === 'NO REQUIERE' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                              'bg-amber-50 text-amber-600 border-amber-200'
                            }`}>
                              Mat: {s.aprobacionMaterial || 'PEND'}
                            </span>
                          )}
                        </div>

                        {s.notasDoctor && (
                          <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-100">
                            <span className="font-medium">Nota Dr:</span> {s.notasDoctor}
                          </p>
                        )}
                        {s.notasDirectora && (
                          <p className="text-[11px] text-indigo-600 bg-indigo-50 rounded-lg px-3 py-1.5 border border-indigo-100">
                            <span className="font-medium">Dir:</span> {s.notasDirectora}
                          </p>
                        )}
                        {s.motivoRechazo && (
                          <p className="text-[11px] text-rose-600 bg-rose-50 rounded-lg px-3 py-1.5 border border-rose-100">
                            <span className="font-medium">Rechazo:</span> {s.motivoRechazo}
                          </p>
                        )}
                        {s.motivoCancelacion && (
                          <p className="text-[11px] text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
                            <span className="font-medium">Cancelación:</span> {s.motivoCancelacion}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                          {canAudit && s.estado === 'SOLICITADA' && (
                            <button onClick={() => { setSelectedSurgery(s); setAuditCodes(''); }}
                              className="px-2.5 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-sm">
                              Codificar
                            </button>
                          )}
                          {canManageStatus && s.estado === 'CODIFICADA' && (
                            <button onClick={() => updateStatus(s.id, 'ENVIADA')}
                              className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-600 text-[11px] font-bold hover:bg-purple-100 border border-purple-200 transition-all active:scale-95">
                              Enviado
                            </button>
                          )}
                          {(canManageStatus && (s.estado === 'CODIFICADA' || s.estado === 'ENVIADA')) && (
                            <>
                              <button onClick={() => updateStatus(s.id, 'AUTORIZADA')} title="Autorizado"
                                className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1">
                                <CheckCircle2 size={13} />
                                <span>Autorizado</span>
                              </button>
                              <button onClick={() => setRejectModal(s)} title="Rechazado"
                                className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1">
                                <XCircle size={13} />
                                <span>Rechazado</span>
                              </button>
                              <button onClick={() => setCancelModal(s)} title="Cancelado"
                                className="px-2.5 py-1 rounded-md bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1">
                                <XCircle size={13} />
                                <span>Cancelado</span>
                              </button>
                            </>
                          )}
                          {canManageStatus && (s.estado === 'RECHAZADA' || s.estado === 'CANCELADA') && (
                            <button onClick={() => updateStatus(s.id, 'ENVIADA')}
                              className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-600 text-[11px] font-bold hover:bg-amber-100 border border-amber-200 transition-all active:scale-95">
                              Reactivar
                            </button>
                          )}
                          {canManageStatus && s.requiereMaterial === 'SI' && (
                            <button onClick={() => toggleMaterialApproval(s.id)} title={`Material: ${s.aprobacionMaterial || 'PENDIENTE'}`}
                              className={`p-1.5 rounded-md border transition-all active:scale-95 ${
                                (s.aprobacionMaterial || 'PENDIENTE') === 'APROBADO' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' :
                                (s.aprobacionMaterial || 'PENDIENTE') === 'NO REQUIERE' ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200' :
                                'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                              }`}>
                              <Package size={15} />
                            </button>
                          )}

                          {/* FIJAR / DESFIJAR */}
                          <button
                            type="button"
                            onClick={() => handleTogglePinSurgery(s.id)}
                            className={`p-1.5 rounded-md transition-all border active:scale-95 ${
                              s.pinned
                                ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 shadow-xs'
                                : 'bg-slate-100 text-slate-400 hover:text-amber-600 hover:bg-amber-50 border-slate-200'
                            }`}
                            title={s.pinned ? 'Desfijar pedido' : 'Fijar pedido al inicio'}
                          >
                            <Pin size={15} className={s.pinned ? 'fill-amber-500 text-amber-700' : ''} />
                          </button>

                          {/* EDITAR (Unificado) */}
                          {(canEditSurgery(s) || isAdmin || canManageStatus) && (
                            <button onClick={() => openEditModal(s)} title="Editar cirugía completa"
                              className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1">
                              <Pencil size={13} />
                              <span>Editar</span>
                            </button>
                          )}

                          {/* WHATSAPP */}
                          <button onClick={() => setWhatsAppModalSurgery(s)} title="Enviar WhatsApp al paciente"
                            className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 border border-emerald-200 transition-all active:scale-95">
                            <MessageCircle size={15} />
                          </button>

                          {/* IMPRIMIR */}
                          {(canEditSurgery(s) || isAdmin || canManageStatus) && (
                            <button onClick={() => handlePrint(s)} title="Imprimir"
                              className="p-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-all active:scale-95">
                              <Printer size={15} />
                            </button>
                          )}

                          {/* ELIMINAR */}
                          {(canEditSurgery(s) || isAdmin) && (
                            <button onClick={() => handleDelete(s.id)} title="Eliminar"
                              className="p-1.5 rounded-md bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-700 border border-rose-200 transition-all active:scale-95">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {getFilteredSurgeries().length === 0 && (
                    <div className="py-16 text-center text-slate-400">
                      <div className="inline-flex p-4 bg-slate-50 rounded-full mb-3">
                        <FileText size={32} className="opacity-20" />
                      </div>
                      <p className="text-sm italic mb-2">No se encontraron registros para la vista actual.</p>
                      {canCreate && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenNewSurgery('CIRUGIA')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            <PlusCircle size={14} />
                            <span>Nueva Cirugía</span>
                          </button>
                          <button
                            onClick={() => handleOpenNewSurgery('ESTUDIO')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            <PlusCircle size={14} />
                            <span>Nuevo Estudio</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* BOTÓN CARGAR MÁS / PAGINACIÓN */}
                {getFilteredSurgeries().length > visibleCount && (
                  <div className="p-6 text-center border-t border-slate-100 bg-slate-50/50">
                    <button
                      onClick={() => setVisibleCount(prev => prev + 15)}
                      className="px-6 py-2.5 bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-600 font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all active:scale-95"
                    >
                      Cargar más ({getFilteredSurgeries().length - visibleCount} restantes)
                    </button>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2">
                      Mostrando {visibleCount} de {getFilteredSurgeries().length} registros
                    </p>
                  </div>
                )}
            </section>
          </div>
          )}
        </>
        )}
      </main>

      {/* MODAL DE RECHAZO */}
      {rejectModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setRejectModal(null); setRejectMotivo(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center"><XCircle size={20} className="text-rose-600" /></div>
              <div><h3 className="font-bold text-slate-800">Rechazar Cirugía</h3><p className="text-[10px] text-slate-400">{rejectModal.paciente}</p></div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo del rechazo</label>
              <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 outline-none transition-all text-sm min-h-[100px] resize-none" placeholder="Indique el motivo para informar al profesional..." value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectModal(null); setRejectMotivo(''); }} className="flex-1 py-2.5 text-slate-500 font-bold text-xs uppercase rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { updateStatus(rejectModal.id, 'RECHAZADA', rejectMotivo); setRejectModal(null); setRejectMotivo(''); }} disabled={!rejectMotivo.trim()} className="flex-1 py-2.5 bg-rose-600 text-white font-bold text-xs uppercase rounded-lg shadow-md hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed">Rechazar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CANCELACIÓN */}
      {cancelModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setCancelModal(null); setCancelMotivo(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center"><XCircle size={20} className="text-slate-600" /></div>
              <div><h3 className="font-bold text-slate-800">Cancelar Cirugía</h3><p className="text-[10px] text-slate-400">{cancelModal.paciente}</p></div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo de cancelación</label>
              <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-slate-400 outline-none transition-all text-sm min-h-[100px] resize-none" placeholder="Indique el motivo de la cancelación..." value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} autoFocus />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setCancelModal(null); setCancelMotivo(''); }} className="flex-1 py-2.5 text-slate-500 font-bold text-xs uppercase rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { updateStatus(cancelModal.id, 'CANCELADA', cancelMotivo); setCancelModal(null); setCancelMotivo(''); }} disabled={!cancelMotivo.trim()} className="flex-1 py-2.5 bg-slate-600 text-white font-bold text-xs uppercase rounded-lg shadow-md hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AUDITORÍA */}
      {selectedSurgery && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-indigo-600" />
                <h3 className="font-bold text-slate-800">Auditoría de Solicitud</h3>
              </div>
              <button onClick={() => setSelectedSurgery(null)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <XCircle size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Datos del Profesional</h4>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Nombre: <span className="text-slate-800 font-medium">{selectedSurgery.nombreProfesional}</span></p>
                    <p className="text-xs text-slate-500">Email: <span className="text-slate-800 font-medium">{selectedSurgery.emailProfesional}</span></p>
                  </div>

                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest pt-2">Datos del Paciente</h4>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Nombre: <span className="text-slate-800 font-medium">{selectedSurgery.paciente}</span></p>
                    <p className="text-xs text-slate-500">Edad/DNI: <span className="text-slate-800 font-medium">{selectedSurgery.edad} años / {selectedSurgery.dni}</span></p>
                    <p className="text-xs text-slate-500">Contacto: <span className="text-slate-800 font-medium">{selectedSurgery.contactoFamiliar}</span></p>
                    <p className="text-xs text-slate-500">Clínica: <span className="text-slate-800 font-medium">{selectedSurgery.esPacienteClinica}</span></p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Detalles Técnicos</h4>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">Fecha: <span className="text-slate-800 font-medium">{selectedSurgery.fecha}</span></p>
                    <p className="text-xs text-slate-500">Duración: <span className="text-slate-800 font-medium">{selectedSurgery.duracion} hs</span></p>
                    <p className="text-xs text-slate-500">Obra Social: <span className="text-slate-800 font-medium">{selectedSurgery.obraSocial}</span></p>
                    <p className="text-xs text-slate-500">Psicoprofilaxis: <span className="text-slate-800 font-medium">{selectedSurgery.psicoprofilaxis}</span></p>
                    <p className="text-xs text-slate-500">Anestesia: <span className="text-slate-800 font-medium">{selectedSurgery.anestesia}</span></p>
                    {selectedSurgery.requierePresupuesto === 'SI' && (
                      <p className="text-xs font-bold text-amber-600">Esta cirugía requiere presupuesto</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Justificación y Materiales</h4>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 italic">
                  "{selectedSurgery.justificacion}"
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 font-medium">
                  Materiales: {selectedSurgery.materiales || 'No especificados'}
                </div>
                {selectedSurgery.notasDoctor && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs">
                    <span className="font-bold text-amber-700">Notas del médico:</span>
                    <p className="text-slate-800 mt-1">{selectedSurgery.notasDoctor}</p>
                  </div>
                )}
                {selectedSurgery.motivoRechazo && (
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-xs">
                    <span className="font-bold text-rose-700">Rechazo:</span>
                    <p className="text-slate-800 mt-1">{selectedSurgery.motivoRechazo}</p>
                  </div>
                )}
                {selectedSurgery.motivoCancelacion && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <span className="font-bold text-slate-600">Cancelación:</span>
                    <p className="text-slate-800 mt-1">{selectedSurgery.motivoCancelacion}</p>
                  </div>
                )}
                {selectedSurgery.reactivada && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs">
                    <span className="font-bold text-amber-600">Esta cirugía fue reactivada</span>
                  </div>
                )}
                {selectedSurgery.codigos && (
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 text-xs">
                    <span className="font-bold text-indigo-700">Códigos solicitados por el profesional:</span>
                    <div className="text-slate-800 mt-1 font-medium space-y-1">
                      {selectedSurgery.codigos.split(/\s+/).filter(c => c.trim()).map((rawCode, i) => {
                        const trimmed = rawCode.trim();
                        const isSM = selectedSurgery.obraSocial?.toUpperCase().includes('SWISS');
                        const isIOSFA = selectedSurgery.obraSocial?.toUpperCase().includes('IOSFA');
                        const expanded = expandCodes(trimmed, isSM, isIOSFA);
                        const desc = expanded.length > 0 ? expanded[0] : `${trimmed} — ${getCodeName(trimmed)}`;
                        const osPresupuesto = JSON.parse(localStorage.getItem('os_code_presupuesto') || '{}');
                        const key = `${selectedSurgery.obraSocial}||${trimmed}`;
                        const isPresupuesto = !!osPresupuesto[key];
                        return (
                          <div key={i} className="py-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{trimmed}</span>
                              {isPresupuesto && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-black border border-amber-200">REQUIERE PRESUPUESTO</span>
                              )}
                            </div>
                            <div className="text-[10px] text-indigo-500 font-medium pl-1">{desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase">Asignar Códigos de Cirugía</label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={auditCodes === (selectedSurgery?.codigos || '')}
                    onChange={e => {
                      if (e.target.checked) {
                        setAuditCodes(selectedSurgery?.codigos || '');
                      } else {
                        setAuditCodes('');
                      }
                    }}
                  />
                  <span className="text-xs font-medium text-slate-600">Los códigos solicitados son correctos</span>
                </label>

                <div className="flex gap-2">
                  <textarea
                    autoFocus
                    className="flex-1 px-3 py-2 rounded-lg border border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm h-20"
                    placeholder="Ingrese un código por línea"
                    value={auditCodes} onChange={e => setAuditCodes(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (auditCodes) {
                        assignCodes(selectedSurgery.id, auditCodes);
                        setSelectedSurgery(null);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-md"
                  >
                    Confirmar
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <label className="block text-xs font-bold text-indigo-700 uppercase mb-2">Notas para la Secretaria</label>
                  <textarea
                  className="w-full px-3 py-2 rounded-lg border border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm h-20"
                  value={selectedSurgery.notasDirectora || ''}
                  onChange={e => {
                    setSurgeries(surgeries.map(s =>
                      s.id === selectedSurgery.id ? { ...s, notasDirectora: e.target.value } : s
                    ));
                    setSelectedSurgery({ ...selectedSurgery, notasDirectora: e.target.value });
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* MODAL DE EDICIÓN COMPLETA */}
      {editModalData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Pencil size={20} className="text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-800">Editar Solicitud</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                    {editModalData.creador && (
                      <span>Cargada por: <strong className="text-slate-700">{editModalData.creador}</strong></span>
                    )}
                    {editModalData.modifiedBy && (
                      <>
                        <span>•</span>
                        <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                          Última modif.: <strong>{editModalData.modifiedBy}</strong>
                          {editModalData.modifiedAt && ` (${new Date(editModalData.modifiedAt).toLocaleDateString([], {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})})`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setEditModalData(null)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <XCircle size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* Profesional */}
                <div className="md:col-span-2 flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                    {editModalData.residente ? 'Profesional a Cargo (Firma y Sello)' : 'Datos del Profesional'}
                  </h4>
                  {editModalData.residente && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      Residente: {editModalData.residente}
                    </span>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    {editModalData.residente ? 'Médico a Cargo' : 'Seleccionar Profesional'}
                  </label>
                  <ProfessionalSearchSelect
                    professionals={professionals}
                    selectedId={editModalData.professionalId}
                    placeholder={editModalData.residente ? "Buscar médico a cargo por apellido (ej: Valeriani, Romani)..." : "Buscar profesional por apellido..."}
                    onSelect={prof => {
                      if (!prof) {
                        setEditModalData(prev => ({
                          ...prev,
                          professionalId: null,
                          nombreProfesional: '',
                          emailProfesional: ''
                        }));
                        return;
                      }
                      setEditModalData(prev => ({
                        ...prev,
                        professionalId: prof.id,
                        nombreProfesional: prof.nombre,
                        emailProfesional: prof.email || prev.emailProfesional
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Profesional</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.emailProfesional || ''}
                    onChange={e => setEditModalData({...editModalData, emailProfesional: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre y Apellido</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.nombreProfesional || ''}
                    onChange={e => setEditModalData({...editModalData, nombreProfesional: e.target.value})}
                  />
                </div>

                {/* Paciente */}
                <div className="md:col-span-2">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 mt-2">Datos del Paciente</h4>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre y Apellido</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.paciente || ''}
                    onChange={e => setEditModalData({...editModalData, paciente: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Edad</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.edad || ''}
                    onChange={e => setEditModalData({...editModalData, edad: e.target.value})}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">DNI</label>
                    {editDniFoundMessage && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {editDniFoundMessage}
                      </span>
                    )}
                  </div>
                  <input className={`w-full px-3 py-2 rounded-lg border focus:ring-2 outline-none text-sm transition-all ${
                    editDniFoundMessage ? 'border-emerald-400 bg-emerald-50/20 focus:ring-emerald-500' : 'border-slate-300 focus:ring-indigo-500'
                  }`}
                    value={editModalData.dni || ''}
                    onChange={e => handleDniSearchAndFill(e.target.value, true)}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Busca y autocompleta automáticamente en la base de pacientes</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contacto Familiar</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.contactoFamiliar || ''}
                    onChange={e => setEditModalData({...editModalData, contactoFamiliar: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿Es paciente de la clínica?</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.esPacienteClinica || 'SI'}
                    onChange={e => setEditModalData({...editModalData, esPacienteClinica: e.target.value})}
                  >
                    <option value="SI">SÍ</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Obra Social</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.obraSocial || ''}
                    onChange={e => setEditModalData({...editModalData, obraSocial: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nº Afiliado</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.nroAfiliado || ''}
                    onChange={e => setEditModalData({...editModalData, nroAfiliado: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SALA</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm uppercase font-extrabold text-slate-800"
                    placeholder="Ej: SALA 1, Q1..."
                    value={editModalData.habitacion || ''}
                    onChange={e => setEditModalData({...editModalData, habitacion: e.target.value.toUpperCase()})}
                    disabled={!(userRole === ROLES.DIRECTORA || userRole === ROLES.SECRE || userRole === ROLES.ADMIN)}
                  />
                </div>

                {/* Cirugía / Estudio */}
                <div className="md:col-span-2 flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                    {editModalData.tipoProcedimiento === 'ESTUDIO' ? 'Detalles del Estudio bajo Anestesia' : 'Detalles de la Cirugía'}
                  </h4>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                    <button
                      type="button"
                      onClick={() => setEditModalData(prev => ({ ...prev, tipoProcedimiento: 'CIRUGIA', estudioBajoAnestesia: false }))}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${editModalData.tipoProcedimiento !== 'ESTUDIO' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Cirugía
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditModalData(prev => ({ ...prev, tipoProcedimiento: 'ESTUDIO', estudioBajoAnestesia: true }))}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${editModalData.tipoProcedimiento === 'ESTUDIO' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Estudio bajo Anestesia
                    </button>
                  </div>
                </div>

                {editModalData.tipoProcedimiento === 'ESTUDIO' && (
                  <div className="md:col-span-2 p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2 mb-2">
                    <p className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
                      Seleccionar Estudio (clic para agregar o quitar):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ESTUDIOS_BAJO_ANESTESIA.map(est => {
                        const isAdded = editCodeInputs.some(c => c.trim().toLowerCase() === est.name.toLowerCase() || c.trim() === est.code);
                        return (
                          <button
                            key={est.code}
                            type="button"
                            onClick={() => {
                              if (isAdded) {
                                const next = editCodeInputs.filter(c => c.trim().toLowerCase() !== est.name.toLowerCase() && c.trim() !== est.code);
                                setEditCodeInputs(next.length > 0 ? next : ['']);
                              } else {
                                const emptyIdx = editCodeInputs.findIndex(c => !c.trim());
                                if (emptyIdx !== -1) {
                                  const next = [...editCodeInputs];
                                  next[emptyIdx] = est.name;
                                  setEditCodeInputs(next);
                                } else {
                                  setEditCodeInputs([...editCodeInputs, est.name]);
                                }
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                              isAdded 
                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm' 
                                : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100/70'
                            }`}
                          >
                            {isAdded ? '✓ ' : '+ '} {est.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Solicitud</label>
                  <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.fechaSolicitud || ''}
                    onChange={e => setEditModalData({...editModalData, fechaSolicitud: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    {editModalData.tipoProcedimiento === 'ESTUDIO' ? 'Fecha Estudio' : 'Fecha Cirugía'}
                  </label>
                  <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.fecha || ''}
                    onChange={e => setEditModalData({...editModalData, fecha: e.target.value})}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Hora Inicio</label>
                    {editModalData.horaFin && (
                      <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                        Hasta: {editModalData.horaFin} hs
                      </span>
                    )}
                  </div>
                  <input type="time" className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.horaInicio || ''}
                    onChange={e => {
                      const h = e.target.value;
                      const dMin = parseDurationToMinutes(editModalData.duracion || '1:00 hs');
                      setEditModalData({...editModalData, horaInicio: h, horaFin: h ? addMinutesToTime(h, dMin) : ''});
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duración Estimada</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                    value={editModalData.duracion || '1:00 hs'}
                    onChange={e => {
                      const dur = e.target.value;
                      const dMin = parseDurationToMinutes(dur);
                      const hFin = editModalData.horaInicio ? addMinutesToTime(editModalData.horaInicio, dMin) : '';
                      setEditModalData({...editModalData, duracion: dur, horaFin: hFin});
                    }}
                  >
                    <option value="0:30 hs">30 min (0:30 hs)</option>
                    <option value="0:45 hs">45 min (0:45 hs)</option>
                    <option value="1:00 hs">1 hora (1:00 hs)</option>
                    <option value="1:15 hs">1h 15m (1:15 hs)</option>
                    <option value="1:30 hs">1h 30m (1:30 hs)</option>
                    <option value="1:45 hs">1h 45m (1:45 hs)</option>
                    <option value="2:00 hs">2 horas (2:00 hs)</option>
                    <option value="2:30 hs">2h 30m (2:30 hs)</option>
                    <option value="3:00 hs">3 horas (3:00 hs)</option>
                    <option value="3:30 hs">3h 30m (3:30 hs)</option>
                    <option value="4:00 hs">4 horas (4:00 hs)</option>
                  </select>
                </div>

                {/* Horario de Ingreso y Orden para WhatsApp */}
                <div className="md:col-span-2 p-3 bg-gradient-to-r from-amber-50/80 to-indigo-50/50 border border-amber-200/80 rounded-xl space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Clock size={15} className="text-amber-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">Horario de Ingreso del Paciente (Para WhatsApp)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="07:10"
                          className="w-20 px-2 py-1 text-xs font-black text-amber-900 bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-center shadow-xs"
                          value={editModalData.horaIngreso || ''}
                          onChange={e => setEditModalData(prev => ({ ...prev, horaIngreso: e.target.value }))}
                        />
                        <span className="text-xs font-bold text-slate-500">hs</span>
                      </div>
                      <input
                        type="text"
                        placeholder="Orden (ej: 1° turno)"
                        className="w-28 px-2 py-1 text-xs font-bold text-indigo-900 bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
                        value={editModalData.ordenIngreso || ''}
                        onChange={e => setEditModalData(prev => ({ ...prev, ordenIngreso: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-500 mr-1">Rápido:</span>
                    {['07:10', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditModalData(prev => ({ ...prev, horaIngreso: t }))}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${editModalData.horaIngreso === t ? 'bg-amber-500 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-amber-50'}`}
                      >
                        {t} hs
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Psicoprofilaxis</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.psicoprofilaxis || 'SI'}
                    onChange={e => setEditModalData({...editModalData, psicoprofilaxis: e.target.value})}
                  >
                    <option value="SI">SÍ</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Anestesia</label>
                  <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.anestesia || ''}
                    onChange={e => setEditModalData({...editModalData, anestesia: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿Requiere Presupuesto?</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={editModalData.requierePresupuesto || 'NO'}
                    onChange={e => setEditModalData({...editModalData, requierePresupuesto: e.target.value})}
                  >
                    <option value="NO">NO</option>
                    <option value="SI">SÍ</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    {editModalData.tipoProcedimiento === 'ESTUDIO' ? 'Estudios a Solicitar' : 'Códigos a Autorizar'}
                  </label>
                  <div className="space-y-2">
                    {editCodeInputs.map((val, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-xs font-bold text-slate-400 w-16 shrink-0 mt-2">Código {idx + 1}</span>
                        <div className="flex-1 space-y-1">
                          <div className="relative">
                            <input
                              type="text"
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                              value={val}
                              placeholder="Escriba código o nombre..."
                              onChange={(e) => {
                                const newVal = e.target.value;
                                const newInputs = [...editCodeInputs];
                                newInputs[idx] = newVal;
                                setEditCodeInputs(newInputs);
                                const isSM = editModalData.obraSocial?.toUpperCase().includes('SWISS');
                                const matches = searchCodes(newVal, isSM, editModalData.tipoProcedimiento || 'CIRUGIA');
                                setEditCodeSuggestions({ ...editCodeSuggestions, [idx]: matches });
                                setEditActiveCodeField(idx);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && editCodeSuggestions[idx]?.length > 0 && editActiveCodeField === idx) {
                                  e.preventDefault();
                                  const s = editCodeSuggestions[idx][0];
                                  const newInputs = [...editCodeInputs];
                                  newInputs[idx] = s.code;
                                  setEditCodeInputs(newInputs);
                                  setEditCodeSuggestions({});
                                }
                              }}
                              onFocus={() => {
                                setEditActiveCodeField(idx);
                                if (val.trim().length >= 2) {
                                  const isSM = editModalData.obraSocial?.toUpperCase().includes('SWISS');
                                  const matches = searchCodes(val, isSM, editModalData.tipoProcedimiento || 'CIRUGIA');
                                  setEditCodeSuggestions({ ...editCodeSuggestions, [idx]: matches });
                                }
                              }}
                              onBlur={() => setTimeout(() => { setEditCodeSuggestions({}); setEditActiveCodeField(null); }, 200)}
                            />
                            {editCodeSuggestions[idx]?.length > 0 && editActiveCodeField === idx && (
                              <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                {editCodeSuggestions[idx].map((s, si) => (
                                  <button
                                    key={si}
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-xs border-b border-slate-100 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      const newInputs = [...editCodeInputs];
                                      newInputs[idx] = s.code;
                                      setEditCodeInputs(newInputs);
                                      setEditCodeSuggestions({});
                                    }}
                                  >
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {s.parentModule ? (
                                        <>
                                          <span className="font-bold text-indigo-700">{s.parentModule.code} {s.parentModule.name}</span>
                                          <span className="text-slate-400">-</span>
                                          <span className="font-bold text-slate-700">{s.code}</span>
                                          <span className="text-slate-600">{s.name}</span>
                                        </>
                                      ) : s.type === 'iosfa' && s.generalCode ? (
                                        <>
                                          <span className="font-bold text-emerald-700">{s.code}</span>
                                          <span className="text-slate-400">({s.generalCode})</span>
                                          <span className="text-slate-600">{s.name}</span>
                                          <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1 rounded font-bold">IOSFA</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-bold text-indigo-700">{s.code}</span>
                                          <span className="text-slate-600">{s.name}</span>
                                        </>
                                      )}
                                      {s.type === 'modulo' && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1 rounded font-bold">MÓDULO</span>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {val.trim() && (
                            <div className="text-[10px] text-indigo-500 font-medium px-1 leading-tight">
                              {(() => {
                                const isSM = editModalData.obraSocial?.toUpperCase().includes('SWISS');
                                const isIOSFA = editModalData.obraSocial?.toUpperCase().includes('IOSFA');
                                const expanded = expandCodes(val.trim(), isSM, isIOSFA);
                                return expanded.length > 0 ? expanded[0] : `${val.trim()} - ${getCodeName(val.trim())}`;
                              })()}
                            </div>
                          )}
                        </div>
                        {idx >= 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newInputs = editCodeInputs.filter((_, i) => i !== idx);
                              setEditCodeInputs(newInputs);
                            }}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditCodeInputs([...editCodeInputs, ''])}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-700 mt-1"
                    >
                      <PlusCircle size={14} /> Agregar código
                    </button>
                  </div>
                </div>

                {/* SECCIÓN CONVENIO Y VALORES PARA ESTUDIOS */}
                {(editModalData.tipoProcedimiento === 'ESTUDIO' || editModalData.estudioBajoAnestesia) && (
                  <div className="md:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                          Convenios y Valores de los Estudios
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Panel de gestión secretaría</span>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Indique si cada práctica se encuentra convenida con la obra social. Si marca <strong>No convenido</strong>, ingrese el importe a abonar por el paciente.
                    </p>

                    <div className="space-y-2.5 pt-1">
                      {editCodeInputs.filter(c => c && c.trim()).map((val, idx) => {
                        const trimmed = val.trim();
                        const resolvedName = getCodeName(trimmed) || trimmed;
                        const convenios = editModalData.conveniosEstudios || {};
                        const itemCfg = convenios[resolvedName] || convenios[trimmed] || {};
                        const isConvenido = itemCfg.convenido !== false;
                        const currentValor = itemCfg.valor || '';

                        return (
                          <div key={idx} className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs font-black text-purple-700 w-5">{idx + 1}-</span>
                              <span className="text-xs font-bold text-slate-700 truncate">{resolvedName}</span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...(editModalData.conveniosEstudios || {}) };
                                    next[resolvedName] = { convenido: true, valor: '' };
                                    setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${isConvenido ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                  Convenido
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...(editModalData.conveniosEstudios || {}) };
                                    next[resolvedName] = { convenido: false, valor: currentValor || '' };
                                    setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${!isConvenido ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                  No convenido
                                </button>
                              </div>

                              {!isConvenido && (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-bold text-slate-500">$</span>
                                  <input
                                    type="text"
                                    placeholder="Valor (ej: 30000)"
                                    value={currentValor}
                                    onChange={e => {
                                      const next = { ...(editModalData.conveniosEstudios || {}) };
                                      next[resolvedName] = { convenido: false, valor: e.target.value };
                                      setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                    }}
                                    className="w-28 px-2 py-1 rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500 outline-none text-xs font-bold text-slate-800"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Items institucionales (si no es sólo DISE) */}
                      {(() => {
                        const rawCodes = editCodeInputs.filter(c => c && c.trim());
                        const isDiseOnly = rawCodes.length > 0 && rawCodes.every(c => c.toUpperCase() === 'DISE' || c.toUpperCase().includes('DISE'));
                        if (isDiseOnly) return null;

                        const convenios = editModalData.conveniosEstudios || {};
                        const intCfg = convenios['INTERNACION_BREVE'] || {};
                        const intConvenido = intCfg.convenido !== false;
                        const intValor = intCfg.valor || '';

                        const medCfg = convenios['MEDICAMENTOS_DESCARTABLES'] || {};
                        const medConvenido = medCfg.convenido !== false;
                        const medValor = medCfg.valor || '';

                        return (
                          <div className="space-y-2 pt-2 border-t border-slate-200">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Gastos Sanatoriales (incluidos en la orden de estudio):
                            </p>

                            {/* Internación breve */}
                            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <span className="text-xs font-bold text-slate-700">Internación breve, uso de quirófano</span>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...(editModalData.conveniosEstudios || {}) };
                                      next['INTERNACION_BREVE'] = { convenido: true, valor: '' };
                                      setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${intConvenido ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                  >
                                    Convenido
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...(editModalData.conveniosEstudios || {}) };
                                      next['INTERNACION_BREVE'] = { convenido: false, valor: intValor || '' };
                                      setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${!intConvenido ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                  >
                                    No convenido
                                  </button>
                                </div>
                                {!intConvenido && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-slate-500">$</span>
                                    <input
                                      type="text"
                                      placeholder="Valor"
                                      value={intValor}
                                      onChange={e => {
                                        const next = { ...(editModalData.conveniosEstudios || {}) };
                                        next['INTERNACION_BREVE'] = { convenido: false, valor: e.target.value };
                                        setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                      }}
                                      className="w-28 px-2 py-1 rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500 outline-none text-xs font-bold text-slate-800"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Medicamentos y descartables */}
                            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <span className="text-xs font-bold text-slate-700">Medicamentos y descartables</span>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...(editModalData.conveniosEstudios || {}) };
                                      next['MEDICAMENTOS_DESCARTABLES'] = { convenido: true, valor: '' };
                                      setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${medConvenido ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                  >
                                    Convenido
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...(editModalData.conveniosEstudios || {}) };
                                      next['MEDICAMENTOS_DESCARTABLES'] = { convenido: false, valor: medValor || '' };
                                      setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${!medConvenido ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                  >
                                    No convenido
                                  </button>
                                </div>
                                {!medConvenido && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-slate-500">$</span>
                                    <input
                                      type="text"
                                      placeholder="Valor"
                                      value={medValor}
                                      onChange={e => {
                                        const next = { ...(editModalData.conveniosEstudios || {}) };
                                        next['MEDICAMENTOS_DESCARTABLES'] = { convenido: false, valor: e.target.value };
                                        setEditModalData(prev => ({ ...prev, conveniosEstudios: next }));
                                      }}
                                      className="w-28 px-2 py-1 rounded-lg border border-amber-300 focus:ring-2 focus:ring-amber-500 outline-none text-xs font-bold text-slate-800"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={editModalData.requiereMaterial === 'SI'}
                      onChange={e => setEditModalData({...editModalData, requiereMaterial: e.target.checked ? 'SI' : 'NO', materiales: e.target.checked ? editModalData.materiales : ''})}
                    />
                    <span className="text-xs font-bold text-slate-500 uppercase">Requiere Material</span>
                  </label>
                </div>
                {editModalData.requiereMaterial === 'SI' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Materiales a Solicitar OS</label>
                    <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm h-20"
                      value={editModalData.materiales || ''}
                      onChange={e => setEditModalData({...editModalData, materiales: e.target.value})}
                    />
                    <div className="mt-2 space-y-1">
                      {PREDEFINED_MATERIALS.map(mat => {
                        const lines = (editModalData.materiales || '').split('\n');
                        const match = lines.find(l => l.includes(mat));
                        const qty = match ? (match.startsWith('1') ? 1 : match.startsWith('2') ? 2 : 0) : 0;
                        return (
                          <div key={mat} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const current = editModalData.materiales || '';
                                const currentLines = current.split('\n').filter(l => l.trim());
                                const filtered = currentLines.filter(l => !l.includes(mat));
                                if (qty === 0) {
                                  filtered.push(formatMaterialLine(mat, 1));
                                } else if (qty === 1) {
                                  filtered.push(formatMaterialLine(mat, 2));
                                }
                                setEditModalData({...editModalData, materiales: filtered.join('\n')});
                              }}
                              className={`w-7 h-7 rounded-lg border text-xs font-bold transition-all ${
                                qty === 0 ? 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300' :
                                qty === 1 ? 'bg-blue-50 border-blue-200 text-blue-600' :
                                'bg-blue-100 border-blue-300 text-blue-700'
                              }`}
                            >
                              {qty === 0 ? '+' : qty}
                            </button>
                            <span className={`text-xs font-medium ${qty > 0 ? 'text-slate-800' : 'text-slate-400'}`}>{mat}</span>
                            {qty > 0 && (
                              <span className="text-[10px] text-blue-500 font-medium">{formatMaterialLine(mat, qty)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Justificación Pedido CX</label>
                  <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm h-20"
                    value={editModalData.justificacion || ''}
                    onChange={e => setEditModalData({...editModalData, justificacion: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-amber-600 uppercase mb-1">Notas del médico</label>
                  <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm h-20"
                    value={editModalData.notasDoctor || ''}
                    onChange={e => setEditModalData({...editModalData, notasDoctor: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-indigo-600 uppercase mb-1">Notas de la directora</label>
                  <textarea className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm h-20"
                    value={editModalData.notasDirectora || ''}
                    onChange={e => setEditModalData({...editModalData, notasDirectora: e.target.value})}
                  />
                </div>
                {editModalData.estado === 'RECHAZADA' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-rose-600 uppercase mb-1">Motivo de rechazo</label>
                    <textarea className="w-full px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 outline-none text-sm h-20 text-rose-700"
                      value={editModalData.motivoRechazo || ''} readOnly
                    />
                  </div>
                )}
                {editModalData.estado === 'CANCELADA' && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo de cancelación</label>
                    <textarea className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 outline-none text-sm h-20 text-slate-600"
                      value={editModalData.motivoCancelacion || ''} readOnly
                    />
                  </div>
                )}
                {editModalData.reactivada && (
                  <div className="md:col-span-2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-600 text-[10px] font-bold uppercase">
                      Esta cirugía fue reactivada
                    </span>
                  </div>
                )}

                {/* ADJUNTOS EN MODAL DE EDICIÓN */}
                <div className="md:col-span-2 pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Camera size={15} className="text-indigo-600" />
                      <span>Fotos y Estudios Adjuntos</span>
                    </span>
                    {uploadingFile && <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Subiendo...</span>}
                  </label>
                  
                  <div className="space-y-3">
                    <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl cursor-pointer bg-slate-50/50 hover:bg-indigo-50/30 transition-all">
                      <Paperclip size={16} className="text-indigo-600" />
                      <span className="text-xs font-semibold text-slate-600">Subir nueva foto o estudio</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        disabled={uploadingFile}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingFile(true);
                          try {
                            const path = `ordenes_adjuntos/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                            const url = await apiService.uploadFile(path, file);
                            setEditModalData(prev => ({
                              ...prev,
                              adjuntos: [...(prev.adjuntos || []), url]
                            }));
                          } catch (err) {
                            alert("Error al subir archivo: " + err.message);
                          } finally {
                            setUploadingFile(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>

                    {editModalData.adjuntos?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {editModalData.adjuntos.map((url, idx) => (
                          <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                            <img src={url} alt="adjunto" className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(url)} />
                            <button
                              type="button"
                              onClick={() => setEditModalData(prev => ({ ...prev, adjuntos: prev.adjuntos.filter((_, i) => i !== idx) }))}
                              className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 opacity-80 hover:opacity-100 transition-opacity"
                              title="Quitar"
                            >
                              <XCircle size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-slate-200">
                <button
                  onClick={() => handleSaveEditModal(editModalData)}
                  className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} /> Guardar Cambios
                </button>
                <button
                  onClick={() => setEditModalData(null)}
                  className="px-6 py-2.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN PANEL */}
      {showAdminPanel && (
        <AdminPanel
          users={users}
          setUsers={setUsers}
          currentUser={currentUser}
          onClose={() => setShowAdminPanel(false)}
          obrasSociales={obrasSociales}
          setObrasSociales={setObrasSociales}
          userRole={userRole}
        />
      )}

      {/* DOCUMENTO IMPRIMIBLE (ORDEN DE INTERNACIÓN) */}
      {printSurgery && (
        <div className="hidden print:block" style={{ fontFamily: 'Arial, sans-serif' }}>
          <div className="mx-auto bg-white" style={{
            width: '210mm',
            height: '297mm',
            padding: '48px 64px',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '56px' }}>
                <img
                  src="/coat_logo.png"
                  alt="COAT"
                  style={{ height: '56px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingRight: '64px' }}>
                  <span style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.05em', lineHeight: 1.2 }}>
                    CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA
                  </span>
                  <span style={{ fontSize: '9pt', fontWeight: 500, color: '#334155', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '2px' }}>
                    NARIZ • GARGANTA • OÍDO
                  </span>
                </div>
              </div>
            </div>

            <p style={{ textAlign: 'right', marginBottom: '40px', fontSize: '11pt', color: '#000' }}>
              {getTodayDateString(printSurgery?.fechaSolicitud || (printSurgery?.fechaCreacion ? printSurgery.fechaCreacion.slice(0, 10) : printSurgery?.fecha))}
            </p>

            <h1 style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 700, marginBottom: '40px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#000' }}>
              {(printSurgery.tipoProcedimiento === 'ESTUDIO' || printSurgery.estudioBajoAnestesia) ? 'PEDIDO DE ESTUDIO BAJO ANESTESIA' : 'ORDEN DE INTERNACIÓN'}
            </h1>

            <div style={{ fontSize: '11pt', lineHeight: 1.8, color: '#000' }}>
              <p><strong>Afiliado:</strong> {printSurgery.paciente?.toUpperCase() || ''}</p>
              <p><strong>Obra social:</strong> {printSurgery.obraSocial?.toUpperCase() || ''}</p>
              {printSurgery.obraSocial?.toLowerCase() !== 'particular' && (
                <p><strong>Número de afiliado:</strong> {printSurgery.nroAfiliado || ''}</p>
              )}
              {printSurgery.dni && <p><strong>DNI:</strong> {printSurgery.dni}</p>}

              {(printSurgery.tipoProcedimiento === 'ESTUDIO' || printSurgery.estudioBajoAnestesia) ? (
                <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
                  <p style={{ fontWeight: 700, marginBottom: '6px' }}>Estudios solicitados:</p>
                  <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {buildStudyOrderLines(printSurgery, expandCodes(printSurgery.codigosAuditados || printSurgery.codigos || '', printSurgery.obraSocial?.toUpperCase().includes('SWISS'), printSurgery.obraSocial?.toUpperCase().includes('IOSFA'))).map((line, idx) => (
                      <p key={idx} style={{ lineHeight: 1.4, fontSize: '11pt' }}>
                        <strong>{idx + 1}-</strong> {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ paddingTop: '8px', display: 'flex', gap: '8px' }}>
                  <strong style={{ flexShrink: 0 }}>Códigos de cirugía:</strong>
                  <div>
                    {expandCodes(printSurgery.codigosAuditados || printSurgery.codigos || '', printSurgery.obraSocial?.toUpperCase().includes('SWISS'), printSurgery.obraSocial?.toUpperCase().includes('IOSFA')).map((line, idx) => (
                      <p key={idx} style={{ lineHeight: 1.2 }}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              <p style={{ paddingTop: '8px' }}><strong>Tipo de anestesia:</strong> {printSurgery.anestesia?.toLowerCase() || ''}</p>
              <p style={{ paddingTop: '8px' }}><strong>{(printSurgery.tipoProcedimiento === 'ESTUDIO' || printSurgery.estudioBajoAnestesia) ? 'Fecha del estudio:' : 'Fecha de cirugía:'}</strong> {formatPrintDateNumeric(printSurgery.fecha)}</p>
              <p style={{ paddingTop: '8px' }}><strong>Material:</strong> {printSurgery.materiales?.trim() ? 'Sí' : 'No'}</p>
              <p style={{ paddingTop: '8px' }}><strong>Diagnóstico:</strong> {printSurgery.justificacion?.toUpperCase() || ''}</p>
            </div>

            <div style={{ position: 'absolute', bottom: '144px', right: '64px', textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.2, fontFamily: '"Arial Black", Arial, sans-serif' }}>
                  <p>{formatDoctorDisplayName(printSurgery.nombreProfesional) || ''}</p>
                  <p>Médico</p>
                  <p>MP — - ME —</p>
                </div>
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: '40px', left: '64px', right: '64px' }}>
              <div style={{ borderTop: '2px solid #1e3a8a', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '8pt', color: '#64748b', fontWeight: 500 }}>
                <p>Urquiza 401 - Alberdi • Córdoba • Tel: (0351) 423-0530 / 423-9428 • WhatsApp: 3543579794</p>
                <p>Email: info@coat.com.ar • Web: www.coat.com.ar</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ORDEN DE MATERIAL (segunda hoja) */}
      {printSurgery && printSurgery.materiales?.trim() && (
        <div className="hidden print:block" style={{ fontFamily: 'Arial, sans-serif' }}>
          <div className="page-break" style={{ pageBreakBefore: 'always', breakBefore: 'page' }}></div>
          <div className="mx-auto bg-white" style={{
            width: '210mm',
            height: '297mm',
            padding: '48px 64px',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '8px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '56px' }}>
                <img
                  src="/coat_logo.png"
                  alt="COAT"
                  style={{ height: '56px', width: 'auto', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingRight: '64px' }}>
                  <span style={{ fontSize: '12pt', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.05em', lineHeight: 1.2 }}>
                    CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA
                  </span>
                  <span style={{ fontSize: '9pt', fontWeight: 500, color: '#334155', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '2px' }}>
                    NARIZ • GARGANTA • OÍDO
                  </span>
                </div>
              </div>
            </div>

            <p style={{ textAlign: 'right', marginBottom: '40px', fontSize: '11pt', color: '#000' }}>
              {getTodayDateString(printSurgery?.fechaSolicitud || (printSurgery?.fechaCreacion ? printSurgery.fechaCreacion.slice(0, 10) : printSurgery?.fecha))}
            </p>

            <h1 style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 700, marginBottom: '40px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#000' }}>
              ORDEN DE PEDIDO DE MATERIAL
            </h1>

            <div style={{ fontSize: '11pt', lineHeight: 1.8, color: '#000' }}>
              <p><strong>Afiliado:</strong> {printSurgery.paciente?.toUpperCase() || ''}</p>
              <p><strong>Obra social:</strong> {printSurgery.obraSocial?.toUpperCase() || ''}</p>
              {printSurgery.obraSocial?.toLowerCase() !== 'particular' && (
                <p><strong>Número de afiliado:</strong> {printSurgery.nroAfiliado || ''}</p>
              )}
              {printSurgery.dni && <p><strong>DNI:</strong> {printSurgery.dni}</p>}

              <div style={{ paddingTop: '8px' }}>
                <p style={{ fontWeight: 700, marginBottom: '4px' }}>Material solicitado:</p>
                <p style={{ whiteSpace: 'pre-wrap' }}>{printSurgery.materiales}</p>
              </div>

              <p style={{ paddingTop: '8px' }}><strong>Tipo de anestesia:</strong> {printSurgery.anestesia?.toLowerCase() || ''}</p>
              <p style={{ paddingTop: '8px' }}><strong>Fecha de cirugía:</strong> {formatPrintDateNumeric(printSurgery.fecha)}</p>
              <p style={{ paddingTop: '8px' }}><strong>Diagnóstico:</strong> {printSurgery.justificacion?.toUpperCase() || ''}</p>
            </div>

            <div style={{ position: 'absolute', bottom: '144px', right: '64px', textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '8pt', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.2, fontFamily: '"Arial Black", Arial, sans-serif' }}>
                  <p>{formatDoctorDisplayName(printSurgery.nombreProfesional) || ''}</p>
                  <p>Médico</p>
                  <p>MP — - ME —</p>
                </div>
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: '40px', left: '64px', right: '64px' }}>
              <div style={{ borderTop: '2px solid #1e3a8a', paddingTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '8pt', color: '#64748b', fontWeight: 500 }}>
                <p>Urquiza 401 - Alberdi • Córdoba • Tel: (0351) 423-0530 / 423-9428 • WhatsApp: 3543579794</p>
                <p>Email: info@coat.com.ar • Web: www.coat.com.ar</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT CONSOLE */}
      {printModalData && (
        <PrintConsole surgery={printModalData} onClose={() => setPrintModalData(null)} />
      )}

      {/* MODAL REPORTE DE QUIRÓFANO */}
      {quirofanoModalDate && (
        <QuirofanoReportModal
          date={quirofanoModalDate}
          surgeries={surgeries}
          onClose={() => setQuirofanoModalDate(null)}
        />
      )}

      {/* MODAL WHATSAPP */}
      {whatsAppModalSurgery && (
        <WhatsAppModal
          surgery={surgeries.find(s => s.id === whatsAppModalSurgery.id) || whatsAppModalSurgery}
          currentUser={currentUser}
          onClose={() => setWhatsAppModalSurgery(null)}
          onUpdatePhone={handleUpdateSurgeryPhone}
          onUpdateAdmission={handleUpdateSurgeryAdmission}
        />
      )}

      {/* MODAL VISOR DE IMAGEN/ADJUNTO */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-black/40 rounded-2xl p-2 overflow-hidden flex flex-col items-center justify-center border border-white/10" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-slate-800/80 hover:bg-slate-700 text-white rounded-full p-2 transition-all shadow-lg"
              title="Cerrar"
            >
              <XCircle size={22} />
            </button>
            <img 
              src={previewImage} 
              alt="Vista previa adjunto" 
              className="max-h-[82vh] max-w-full object-contain rounded-xl shadow-2xl" 
            />
            <div className="mt-2 text-center">
              <a 
                href={previewImage} 
                target="_blank" 
                rel="noreferrer" 
                className="text-xs font-bold text-indigo-300 hover:text-indigo-200 underline"
              >
                Abrir en tamaño original en pestaña nueva
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
