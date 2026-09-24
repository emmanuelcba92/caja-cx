import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, LayoutDashboard, Calendar, X, Edit2, Calculator, History, FileText, MessageSquare, CheckCircle2, Circle, Bell, Shield, Lock, Printer, Download, FileSpreadsheet } from 'lucide-react';
import HistorialCajaView, { exportCajaDayToExcel, printCajaDay } from './HistorialCajaView';
import LiquidacionView from './LiquidacionView';
import StaffLiquidacionesView from './components/StaffLiquidacionesView';
import { SEED_CAJA } from './data/seedData';
import ReciboLibreView from './components/ReciboLibreView';
import apiService from './services/apiService';

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
  minimo_retencion: 80000,
  porcentaje_retencion: 20,
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

  // Verificar si la obra social es Particular (no aplica retención fija ni mínima clínica)
  const isParticular = (e.obra_social || '').trim().toLowerCase().startsWith('part');

  // Base distribuible para profesionales en ARS y USD
  let basePesosParaProfesionales = pPesos;
  let baseUSD = pDolares;

  const minRet = e.minimo_retencion !== undefined && e.minimo_retencion !== '' ? (parseFloat(e.minimo_retencion) || 0) : 80000;
  const pctRet = e.porcentaje_retencion !== undefined && e.porcentaje_retencion !== '' ? (parseFloat(e.porcentaje_retencion) || 0) / 100 : 0.20;

  if (pPesos > 0 && !isParticular) {
    // Regla de retención mínima COAT (por defecto $80.000 o 20%, o valor manual modificado):
    const retencionMinimaCOAT = Math.min(pPesos, Math.max(minRet, pPesos * pctRet));
    basePesosParaProfesionales = Math.max(0, pPesos - retencionMinimaCOAT);
  }

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

  e.coat_pesos = pPesos - totalPesos;
  e.coat_dolares = pDolares - totalUSD;
  return e;
};

