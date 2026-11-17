import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, LayoutDashboard, Calendar, X, Edit2, Calculator, History, FileText, MessageSquare, CheckCircle2, Circle, Bell, Shield, Lock, Printer, Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import HistorialCajaView, { exportCajaDayToExcel, printCajaDay } from './HistorialCajaView';
import LiquidacionView from './LiquidacionView';
import StaffLiquidacionesView from './components/StaffLiquidacionesView';
import { SEED_CAJA } from './data/seedData';
import ReciboLibreView from './components/ReciboLibreView';
import apiService from './services/apiService';
import { USE_LOCAL_DB } from './firebase/config';
import { getInitialCajaHistoryState, subscribeCajaHistory } from './utils/cajaHistorySync';

export const STORAGE_KEY = 'caja_proto';
export const PROF_KEY = 'profesionales_caja';
export const REMINDERS_KEY = 'reminders_caja';

export const formatMoney = (val) => (parseFloat(val) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

export const normalizeDate = (d) => {
  if (!d) return '';
  if (typeof d !== 'string') {
    try {
      d = new Date(d).toISOString().split('T')[0];
    } catch {
      return '';
    }
  }
  const trimmed = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (trimmed.includes('T')) {
    return trimmed.split('T')[0];
  }
  return trimmed;
};

export const currencies = ['ARS', 'USD'];

export const DEFAULT_PROFESIONALES = [
  'Dr. García', 'Dr. Martínez', 'Dr. Rodríguez', 'Dr. Fernández', 'Dr. López',
  'Dr. Pérez', 'Dr. Sánchez', 'Dra. González', 'Dra. Pérez', 'Dra. Díaz',
  'Dra. Romero', 'Dra. Molina', 'Dr. Torres',
  'Anestesista Dr. Romero', 'Anestesista Dra. Molina', 'Anestesista Dr. Torres',
  'Tutoras'
];

export const MoneyInput = ({ value, onChange, className, placeholder }) => {
  const format = (val) => {
    if (val === '' || val === null || val === undefined) return '';
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };
  const parse = (val) => {
    if (!val) return 0;
    const clean = val.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    return parseFloat(clean) || 0;
  };
  const [display, setDisplay] = useState('');
  useEffect(() => { setDisplay(format(value)); }, [value]);
  return (
    <input type="text" className={className} value={display}
      onChange={e => setDisplay(e.target.value)} onBlur={() => { const n = parse(display); onChange(n); setDisplay(format(n)); }}
      onFocus={e => e.target.select()} placeholder={placeholder}
    />
  );
};

const emptyEntry = () => ({
  id: Date.now(),
  fecha: new Date().toISOString().split('T')[0],
  paciente: '', dni: '', obra_social: '',
  prof_1: '', prof_2: '', prof_3: '',
  porcentaje_prof_1: 0, showPercent_1: false,
  porcentaje_prof_2: 0, showPercent_2: false,
  porcentaje_prof_3: 0, showPercent_3: false,
  showProf3: false,
  pesos: 0, dolares: 0,
  liq_prof_1: 0, liq_prof_1_currency: 'ARS', liq_prof_1_secondary: 0, liq_prof_1_currency_secondary: 'USD', showSecondary_1: false,
  liq_prof_2: 0, liq_prof_2_currency: 'ARS', liq_prof_2_secondary: 0, liq_prof_2_currency_secondary: 'USD', showSecondary_2: false,
  liq_prof_3: 0, liq_prof_3_currency: 'ARS', liq_prof_3_secondary: 0, liq_prof_3_currency_secondary: 'USD', showSecondary_3: false,
  anestesista: '', liq_anestesista: 0, liq_anestesista_currency: 'ARS', liq_anestesista_secondary: 0, liq_anestesista_currency_secondary: 'USD', showSecondaryAnes: false,
  isTransfer: false,
  modalidad_retencion: 'libre',
  tipo_retencion_libre: 'monto',
  minimo_retencion: 0,
  porcentaje_retencion: null,
  coat_pesos: 0, coat_dolares: 0,
  comentario: ''
});

export const calcLiq = (entry) => {
  const e = { ...entry };
  const pPesos = parseFloat(e.pesos) || 0;
  const pDolares = parseFloat(e.dolares) || 0;
  const pct1 = parseFloat(e.porcentaje_prof_1) || 0;
  const pct2 = parseFloat(e.porcentaje_prof_2) || 0;
  const pct3 = parseFloat(e.porcentaje_prof_3) || 0;
  const share1 = pct1 / 100;
  const share2 = pct2 / 100;
  const share3 = pct3 / 100;

  if (pDolares > 0 && pPesos === 0) {
    if (e.prof_1 && e.liq_prof_1_currency === 'ARS') e.liq_prof_1_currency = 'USD';
    if (e.prof_2 && e.liq_prof_2_currency === 'ARS') e.liq_prof_2_currency = 'USD';
    if (e.prof_3 && e.liq_prof_3_currency === 'ARS') e.liq_prof_3_currency = 'USD';
    if (e.anestesista && e.liq_anestesista_currency === 'ARS') e.liq_anestesista_currency = 'USD';
  } else if (pPesos > 0 && pDolares === 0) {
    if (e.prof_1 && e.liq_prof_1_currency === 'USD') e.liq_prof_1_currency = 'ARS';
    if (e.prof_2 && e.liq_prof_2_currency === 'USD') e.liq_prof_2_currency = 'ARS';
    if (e.prof_3 && e.liq_prof_3_currency === 'USD') e.liq_prof_3_currency = 'ARS';
    if (e.anestesista && e.liq_anestesista_currency === 'USD') e.liq_anestesista_currency = 'ARS';
  }

  // Modalidad de retención COAT:
  // - 'libre': permite ingresar manualmente los importes de retención COAT en ARS y USD, sin porcentajes ni mínimos automáticos.
  // - '10': calcula automáticamente el 10% de lo cobrado, sin mínimo (en ARS y USD).
  // - '20': calcula automáticamente el 20% en ARS con mínimo de $80.000 (sin superar el cobro) y 20% en USD sin mínimo.
  // Registros históricos o no definidos: default 'libre' para preservar retenciones manuales anteriores.
  const rawMod = String(e.modalidad_retencion !== undefined && e.modalidad_retencion !== null ? e.modalidad_retencion : '').trim().toLowerCase();
  let modRet = 'libre';
  if (rawMod === '10' || rawMod === '10%') {
    modRet = '10';
  } else if (rawMod === '20' || rawMod === '20%') {
    modRet = '20';
  } else {
    modRet = 'libre';
  }
  e.modalidad_retencion = modRet;

  let retencionCOAT_pesos = 0;
  let retencionCOAT_usd = 0;

  if (modRet === '10') {
    retencionCOAT_pesos = pPesos > 0 ? pPesos * 0.10 : 0;
    retencionCOAT_usd = pDolares > 0 ? pDolares * 0.10 : 0;
    e.porcentaje_retencion = 10;
    e.minimo_retencion = 0;
  } else if (modRet === '20') {
    retencionCOAT_pesos = pPesos > 0 ? Math.min(pPesos, Math.max(80000, pPesos * 0.20)) : 0;
    retencionCOAT_usd = pDolares > 0 ? pDolares * 0.20 : 0;
    e.porcentaje_retencion = 20;
    e.minimo_retencion = 80000;
  } else {
    // LIBRE: permite elegir entre importe fijo manual ('monto') o porcentaje manual ('porcentaje' 0-100% sin mínimo)
    const rawTipoLibre = String(e.tipo_retencion_libre || '').trim().toLowerCase();
    const tipoLibre = rawTipoLibre === 'porcentaje' ? 'porcentaje' : 'monto';
    e.tipo_retencion_libre = tipoLibre;
    e.minimo_retencion = 0;

    if (tipoLibre === 'porcentaje') {
      const rawPct = parseFloat(e.porcentaje_retencion);
      const pctLibre = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
      e.porcentaje_retencion = pctLibre;
      retencionCOAT_pesos = pPesos > 0 ? Math.min(pPesos, Math.max(0, pPesos * (pctLibre / 100))) : 0;
      retencionCOAT_usd = pDolares > 0 ? Math.min(pDolares, Math.max(0, pDolares * (pctLibre / 100))) : 0;
    } else {
      e.porcentaje_retencion = null;
      const rawPesos = parseFloat(e.coat_pesos) || 0;
      const rawUsd = parseFloat(e.coat_dolares) || 0;
      retencionCOAT_pesos = pPesos > 0 ? Math.min(pPesos, Math.max(0, rawPesos)) : 0;
      retencionCOAT_usd = pDolares > 0 ? Math.min(pDolares, Math.max(0, rawUsd)) : 0;
    }
  }

  // Base distribuible para profesionales en ARS y USD:
  // - En LIBRE (porcentaje o importe fijo): sobre el 100% del cobro total, sin descontar COAT.
  // - En 10% y 20%: sobre el remanente después de la retención COAT.
  const basePesosParaProfesionales = modRet === 'libre' ? pPesos : Math.max(0, pPesos - retencionCOAT_pesos);
  const baseUSD = modRet === 'libre' ? pDolares : Math.max(0, pDolares - retencionCOAT_usd);

  // Si los porcentajes están definidos (> 0), se calcula la liquidación sobre el remanente después de la retención
  if (share1 > 0) {
    if (e.liq_prof_1_currency === 'ARS') e.liq_prof_1 = basePesosParaProfesionales * share1;
    else e.liq_prof_1 = baseUSD * share1;
  }
  if (share2 > 0) {
    if (e.liq_prof_2_currency === 'ARS') e.liq_prof_2 = basePesosParaProfesionales * share2;
    else e.liq_prof_2 = baseUSD * share2;
  }
  if (share3 > 0) {
    if (e.liq_prof_3_currency === 'ARS') e.liq_prof_3 = basePesosParaProfesionales * share3;
    else e.liq_prof_3 = baseUSD * share3;
  }
  if (e.showSecondary_1 && share1 > 0) e.liq_prof_1_secondary = (e.liq_prof_1_currency_secondary === 'USD' ? baseUSD : basePesosParaProfesionales) * share1;
  if (e.showSecondary_2 && share2 > 0) e.liq_prof_2_secondary = (e.liq_prof_2_currency_secondary === 'USD' ? baseUSD : basePesosParaProfesionales) * share2;
  if (e.showSecondary_3 && share3 > 0) e.liq_prof_3_secondary = (e.liq_prof_3_currency_secondary === 'USD' ? baseUSD : basePesosParaProfesionales) * share3;

  let totalPesos = 0, totalUSD = 0;
  const add = (amt, curr) => { const v = parseFloat(amt) || 0; if (curr === 'USD') totalUSD += v; else totalPesos += v; };
  add(e.liq_prof_1, e.liq_prof_1_currency);
  add(e.liq_prof_2, e.liq_prof_2_currency);
  add(e.liq_prof_3, e.liq_prof_3_currency);
  add(e.liq_anestesista, e.liq_anestesista_currency);
  if (e.showSecondary_1) add(e.liq_prof_1_secondary, e.liq_prof_1_currency_secondary);
  if (e.showSecondary_2) add(e.liq_prof_2_secondary, e.liq_prof_2_currency_secondary);
  if (e.showSecondary_3) add(e.liq_prof_3_secondary, e.liq_prof_3_currency_secondary);
  if (e.showSecondaryAnes) add(e.liq_anestesista_secondary, e.liq_anestesista_currency_secondary);

  const hasProfSharesPesos = (
    (share1 > 0 && e.liq_prof_1_currency === 'ARS') ||
    (share2 > 0 && e.liq_prof_2_currency === 'ARS') ||
    (share3 > 0 && e.liq_prof_3_currency === 'ARS') ||
    (e.showSecondary_1 && share1 > 0 && e.liq_prof_1_currency_secondary === 'ARS') ||
    (e.showSecondary_2 && share2 > 0 && e.liq_prof_2_currency_secondary === 'ARS') ||
    (e.showSecondary_3 && share3 > 0 && e.liq_prof_3_currency_secondary === 'ARS')
  );

  const hasProfSharesUSD = (
    (share1 > 0 && e.liq_prof_1_currency === 'USD') ||
    (share2 > 0 && e.liq_prof_2_currency === 'USD') ||
    (share3 > 0 && e.liq_prof_3_currency === 'USD') ||
    (e.showSecondary_1 && share1 > 0 && e.liq_prof_1_currency_secondary === 'USD') ||
    (e.showSecondary_2 && share2 > 0 && e.liq_prof_2_currency_secondary === 'USD') ||
    (e.showSecondary_3 && share3 > 0 && e.liq_prof_3_currency_secondary === 'USD')
  );

  if (modRet === 'libre') {
    e.coat_pesos = retencionCOAT_pesos;
    e.coat_dolares = retencionCOAT_usd;
  } else {
    if (hasProfSharesPesos) {
      e.coat_pesos = pPesos - totalPesos;
    } else {
      e.coat_pesos = totalPesos > 0 ? (pPesos - totalPesos) : retencionCOAT_pesos;
    }

    if (hasProfSharesUSD) {
      e.coat_dolares = pDolares - totalUSD;
    } else {
      e.coat_dolares = totalUSD > 0 ? (pDolares - totalUSD) : retencionCOAT_usd;
    }
  }

  return e;
};

export const getLibrePercentageSummary = (entry) => {
  const mod = String(entry?.modalidad_retencion || 'libre').trim().toLowerCase();
  const isLibre = mod !== '10' && mod !== '10%' && mod !== '20' && mod !== '20%';
  const isPct = isLibre && String(entry?.tipo_retencion_libre || '').trim().toLowerCase() === 'porcentaje';
  if (!isPct) return { required: false, valid: true, total: 100 };

  const pctCoat = parseFloat(entry.porcentaje_retencion) || 0;
  const pct1 = parseFloat(entry.porcentaje_prof_1) || 0;
  const pct2 = parseFloat(entry.porcentaje_prof_2) || 0;
  const pct3 = entry.showProf3 ? (parseFloat(entry.porcentaje_prof_3) || 0) : 0;
  const total = Math.round((pctCoat + pct1 + pct2 + pct3) * 1000) / 1000;
  return { required: true, valid: Math.abs(total - 100) <= 0.01, total };
};

function CajaForm({ currentUser, history, setHistory, professionals, surgeries = [], isReadOnly = false }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState([{ ...emptyEntry(), id: Date.now() }]);
  const [commentModalId, setCommentModalId] = useState(null);
  const [dailyComment, setDailyComment] = useState('');
  const [showDailyCommentModal, setShowDailyCommentModal] = useState(false);
  const [reminders, setReminders] = useState(() => {
    const saved = localStorage.getItem(REMINDERS_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [newReminder, setNewReminder] = useState('');
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [historyToEdit, setHistoryToEdit] = useState(null);
  const [historyAction, setHistoryAction] = useState(null);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pacientesList, setPacientesList] = useState(() => {
    try {
      const saved = localStorage.getItem('coat_pacientes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const loadPacientes = async () => {
      try {
        const data = await apiService.getCollection('pacientes');
        if (data && data.length > 0) {
          setPacientesList(data);
        }
      } catch (err) {
        console.error("Error loading pacientes in CajaForm:", err);
      }
    };
    loadPacientes();
  }, []);

  useEffect(() => { localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => { localStorage.setItem('cajaDiariaEntries', JSON.stringify(entries)); }, [entries]);

  // El comentario es un dato de la caja completa, no de una operación. Se guarda
  // por fecha en Firestore para que esté disponible desde cualquier equipo.
  useEffect(() => {
    let isCurrent = true;
    const commentDate = normalizeDate(date);

    const loadDailyComment = async () => {
      setDailyComment('');
      if (!commentDate) return;
      try {
        const savedComment = await apiService.getDocument('caja_comentarios', commentDate);
        if (!isCurrent) return;
        if (savedComment) {
          setDailyComment(savedComment.comentario || '');
          return;
        }
      } catch (err) {
        console.error('Error loading daily caja comment:', err);
      }

      // Compatibilidad con notas creadas antes de que se persistieran en Firestore.
      try {
        const legacyComments = JSON.parse(localStorage.getItem('daily_comments_proto') || '{}');
        if (isCurrent) setDailyComment(legacyComments[commentDate] || '');
      } catch {
        if (isCurrent) setDailyComment('');
      }
    };

    loadDailyComment();
    return () => { isCurrent = false; };
  }, [date]);

  const saveDailyComment = async () => {
    const commentDate = normalizeDate(date);
    if (!commentDate) return;
    const comentario = dailyComment.trim();

    try {
      if (comentario) {
        await apiService.setDocument('caja_comentarios', commentDate, {
          fecha: commentDate,
          comentario,
          actualizadoPor: currentUser?.nombre || 'unknown'
        });
      } else {
        await apiService.deleteDocument('caja_comentarios', commentDate);
      }

      // Conserva una copia local para que sigan visibles los datos offline/antiguos.
      const localComments = JSON.parse(localStorage.getItem('daily_comments_proto') || '{}');
      if (comentario) localComments[commentDate] = comentario;
      else delete localComments[commentDate];
      localStorage.setItem('daily_comments_proto', JSON.stringify(localComments));
      setShowDailyCommentModal(false);
    } catch (err) {
      console.error('Error saving daily caja comment:', err);
      alert('No se pudo guardar el comentario del día. Intentá nuevamente.');
    }
  };

  const anestesistas = professionals.filter(p => p.especialidad === 'Anestesista').map(p => p.nombre);
  const orlProfs = professionals.filter(p => p.especialidad !== 'Anestesista').map(p => p.nombre);

  const updateEntry = (id, field, value) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };

      if (field === 'modalidad_retencion') {
        const val = String(value || '').trim().toLowerCase();
        if (val === '10' || val === '10%') {
          updated.modalidad_retencion = '10';
          updated.porcentaje_retencion = 10;
          updated.minimo_retencion = 0;
        } else if (val === '20' || val === '20%') {
          updated.modalidad_retencion = '20';
          updated.porcentaje_retencion = 20;
          updated.minimo_retencion = 80000;
        } else {
          updated.modalidad_retencion = 'libre';
          const nextTipo = updated.tipo_retencion_libre === 'porcentaje' ? 'porcentaje' : 'monto';
          updated.tipo_retencion_libre = nextTipo;
          updated.porcentaje_retencion = nextTipo === 'porcentaje' ? 0 : null;
          updated.minimo_retencion = 0;
          updated.coat_pesos = 0;
          updated.coat_dolares = 0;
        }
      }

      if (field === 'tipo_retencion_libre') {
        const nextTipo = String(value || '').trim().toLowerCase() === 'porcentaje' ? 'porcentaje' : 'monto';
        updated.modalidad_retencion = 'libre';
        updated.tipo_retencion_libre = nextTipo;
        updated.minimo_retencion = 0;
        updated.coat_pesos = 0;
        updated.coat_dolares = 0;
        updated.porcentaje_retencion = nextTipo === 'porcentaje' ? 0 : null;
      }

      if (field === 'porcentaje_retencion') {
        const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
        const parsed = parseFloat(normalized);
        updated.porcentaje_retencion = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
      }

      if (field === 'showProf3') {
        if (value === true) { updated.porcentaje_prof_1 = 50; updated.porcentaje_prof_2 = 25; updated.porcentaje_prof_3 = 25; }
        else { updated.porcentaje_prof_1 = 100; updated.porcentaje_prof_2 = 0; updated.porcentaje_prof_3 = 0; updated.prof_3 = ''; updated.liq_prof_3 = 0; }
      }

      return calcLiq(updated);
    }));
  };

  const handleDniChange = (id, rawValue) => {
    const cleanDni = rawValue.replace(/\D/g, '');
    
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, dni: cleanDni };

      if (cleanDni.length >= 7) {
        // 1. Search in surgeries first (prioritize most recent)
        const surgeryMatch = [...surgeries].reverse().find(s => {
          const sDni = (s.dni || '').replace(/\D/g, '');
          return sDni === cleanDni;
        });

        // 2. Search in pacientes collection
        const pacienteMatch = pacientesList.find(p => {
          const pDni = (p.dni || '').replace(/\D/g, '');
          return pDni === cleanDni;
        });

        const foundPatientName = surgeryMatch?.paciente || surgeryMatch?.afiliado || pacienteMatch?.nombre || '';
        const foundObraSocial = surgeryMatch?.obraSocial || pacienteMatch?.obraSocial || '';
        
        if (foundPatientName && !e.paciente) {
          updated.paciente = foundPatientName;
        } else if (foundPatientName && (!e.paciente || e.paciente.trim().length === 0)) {
          updated.paciente = foundPatientName;
        } else if (foundPatientName) {
          // If already filled with different or empty, update to match record
          updated.paciente = foundPatientName;
        }

        if (foundObraSocial) {
          updated.obra_social = foundObraSocial;
        }

        // Check if surgery has professional
        if (surgeryMatch?.nombreProfesional && (!updated.prof_1 || updated.prof_1 === '')) {
          // Match with existing list or exact
          const profMatch = orlProfs.find(p => p.toLowerCase() === surgeryMatch.nombreProfesional.toLowerCase()) || surgeryMatch.nombreProfesional;
          updated.prof_1 = profMatch;
        }

        // If not found in current state, attempt direct fetch from Firestore by docId or query
        if (!foundPatientName) {
          apiService.getDocument('pacientes', cleanDni).then(pDoc => {
            if (pDoc && (pDoc.nombre || pDoc.paciente)) {
              setEntries(currentEntries => currentEntries.map(cur => {
                if (cur.id !== id) return cur;
                return calcLiq({
                  ...cur,
                  paciente: cur.paciente || pDoc.nombre || pDoc.paciente || '',
                  obra_social: cur.obra_social || pDoc.obraSocial || pDoc.obra_social || ''
                });
              }));
            }
          }).catch(() => {});
        }
      }

      return calcLiq(updated);
    }));
  };

  const toggleCurrency = (id, field) => {
    const newValue = entries.find(e => e.id === id)?.[field] === 'ARS' ? 'USD' : 'ARS';
    updateEntry(id, field, newValue);
  };

  const addRow = () => {
    setEntries([...entries, { ...emptyEntry(), id: Date.now() }]);
  };

  const removeRow = (id) => {
    if (entries.length > 1) setEntries(entries.filter(e => e.id !== id));
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Modo solo consulta: no tenés permisos para guardar.'); return; }
    const toSave = entries.filter(e => e.paciente && e.paciente.trim().length > 0);
    if (toSave.length === 0) { alert('Complete al menos el nombre del paciente.'); return; }
    const invalidPctEntry = toSave.find(e => !getLibrePercentageSummary(e).valid);
    if (invalidPctEntry) {
      const { total } = getLibrePercentageSummary(invalidPctEntry);
      alert(`En modalidad LIBRE por porcentaje, la suma de COAT y profesionales debe ser 100% (actual: ${total}%).`);
      return;
    }
    
    const savedItems = [];
    for (const rawEntry of toSave) {
      const existingEntry = history.find(h => String(h.id) === String(rawEntry.id));
      const isExisting = !!existingEntry || (typeof rawEntry.id === 'string' && isNaN(Number(rawEntry.id)) && !rawEntry.id.startsWith('local_'));
      const calculated = calcLiq(rawEntry);
      const { id: rawId, ...restCalculated } = calculated;
      const cleanEntry = {
        ...restCalculated,
        fecha: normalizeDate(date),
        creadoPor: (isExisting && (rawEntry.creadoPor || existingEntry?.creadoPor)) || currentUser?.nombre || 'unknown',
        createdAt: rawEntry.createdAt || new Date().toISOString()
      };
      
      try {
        if (isExisting) {
          await apiService.updateDocument('caja', String(rawEntry.id), cleanEntry);
          savedItems.push({ ...cleanEntry, id: rawEntry.id });
        } else {
          const docId = await apiService.addDocument('caja', cleanEntry);
          savedItems.push({ ...cleanEntry, id: docId || String(Date.now()) });
        }
      } catch (err) {
        console.error("Error saving caja entry to Firestore:", err);
        if (isExisting) {
          alert(`No se pudo guardar la edición${err.code ? ` (${err.code})` : ''}: ${err.message || 'Intentá nuevamente.'}`);
          return;
        }
        savedItems.push({ ...cleanEntry, id: String(Date.now()) });
      }
    }

    setHistory(prev => {
      const savedIds = new Set(savedItems.map(s => String(s.id)));
      const filteredPrev = prev.filter(p => !savedIds.has(String(p.id)));
      return [...filteredPrev, ...savedItems];
    });

    setEntries([{ ...emptyEntry(), id: Date.now() }]);
    localStorage.removeItem('cajaDiariaEntries');
    alert('Operación guardada correctamente.');
  };

  const handleCerrarCaja = async () => {
    if (isReadOnly) { alert('Modo solo consulta: no tenés permisos para cerrar caja.'); return; }
    const toSave = entries.filter(e => e.paciente && e.paciente.trim().length > 0);
    const invalidPctEntry = toSave.find(e => !getLibrePercentageSummary(e).valid);
    if (invalidPctEntry) {
      const { total } = getLibrePercentageSummary(invalidPctEntry);
      alert(`En modalidad LIBRE por porcentaje, la suma de COAT y profesionales debe ser 100% (actual: ${total}%).`);
      return;
    }
    if (!window.confirm("¿Estás seguro de cerrar la caja? Guardará los datos y limpiará el formulario.")) return;
    const savedItems = [];
    if (toSave.length > 0) {
      for (const rawEntry of toSave) {
        const existingEntry = history.find(h => String(h.id) === String(rawEntry.id));
        const isExisting = !!existingEntry || (typeof rawEntry.id === 'string' && isNaN(Number(rawEntry.id)) && !rawEntry.id.startsWith('local_'));
        const calculated = calcLiq(rawEntry);
        const { id: rawId, ...restCalculated } = calculated;
        const cleanEntry = {
          ...restCalculated,
          fecha: normalizeDate(date),
          creadoPor: (isExisting && (rawEntry.creadoPor || existingEntry?.creadoPor)) || currentUser?.nombre || 'unknown',
          createdAt: rawEntry.createdAt || new Date().toISOString()
        };
        try {
          if (isExisting) {
            await apiService.updateDocument('caja', String(rawEntry.id), cleanEntry);
            savedItems.push({ ...cleanEntry, id: rawEntry.id });
          } else {
            const docId = await apiService.addDocument('caja', cleanEntry);
            savedItems.push({ ...cleanEntry, id: docId || String(Date.now()) });
          }
        } catch (err) {
          console.error("Error saving caja entry to Firestore:", err);
          if (isExisting) {
            alert(`No se pudo guardar la edición${err.code ? ` (${err.code})` : ''}: ${err.message || 'Intentá nuevamente.'}`);
            return;
          }
          savedItems.push({ ...cleanEntry, id: String(Date.now()) });
        }
      }
      setHistory(prev => {
        const savedIds = new Set(savedItems.map(s => String(s.id)));
        const filteredPrev = prev.filter(p => !savedIds.has(String(p.id)));
        return [...filteredPrev, ...savedItems];
      });
    }
    setEntries([{ ...emptyEntry(), id: Date.now() }]);
    localStorage.removeItem('cajaDiariaEntries');
    await saveDailyComment();
    alert('Caja cerrada correctamente.');
  };

  const loadToEdit = (item) => {
    setEntries([{ ...item, id: item.id || Date.now() }]);
    setDate(normalizeDate(item.fecha) || new Date().toISOString().split('T')[0]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteHistory = async (id) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Eliminar este registro?')) return;
    try {
      if (id) {
        await apiService.deleteDocument('caja', String(id));
      }
    } catch (err) {
      console.error("Error deleting from Firestore:", err);
    }
    setHistory(prev => prev.filter(h => String(h.id) !== String(id)));
  };

  const requestHistoryAction = (item, action) => {
    setHistoryToEdit(item);
    setHistoryAction(action);
    if (isPinVerified) {
      if (action === 'delete') { deleteHistory(item.id); }
      else { loadToEdit(item); }
    } else {
      setShowPinModal(true);
    }
  };

  const executePinAction = () => {
    setIsPinVerified(true);
    setShowPinModal(false);
    setPinInput('');
    if (historyAction === 'delete' && historyToEdit) { deleteHistory(historyToEdit.id); }
    else if (historyAction === 'edit' && historyToEdit) { loadToEdit(historyToEdit); }
  };

  const handleVerifyPin = () => {
    const input = pinInput.trim();
    if (!input) { alert("Ingresa un PIN."); return; }
    const masterPins = ['546287', '0511', '1105'];
    if (masterPins.includes(input)) { executePinAction(); return; }
    alert("PIN Incorrecto.");
    setPinInput('');
  };

  const handleAddReminder = () => {
    if (!newReminder.trim()) return;
    const r = { id: Date.now(), text: newReminder, completed: false, createdAt: new Date().toISOString() };
    setReminders(prev => [...prev, r]);
    setNewReminder('');
    setIsAddingReminder(false);
  };

  const toggleReminder = (id) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completed: !r.completed } : r));
  };

  const deleteReminder = (id) => {
    if (!window.confirm("¿Eliminar recordatorio?")) return;
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const historyForDate = history.filter(h => normalizeDate(h.fecha) === normalizeDate(date));

  const totals = historyForDate.reduce((acc, h) => {
    acc.pesos += parseFloat(h.pesos) || 0;
    acc.dolares += parseFloat(h.dolares) || 0;
    acc.coat_pesos += parseFloat(h.coat_pesos) || 0;
    acc.coat_dolares += parseFloat(h.coat_dolares) || 0;
    return acc;
  }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 });

  const renderEntryForm = (entry, index) => (
    <div key={entry.id} className="card p-5 md:p-6 space-y-5">
      {/* Patient Row */}
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-sm font-black shadow-md shadow-blue-500/20 shrink-0">{index + 1}</span>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">Paciente</label>
            <input className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] focus:bg-[var(--bg-card)] text-sm font-bold text-[var(--text-main)] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all" value={entry.paciente} onChange={e => updateEntry(entry.id, 'paciente', e.target.value)} placeholder="Nombre Completo..." />
          </div>
          <div>
            <label className="block text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">DNI / Documento</label>
            <input 
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] focus:bg-[var(--bg-card)] text-sm font-bold text-[var(--text-main)] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all" 
              value={entry.dni} 
              onChange={e => handleDniChange(entry.id, e.target.value)} 
              onBlur={e => handleDniChange(entry.id, e.target.value)}
              placeholder="Sin puntos..." 
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-[var(--text-sub)] uppercase tracking-widest mb-1">Obra Social</label>
            <input className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] focus:bg-[var(--bg-card)] text-sm font-bold text-[var(--text-main)] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 transition-all" value={entry.obra_social} onChange={e => updateEntry(entry.id, 'obra_social', e.target.value)} placeholder="Cobertura médica..." />
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-end pb-0.5">
          <button onClick={() => setCommentModalId(entry.id)}
            className={`p-2.5 rounded-xl border transition-all ${entry.comentario ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-[var(--bg-secondary)] text-[var(--text-sub)] border-[var(--border-main)] hover:text-blue-600'}`}
            title="Añadir nota"><MessageSquare size={16} /></button>
          {entries.length > 1 && (
            <button onClick={() => removeRow(entry.id)} className="p-2.5 text-[var(--text-sub)] hover:text-rose-500 hover:bg-rose-500/10 rounded-xl border border-[var(--border-main)] transition-all"><Trash2 size={16} /></button>
          )}
        </div>
      </div>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* COBRO PACIENTE - always visible */}
        <div className="lg:col-span-3 space-y-2">
          <label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Cobro Paciente</label>
          <div className="space-y-2">
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-bold text-sm">$</span>
              <MoneyInput className="w-full pl-8 pr-3 py-2 rounded-lg border border-emerald-200 text-emerald-800 font-bold text-lg outline-none focus:ring-2 focus:ring-emerald-500" value={entry.pesos} onChange={v => updateEntry(entry.id, 'pesos', v)} placeholder="0,00" /></div>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold text-sm">U$D</span>
              <MoneyInput className="w-full pl-12 pr-3 py-2 rounded-lg border border-blue-200 text-blue-800 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500" value={entry.dolares} onChange={v => updateEntry(entry.id, 'dolares', v)} placeholder="0,00" /></div>
          </div>
          <div className="pt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider">Retención COAT</label>
              <div className="inline-flex items-center bg-orange-100/60 dark:bg-orange-950/30 p-0.5 rounded-lg border border-orange-200 dark:border-orange-900/40">
                <button
                  type="button"
                  onClick={() => updateEntry(entry.id, 'modalidad_retencion', 'libre')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    entry.modalidad_retencion === 'libre'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-orange-700 dark:text-orange-300 hover:bg-orange-200/50'
                  }`}
                  title="Modalidad Libre (Ingreso manual de retención en ARS y USD)"
                >
                  Libre
                </button>
                <button
                  type="button"
                  onClick={() => updateEntry(entry.id, 'modalidad_retencion', '10')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    entry.modalidad_retencion === '10'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-orange-700 dark:text-orange-300 hover:bg-orange-200/50'
                  }`}
                  title="Modalidad 10% (Paciente externo: retiene 10% sin mínimo)"
                >
                  10%
                </button>
                <button
                  type="button"
                  onClick={() => updateEntry(entry.id, 'modalidad_retencion', '20')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    entry.modalidad_retencion === '20'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-orange-700 dark:text-orange-300 hover:bg-orange-200/50'
                  }`}
                  title="Modalidad 20% (Paciente de COAT: retiene 20% con mínimo $80.000)"
                >
                  20%
                </button>
              </div>
            </div>
            {entry.modalidad_retencion === 'libre' && (
              <div className="flex items-center justify-between gap-2 bg-orange-50/70 dark:bg-orange-950/20 px-2.5 py-1.5 rounded-lg border border-orange-200/70 dark:border-orange-900/30">
                <div className="inline-flex items-center bg-white/80 dark:bg-slate-900/50 p-0.5 rounded-md border border-orange-200 dark:border-orange-900/40">
                  <button
                    type="button"
                    onClick={() => updateEntry(entry.id, 'tipo_retencion_libre', 'monto')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                      entry.tipo_retencion_libre !== 'porcentaje'
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'text-orange-700 dark:text-orange-300 hover:bg-orange-100/70'
                    }`}
                    title="Ingresar importe fijo manual en ARS y USD"
                  >
                    Importe fijo
                  </button>
                  <button
                    type="button"
                    onClick={() => updateEntry(entry.id, 'tipo_retencion_libre', 'porcentaje')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                      entry.tipo_retencion_libre === 'porcentaje'
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'text-orange-700 dark:text-orange-300 hover:bg-orange-100/70'
                    }`}
                    title="Ingresar porcentaje manual entre 0% y 100% sin mínimo"
                  >
                    Porcentaje %
                  </button>
                </div>
                {entry.tipo_retencion_libre === 'porcentaje' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      className="w-20 px-2 py-0.5 text-right text-xs font-bold rounded border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 text-orange-700 dark:text-orange-300 outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
                      value={entry.porcentaje_retencion ?? 0}
                      onChange={e => updateEntry(entry.id, 'porcentaje_retencion', e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                    />
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">%</span>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border border-orange-100 dark:border-orange-900/30">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-orange-400 uppercase">ARS</p>
                  <span className="text-[8px] font-semibold text-orange-600/80 dark:text-orange-400/80">
                    {entry.modalidad_retencion === '10'
                      ? '10% s/mín'
                      : entry.modalidad_retencion === '20'
                        ? '20% mín $80k'
                        : entry.tipo_retencion_libre === 'porcentaje'
                          ? `${entry.porcentaje_retencion ?? 0}% libre`
                          : 'Libre'}
                  </span>
                </div>
                {entry.modalidad_retencion === 'libre' && entry.tipo_retencion_libre !== 'porcentaje' ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-orange-400 font-bold text-sm">$</span>
                    <MoneyInput
                      className="w-full bg-transparent border-none p-0 text-lg font-bold text-orange-700 dark:text-orange-300 outline-none tabular-nums"
                      value={entry.coat_pesos}
                      onChange={v => updateEntry(entry.id, 'coat_pesos', v)}
                      placeholder="0,00"
                    />
                  </div>
                ) : (
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-300 tabular-nums select-all mt-0.5">
                    $ {formatMoney(entry.coat_pesos)}
                  </p>
                )}
              </div>
              <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border border-orange-100 dark:border-orange-900/30">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-orange-400 uppercase">USD</p>
                  <span className="text-[8px] font-semibold text-orange-600/80 dark:text-orange-400/80">
                    {entry.modalidad_retencion === '10'
                      ? '10% s/mín'
                      : entry.modalidad_retencion === '20'
                        ? '20% s/mín'
                        : entry.tipo_retencion_libre === 'porcentaje'
                          ? `${entry.porcentaje_retencion ?? 0}% libre`
                          : 'Libre'}
                  </span>
                </div>
                {entry.modalidad_retencion === 'libre' && entry.tipo_retencion_libre !== 'porcentaje' ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-blue-400 font-bold text-sm">U$D</span>
                    <MoneyInput
                      className="w-full bg-transparent border-none p-0 text-lg font-bold text-orange-700 dark:text-orange-300 outline-none tabular-nums"
                      value={entry.coat_dolares}
                      onChange={v => updateEntry(entry.id, 'coat_dolares', v)}
                      placeholder="0,00"
                    />
                  </div>
                ) : (
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-300 tabular-nums select-all mt-0.5">
                    U$D {formatMoney(entry.coat_dolares)}
                  </p>
                )}
              </div>
            </div>
            {(entry.modalidad_retencion === '20' && (parseFloat(entry.pesos) || 0) > 0 && (parseFloat(entry.pesos) || 0) < 80000) && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] leading-tight">
                <AlertTriangle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span>No se alcanza el mínimo de COAT ($80.000). Se retiene el total cobrado sin saldo negativo.</span>
              </div>
            )}
            {(() => {
              const pctSummary = getLibrePercentageSummary(entry);
              if (!pctSummary.required || pctSummary.valid) return null;
              return (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-[10px] leading-tight font-medium">
                  <AlertTriangle size={13} className="shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>Los porcentajes de COAT y profesionales deben sumar 100% (actual: {pctSummary.total}%). Guardado bloqueado.</span>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" className="w-3 h-3 rounded border-slate-300" checked={entry.isTransfer} onChange={e => updateEntry(entry.id, 'isTransfer', e.target.checked)} />
            <span className="text-[9px] text-slate-400">Transferencia</span>
          </div>
        </div>

        {/* DISTRIBUCIÓN HONORARIOS */}
        <div className="lg:col-span-6 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Distribución Honorarios</label>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-500 rounded text-[9px] font-bold">{entry.showProf3 ? '3' : '2'} Médicos</span>
            </div>
            {!entry.showProf3 && (
              <button onClick={() => updateEntry(entry.id, 'showProf3', true)} className="text-[10px] font-bold text-blue-600 flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-100"><Plus size={12} /> Agregar Prof. 3</button>
            )}
          </div>
          {[1, 2, 3].map(n => {
            if (n === 3 && !entry.showProf3) return null;
            const nameKey = `prof_${n}`;
            const pctKey = `porcentaje_prof_${n}`;
            const liqKey = `liq_prof_${n}`;
            const currKey = `liq_prof_${n}_currency`;
            const secKey = `liq_prof_${n}_secondary`;
            const secCurrKey = `liq_prof_${n}_currency_secondary`;
            const showSecKey = `showSecondary_${n}`;
            const colors = ['border-blue-200 bg-blue-50', 'border-indigo-200 bg-indigo-50', 'border-teal-200 bg-teal-50'];
            return (
              <div key={n} className={`${colors[n-1]} border rounded-lg p-2 space-y-1.5`}>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Médico {n}</label>
                    <select className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold outline-none bg-white" value={entry[nameKey]} onChange={e => updateEntry(entry.id, nameKey, e.target.value)}>
                      <option value="">Seleccionar profesional...</option>
                      {orlProfs.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">%</label>
                    <input type="number" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-center outline-none bg-white" value={entry[pctKey]} onChange={e => updateEntry(entry.id, pctKey, parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Liquidación</label>
                    <div className="flex gap-1">
                      <button onClick={() => toggleCurrency(entry.id, currKey)} className="px-1.5 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-bold shrink-0">{entry[currKey]}</button>
                      <MoneyInput className="flex-1 min-w-0 px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold outline-none bg-white" value={entry[liqKey]} onChange={v => updateEntry(entry.id, liqKey, v)} />
                      <button onClick={() => updateEntry(entry.id, showSecKey, !entry[showSecKey])} className={`px-1.5 py-1.5 rounded-lg transition-all text-xs font-bold shrink-0 ${entry[showSecKey] ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-blue-600'}`} title="2do pago"><Plus size={12} /></button>
                    </div>
                  </div>
                </div>
                {entry[showSecKey] && (
                  <div className="pt-1.5 border-t border-slate-200 flex items-center gap-2 justify-end">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">2do Pago</span>
                    <button onClick={() => toggleCurrency(entry.id, secCurrKey)} className="px-2 py-1 text-[9px] font-bold bg-slate-200 rounded">{entry[secCurrKey]}</button>
                    <MoneyInput className="w-24 px-2 py-1 rounded border border-slate-200 text-xs font-bold text-right outline-none" value={entry[secKey]} onChange={v => updateEntry(entry.id, secKey, v)} />
                  </div>
                )}
                <div className="flex items-center justify-end">
                  {n === 3 && (
                    <button onClick={() => updateEntry(entry.id, 'showProf3', false)} className="p-1 text-red-400 hover:bg-red-50 rounded"><X size={14} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ANESTESIA */}
        <div className="lg:col-span-3 space-y-2">
          <label className="block text-[10px] font-bold text-purple-600 uppercase tracking-wider">Anestesia</label>
          <div className="bg-purple-50 rounded-lg border border-purple-200 p-2 space-y-2">
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Profesional</label>
              <select className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold outline-none bg-white" value={entry.anestesista} onChange={e => updateEntry(entry.id, 'anestesista', e.target.value)}>
                <option value="">No requiere</option>
                {anestesistas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Liquidación</label>
              <div className="flex gap-1">
                <button onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency')} className="px-1.5 py-1.5 bg-purple-600 text-white rounded-lg text-[9px] font-bold shrink-0">{entry.liq_anestesista_currency}</button>
                <MoneyInput className="flex-1 min-w-0 px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold outline-none bg-white" value={entry.liq_anestesista} onChange={v => updateEntry(entry.id, 'liq_anestesista', v)} />
                <button onClick={() => updateEntry(entry.id, 'showSecondaryAnes', !entry.showSecondaryAnes)} className={`px-1.5 py-1.5 rounded-lg text-xs font-bold shrink-0 ${entry.showSecondaryAnes ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400 hover:text-purple-600'}`}><Plus size={12} /></button>
              </div>
            </div>
            {entry.showSecondaryAnes && (
              <div className="pt-1.5 border-t border-purple-200 flex items-center gap-2 justify-end">
                <span className="text-[9px] font-bold text-slate-400 uppercase">2do Pago</span>
                <button onClick={() => toggleCurrency(entry.id, 'liq_anestesista_currency_secondary')} className="px-2 py-1 text-[9px] font-bold bg-slate-200 rounded">{entry.liq_anestesista_currency_secondary}</button>
                <MoneyInput className="w-24 px-2 py-1 rounded border border-slate-200 text-xs font-bold text-right outline-none" value={entry.liq_anestesista_secondary} onChange={v => updateEntry(entry.id, 'liq_anestesista_secondary', v)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* PIN MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowPinModal(false); setPinInput(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6"><Shield size={32} className="text-slate-500" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Seguridad</h3>
            <p className="text-xs text-slate-500 mb-6">Ingresa tu clave maestra</p>
            <input type="password" className="w-full text-center text-2xl tracking-[0.3em] font-bold py-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 mb-6" placeholder="••••" maxLength={8} value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleVerifyPin()} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => { setShowPinModal(false); setPinInput(''); }} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={handleVerifyPin} className="flex-1 py-3 bg-indigo-600 text-white font-bold text-xs uppercase rounded-lg shadow-md hover:bg-indigo-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* COMMENT MODAL */}
      {commentModalId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setCommentModalId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><MessageSquare size={20} className="text-blue-600" /></div>
              <div><h3 className="font-bold text-slate-800">Comentario del Paciente</h3></div>
            </div>
            <textarea className="w-full bg-slate-50 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none border border-slate-200"
              placeholder="Detalles sobre este paciente..."
              value={entries.find(e => e.id === commentModalId)?.comentario || ''}
              onChange={e => updateEntry(commentModalId, 'comentario', e.target.value)}
              autoFocus
            />
            <button onClick={() => setCommentModalId(null)} className="mt-4 w-full py-3 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl shadow-md hover:bg-blue-700">Listo</button>
          </div>
        </div>
      )}

      {/* DAILY COMMENT MODAL */}
      {showDailyCommentModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDailyCommentModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><MessageSquare size={20} className="text-amber-600" /></div>
              <div><h3 className="font-bold text-slate-800">Nota General del Día</h3><p className="text-[10px] text-slate-400">Visible al cerrar la caja</p></div>
            </div>
            <textarea className="w-full bg-slate-50 rounded-xl p-4 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 min-h-[150px] resize-none border border-slate-200"
              placeholder="Observaciones del día..."
              value={dailyComment} onChange={e => setDailyComment(e.target.value)} autoFocus
            />
            <button onClick={saveDailyComment} className="mt-4 w-full py-3 bg-amber-500 text-white font-bold text-xs uppercase rounded-xl shadow-md hover:bg-amber-600">Guardar</button>
          </div>
        </div>
      )}

      {/* TOP BAR */}
      <div className="card p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/25"><LayoutDashboard size={22} /></div>
          <div>
            <h3 className="font-black text-lg tracking-tight text-[var(--text-main)]">Caja de Cirugía</h3>
            <p className="text-xs text-[var(--text-sub)] font-medium">Registro diario de cobros, honorarios y retenciones COAT</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-main)]">
            <Calendar size={15} className="text-blue-600" />
            <input type="date" className="bg-transparent border-none p-0 text-xs font-black text-[var(--text-main)] outline-none" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-right">
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Balance ARS</p>
              <p className="text-base font-black text-emerald-700 dark:text-emerald-400 tabular-nums">$ {formatMoney(totals.coat_pesos)}</p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-right">
              <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Balance USD</p>
              <p className="text-base font-black text-blue-700 dark:text-blue-400 tabular-nums">U$D {formatMoney(totals.coat_dolares)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ENTRIES */}
      <div className="space-y-4">
        {entries.map((entry, i) => renderEntryForm(entry, i))}
      </div>

      {/* ACTIONS */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={addRow} className="p-3.5 bg-[var(--bg-card)] hover:bg-blue-600/10 text-[var(--text-main)] hover:text-blue-600 border border-[var(--border-main)] rounded-2xl transition-all shadow-2xs" title="Agregar entrada"><Plus size={20} /></button>
        <button onClick={() => setShowDailyCommentModal(true)} className={`flex items-center gap-2 px-4 py-3.5 rounded-2xl border text-xs font-black uppercase tracking-wider transition-all ${dailyComment ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-[var(--bg-card)] text-[var(--text-sub)] border-[var(--border-main)] hover:text-amber-500'}`}><MessageSquare size={16} /> Nota Gral</button>
        <div className="flex-1" />
        <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-500/25 transition-all active:scale-95"><Save size={18} /> Guardar Operación</button>
        <button onClick={handleCerrarCaja} className="flex items-center gap-2 px-6 py-3.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg transition-all active:scale-95"><Lock size={18} /> Cerrar Caja</button>
      </div>

      {/* HISTORY */}
      <div className="card">
        <div className="px-6 py-5 border-b border-[var(--border-main)] flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-secondary)]/40">
          <div className="flex items-center gap-2.5">
            <Calculator size={18} className="text-blue-600" />
            <h3 className="font-black text-base text-[var(--text-main)]">Historial del Día — {date}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-blue-600/10 text-blue-600 text-xs font-black">{historyForDate.length} registros</span>
            {historyForDate.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => printCajaDay(date, historyForDate, dailyComment, totals)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-xs font-black uppercase tracking-wider text-blue-600 transition-all"
                  title="Imprimir caja de esta fecha"
                >
                  <Printer size={14} /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => exportCajaDayToExcel(date, historyForDate, dailyComment)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs font-black uppercase tracking-wider text-emerald-600 transition-all"
                  title="Descargar Excel de esta fecha"
                >
                  <Download size={14} /> Excel
                </button>
              </>
            )}
          </div>
        </div>
        {historyForDate.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No hay registros para esta fecha.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {historyForDate.map(item => (
              <div key={item.id} className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/80 transition-all">
                {/* 1. Patient Info */}
                <div className="flex items-center gap-4 shrink-0 min-w-[220px]">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-lg shrink-0">
                    {(item.paciente || '?')[0]}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm leading-snug">{item.paciente}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap mt-0.5">
                      {item.obra_social && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold text-[10px]">{item.obra_social}</span>}
                      {item.dni && <span>DNI: {item.dni}</span>}
                      {item.comentario && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-medium" title={item.comentario}>Nota</span>}
                      {item.creadoPor && item.creadoPor !== 'unknown' && (
                        <span className="text-[10px] text-slate-400">Cargó: <strong className="text-slate-600 font-semibold">{item.creadoPor}</strong></span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Breakdown: Professionals & Anesthesia */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 py-1 border-t lg:border-t-0 lg:border-l border-slate-200">
                  {[1, 2, 3].map(n => item[`prof_${n}`] ? (
                    <div key={n} className="flex flex-col">
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${n === 1 ? 'text-blue-600' : n === 2 ? 'text-indigo-600' : 'text-teal-600'}`}>
                        {item[`prof_${n}`]}
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums">
                        {item[`liq_prof_${n}_currency`] === 'USD' ? 'U$D ' : '$ '}
                        {formatMoney(item[`liq_prof_${n}`])}
                      </span>
                    </div>
                  ) : null)}
                  {item.anestesista ? (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-purple-600 uppercase tracking-wider">
                        {item.anestesista}
                      </span>
                      <span className="text-xs font-bold text-slate-700 tabular-nums">
                        {item.liq_anestesista_currency === 'USD' ? 'U$D ' : '$ '}
                        {formatMoney(item.liq_anestesista)}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* 3. COAT Retention + Total + Actions */}
                <div className="flex items-center gap-4 justify-between lg:justify-end shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-4 pt-2 lg:pt-0">
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">COAT</p>
                    <div className="flex flex-col items-end text-xs font-bold tabular-nums">
                      {(item.coat_pesos !== 0 || item.coat_dolares === 0) && (
                        <span className="text-orange-700 font-bold">$ {formatMoney(item.coat_pesos)}</span>
                      )}
                      {item.coat_dolares > 0 && (
                        <span className="text-blue-600 font-bold">U$D {formatMoney(item.coat_dolares)}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right border-l border-slate-200 pl-4">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cobro Total</p>
                    <div className="flex flex-col items-end font-bold tabular-nums">
                      {item.pesos > 0 && (
                        <span className="text-sm text-emerald-600 font-bold">$ {formatMoney(item.pesos)}</span>
                      )}
                      {item.dolares > 0 && (
                        <span className="text-sm text-blue-600 font-bold">U$D {formatMoney(item.dolares)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 pl-2">
                    <button 
                      onClick={() => requestHistoryAction(item, 'edit')} 
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" 
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => requestHistoryAction(item, 'delete')} 
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" 
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REMINDERS */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Bell size={18} className="text-amber-500" /><h3 className="font-black text-base text-[var(--text-main)]">Recordatorios de Caja</h3></div>
          <button onClick={() => setIsAddingReminder(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] text-xs font-black uppercase tracking-wider text-[var(--text-sub)] hover:text-blue-600 transition-all"><Plus size={14} /> Nuevo</button>
        </div>
        {isAddingReminder && (
          <div className="flex gap-2 mb-3">
            <input className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] text-sm font-bold text-[var(--text-main)] outline-none focus:border-blue-600" placeholder="¿Qué necesitas recordar?" value={newReminder} onChange={e => setNewReminder(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddReminder()} autoFocus />
            <button onClick={handleAddReminder} className="px-5 py-2.5 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-700">Guardar</button>
            <button onClick={() => { setIsAddingReminder(false); setNewReminder(''); }} className="px-3 py-2 text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
        )}
        <div className="space-y-2">
          {reminders.map(r => (
            <div key={r.id} className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${r.completed ? 'bg-[var(--bg-secondary)] border-[var(--border-main)] opacity-60' : 'bg-[var(--bg-card)] border-[var(--border-main)]'}`}>
              <button onClick={() => toggleReminder(r.id)} className={`transition-all ${r.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-blue-500'}`}>{r.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>
              <p className={`flex-1 text-sm font-bold ${r.completed ? 'text-[var(--text-sub)] line-through' : 'text-[var(--text-main)]'}`}>{r.text}</p>
              <button onClick={() => deleteReminder(r.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          ))}
          {reminders.length === 0 && !isAddingReminder && <p className="py-6 text-center text-[var(--text-sub)] text-xs font-bold uppercase tracking-widest">No hay recordatorios.</p>}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PROFESSIONALS = [
  { id: 1, nombre: 'Dr. Pérez', especialidad: 'ORL' },
  { id: 2, nombre: 'Dr. García', especialidad: 'ORL' },
  { id: 3, nombre: 'Dr. Martínez', especialidad: 'ORL' },
  { id: 4, nombre: 'Dr. Fernández', especialidad: 'ORL' },
  { id: 5, nombre: 'Dra. Sánchez', especialidad: 'ORL' },
  { id: 6, nombre: 'Anestesista Dr. Romero', especialidad: 'Anestesista' },
  { id: 7, nombre: 'Anestesista Dra. Molina', especialidad: 'Anestesista' },
  { id: 8, nombre: 'Lic. López', especialidad: 'ORL' },
];

export default function CajaView({ currentUser, professionals: professionalsProp, surgeries = [], isReadOnly = false }) {
  const professionals = professionalsProp || (() => {
    try {
      const saved = localStorage.getItem(PROF_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PROFESSIONALS;
  })();
  const [subTab, setSubTab] = useState(isReadOnly ? 'historial' : 'caja');
  const [initialHistoryState] = useState(() =>
    getInitialCajaHistoryState({
      useLocalDb: USE_LOCAL_DB,
      storageKey: STORAGE_KEY,
      seedCaja: SEED_CAJA,
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    })
  );
  const [history, setHistory] = useState(initialHistoryState.history);
  const [historyStatus, setHistoryStatus] = useState(initialHistoryState.status);
  const [historyError, setHistoryError] = useState(initialHistoryState.error);

  useEffect(() => {
    if (USE_LOCAL_DB) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    if (USE_LOCAL_DB) return undefined;

    return subscribeCajaHistory({
      onCollectionSnapshotFn: (col, cb, filters, onErr) =>
        apiService.onCollectionSnapshot(col, cb, filters, onErr),
      getCollectionFn: (col) => apiService.getCollection(col),
      onData: (rows) => {
        setHistory(rows);
        setHistoryStatus('ready');
        setHistoryError('');
      },
      onError: (err) => {
        console.error('Error al cargar historial de Caja desde Firestore:', err);
        setHistory([]);
        setHistoryStatus('error');
        setHistoryError(
          err?.message || 'No se pudo cargar el historial de Caja desde Firestore. Verificá la conexión e intentá nuevamente.'
        );
      },
    });
  }, []);

  const isFinancialReportTab =
    subTab === 'historial' || subTab === 'liquidaciones' || subTab === 'resumen_mensual';

  return (
    <div className="space-y-6">
      <div className="card p-3 md:p-4">
        <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] p-1.5 rounded-2xl border border-[var(--border-main)] w-fit flex-wrap">
          {!isReadOnly && (
            <button onClick={() => setSubTab('caja')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${subTab === 'caja' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'}`}><LayoutDashboard size={15} />Caja Diaria</button>
          )}
          <button onClick={() => setSubTab('historial')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${subTab === 'historial' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'}`}><History size={15} />Historial</button>
          <button onClick={() => setSubTab('liquidaciones')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${subTab === 'liquidaciones' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'}`}><FileText size={15} />Liquidaciones</button>
          <button onClick={() => setSubTab('resumen_mensual')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${subTab === 'resumen_mensual' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'}`}><FileSpreadsheet size={15} />Resumen Mensual</button>
          {!isReadOnly && (
            <button onClick={() => setSubTab('recibo_libre')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${subTab === 'recibo_libre' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'}`}><FileText size={15} />Recibo Libre</button>
          )}
        </div>
      </div>

      {!isReadOnly && subTab === 'caja' && <CajaForm currentUser={currentUser} history={history} setHistory={setHistory} professionals={professionals} surgeries={surgeries} isReadOnly={isReadOnly} />}
      {isFinancialReportTab && historyStatus === 'loading' && (
        <div className="card p-8 text-center text-sm font-semibold text-[var(--text-sub)]">
          Cargando movimientos de Caja desde Firestore...
        </div>
      )}
      {isFinancialReportTab && historyStatus === 'error' && (
        <div className="card p-6 border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold">
          {historyError || 'No se pudo cargar el historial de Caja desde Firestore.'}
        </div>
      )}
      {historyStatus === 'ready' && subTab === 'historial' && <HistorialCajaView history={history} setHistory={setHistory} currentUser={currentUser} professionals={professionals} isReadOnly={isReadOnly} />}
      {historyStatus === 'ready' && subTab === 'liquidaciones' && <LiquidacionView history={history} setHistory={setHistory} currentUser={currentUser} professionals={professionals} isReadOnly={isReadOnly} />}
      {historyStatus === 'ready' && subTab === 'resumen_mensual' && <StaffLiquidacionesView history={history} professionals={professionals} />}
      {!isReadOnly && subTab === 'recibo_libre' && <ReciboLibreView isReadOnly={isReadOnly} />}
    </div>
  );
}
