import React, { useState, useMemo, useEffect } from 'react';
import { FileText, Printer, Trash2, MinusCircle, Plus, X, Download, Calendar } from 'lucide-react';
import { formatMoney } from './CajaView';

const saveAs = (blob, filename) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };

const DED_KEY = 'deducciones_liquidacion';
const MANUAL_KEY = 'liquidaciones_manuales';

const loadJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
const saveJSON = (key, val) => localStorage.setItem(key, JSON.stringify(val));

const cleanName = (name) => name?.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '').trim() || '';

export default function LiquidacionView({ history, currentUser, professionals }) {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [dateMode, setDateMode] = useState('range'); // 'range' or 'month'
  const [selectedProf, setSelectedProf] = useState('');
  const [selectedModel, setSelectedModel] = useState('1');
  const [deductions, setDeductions] = useState(() => loadJSON(DED_KEY, []));
  const [manualLiqs, setManualLiqs] = useState(() => loadJSON(MANUAL_KEY, []));
  const [newDed, setNewDed] = useState({ date: today, desc: '', amount: '', currency: 'ARS' });
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    date: today, patient: '', totalPayment: '', currency: 'ARS', inReceipt: false,
    profs: [{ prof: '', amount: '' }]
  });

  useEffect(() => { saveJSON(DED_KEY, deductions); }, [deductions]);
  useEffect(() => { saveJSON(MANUAL_KEY, manualLiqs); }, [manualLiqs]);

  useEffect(() => {
    if (showManualModal && selectedProf) {
      setManualForm(prev => ({ ...prev, profs: [{ prof: selectedProf, amount: '' }] }));
    }
  }, [showManualModal, selectedProf]);

  useEffect(() => {
    if (selectedProf && professionals?.length) {
      const profData = professionals.find(p => 
        selectedProf.includes(p.nombre) || p.nombre === selectedProf
      );
      if (profData?.especialidad === 'Anestesista' || profData?.especialidad === 'Fonoaudióloga' || /^lic\.?\s/i.test(selectedProf.trim())) {
        setSelectedModel('2');
      } else {
        setSelectedModel('1');
      }
    }
  }, [selectedProf, professionals]);

  const normProf = (n) => n?.replace(/\./g, '').trim().toLowerCase() || '';

  const allEntries = useMemo(() => [...history, ...manualLiqs], [history, manualLiqs]);

  const availableProfs = useMemo(() => {
    const profMap = new Map();
    if (professionals && Array.isArray(professionals)) {
      professionals.forEach(p => {
        const name = typeof p === 'string' ? p : p?.nombre;
        if (name && name.trim()) {
          const key = normProf(name);
          if (key && !profMap.has(key)) {
            profMap.set(key, name.trim());
          }
        }
      });
    }
    allEntries.forEach(h => {
      [h.prof_1, h.prof_2, h.prof_3, h.anestesista].forEach(name => {
        if (name && typeof name === 'string' && name.trim()) {
          const key = normProf(name);
          if (key && !profMap.has(key)) {
            profMap.set(key, name.trim());
          }
        }
      });
    });
    return Array.from(profMap.values()).sort((a, b) => a.localeCompare(b));
  }, [allEntries, professionals]);

  const dateEntries = useMemo(() => {
    let list = [];
    if (dateMode === 'month') {
      const monthStart = `${selectedYear}-${selectedMonth}-01`;
      const monthEnd = new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).toISOString().split('T')[0];
      list = allEntries.filter(h => h.fecha >= monthStart && h.fecha <= monthEnd);
    } else {
      list = allEntries.filter(h => h.fecha >= startDate && h.fecha <= endDate);
    }
    const seen = new Set();
    return list.filter(h => {
      const key = h.id || `${h.fecha}_${h.paciente}_${h.prof_1}_${h.pesos}_${h.dolares}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allEntries, startDate, endDate, dateMode, selectedMonth, selectedYear]);

  const profsWithData = useMemo(() => {
    return availableProfs.filter(prof => {
      const pKey = normProf(prof);
      return dateEntries.some(h => {
        return normProf(h.prof_1) === pKey ||
               normProf(h.prof_2) === pKey ||
               normProf(h.prof_3) === pKey ||
               normProf(h.anestesista) === pKey;
      });
    });
  }, [availableProfs, dateEntries]);

  const filtered = useMemo(() => {
    if (!selectedProf) return [];
    const p = normProf(selectedProf);
    return allEntries.filter(h => {
      if (h.fecha < startDate || h.fecha > endDate) return false;
      return normProf(h.prof_1) === p || normProf(h.prof_2) === p || normProf(h.prof_3) === p || normProf(h.anestesista) === p;
    });
  }, [allEntries, selectedProf, startDate, endDate]);

  const dayPatients = useMemo(() => {
    const seen = new Set();
    return history.filter(h => h.fecha === manualForm.date && !h.isManualLiquidation)
      .filter(h => { if (seen.has(h.paciente)) return false; seen.add(h.paciente); return true; })
      .map(h => ({ name: h.paciente, pesos: parseFloat(h.pesos) || 0, dolares: parseFloat(h.dolares) || 0 }));
  }, [history, manualForm.date]);

  const profDeductions = useMemo(() => {
    const p = normProf(selectedProf);
    return deductions.filter(d => normProf(d.profesional) === p && d.date >= startDate && d.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [deductions, selectedProf, startDate, endDate]);

  const liquidationData = useMemo(() => {
    let totalPesos = 0, totalDolares = 0;
    const p = normProf(selectedProf);
    const rows = filtered.map(h => {
      let liqAmount = 0, liqCurrency = 'ARS';
      let cobroPesos = parseFloat(h.pesos) || 0;
      let cobroDolares = parseFloat(h.dolares) || 0;

      if (normProf(h.prof_1) === p) { liqAmount = parseFloat(h.liq_prof_1) || 0; liqCurrency = h.liq_prof_1_currency || 'ARS'; }
      else if (normProf(h.prof_2) === p) { liqAmount = parseFloat(h.liq_prof_2) || 0; liqCurrency = h.liq_prof_2_currency || 'ARS'; }
      else if (normProf(h.prof_3) === p) { liqAmount = parseFloat(h.liq_prof_3) || 0; liqCurrency = h.liq_prof_3_currency || 'ARS'; }
      else if (normProf(h.anestesista) === p) { liqAmount = parseFloat(h.liq_anestesista) || 0; liqCurrency = h.liq_anestesista_currency || 'ARS'; }

      const isTransfer = h.isTransfer || false;
      const isManual = h.isManualLiquidation || h.paciente?.toLowerCase().includes('(liq. manual)');

      if (!isTransfer) {
        if (liqCurrency === 'USD') totalDolares += liqAmount;
        else totalPesos += liqAmount;
      }

      return { ...h, liqAmount, liqCurrency, cobroPesos, cobroDolares, key: h.id, isTransfer, isManual, displayName: isManual ? cleanName(h.paciente) : h.paciente };
    }).filter(r => r.liqAmount > 0 || r.isManual);

    rows.sort((a, b) => {
      if (a.isManual !== b.isManual) return a.isManual ? 1 : -1;
      return 0;
    });

    return { rows, totalPesos, totalDolares };
  }, [filtered, selectedProf]);

  const totalDedPesos = profDeductions.filter(d => d.currency !== 'USD').reduce((a, d) => a + Math.abs(d.amount || 0), 0);
  const totalDedUSD = profDeductions.filter(d => d.currency === 'USD').reduce((a, d) => a + Math.abs(d.amount || 0), 0);
  const finalPesos = liquidationData.totalPesos - totalDedPesos;
  const finalDolares = liquidationData.totalDolares - totalDedUSD;

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const addDeduction = () => {
    if (!newDed.desc || !newDed.amount || !selectedProf) return;
    setDeductions(prev => [...prev, { id: Date.now(), profesional: selectedProf, date: newDed.date, desc: newDed.desc, amount: Math.abs(parseFloat(newDed.amount)), currency: newDed.currency }]);
    setNewDed({ date: today, desc: '', amount: '', currency: 'ARS' });
  };

  const removeDeduction = (id) => {
    if (!window.confirm('¿Eliminar esta deducción?')) return;
    setDeductions(prev => prev.filter(d => d.id !== id));
  };

  const addManualProfRow = () => setManualForm(prev => ({ ...prev, profs: [...prev.profs, { prof: '', amount: '' }] }));
  const removeManualProfRow = (idx) => { if (manualForm.profs.length <= 1) return; setManualForm(prev => ({ ...prev, profs: prev.profs.filter((_, i) => i !== idx) })); };
  const updateManualProfRow = (idx, field, val) => setManualForm(prev => { const p = [...prev.profs]; p[idx] = { ...p[idx], [field]: val }; return { ...prev, profs: p }; });

  const handleSaveManual = () => {
    if (!manualForm.patient || manualForm.profs.some(p => !p.prof || !p.amount)) {
      return alert('Complete todos los campos de profesionales y montos');
    }
    const newEntries = manualForm.profs.map(item => ({
      id: Date.now() + Math.random(),
      fecha: manualForm.date,
      paciente: manualForm.patient + ' (Liq. Manual)',
      dni: '', obra_social: '',
      prof_1: item.prof, prof_2: '', prof_3: '', anestesista: '',
      pesos: 0, dolares: 0,
      abonado_ref: parseFloat(String(manualForm.totalPayment).replace(',', '.') || 0),
      abonado_ref_currency: manualForm.currency,
      liq_prof_1: parseFloat(String(item.amount).replace(',', '.') || 0),
      liq_prof_1_currency: manualForm.currency,
      liq_prof_2: 0, liq_prof_2_currency: 'ARS',
      liq_prof_3: 0, liq_prof_3_currency: 'ARS',
      liq_anestesista: 0, liq_anestesista_currency: 'ARS',
      coat_pesos: 0, coat_dolares: 0,
      isManualLiquidation: true,
      includeInReceipt: manualForm.inReceipt,
      createdAt: new Date().toISOString(),
    }));
    setManualLiqs(prev => [...prev, ...newEntries]);
    setShowManualModal(false);
    setManualForm({ date: today, patient: '', totalPayment: '', currency: 'ARS', inReceipt: false, profs: [{ prof: selectedProf || '', amount: '' }] });
  };

  const handlePrintDetail = () => {
    const rows = liquidationData.rows.map(r => {
      const isT = r.isTransfer;
      const isM = r.isManual;
      const bgColor = isT ? '#fffbeb' : isM ? '#f0fdf4' : '';
      return `<tr${bgColor ? ` style="background:${bgColor}"` : ''}>
        <td>${r.fecha ? r.fecha.split('-').reverse().join('/') : '-'}</td>
        <td>
          <div style="font-weight:700">${r.displayName || '-'}</div>
          <div style="font-size:9px;color:#666">${r.dni || ''} ${r.dni && r.obra_social ? ' - ' : ''} ${r.obra_social || ''}${isT ? ' <span style="color:#d97706;font-weight:700">TRANSFERENCIA</span>' : ''}${isM ? ' <span style="color:#059669;font-weight:700">MANUAL</span>' : ''}</div>
        </td>
        <td style="text-align:right">${r.cobroPesos > 0 ? '$ ' + formatMoney(r.cobroPesos) : '$0,00'}</td>
        <td style="text-align:right">${r.cobroDolares > 0 ? 'USD ' + formatMoney(r.cobroDolares) : 'USD 0,00'}</td>
        <td style="text-align:right;font-weight:700;${isT ? 'color:#d97706;text-decoration:line-through' : isM ? 'color:#059669' : ''}">${r.liqCurrency === 'USD' ? 'USD ' + formatMoney(r.liqAmount) : '$ ' + formatMoney(r.liqAmount)}</td>
      </tr>`;
    }).join('');

    const dedRows = profDeductions.map(d => `<tr style="background:#fef2f2"><td>${formatDate(d.date)}</td><td style="font-style:italic;color:#991b1b">${d.desc}</td><td colspan="2"></td><td style="text-align:right;font-weight:700;color:#dc2626">-${d.currency === 'USD' ? 'USD ' : '$ '}${formatMoney(d.amount)}</td></tr>`).join('');

    const printWin = window.open('', '_blank', 'height=800,width=800');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><title>Liquidación - ${selectedProf}</title><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #000; background: #fff; padding: 18px; }
      .page { width: 100%; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
      .header img { height: 46px; }
      .header h1 { font-size: 15pt; margin: 0; text-transform: uppercase; }
      .header p { font-size: 11pt; margin: 3px 0 0; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #000; padding: 5px 7px; text-align: left; font-size: 9.5pt; }
      th { background: #f1f5f9; font-weight: 700; }
      .text-right { text-align: right; }
      .total-row { background: #1e293b; color: #fff; font-weight: 700; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { padding: 0; margin: 0; }
        .page { padding: 8px 10px; page-break-inside: avoid; }
      }
    </style></head><body>
    <div class="page">
      <div class="header">
        <img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'">
        <div style="text-align:right"><h1>Liquidación: ${selectedProf}</h1><p>${formatDate(startDate)} - ${formatDate(endDate)}</p></div>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Paciente</th><th>Cobro $</th><th>Cobro USD</th><th style="text-align:right">Liquidación</th></tr></thead>
        <tbody>${rows}${dedRows}</tbody>
        <tfoot><tr class="total-row"><td colspan="4" style="text-align:right;border-color:#fff">TOTAL FINAL</td><td style="text-align:right;border-color:#fff;font-size:12pt">${finalPesos > 0 || finalDolares === 0 ? '$ ' + formatMoney(finalPesos > 0 ? finalPesos : 0) : ''}${finalDolares > 0 ? (finalPesos > 0 ? '<br>' : '') + 'USD ' + formatMoney(finalDolares) : ''}</td></tr></tfoot>
      </table>
    </div></body></html>`);
    printWin.document.close();
    printWin.onafterprint = () => { try { printWin.close(); } catch(e) {} };
    setTimeout(() => { printWin.print(); }, 500);
  };

  const handlePrintReceipt = () => {
    const nonTransfer = liquidationData.rows.filter(r => !r.isTransfer);
    const refNames = nonTransfer.map(r => r.displayName).filter(Boolean);
    const dedRefs = profDeductions.filter(d => d.desc).map(d => d.desc);
    const allRef = [...refNames, ...dedRefs].join(', ');

    const printWin = window.open('', '_blank', 'height=800,width=800');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><title>Recibo - ${selectedProf}</title><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; padding: 24px; }
      .page { max-width: 720px; margin: 0 auto; width: 100%; }
      .meta { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; margin-bottom: 24px; font-size: 11pt; }
      .meta dt { font-weight: 700; color: #111; }
      .meta dd { margin: 0; color: #333; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border-top: 1px solid #999; }
      th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #ddd; font-size: 10.5pt; }
      th { font-weight: 700; color: #111; }
      .text-right { text-align: right; }
      .signature { margin-top: 50px; display: flex; justify-content: flex-end; }
      .sig-line { width: 240px; text-align: center; border-top: 1px solid #111; padding-top: 6px; }
      .sig-line p { font-weight: 700; font-size: 11pt; margin: 2px 0 0; }
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        body { padding: 0; margin: 0; }
        .page { padding: 12px 16px; page-break-inside: avoid; }
      }
    </style></head><body>
    <div class="page">
      <div style="text-align:center;margin-bottom:20px"><img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'" style="height:55px"></div>
      <dl class="meta">
        <dt>Fecha:</dt><dd>${startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} al ${formatDate(endDate)}`}</dd>
        <dt>Movimiento:</dt><dd>Egreso</dd>
        <dt>Concepto:</dt><dd>Honorarios por técnica en común de por cuenta y orden de ${selectedProf}</dd>
        <dt>Referencia:</dt><dd style="font-size:10pt">${allRef || '-'}</dd>
      </dl>
      <table>
        <thead><tr><th>M. de Pago</th><th>Número</th><th>F. Cobro</th><th class="text-right">Importe</th></tr></thead>
        <tbody>
          ${finalPesos > 0 || finalDolares === 0 ? `<tr><td>Efectivo</td><td></td><td></td><td class="text-right" style="font-weight:700">$ ${formatMoney(finalPesos > 0 ? finalPesos : 0)}</td></tr>` : ''}
          ${finalDolares > 0 ? `<tr><td>Dólares</td><td></td><td></td><td class="text-right" style="font-weight:700">U$D ${formatMoney(finalDolares)}</td></tr>` : ''}
        </tbody>
      </table>
      <div class="signature"><div class="sig-line"><p>Recibí conforme</p></div></div>
    </div></body></html>`);
    printWin.document.close();
    printWin.onafterprint = () => { try { printWin.close(); } catch(e) {} };
    setTimeout(() => { printWin.print(); }, 500);
  };

  const calcProfLiq = (entries, profName) => {
    const p = normProf(profName);
    let totalPesos = 0, totalDolares = 0;
    const rows = entries.map(h => {
      let liqAmount = 0, liqCurrency = 'ARS';
      const cobroPesos = parseFloat(h.pesos) || 0;
      const cobroDolares = parseFloat(h.dolares) || 0;
      if (normProf(h.prof_1) === p) { liqAmount = parseFloat(h.liq_prof_1) || 0; liqCurrency = h.liq_prof_1_currency || 'ARS'; }
      else if (normProf(h.prof_2) === p) { liqAmount = parseFloat(h.liq_prof_2) || 0; liqCurrency = h.liq_prof_2_currency || 'ARS'; }
      else if (normProf(h.prof_3) === p) { liqAmount = parseFloat(h.liq_prof_3) || 0; liqCurrency = h.liq_prof_3_currency || 'ARS'; }
      else if (normProf(h.anestesista) === p) { liqAmount = parseFloat(h.liq_anestesista) || 0; liqCurrency = h.liq_anestesista_currency || 'ARS'; }
      const isTransfer = h.isTransfer || false;
      const isManual = h.isManualLiquidation || h.paciente?.toLowerCase().includes('(liq. manual)');
      if (!isTransfer) { if (liqCurrency === 'USD') totalDolares += liqAmount; else totalPesos += liqAmount; }
      return { ...h, liqAmount, liqCurrency, cobroPesos, cobroDolares, isTransfer, isManual, displayName: isManual ? cleanName(h.paciente) : h.paciente };
    }).filter(r => r.liqAmount > 0 || r.isManual);
    const profDeds = deductions.filter(d => normProf(d.profesional) === p && d.date >= startDate && d.date <= endDate);
    const dedPesos = profDeds.filter(d => d.currency !== 'USD').reduce((a, d) => a + Math.abs(d.amount || 0), 0);
    const dedUSD = profDeds.filter(d => d.currency === 'USD').reduce((a, d) => a + Math.abs(d.amount || 0), 0);
    return { rows, totalPesos: totalPesos - dedPesos, totalDolares: totalDolares - dedUSD, deductions: profDeds };
  };

  const buildDetailHTML = (profName, data) => {
    const rows = data.rows.map(r => {
      const isT = r.isTransfer;
      const isM = r.isManual;
      const bgColor = isT ? '#fffbeb' : isM ? '#f0fdf4' : '';
      return `<tr${bgColor ? ` style="background:${bgColor}"` : ''}>
        <td>${r.fecha ? r.fecha.split('-').reverse().join('/') : '-'}</td>
        <td><div style="font-weight:700">${r.displayName || '-'}</div><div style="font-size:9px;color:#666">${r.dni || ''} ${r.dni && r.obra_social ? ' - ' : ''} ${r.obra_social || ''}${isT ? ' <span style="color:#d97706;font-weight:700">TRANSFERENCIA</span>' : ''}${isM ? ' <span style="color:#059669;font-weight:700">MANUAL</span>' : ''}</div></td>
        <td style="text-align:right">${r.cobroPesos > 0 ? '$ ' + formatMoney(r.cobroPesos) : '$0,00'}</td>
        <td style="text-align:right">${r.cobroDolares > 0 ? 'USD ' + formatMoney(r.cobroDolares) : 'USD 0,00'}</td>
        <td style="text-align:right;font-weight:700;${isT ? 'color:#d97706;text-decoration:line-through' : isM ? 'color:#059669' : ''}">${r.liqCurrency === 'USD' ? 'USD ' + formatMoney(r.liqAmount) : '$ ' + formatMoney(r.liqAmount)}</td>
      </tr>`;
    }).join('');
    const dedRows = data.deductions.map(d => `<tr style="background:#fef2f2"><td>${formatDate(d.date)}</td><td style="font-style:italic;color:#991b1b">${d.desc}</td><td colspan="2"></td><td style="text-align:right;font-weight:700;color:#dc2626">-${d.currency === 'USD' ? 'USD ' : '$ '}${formatMoney(d.amount)}</td></tr>`).join('');
    return `<div class="page"><div class="header"><img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'"><div style="text-align:right"><h1>Liquidación: ${profName}</h1><p>${formatDate(startDate)} - ${formatDate(endDate)}</p></div></div>
      <table><thead><tr><th>Fecha</th><th>Paciente</th><th>Cobro $</th><th>Cobro USD</th><th style="text-align:right">Liquidación</th></tr></thead>
      <tbody>${rows}${dedRows}</tbody>
      <tfoot><tr class="total-row"><td colspan="4" style="text-align:right;border-color:#fff">TOTAL FINAL</td><td style="text-align:right;border-color:#fff;font-size:12pt">${data.totalPesos > 0 || data.totalDolares === 0 ? '$ ' + formatMoney(data.totalPesos > 0 ? data.totalPesos : 0) : ''}${data.totalDolares > 0 ? (data.totalPesos > 0 ? '<br>' : '') + 'USD ' + formatMoney(data.totalDolares) : ''}</td></tr></tfoot></table></div>`;
  };

  const buildReceiptHTML = (profName, data) => {
    const nonTransfer = data.rows.filter(r => !r.isTransfer);
    const refNames = nonTransfer.map(r => r.displayName).filter(Boolean);
    const dedRefs = data.deductions.filter(d => d.desc).map(d => d.desc);
    const allRef = [...refNames, ...dedRefs].join(', ');
    return `<div class="page"><div style="text-align:center;margin-bottom:20px"><img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'" style="height:55px"></div>
      <dl class="meta"><dt>Fecha:</dt><dd>${startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} al ${formatDate(endDate)}`}</dd><dt>Movimiento:</dt><dd>Egreso</dd><dt>Concepto:</dt><dd>Honorarios por técnica en común de por cuenta y orden de ${profName}</dd><dt>Referencia:</dt><dd style="font-size:10pt">${allRef || '-'}</dd></dl>
      <table><thead><tr><th>M. de Pago</th><th>Número</th><th>F. Cobro</th><th class="text-right">Importe</th></tr></thead><tbody>
      ${data.totalPesos > 0 || data.totalDolares === 0 ? `<tr><td>Efectivo</td><td></td><td></td><td class="text-right" style="font-weight:700">$ ${formatMoney(data.totalPesos > 0 ? data.totalPesos : 0)}</td></tr>` : ''}
      ${data.totalDolares > 0 ? `<tr><td>Dólares</td><td></td><td></td><td class="text-right" style="font-weight:700">U$D ${formatMoney(data.totalDolares)}</td></tr>` : ''}
      </tbody></table><div class="signature"><div class="sig-line"><p>Recibí conforme</p></div></div></div>`;
  };

  const handlePrintAll = (mode) => {
    if (profsWithData.length === 0) {
      alert("No hay liquidaciones con movimientos para imprimir en este período");
      return;
    }

    const printWin = window.open('', '_blank', 'height=800,width=900');
    if (!printWin) return;
    const pages = profsWithData.map(prof => {
      const data = calcProfLiq(dateEntries, prof);
      return mode === 'receipt' ? buildReceiptHTML(prof, data) : buildDetailHTML(prof, data);
    }).join('');

    printWin.document.write(`<!DOCTYPE html><html><head><title>Liquidaciones - ${mode === 'receipt' ? 'Recibos' : 'Detalle'}</title><style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #000; background: #fff; }
      .page { padding: 18px 24px; }
      .page:not(:last-child) { page-break-after: always; break-after: page; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 2px solid #000; padding-bottom: 8px; }
      .header img { height: 44px; }
      .header h1 { font-size: 15pt; margin: 0; text-transform: uppercase; }
      .header p { font-size: 11pt; margin: 3px 0 0; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 16px; }
      th, td { border: 1px solid #000; padding: 5px 7px; text-align: left; font-size: 9.5pt; }
      th { background: #f1f5f9; font-weight: 700; }
      .text-right { text-align: right; }
      .total-row { background: #1e293b; color: #fff; font-weight: 700; }
      .meta { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; margin-bottom: 24px; font-size: 11pt; }
      .meta dt { font-weight: 700; color: #111; }
      .meta dd { margin: 0; color: #333; }
      .signature { margin-top: 50px; display: flex; justify-content: flex-end; }
      .sig-line { width: 240px; text-align: center; border-top: 1px solid #111; padding-top: 6px; }
      .sig-line p { font-weight: 700; font-size: 11pt; margin: 2px 0 0; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { padding: 0; margin: 0; }
        .page { padding: 8px 12px; page-break-inside: avoid; }
        .page:not(:last-child) { page-break-after: always; break-after: page; }
      }
    </style></head><body>${pages}</body></html>`);
    printWin.document.close();
    printWin.onafterprint = () => { try { printWin.close(); } catch(e) {} };
    setTimeout(() => { printWin.print(); }, 500);
  };

  const handleExportExcel = async () => {
    if (!selectedProf || liquidationData.rows.length === 0) return alert("No hay datos para exportar");
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Liquidación', { pageSetup: { orientation: 'landscape', fitToPage: true } });
      const headerStyle = { font: { bold: true, size: 10 }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin' } } };
      ws.getCell('A1').value = `Liquidación - ${selectedProf}`;
      ws.getCell('A1').font = { bold: true, size: 14 };
      ws.getCell('A2').value = `Período: ${startDate} al ${endDate}`;
      ws.getRow(4).values = ['Fecha', 'Paciente', 'Cobro ARS', 'Cobro USD', 'Liquidación'];
      ws.getRow(4).eachCell(c => { c.font = headerStyle.font; c.alignment = headerStyle.alignment; c.border = headerStyle.border; });
      let ri = 5;
      liquidationData.rows.forEach(row => {
        ws.getRow(ri).values = [row.fecha, row.paciente, row.cobroPesos, row.cobroDolares, `${row.liqCurrency === 'USD' ? 'USD' : '$'}${formatMoney(row.liqAmount)}`];
        ri++;
      });
      ws.getRow(ri).values = ['', 'TOTAL', '', '', `${'$'}${formatMoney(liquidationData.totalPesos)} / USD ${formatMoney(liquidationData.totalDolares)}`];
      ws.getRow(ri).eachCell(c => { c.font = { bold: true }; });
      ws.columns = [{ width: 14 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 18 }];
      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf]), `LIQUIDACION_${selectedProf}_${startDate}_${endDate}.xlsx`);
    } catch(e) { alert("Error al exportar: " + e.message); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-indigo-500" />
            <h3 className="font-bold text-slate-700">Liquidaciones</h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Modo:</label>
            <select className="px-2 py-1 rounded-lg border border-slate-300 text-sm outline-none" value={dateMode} onChange={e => setDateMode(e.target.value)}>
              <option value="range">Rango fechas</option>
              <option value="month">Mes / Año</option>
            </select>
          </div>
          {dateMode === 'month' ? (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Mes:</label>
              <select className="px-2 py-1 rounded-lg border border-slate-300 text-sm outline-none" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={String(m).padStart(2,'0')}>{String(m).padStart(2,'0')}</option>)}
              </select>
              <label className="text-xs font-bold text-slate-500 uppercase">Año:</label>
              <select className="px-2 py-1 rounded-lg border border-slate-300 text-sm outline-none" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                {[2024,2025,2026,2027,2028].map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Desde:</label>
              <input type="date" className="px-2 py-1 rounded-lg border border-slate-300 text-sm outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <label className="text-xs font-bold text-slate-500 uppercase">Hasta:</label>
              <input type="date" className="px-2 py-1 rounded-lg border border-slate-300 text-sm outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          )}

          {/* Professional Selector Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Profesional:</label>
            <select
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm min-w-[200px]"
              value={selectedProf}
              onChange={e => setSelectedProf(e.target.value)}
            >
              <option value="">-- Todos / Resumen general --</option>
              {availableProfs.map(p => {
                const hasData = profsWithData.includes(p);
                return (
                  <option key={p} value={p}>
                    {hasData ? `● ${p}` : p}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200 flex-wrap">
          {dateEntries.length > 0 && (
            <>
              <button onClick={() => handlePrintAll('detail')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition-all shadow-sm">
                <Printer size={14} /> Imprimir Todas ({profsWithData.length})
              </button>
              <button onClick={() => handlePrintAll('receipt')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500 text-white text-xs font-bold hover:bg-purple-600 transition-all shadow-sm">
                <FileText size={14} /> Recibos Todos ({profsWithData.length})
              </button>
            </>
          )}

          {selectedProf && liquidationData.rows.length > 0 && (
            <>
              <div className="h-5 w-[1px] bg-slate-300 mx-1 hidden sm:block"></div>
              <button onClick={handlePrintDetail} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm">
                <Printer size={14} /> Imprimir Detalle
              </button>
              <button onClick={handlePrintReceipt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-all shadow-sm">
                <FileText size={14} /> Imprimir Recibo
              </button>
              <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm">
                <Download size={14} /> Exportar Excel
              </button>
              <button onClick={() => setShowManualModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-all shadow-sm">
                <Plus size={14} /> Agregar Manual
              </button>
            </>
          )}
        </div>

        {/* Quick Doctor Pills */}
        {profsWithData.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2.5 mt-2.5 border-t border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Con movimientos:</span>
            <button
              onClick={() => setSelectedProf('')}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                !selectedProf
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Ver Resumen ({profsWithData.length})
            </button>
            {profsWithData.map(p => (
              <button
                key={p}
                onClick={() => setSelectedProf(selectedProf === p ? '' : p)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedProf === p
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {selectedProf ? (
          <>
            {liquidationData.rows.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No se encontraron registros para {selectedProf} en el período seleccionado.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Total Liquidación ARS</p>
                    <p className="text-2xl font-bold text-emerald-700">$ {formatMoney(liquidationData.totalPesos)}</p>
                  </div>
                  {liquidationData.totalDolares > 0 && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 uppercase">Total Liquidación USD</p>
                      <p className="text-2xl font-bold text-blue-700">U$D {formatMoney(liquidationData.totalDolares)}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {liquidationData.rows.map(h => (
                    <div key={h.key} className={`border rounded-xl p-4 hover:shadow-sm transition-all ${h.isTransfer ? 'bg-amber-50 border-amber-200' : h.isManual ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-bold text-slate-400">{h.fecha ? h.fecha.split('-').reverse().join('/') : '-'}</span>
                            <span className="text-xs text-slate-300">|</span>
                            <span className="text-xs text-slate-500">{h.obra_social || '-'}</span>
                            {h.isTransfer && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">TRANSFERENCIA</span>}
                            {h.isManual && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">MANUAL</span>}
                          </div>
                          <p className="font-bold text-slate-800 text-sm">{h.displayName || '-'}</p>
                          {h.dni && <p className="text-xs text-slate-500 mt-0.5">DNI: {h.dni}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          {h.cobroPesos > 0 && <p className="text-xs text-slate-600">$ {formatMoney(h.cobroPesos)}</p>}
                          {h.cobroDolares > 0 && <p className="text-xs text-slate-600">USD {formatMoney(h.cobroDolares)}</p>}
                          <p className={`text-sm font-bold mt-1 ${h.isTransfer ? 'text-amber-600 line-through' : h.isManual ? 'text-green-600' : 'text-indigo-600'}`}>
                            {h.liqCurrency === 'USD' ? 'U$D ' : '$ '}{formatMoney(h.liqAmount)}
                          </p>
                        </div>
                      </div>
                      {!h.isManual && h.isTransfer && (
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-dashed border-slate-200">
                          <span className="text-[10px] font-bold text-amber-500 uppercase">Transferencia (marcada en caja)</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {profDeductions.length > 0 && (
                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-xs font-bold text-red-500 uppercase mb-3">Deducciones</p>
                    <div className="space-y-2">
                      {profDeductions.map(d => (
                        <div key={d.id} className="flex justify-between items-center bg-red-50 border border-red-100 rounded-xl p-3">
                          <div>
                            <span className="text-[10px] font-bold text-red-400">{formatDate(d.date)}</span>
                            <p className="text-sm text-red-700 font-medium">{d.desc}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-red-600">-{d.currency === 'USD' ? 'U$D ' : '$ '}{formatMoney(d.amount)}</span>
                            <button onClick={() => removeDeduction(d.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">Agregar deducción</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fecha</label>
                      <input type="date" className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={newDed.date} onChange={e => setNewDed({ ...newDed, date: e.target.value })} />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</label>
                      <input type="text" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej: Honorarios Dra. Turiella" value={newDed.desc} onChange={e => setNewDed({ ...newDed, desc: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Moneda</label>
                      <select className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={newDed.currency} onChange={e => setNewDed({ ...newDed, currency: e.target.value })}>
                        <option value="ARS">$</option>
                        <option value="USD">U$D</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Monto</label>
                      <input type="number" className="w-32 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" value={newDed.amount} onChange={e => setNewDed({ ...newDed, amount: e.target.value })} />
                    </div>
                    <button onClick={addDeduction} className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1"><MinusCircle size={14} /> Agregar</button>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-xl p-4 text-white flex items-center justify-between">
                  <span className="text-sm font-bold uppercase">Total Final</span>
                  <div className="text-right">
                    {finalPesos > 0 || finalDolares === 0 ? <p className="text-xl font-black tabular-nums">$ {formatMoney(finalPesos > 0 ? finalPesos : 0)}</p> : null}
                    {finalDolares > 0 ? <p className="text-xl font-black tabular-nums text-teal-400">U$D {formatMoney(finalDolares)}</p> : null}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-bold text-slate-700 text-sm">Resumen de Liquidaciones ({profsWithData.length} profesionales con movimientos)</h4>
            </div>
            {profsWithData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No se encontraron movimientos para el período seleccionado.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profsWithData.map(prof => {
                  const data = calcProfLiq(dateEntries, prof);
                  return (
                    <div key={prof} className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between">
                      <div>
                        <p className="font-bold text-slate-800 text-base mb-1">{prof}</p>
                        <p className="text-xs text-slate-500 mb-3">{data.rows.length} {data.rows.length === 1 ? 'cirugía registrada' : 'cirugías registradas'}</p>
                        <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-slate-100">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Liquidación ARS:</span>
                            <span className="font-bold text-emerald-700">$ {formatMoney(data.totalPesos)}</span>
                          </div>
                          {data.totalDolares > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Liquidación USD:</span>
                              <span className="font-bold text-blue-600">U$D {formatMoney(data.totalDolares)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200 flex gap-2">
                        <button
                          onClick={() => setSelectedProf(prof)}
                          className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all text-center shadow-sm"
                        >
                          Ver y Liquidar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowManualModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">Agregar Liquidación Manual</h3>
              <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha</label>
                <input type="date" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Paciente</label>
                <input list="manual-patients" type="text" placeholder="Buscar o escribir paciente..." className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={manualForm.patient} onChange={e => {
                  const val = e.target.value;
                  const found = dayPatients.find(p => p.name === val);
                  if (found) {
                    const amt = found.pesos > 0 ? found.pesos : (found.dolares > 0 ? found.dolares : '');
                    const curr = found.dolares > 0 ? 'USD' : 'ARS';
                    setManualForm({ ...manualForm, patient: val, totalPayment: amt, currency: curr });
                  } else {
                    setManualForm({ ...manualForm, patient: val });
                  }
                }} />
                <datalist id="manual-patients">
                  {dayPatients.map((p, i) => <option key={i} value={p.name} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Monto Total (ref)</label>
                  <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={manualForm.totalPayment} onChange={e => setManualForm({ ...manualForm, totalPayment: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Moneda</label>
                  <select className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={manualForm.currency} onChange={e => setManualForm({ ...manualForm, currency: e.target.value })}>
                    <option value="ARS">$</option>
                    <option value="USD">U$D</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={manualForm.inReceipt} onChange={e => setManualForm({ ...manualForm, inReceipt: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
                <span className="text-xs font-bold text-slate-500 uppercase">Incluir en recibo</span>
              </label>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-bold text-slate-500 uppercase">Distribución por Profesionales</p>
                  <button onClick={addManualProfRow} className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"><Plus size={12} /> Añadir</button>
                </div>
                <div className="space-y-2">
                  {manualForm.profs.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <select className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={item.prof} onChange={e => updateManualProfRow(idx, 'prof', e.target.value)}>
                          <option value="">Profesional...</option>
                          {availableProfs.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="w-28">
                        <input type="number" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Monto" value={item.amount} onChange={e => updateManualProfRow(idx, 'amount', e.target.value)} />
                      </div>
                      {manualForm.profs.length > 1 && (
                        <button onClick={() => removeManualProfRow(idx)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200">
              <button onClick={handleSaveManual} className="w-full py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-all shadow-md">Confirmar Liquidación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