function CajaForm({ currentUser, history, setHistory, professionals, surgeries = [] }) {
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
    const toSave = entries.filter(e => e.paciente && e.paciente.trim().length > 0);
    if (toSave.length === 0) { alert('Complete al menos el nombre del paciente.'); return; }
    
    const savedItems = [];
    for (const rawEntry of toSave) {
      const calculated = calcLiq(rawEntry);
      const { id: rawId, ...restCalculated } = calculated;
      const cleanEntry = {
        ...restCalculated,
        fecha: normalizeDate(date),
        creadoPor: currentUser?.nombre || 'unknown',
        createdAt: rawEntry.createdAt || new Date().toISOString()
      };
      
      try {
        if (rawEntry.id && typeof rawEntry.id === 'string' && isNaN(Number(rawEntry.id)) && !rawEntry.id.startsWith('local_')) {
          await apiService.setDocument('caja', rawEntry.id, cleanEntry);
          savedItems.push({ ...cleanEntry, id: rawEntry.id });
        } else {
          const docId = await apiService.addDocument('caja', cleanEntry);
          savedItems.push({ ...cleanEntry, id: docId || String(Date.now()) });
        }
      } catch (err) {
        console.error("Error saving caja entry to Firestore:", err);
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
    if (!window.confirm("¿Estás seguro de cerrar la caja? Guardará los datos y limpiará el formulario.")) return;
    const toSave = entries.filter(e => e.paciente && e.paciente.trim().length > 0);
    const savedItems = [];
    if (toSave.length > 0) {
      for (const rawEntry of toSave) {
        const calculated = calcLiq(rawEntry);
        const { id: rawId, ...restCalculated } = calculated;
        const cleanEntry = {
          ...restCalculated,
          fecha: normalizeDate(date),
          creadoPor: currentUser?.nombre || 'unknown',
          createdAt: rawEntry.createdAt || new Date().toISOString()
        };
        try {
          if (rawEntry.id && typeof rawEntry.id === 'string' && isNaN(Number(rawEntry.id)) && !rawEntry.id.startsWith('local_')) {
            await apiService.setDocument('caja', rawEntry.id, cleanEntry);
            savedItems.push({ ...cleanEntry, id: rawEntry.id });
          } else {
            const docId = await apiService.addDocument('caja', cleanEntry);
            savedItems.push({ ...cleanEntry, id: docId || String(Date.now()) });
          }
        } catch (err) {
          console.error("Error saving caja entry to Firestore:", err);
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
    <div key={entry.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
      {/* Patient Row */}
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">{index + 1}</span>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Paciente</label>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={entry.paciente} onChange={e => updateEntry(entry.id, 'paciente', e.target.value)} placeholder="Nombre Completo..." />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">DNI / Documento</label>
            <input 
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-500" 
              value={entry.dni} 
              onChange={e => handleDniChange(entry.id, e.target.value)} 
              onBlur={e => handleDniChange(entry.id, e.target.value)}
              placeholder="Sin puntos..." 
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Obra Social</label>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-500" value={entry.obra_social} onChange={e => updateEntry(entry.id, 'obra_social', e.target.value)} placeholder="Cobertura médica..." />
          </div>
        </div>
      </div>

      {/* Comment + Delete Row */}
      <div className="flex items-center gap-2">
        <button onClick={() => setCommentModalId(entry.id)}
          className={`p-2 rounded-lg transition-all ${entry.comentario ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-400 hover:text-blue-600'}`}
          title="Añadir nota"><MessageSquare size={16} /></button>
        {entries.length > 1 && (
          <button onClick={() => removeRow(entry.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16} /></button>
        )}
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
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-slate-400 font-bold">Mín: $</span>
                <input
                  type="number"
                  step="1000"
                  className="w-20 px-1.5 py-0.5 text-[10px] font-bold text-orange-800 bg-orange-50 border border-orange-200 rounded text-right outline-none focus:ring-1 focus:ring-orange-400 focus:bg-white"
                  value={entry.minimo_retencion !== undefined ? entry.minimo_retencion : 80000}
                  onChange={e => updateEntry(entry.id, 'minimo_retencion', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="80000"
                  title="Monto mínimo de retención COAT (editable a mano)"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                <p className="text-[9px] font-bold text-orange-400 uppercase">ARS</p>
                <MoneyInput className="w-full bg-transparent border-none p-0 text-lg font-bold text-orange-700 outline-none tabular-nums" value={entry.coat_pesos} onChange={v => updateEntry(entry.id, 'coat_pesos', v)} />
              </div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                <p className="text-[9px] font-bold text-orange-400 uppercase">USD</p>
                <MoneyInput className="w-full bg-transparent border-none p-0 text-lg font-bold text-orange-700 outline-none tabular-nums" value={entry.coat_dolares} onChange={v => updateEntry(entry.id, 'coat_dolares', v)} />
              </div>
            </div>
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg"><LayoutDashboard size={20} /></div>
          <div><h3 className="font-bold text-slate-700">Caja de Cirugía</h3><p className="text-[10px] text-slate-500">Nuevas entradas</p></div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
            <Calendar size={14} className="text-blue-500" />
            <input type="date" className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 outline-none" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <div className="text-right"><p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Balance ARS</p><p className="text-base font-bold text-emerald-700 tabular-nums">$ {formatMoney(totals.coat_pesos)}</p></div>
            <div className="text-right"><p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Balance USD</p><p className="text-base font-bold text-blue-700 tabular-nums">U$D {formatMoney(totals.coat_dolares)}</p></div>
          </div>
        </div>
      </div>

      {/* ENTRIES */}
      <div className="space-y-3">
        {entries.map((entry, i) => renderEntryForm(entry, i))}
      </div>

      {/* ACTIONS */}
      <div className="flex items-center gap-3">
        <button onClick={addRow} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all" title="Agregar entrada"><Plus size={20} /></button>
        <button onClick={() => setShowDailyCommentModal(true)} className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-bold transition-all ${dailyComment ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:text-amber-500'}`}><MessageSquare size={16} /> Nota Gral</button>
        <div className="flex-1" />
        <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"><Save size={18} /> Guardar Operación</button>
        <button onClick={handleCerrarCaja} className="flex items-center gap-2 px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-xl shadow-lg shadow-slate-200 transition-all active:scale-95"><Lock size={18} /> Cerrar Caja</button>
      </div>

      {/* HISTORY */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calculator size={18} className="text-slate-400" />
            <h3 className="font-bold text-slate-700">Historial - {date}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">{historyForDate.length} registros</span>
            {historyForDate.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => printCajaDay(date, historyForDate, dailyComment, totals)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs font-bold text-blue-700 transition-all"
                  title="Imprimir caja de esta fecha"
                >
                  <Printer size={14} /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => exportCajaDayToExcel(date, historyForDate, dailyComment)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-700 transition-all"
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Bell size={18} className="text-amber-500" /><h3 className="font-bold text-slate-700">Recordatorios</h3></div>
          <button onClick={() => setIsAddingReminder(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:text-blue-600 transition-all"><Plus size={14} /> Nuevo</button>
        </div>
        {isAddingReminder && (
          <div className="flex gap-2 mb-3">
            <input className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="¿Qué necesitas recordar?" value={newReminder} onChange={e => setNewReminder(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddReminder()} autoFocus />
            <button onClick={handleAddReminder} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700">Guardar</button>
            <button onClick={() => { setIsAddingReminder(false); setNewReminder(''); }} className="px-3 py-2 text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
        )}
        <div className="space-y-2">
          {reminders.map(r => (
            <div key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${r.completed ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200'}`}>
              <button onClick={() => toggleReminder(r.id)} className={`transition-all ${r.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-blue-500'}`}>{r.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>
              <p className={`flex-1 text-sm font-medium ${r.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{r.text}</p>
              <button onClick={() => deleteReminder(r.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          ))}
          {reminders.length === 0 && !isAddingReminder && <p className="py-6 text-center text-slate-400 text-sm">No hay recordatorios.</p>}
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

export default function CajaView({ currentUser, professionals: professionalsProp, surgeries = [] }) {
  const professionals = professionalsProp || (() => {
    try {
      const saved = localStorage.getItem(PROF_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PROFESSIONALS;
  })();
  const [subTab, setSubTab] = useState('caja');
  const [history, setHistory] = useState(() => {
    const cleared = localStorage.getItem('data_cleared');
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { try { return JSON.parse(saved); } catch {} }
    if (cleared) return [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_CAJA));
    return SEED_CAJA;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    let unsubscribe;
    try {
      unsubscribe = apiService.onCollectionSnapshot('caja', (cajaDb) => {
        if (cajaDb && Array.isArray(cajaDb)) {
          setHistory(cajaDb);
        }
      });
    } catch (e) {
      console.error("Error setting up snapshot listener for caja:", e);
      apiService.getCollection('caja').then(cajaDb => {
        if (cajaDb && cajaDb.length > 0) setHistory(cajaDb);
      }).catch(err => console.error("Error fetching caja:", err));
    }
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg w-fit flex-wrap">
          <button onClick={() => setSubTab('caja')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'caja' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><LayoutDashboard size={16} />Caja</button>
          <button onClick={() => setSubTab('historial')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'historial' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><History size={16} />Historial</button>
          <button onClick={() => setSubTab('liquidaciones')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'liquidaciones' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><FileText size={16} />Liquidaciones</button>
          <button onClick={() => setSubTab('resumen_mensual')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'resumen_mensual' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><FileSpreadsheet size={16} />Resumen Mensual</button>
          <button onClick={() => setSubTab('recibo_libre')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'recibo_libre' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><FileText size={16} />Recibo Libre</button>
        </div>
      </div>

      {subTab === 'caja' && <CajaForm currentUser={currentUser} history={history} setHistory={setHistory} professionals={professionals} surgeries={surgeries} />}
      {subTab === 'historial' && <HistorialCajaView history={history} setHistory={setHistory} currentUser={currentUser} professionals={professionals} />}
      {subTab === 'liquidaciones' && <LiquidacionView history={history} currentUser={currentUser} professionals={professionals} />}
      {subTab === 'resumen_mensual' && <StaffLiquidacionesView history={history} professionals={professionals} />}
      {subTab === 'recibo_libre' && <ReciboLibreView />}
    </div>
  );
}
