import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { logAction, AUDIT_ACTIONS } from '../services/auditService';
import { Printer, Calendar, User, FileText, RefreshCw, PenTool, Trash2, Plus, Trash, Download } from 'lucide-react';
import { formatMoney } from '../CajaView';

const SEED_PROFESSIONALS = [
  { id: 1, nombre: 'Dr. García', especialidad: 'ORL' },
  { id: 2, nombre: 'Dr. Martínez', especialidad: 'ORL' },
  { id: 3, nombre: 'Dr. Fernández', especialidad: 'ORL' },
  { id: 4, nombre: 'Dra. Sánchez', especialidad: 'ORL' },
  { id: 5, nombre: 'Anestesista Dr. Romero', especialidad: 'Anestesista' },
  { id: 6, nombre: 'Anestesista Dra. Molina', especialidad: 'Anestesista' },
];

const emptyPatient = (today) => ({
  paciente: '', dni: '', obra_social: '', fecha_cirugia: today,
  cobroPesos: '', cobroDolares: '', liqPesos: '', liqDolares: ''
});

const ReciboLibreView = () => {
  const { currentUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [selectedProf, setSelectedProf] = useState('');
  const [concept, setConcept] = useState('');
  const [isTransfer, setIsTransfer] = useState(false);
  const [modelo, setModelo] = useState(1);
  const [patients, setPatients] = useState([emptyPatient(today)]);

  const [profesionales, setProfesionales] = useState(() => {
    try {
      const saved = localStorage.getItem('professionals_proto');
      if (saved) return JSON.parse(saved);
    } catch {}
    return SEED_PROFESSIONALS;
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedProf) {
      setConcept(`Honorarios por técnica en común de por cuenta y orden de ${selectedProf}`);
    } else {
      setConcept('');
    }
  }, [selectedProf]);

  useEffect(() => {
    const fetchProfs = async () => {
      try {
        const q = query(collection(db, "profesionales"));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (list.length > 0) {
          list.sort((a, b) => a.nombre.localeCompare(b.nombre));
          setProfesionales(list);
        }
      } catch {}
    };
    fetchProfs();
  }, []);

  const updatePatient = (index, field, value) => {
    const updated = [...patients];
    updated[index] = { ...updated[index], [field]: value };
    setPatients(updated);
  };

  const addPatientRow = () => setPatients([...patients, emptyPatient(date)]);
  const removePatientRow = (index) => { if (patients.length > 1) setPatients(patients.filter((_, i) => i !== index)); };

  const totalLiqPesos = patients.reduce((s, p) => s + (parseFloat(p.liqPesos) || 0), 0);
  const totalLiqDolares = patients.reduce((s, p) => s + (parseFloat(p.liqDolares) || 0), 0);
  const totalCobroPesos = patients.reduce((s, p) => s + (parseFloat(p.cobroPesos) || 0), 0);
  const totalCobroDolares = patients.reduce((s, p) => s + (parseFloat(p.cobroDolares) || 0), 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const validPatients = patients.filter(p => p.paciente || parseFloat(p.liqPesos) || parseFloat(p.liqDolares));

  const handleSave = async () => {
    if (!selectedProf) return alert("Seleccioná un profesional");
    if (validPatients.length === 0) return alert("Agregá al menos un paciente");
    setIsSaving(true);
    try {
      const receiptData = {
        userId: currentUser?.uid || 'local',
        fecha: date, profesional: selectedProf, concepto: concept, isTransfer,
        patients: validPatients,
        totals: { cobroPesos: totalCobroPesos, cobroDolares: totalCobroDolares, liqPesos: totalLiqPesos, liqDolares: totalLiqDolares },
        createdAt: new Date()
      };
      await addDoc(collection(db, 'recibos_libres'), receiptData);
      logAction(AUDIT_ACTIONS.CREATE_CAJA_ENTRY, '', `Recibo libre para ${selectedProf}`);
      alert("Recibo guardado");
    } catch (error) {
      console.error("Error saving receipt:", error);
      alert("Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const buildPrintHTML = () => {
    const profRef = selectedProf || '—';
    const cobroCols = modelo === 1
      ? `<td style="text-align:right">${parseFloat(p.cobroPesos) > 0 ? '$ ' + formatMoney(p.cobroPesos) : '—'}</td><td style="text-align:right">${parseFloat(p.cobroDolares) > 0 ? 'USD ' + formatMoney(p.cobroDolares) : '—'}</td>`
      : '';
    const cobroTh = modelo === 1 ? '<th>Abono Paciente $</th><th>Abono Paciente USD</th>' : '';
    const cobroTd = modelo === 1 ? '<td style="text-align:right">$ ' + formatMoney(totalCobroPesos) + '</td><td style="text-align:right">USD ' + formatMoney(totalCobroDolares) + '</td>' : '';
    const cobroColspan = modelo === 1 ? 5 : 3;

    const liqRows = validPatients.map(p => {
      const hasLiq = parseFloat(p.liqPesos) > 0 || parseFloat(p.liqDolares) > 0;
      return `<tr>
      <td>${p.fecha_cirugia ? formatDate(p.fecha_cirugia) : '-'}</td>
      <td><div style="font-weight:700">${p.paciente || '-'}</div><div style="font-size:9px;color:#666">${p.dni || ''}${p.dni && p.obra_social ? ' - ' : ''}${p.obra_social || ''}</div></td>
      ${modelo === 1 ? `<td style="text-align:right">${parseFloat(p.cobroPesos) > 0 ? '$ ' + formatMoney(p.cobroPesos) : '—'}</td><td style="text-align:right">${parseFloat(p.cobroDolares) > 0 ? 'USD ' + formatMoney(p.cobroDolares) : '—'}</td>` : ''}
      <td style="text-align:right;font-weight:700">${hasLiq ? (parseFloat(p.liqDolares) > 0 ? 'USD ' + formatMoney(p.liqDolares) : '$ ' + formatMoney(p.liqPesos)) : '—'}</td>
    </tr>`;
    }).join('');

    const liqTotal = `<tr style="background:#1e293b;color:#fff;font-weight:700">
      <td colspan="2" style="text-align:right;border-color:#fff">TOTAL</td>
      ${modelo === 1 ? `<td style="text-align:right;border-color:#fff">$ ${formatMoney(totalCobroPesos)}</td><td style="text-align:right;border-color:#fff">USD ${formatMoney(totalCobroDolares)}</td>` : ''}
      <td style="text-align:right;border-color:#fff;font-size:13px">${totalLiqPesos > 0 || totalLiqDolares === 0 ? '$ ' + formatMoney(totalLiqPesos > 0 ? totalLiqPesos : 0) : ''}${totalLiqDolares > 0 ? (totalLiqPesos > 0 ? '<br>' : '') + 'USD ' + formatMoney(totalLiqDolares) : ''}</td>
    </tr>`;

    const refNames = validPatients.map(p => p.paciente).filter(Boolean).join(', ');
    const liqMonto = totalLiqPesos > 0 || totalLiqDolares === 0 ? totalLiqPesos : 0;

    return `<!DOCTYPE html><html><head><title>Recibo - ${selectedProf}</title><style>
      body{font-family:Arial;padding:0;margin:0;font-size:11px;color:#000}
      .page{padding:32px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:12px}
      .header img{height:50px}
      .header h1{font-size:18px;margin:0;text-transform:uppercase}
      .header p{font-size:14px;margin:4px 0 0;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #000;padding:6px 8px;text-align:left;font-size:11px}
      th{background:#f1f5f9;font-weight:700}
      .total-row{background:#1e293b;color:#fff;font-weight:700}
      .page-break{page-break-after:always}
      .meta{display:grid;grid-template-columns:120px 1fr;gap:8px 12px;margin-bottom:40px;font-size:14px}
      .meta dt{font-weight:700;color:#111}
      .meta dd{margin:0;color:#333}
      .signature{margin-top:140px;display:flex;justify-content:flex-end}
      .sig-line{width:260px;text-align:center;border-top:1px solid #111;padding-top:8px}
      .sig-line p{font-weight:700;font-size:13px;margin:4px 0 0}
      .receipt-table{width:100%;border-collapse:collapse;margin-top:16px}
      .receipt-table th,.receipt-table td{padding:8px 12px;text-align:left;font-size:13px;border:none}
      .receipt-table th{border-top:2px solid #000;border-bottom:1px solid #000;font-weight:700}
      .receipt-table td{border-bottom:1px solid #ddd}
      .receipt-table .importe{text-align:right;font-weight:700}
      @media print{@page{size:A4 portrait;margin:10mm}}
    </style></head><body>
    <!-- PAGINA 1: LIQUIDACION -->
    <div class="page">
      <div class="header">
        <img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'">
        <div style="text-align:right"><h1>Liquidación: ${profRef}</h1><p>${formatDate(date)}</p></div>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Paciente</th>${modelo === 1 ? '<th>Abono Paciente $</th><th>Abono Paciente USD</th>' : ''}<th style="text-align:right">Liquidación</th></tr></thead>
        <tbody>${liqRows}</tbody>
        <tfoot>${liqTotal}</tfoot>
      </table>
    </div>
    <div class="page-break"></div>
    <!-- PAGINA 2: RECIBO -->
    <div class="page">
      <div style="text-align:center;margin-bottom:32px"><img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'" style="height:70px"></div>
      <dl class="meta">
        <dt>Fecha:</dt><dd>${formatDate(date)}</dd>
        <dt>Movimiento:</dt><dd>Egreso</dd>
        <dt>Concepto:</dt><dd>${concept || '—'}</dd>
        <dt>Referencia:</dt><dd style="font-size:12px">${refNames || '—'}</dd>
      </dl>
      <table class="receipt-table">
        <thead><tr><th>M. de Pago</th><th>Número</th><th>F. Cobro</th><th class="importe">Importe</th></tr></thead>
        <tbody>
          <tr><td>Efectivo</td><td></td><td></td><td class="importe">$ ${formatMoney(liqMonto)}</td></tr>
          <tr><td>Dólares</td><td></td><td></td><td class="importe">USD ${formatMoney(totalLiqDolares)}</td></tr>
        </tbody>
      </table>
      <div class="signature"><div class="sig-line"><p>Recibí conforme</p></div></div>
    </div>
    </body></html>`;
  };

  const handlePrint = () => {
    const printWin = window.open('', '_blank', 'height=800,width=900');
    if (!printWin) return;
    printWin.document.write(buildPrintHTML());
    printWin.document.close();
    printWin.onafterprint = () => { try { printWin.close(); } catch(e) {} };
    setTimeout(() => { printWin.print(); }, 500);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* LEFT: FORM */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Recibo Libre / Especial</h2>
          <p className="text-xs text-slate-400 font-medium mt-1">Carga múltiple de pacientes y liquidación de honorarios</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Fecha del Movimiento</label>
              <input type="date" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Profesional Beneficiario</label>
              <select className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedProf} onChange={e => setSelectedProf(e.target.value)}>
                <option value="">Seleccione profesional...</option>
                {profesionales.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Concepto General del Recibo</label>
            <input type="text" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={concept} onChange={e => setConcept(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm cursor-pointer hover:bg-slate-100 transition-colors w-fit">
            <input type="checkbox" checked={isTransfer} onChange={e => setIsTransfer(e.target.checked)} className="rounded" />
            <span className="font-medium text-slate-600">Liquidado vía transferencia bancaria</span>
          </label>

          <div className="flex gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 self-center">Modelo:</span>
            <button onClick={() => setModelo(1)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${modelo === 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              Modelo 1 — COAT cobra y paga
            </button>
            <button onClick={() => setModelo(2)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${modelo === 2 ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              Modelo 2 — Profesional cobra directo
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Detalle de Pacientes a Liquidar</h3>
            <button onClick={addPatientRow} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
              <Plus size={14} /> Cargar Paciente Manual
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {patients.map((patient, idx) => (
              <div key={idx} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-500 uppercase tracking-widest">Paciente #{idx + 1}</span>
                  {patients.length > 1 && (
                    <button onClick={() => removePatientRow(idx)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nombre Completo</label>
                    <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nombre y Apellido..." value={patient.paciente} onChange={e => updatePatient(idx, 'paciente', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha Cirugía</label>
                    <input type="date" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" value={patient.fecha_cirugia} onChange={e => updatePatient(idx, 'fecha_cirugia', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">DNI (Opcional)</label>
                    <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="DNI..." value={patient.dni} onChange={e => updatePatient(idx, 'dni', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Obra Social (Opcional)</label>
                    <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Obra Social / Prepaga..." value={patient.obra_social} onChange={e => updatePatient(idx, 'obra_social', e.target.value)} />
                  </div>
                </div>
                <div className={`grid gap-3 ${modelo === 1 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                  {modelo === 1 && (
                    <>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Abonó $ (Opcional)</label>
                        <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0,00" value={patient.cobroPesos} onChange={e => updatePatient(idx, 'cobroPesos', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Abonó USD (Opcional)</label>
                        <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0,00" value={patient.cobroDolares} onChange={e => updatePatient(idx, 'cobroDolares', e.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-[10px] font-bold text-emerald-500 uppercase">Liquidación ARS ($)</label>
                    <input type="number" className="w-full px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-right font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0,00" value={patient.liqPesos} onChange={e => updatePatient(idx, 'liqPesos', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-emerald-500 uppercase">Liquidación USD (USD)</label>
                    <input type="number" className="w-full px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-right font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="0,00" value={patient.liqDolares} onChange={e => updatePatient(idx, 'liqDolares', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={handlePrint} disabled={!selectedProf} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all disabled:opacity-40">
            <Printer size={16} /> Imprimir
          </button>
          <button onClick={handleSave} disabled={isSaving || !selectedProf} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50">
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <PenTool size={16} />}
            Guardar Recibo
          </button>
        </div>
      </div>

      {/* RIGHT: PRINT PREVIEW */}
      <div className="space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vista Previa de Impresión (2 páginas)</p>

        {/* PAGINA 1 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Página 1: Detalle de Liquidación (Profesional)</p>
          </div>
          <div className="p-6">
            <div className="flex items-start justify-between mb-6 border-b-2 border-black pb-3">
              <img src="/coat_logo.png" alt="COAT" className="h-12" onError={e => e.target.style.display='none'} />
              <div className="text-right">
                <h2 className="text-lg font-black uppercase">Liquidación: {selectedProf || '—'}</h2>
                <p className="text-sm font-bold">{formatDate(date)}</p>
              </div>
            </div>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-black px-2 py-1.5 text-left font-bold">Fecha</th>
                  <th className="border border-black px-2 py-1.5 text-left font-bold">Paciente</th>
                  {modelo === 1 && <><th className="border border-black px-2 py-1.5 text-right font-bold">Abono Paciente $</th><th className="border border-black px-2 py-1.5 text-right font-bold">Abono Paciente USD</th></>}
                  <th className="border border-black px-2 py-1.5 text-right font-bold">Liquidación</th>
                </tr>
              </thead>
              <tbody>
                {validPatients.length > 0 ? validPatients.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="border border-black px-2 py-1.5">{p.fecha_cirugia ? formatDate(p.fecha_cirugia) : '—'}</td>
                    <td className="border border-black px-2 py-1.5">
                      <div className="font-bold">{p.paciente || '—'}</div>
                      <div className="text-[9px] text-slate-500">{[p.dni, p.obra_social].filter(Boolean).join(' - ')}</div>
                    </td>
                    {modelo === 1 && <><td className="border border-black px-2 py-1.5 text-right">{p.cobroPesos ? '$ ' + formatMoney(p.cobroPesos) : '—'}</td><td className="border border-black px-2 py-1.5 text-right">{p.cobroDolares ? 'USD ' + formatMoney(p.cobroDolares) : '—'}</td></>}
                    <td className="border border-black px-2 py-1.5 text-right font-bold">{p.liqDolares ? 'USD ' + formatMoney(p.liqDolares) : '$ ' + formatMoney(p.liqPesos)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={modelo === 1 ? 5 : 3} className="border border-black px-2 py-4 text-center text-slate-400">Sin pacientes cargados</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold">
                  <td colSpan="2" className="border border-white px-2 py-2 text-right">TOTAL</td>
                  {modelo === 1 && <><td className="border border-white px-2 py-2 text-right">$ {formatMoney(totalCobroPesos)}</td><td className="border border-white px-2 py-2 text-right">USD {formatMoney(totalCobroDolares)}</td></>}
                  <td className="border border-white px-2 py-2 text-right text-[13px]">
                    {totalLiqPesos > 0 || totalLiqDolares === 0 ? '$ ' + formatMoney(totalLiqPesos > 0 ? totalLiqPesos : 0) : ''}
                    {totalLiqDolares > 0 ? <>{totalLiqPesos > 0 && <br/>}USD {formatMoney(totalLiqDolares)}</> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* PAGINA 2 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-violet-50 border-b border-violet-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">Página 2: Recibo de Honorarios (Firma física)</p>
          </div>
          <div className="p-6">
            <div className="text-center mb-8">
              <img src="/coat_logo.png" alt="COAT" className="h-16 mx-auto" onError={e => e.target.style.display='none'} />
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3 text-[13px] mb-10">
              <dt className="font-bold text-slate-800">Fecha:</dt><dd className="text-slate-600">{formatDate(date)}</dd>
              <dt className="font-bold text-slate-800">Movimiento:</dt><dd className="text-slate-600">Egreso</dd>
              <dt className="font-bold text-slate-800">Concepto:</dt><dd className="text-slate-600">{concept || '—'}</dd>
              <dt className="font-bold text-slate-800">Referencia:</dt><dd className="text-slate-600 text-xs">{validPatients.map(p => p.paciente).filter(Boolean).join(', ') || '—'}</dd>
            </div>
            <table className="w-full text-[13px] mb-16">
              <thead>
                <tr className="border-t-2 border-b border-black">
                  <th className="px-2 py-2 text-left font-bold">M. de Pago</th>
                  <th className="px-2 py-2 text-left font-bold">Número</th>
                  <th className="px-2 py-2 text-left font-bold">F. Cobro</th>
                  <th className="px-2 py-2 text-right font-bold">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="px-2 py-2">Efectivo</td><td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right font-bold">$ {formatMoney(totalLiqPesos > 0 ? totalLiqPesos : 0)}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="px-2 py-2">Dólares</td><td className="px-2 py-2"></td><td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right font-bold">USD {formatMoney(totalLiqDolares)}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="w-64 text-center">
                <div className="border-t border-black pt-2">
                  <p className="font-bold text-sm">Recibí conforme</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReciboLibreView;
