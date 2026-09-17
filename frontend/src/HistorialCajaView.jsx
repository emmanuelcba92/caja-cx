import React, { useState, useMemo, useEffect } from 'react';
import { History, ChevronLeft, ChevronRight, Printer, Edit2, Trash2, Save, X, TrendingUp, DollarSign, Download, Plus, User, Shield, Lock as LockIcon, MessageSquare } from 'lucide-react';
import { formatMoney, currencies, MoneyInput, PROF_KEY, DEFAULT_PROFESIONALES, normalizeDate } from './CajaView';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { SEED_DAILY_COMMENTS } from './data/seedData';
import apiService from './services/apiService';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function HistorialCajaView({ history, setHistory, currentUser, professionals }) {
  const [view, setView] = useState('years');
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [dailyComment, setDailyComment] = useState('');
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState({});
  const [isExportingRange, setIsExportingRange] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [profesionales, setProfesionales] = useState(() => {
    const saved = localStorage.getItem(PROF_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_PROFESIONALES;
  });

  const anestesistas = professionals.filter(p => p.especialidad === 'Anestesista').map(p => p.nombre);
  const orlProfs = professionals.filter(p => !['Anestesista', 'Fonoaudióloga'].includes(p.especialidad)).map(p => p.nombre);

  useEffect(() => {
    const cleared = localStorage.getItem('data_cleared');
    const saved = localStorage.getItem('daily_comments_proto');
    if (!saved && !cleared) {
      localStorage.setItem('daily_comments_proto', JSON.stringify(SEED_DAILY_COMMENTS));
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('daily_comments_proto');
    if (saved) {
      const all = JSON.parse(saved);
      if (selectedDate && all[selectedDate]) setDailyComment(all[selectedDate]);
      else setDailyComment('');
    }
  }, [selectedDate]);

  const saveDailyComment = () => {
    const all = JSON.parse(localStorage.getItem('daily_comments_proto') || '{}');
    if (dailyComment.trim()) all[selectedDate] = dailyComment;
    else delete all[selectedDate];
    localStorage.setItem('daily_comments_proto', JSON.stringify(all));
    setIsEditingComment(false);
  };

  const getYears = () => [...new Set(history.map(h => normalizeDate(h.fecha)?.split('-')[0]).filter(Boolean))].sort().reverse();
  const getMonths = (year) => [...new Set(history.filter(h => normalizeDate(h.fecha)?.startsWith(year)).map(h => parseInt(normalizeDate(h.fecha).split('-')[1]) - 1))].sort((a, b) => b - a);
  const getDays = (year, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return [...new Set(history.filter(h => normalizeDate(h.fecha)?.startsWith(prefix)).map(h => normalizeDate(h.fecha)))].sort().reverse();
  };

  const dateEntries = selectedDate ? history.filter(h => normalizeDate(h.fecha) === normalizeDate(selectedDate)) : [];

  const totals = dateEntries.reduce((acc, h) => {
    acc.pesos += parseFloat(h.pesos) || 0;
    acc.dolares += parseFloat(h.dolares) || 0;
    acc.coat_pesos += parseFloat(h.coat_pesos) || 0;
    acc.coat_dolares += parseFloat(h.coat_dolares) || 0;
    return acc;
  }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 });

  const allTotals = useMemo(() => history.reduce((acc, h) => {
    acc.pesos += parseFloat(h.pesos) || 0; acc.dolares += parseFloat(h.dolares) || 0;
    acc.coat_pesos += parseFloat(h.coat_pesos) || 0; acc.coat_dolares += parseFloat(h.coat_dolares) || 0;
    return acc;
  }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 }), [history]);

  const handleEditClick = (item) => { setEditId(item.id); setEditForm({ ...item }); };
  const handleEditChange = (field, value) => { setEditForm(prev => ({ ...prev, [field]: value })); };
  
  const handleEditSave = async () => {
    try {
      if (editId) {
        await apiService.setDocument('caja', String(editId), editForm);
      }
    } catch (err) {
      console.error("Error updating document in Firestore:", err);
    }
    setHistory(prev => prev.map(h => String(h.id) === String(editId) ? { ...h, ...editForm } : h));
    setEditId(null);
    setEditForm({});
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro permanentemente?')) return;
    try {
      if (id) {
        await apiService.deleteDocument('caja', String(id));
      }
    } catch (err) {
      console.error("Error deleting document from Firestore:", err);
    }
    setHistory(prev => prev.filter(h => String(h.id) !== String(id)));
    if (editId === id) { setEditId(null); setEditForm({}); }
  };

  const handleDeleteDay = async () => {
    if (!selectedDate) return;
    if (!window.confirm(`¿ELIMINAR TODOS los registros del día ${selectedDate}?`)) return;
    if (!window.confirm('¿De verdad? Esta acción no se puede deshacer.')) return;
    const itemsToDelete = history.filter(h => normalizeDate(h.fecha) === normalizeDate(selectedDate));
    for (const item of itemsToDelete) {
      if (item.id) {
        try {
          await apiService.deleteDocument('caja', String(item.id));
        } catch (e) {
          console.error("Error deleting doc:", e);
        }
      }
    }
    setHistory(prev => prev.filter(h => normalizeDate(h.fecha) !== normalizeDate(selectedDate)));
    setSelectedDate(null);
    setView('months');
  };

  const handleCreateEntry = async () => {
    if (!newEntry.paciente || !selectedDate) return alert("Complete el nombre del paciente.");
    const entryData = {
      ...newEntry,
      fecha: normalizeDate(selectedDate),
      createdAt: new Date().toISOString(),
      creadoPor: currentUser?.nombre || 'unknown',
      pesos: parseFloat(newEntry.pesos) || 0,
      dolares: parseFloat(newEntry.dolares) || 0,
      liq_prof_1: parseFloat(newEntry.liq_prof_1) || 0,
      liq_prof_2: parseFloat(newEntry.liq_prof_2) || 0,
      liq_prof_3: parseFloat(newEntry.liq_prof_3) || 0,
      liq_anestesista: parseFloat(newEntry.liq_anestesista) || 0,
      liq_prof_1_currency: newEntry.liq_prof_1_currency || 'ARS',
      liq_prof_2_currency: newEntry.liq_prof_2_currency || 'ARS',
      liq_prof_3_currency: newEntry.liq_prof_3_currency || 'ARS',
      liq_anestesista_currency: newEntry.liq_anestesista_currency || 'ARS',
      coat_pesos: parseFloat(newEntry.coat_pesos) || 0,
      coat_dolares: parseFloat(newEntry.coat_dolares) || 0,
      prof_1: newEntry.prof_1 || '', prof_2: newEntry.prof_2 || '', prof_3: newEntry.prof_3 || '',
      anestesista: newEntry.anestesista || '',
      obra_social: newEntry.obra_social || '',
      dni: newEntry.dni || ''
    };
    try {
      const newId = await apiService.addDocument('caja', entryData);
      setHistory(prev => [...prev, { ...entryData, id: newId || String(Date.now()) }]);
    } catch (err) {
      console.error("Error adding entry to Firestore:", err);
      setHistory(prev => [...prev, { ...entryData, id: String(Date.now()) }]);
    }
    setShowAddModal(false);
    setNewEntry({});
  };

  const handleExportExcel = async () => {
    if (dateEntries.length === 0) return alert("No hay datos para exportar");
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Caja', { pageSetup: { orientation: 'landscape', fitToPage: true } });
      const headerStyle = { font: { bold: true, size: 10 }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin' } } };
      ws.getCell('A1').value = `Caja de Cirugía - ${selectedDate}`;
      ws.getCell('A1').font = { bold: true, size: 14 };
      ws.getRow(3).values = ['Paciente', 'DNI', 'OS', 'Prof.1', 'Prof.2', 'Prof.3', 'Pesos', 'USD', 'Liq.P1', 'Liq.P2', 'Liq.P3', 'Anest.', 'Liq.An.', 'COAT $', 'COAT USD'];
      ws.getRow(3).eachCell(c => { c.font = headerStyle.font; c.alignment = headerStyle.alignment; c.border = headerStyle.border; });
      let ri = 4;
      let tcARS = 0, tcUSD = 0;
      dateEntries.forEach(item => {
        const row = ws.getRow(ri);
        row.values = [item.paciente, item.dni, item.obra_social, item.prof_1||'', item.prof_2||'', item.prof_3||'', item.pesos, item.dolares,
          `${item.liq_prof_1_currency === 'USD' ? 'USD' : '$'}${formatMoney(item.liq_prof_1)}`,
          `${item.liq_prof_2_currency === 'USD' ? 'USD' : '$'}${formatMoney(item.liq_prof_2)}`,
          `${item.liq_prof_3_currency === 'USD' ? 'USD' : '$'}${formatMoney(item.liq_prof_3)}`,
          item.anestesista||'', `${item.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_anestesista)}`,
          item.coat_pesos, item.coat_dolares];
        tcARS += item.coat_pesos||0; tcUSD += item.coat_dolares||0; ri++;
      });
      ws.getRow(ri+1).getCell(13).value = 'Total COAT:'; ws.getRow(ri+1).getCell(13).font = { bold: true };
      ws.getRow(ri+1).getCell(14).value = tcARS; ws.getRow(ri+1).getCell(15).value = tcUSD;
      ws.columns = [{width:22},{width:14},{width:18},{width:18},{width:18},{width:18},{width:12},{width:12},{width:14},{width:14},{width:14},{width:18},{width:14},{width:12},{width:12}];
      if (dailyComment) { ws.getRow(ri+3).getCell(1).value = `Observaciones: ${dailyComment}`; ws.getRow(ri+3).getCell(1).font = { italic: true, color: { argb: 'FF666666' } }; }
      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf]), `CAJA_CX_${selectedDate}.xlsx`);
    } catch(e) { alert("Error al exportar: " + e.message); }
  };

  const handleExportRange = async () => {
    if (!rangeStart || !rangeEnd) return alert("Seleccione rango de fechas.");
    if (rangeStart > rangeEnd) return alert("Fecha inicio debe ser anterior a fin.");
    const dates = [];
    let d = new Date(rangeStart + 'T00:00:00');
    const end = new Date(rangeEnd + 'T00:00:00');
    while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    setIsExportingRange(true);
    try {
      const comments = JSON.parse(localStorage.getItem('daily_comments_proto') || '{}');
      for (const ds of dates) {
        const data = history.filter(h => h.fecha === ds);
        if (data.length === 0) continue;
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Caja');
        ws.getCell('A1').value = `Caja - ${ds}`; ws.getCell('A1').font = { bold: true };
        ws.getRow(3).values = ['Paciente','DNI','OS','Pesos','USD','COAT $','COAT USD'];
        let ri = 4;
        data.forEach(item => { ws.getRow(ri).values = [item.paciente, item.dni, item.obra_social, item.pesos, item.dolares, item.coat_pesos, item.coat_dolares]; ri++; });
        if (comments[ds]) { ws.getRow(ri+1).getCell(1).value = `Obs: ${comments[ds]}`; }
        ws.columns = [{width:22},{width:14},{width:20},{width:12},{width:12},{width:12},{width:12}];
        const buf = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buf]), `CAJA_CX_${ds}.xlsx`);
        await new Promise(r => setTimeout(r, 200));
      }
      alert("Exportación de rango finalizada.");
    } catch(e) { alert("Error: " + e.message); } finally { setIsExportingRange(false); }
  };

  const handleBackup = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `backup_caja_${new Date().toISOString().split('T')[0]}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const navigateHome = () => { setView('years'); setSelectedYear(null); setSelectedMonth(null); setSelectedDate(null); };
  const navigateBack = () => {
    if (view === 'table') { setView('days'); setSelectedDate(null); }
    else if (view === 'days') { setView('months'); setSelectedMonth(null); }
    else if (view === 'months') { setView('years'); setSelectedYear(null); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2"><History size={18} className="text-indigo-500" /><h3 className="font-bold text-slate-700">Historial de Caja</h3></div>
        <div className="flex items-center gap-2">
          <button onClick={handleBackup} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-all"><Download size={14} /> Backup</button>
          {view === 'table' && (
            <>
              <button onClick={handleExportExcel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-600 hover:bg-emerald-100 transition-all"><Download size={14} /> Excel</button>
              <button onClick={() => { if (!isAdmin) setShowPinModal(true); else setShowAddModal(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-blue-600 transition-all"><Plus size={14} /> Agregar</button>
            </>
          )}
          {view !== 'years' && (
            <button onClick={navigateBack} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"><ChevronLeft size={14} /> Volver</button>
          )}
        </div>
      </div>

      {/* PIN MODAL */}
      {showPinModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowPinModal(false); setPinInput(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6"><Shield size={32} className="text-slate-500" /></div>
            <h3 className="text-lg font-bold text-slate-800 mb-6">Modo Administrador</h3>
            <input type="password" className="w-full text-center text-2xl tracking-[0.3em] font-bold py-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 mb-6" placeholder="••••" maxLength={8} value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (() => { if (['546287','0511','1105'].includes(pinInput.trim())) { setIsAdmin(true); setShowPinModal(false); setPinInput(''); } else { alert("PIN Incorrecto"); setPinInput(''); } })()} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => { setShowPinModal(false); setPinInput(''); }} className="flex-1 py-3 text-slate-500 font-bold text-xs uppercase rounded-lg">Cancelar</button>
              <button onClick={() => { if (['546287','0511','1105'].includes(pinInput.trim())) { setIsAdmin(true); setShowPinModal(false); setPinInput(''); } else { alert("PIN Incorrecto"); setPinInput(''); } }} className="flex-1 py-3 bg-indigo-600 text-white font-bold text-xs uppercase rounded-lg">Desbloquear</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ENTRY MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-4">Agregar entrada a {selectedDate}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Paciente</label>
                <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.paciente||''} onChange={e => setNewEntry({...newEntry, paciente: e.target.value})} placeholder="Nombre" /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">DNI</label>
                <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.dni||''} onChange={e => setNewEntry({...newEntry, dni: e.target.value})} /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Obra Social</label>
                <input className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.obra_social||''} onChange={e => setNewEntry({...newEntry, obra_social: e.target.value})} /></div>
              <div><label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Pesos $</label>
                <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.pesos||''} onChange={e => setNewEntry({...newEntry, pesos: e.target.value})} /></div>
              <div><label className="text-[10px] font-bold text-blue-600 uppercase mb-1 block">USD</label>
                <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.dolares||''} onChange={e => setNewEntry({...newEntry, dolares: e.target.value})} /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Prof. 1</label>
                <select className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none bg-white" value={newEntry.prof_1||''} onChange={e => setNewEntry({...newEntry, prof_1: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {orlProfs.map(p => <option key={p} value={p}>{p}</option>)}
                </select></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Prof. 2</label>
                <select className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none bg-white" value={newEntry.prof_2||''} onChange={e => setNewEntry({...newEntry, prof_2: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {orlProfs.map(p => <option key={p} value={p}>{p}</option>)}
                </select></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Liq. P1 $</label>
                <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.liq_prof_1||''} onChange={e => setNewEntry({...newEntry, liq_prof_1: e.target.value})} /></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Liq. P2 $</label>
                <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.liq_prof_2||''} onChange={e => setNewEntry({...newEntry, liq_prof_2: e.target.value})} /></div>
              <div><label className="text-[10px] font-bold text-purple-600 uppercase mb-1 block">Anestesista</label>
                <select className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none bg-white" value={newEntry.anestesista||''} onChange={e => setNewEntry({...newEntry, anestesista: e.target.value})}>
                  <option value="">No requiere</option>
                  {anestesistas.map(p => <option key={p} value={p}>{p}</option>)}
                </select></div>
              <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Liq. Anest.</label>
                <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" value={newEntry.liq_anestesista||''} onChange={e => setNewEntry({...newEntry, liq_anestesista: e.target.value})} /></div>
              <div className="col-span-2 flex gap-3 mt-2">
                <button onClick={handleCreateEntry} className="flex-1 py-3 bg-indigo-600 text-white font-bold text-xs uppercase rounded-xl shadow-md hover:bg-indigo-700"><Save size={16} className="inline mr-1" /> Guardar</button>
                <button onClick={() => setShowAddModal(false)} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold text-xs uppercase rounded-xl hover:bg-slate-200">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {view === 'years' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Totales Generales</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100"><p className="text-[10px] font-bold text-emerald-600 uppercase">Recaudado $</p><p className="text-xl font-bold text-emerald-700">$ {formatMoney(allTotals.pesos)}</p></div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100"><p className="text-[10px] font-bold text-blue-600 uppercase">Recaudado USD</p><p className="text-xl font-bold text-blue-700">U$D {formatMoney(allTotals.dolares)}</p></div>
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-100"><p className="text-[10px] font-bold text-orange-600 uppercase">COAT ARS</p><p className="text-xl font-bold text-orange-700">$ {formatMoney(allTotals.coat_pesos)}</p></div>
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100"><p className="text-[10px] font-bold text-purple-600 uppercase">COAT USD</p><p className="text-xl font-bold text-purple-700">U$D {formatMoney(allTotals.coat_dolares)}</p></div>
            </div>
            <div className="flex gap-4 items-end mb-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Exportar rango</label>
                <input type="date" className="px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none" value={rangeStart} onChange={e => setRangeStart(e.target.value)} /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">hasta</label>
                <input type="date" className="px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} /></div>
              <button onClick={handleExportRange} disabled={isExportingRange} className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50"><Download size={14} className="inline mr-1" />Exportar rango</button>
            </div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Años</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {getYears().map(y => (
                <button key={y} onClick={() => { setSelectedYear(y); setView('months'); }} className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all text-center">
                  <p className="text-2xl font-bold text-slate-800">{y}</p><p className="text-xs text-slate-500 mt-1">{history.filter(h => h.fecha?.startsWith(y)).length} registros</p></button>
              ))}
              {getYears().length === 0 && <p className="col-span-full text-center text-slate-400 py-12">No hay registros en el historial.</p>}
            </div>
          </div>
        )}

        {view === 'months' && selectedYear && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{selectedYear}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {getMonths(selectedYear).map(m => (
                <button key={m} onClick={() => { setSelectedMonth(m); setView('days'); }} className="p-6 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all text-center">
                  <p className="text-lg font-bold text-slate-800">{MONTHS[m]}</p><p className="text-xs text-slate-500 mt-1">{history.filter(h => h.fecha?.startsWith(`${selectedYear}-${String(m+1).padStart(2,'0')}`)).length} registros</p></button>
              ))}
            </div>
          </div>
        )}

        {view === 'days' && selectedYear !== null && selectedMonth !== null && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{MONTHS[selectedMonth]} {selectedYear}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {getDays(selectedYear, selectedMonth).map(d => {
                const dayEntries = history.filter(h => h.fecha === d);
                const dayTotals = dayEntries.reduce((a, h) => { a.coat_pesos += parseFloat(h.coat_pesos)||0; a.coat_dolares += parseFloat(h.coat_dolares)||0; return a; }, { coat_pesos: 0, coat_dolares: 0 });
                return (
                  <button key={d} onClick={() => { setSelectedDate(d); setView('table'); }} className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all text-left">
                    <p className="font-bold text-slate-800">{d.split('-').reverse().join('/')}</p>
                    <p className="text-xs text-slate-500">{dayEntries.length} ops</p>
                    <p className="text-xs text-emerald-600 font-bold">$ {formatMoney(dayTotals.coat_pesos)}</p>
                    {dayTotals.coat_dolares > 0 && <p className="text-xs text-blue-600 font-bold">U$D {formatMoney(dayTotals.coat_dolares)}</p>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'table' && selectedDate && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-700">{selectedDate.split('-').reverse().join('/')}</h4>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right"><p className="text-[10px] font-bold text-orange-500 uppercase">COAT ARS</p><p className="font-bold text-orange-700">$ {formatMoney(totals.coat_pesos)}</p></div>
                <div className="text-right"><p className="text-[10px] font-bold text-blue-500 uppercase">COAT USD</p><p className="font-bold text-blue-700">U$D {formatMoney(totals.coat_dolares)}</p></div>
              </div>
            </div>

            {/* DAILY COMMENT */}
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-center gap-2 mb-2"><MessageSquare size={16} className="text-amber-600" /><span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Comentario del día</span></div>
              {isEditingComment ? (
                <div className="flex gap-2"><input className="flex-1 px-3 py-2 rounded-lg border border-amber-300 text-sm outline-none" value={dailyComment} onChange={e => setDailyComment(e.target.value)} autoFocus />
                  <button onClick={saveDailyComment} className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700"><Save size={14} className="inline mr-1" />Guardar</button>
                  <button onClick={() => setIsEditingComment(false)} className="px-3 py-2 text-slate-500"><X size={16} /></button></div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-slate-700 italic">{dailyComment || 'Sin comentario'}</p>
                  <button onClick={() => setIsEditingComment(true)} className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"><Edit2 size={14} className="inline mr-1" />Editar</button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">OS</th>
                    <th className="px-4 py-3 text-right">$</th>
                    <th className="px-4 py-3 text-right">USD</th>
                    <th className="px-4 py-3">Profesionales</th>
                    <th className="px-4 py-3 text-right">Liq.</th>
                    <th className="px-4 py-3 text-right">COAT $</th>
                    <th className="px-4 py-3 text-right">COAT USD</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateEntries.map(h => (
                    editId === h.id ? (
                      <tr key={h.id} className="bg-blue-50">
                        <td className="px-4 py-2"><input className="w-full px-2 py-1 rounded border border-slate-300 text-xs outline-none" value={editForm.paciente||''} onChange={e => handleEditChange('paciente', e.target.value)} /></td>
                        <td className="px-4 py-2"><input className="w-full px-2 py-1 rounded border border-slate-300 text-xs outline-none" value={editForm.dni||''} onChange={e => handleEditChange('dni', e.target.value)} /></td>
                        <td className="px-4 py-2"><input className="w-full px-2 py-1 rounded border border-slate-300 text-xs outline-none" value={editForm.obra_social||''} onChange={e => handleEditChange('obra_social', e.target.value)} /></td>
                        <td className="px-4 py-2"><MoneyInput className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-right outline-none" value={editForm.pesos||0} onChange={v => handleEditChange('pesos', v)} /></td>
                        <td className="px-4 py-2"><MoneyInput className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-right outline-none" value={editForm.dolares||0} onChange={v => handleEditChange('dolares', v)} /></td>
                        <td className="px-4 py-2">
                          <input className="w-full px-2 py-1 rounded border border-slate-300 text-xs outline-none mb-1" placeholder="Prof 1" value={editForm.prof_1||''} onChange={e => handleEditChange('prof_1', e.target.value)} />
                          <input className="w-full px-2 py-1 rounded border border-slate-300 text-xs outline-none" placeholder="Prof 2" value={editForm.prof_2||''} onChange={e => handleEditChange('prof_2', e.target.value)} />
                        </td>
                        <td className="px-4 py-2"><MoneyInput className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-right outline-none" value={editForm.liq_prof_1||0} onChange={v => handleEditChange('liq_prof_1', v)} /></td>
                        <td className="px-4 py-2"><MoneyInput className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-right outline-none" value={editForm.coat_pesos||0} onChange={v => handleEditChange('coat_pesos', v)} /></td>
                        <td className="px-4 py-2"><MoneyInput className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-right outline-none" value={editForm.coat_dolares||0} onChange={v => handleEditChange('coat_dolares', v)} /></td>
                        <td className="px-4 py-2 text-center"><div className="flex gap-1 justify-center">
                          <button onClick={handleEditSave} className="p-1.5 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200"><Save size={14} /></button>
                          <button onClick={() => setEditId(null)} className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={14} /></button>
                        </div></td>
                      </tr>
                    ) : (
                      <tr key={h.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          <div>{h.paciente}</div>
                          {h.creadoPor && h.creadoPor !== 'unknown' && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              Cargó: <span className="text-slate-600 font-semibold">{h.creadoPor}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-sm">{h.dni || '-'}</td>
                        <td className="px-4 py-3 text-slate-500 text-sm">{h.obra_social || '-'}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-bold tabular-nums">{h.pesos > 0 ? '$ ' + formatMoney(h.pesos) : '-'}</td>
                        <td className="px-4 py-3 text-right text-blue-600 font-bold tabular-nums">{h.dolares > 0 ? 'U$D ' + formatMoney(h.dolares) : '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{[h.prof_1, h.prof_2, h.prof_3].filter(Boolean).join(', ') || '-'}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">{h.liq_prof_1 > 0 ? '$ ' + formatMoney(h.liq_prof_1) : '-'}</td>
                        <td className="px-4 py-3 text-right text-orange-600 font-bold tabular-nums">$ {formatMoney(h.coat_pesos)}</td>
                        <td className="px-4 py-3 text-right text-purple-600 font-bold tabular-nums">{h.coat_dolares > 0 ? 'U$D ' + formatMoney(h.coat_dolares) : '-'}</td>
                        <td className="px-4 py-3 text-center">{(h.creadoPor === currentUser?.nombre || isAdmin) && (<div className="flex gap-1 justify-center">
                          <button onClick={() => handleEditClick(h)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(h.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                        </div>)}</td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>

            {dateEntries.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-sm">No hay registros para esta fecha.</div>
            )}

            {isAdmin && (
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700"><Plus size={14} /> Agregar entrada</button>
                <button onClick={handleDeleteDay} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700"><Trash2 size={14} /> Eliminar día</button>
                <button onClick={() => { setIsAdmin(false); setEditId(null); }} className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white text-xs font-bold rounded-lg hover:bg-slate-700"><LockIcon size={14} /> Salir Admin</button>
              </div>
            )}

            {!isAdmin && (
              <button onClick={() => setShowPinModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 border border-slate-200"><Shield size={14} /> Admin</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
