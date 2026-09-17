import React, { useState, useMemo, useEffect } from 'react';
import { History, ChevronLeft, ChevronRight, Printer, Edit2, Trash2, Save, X, TrendingUp, DollarSign, Download, Plus, User, Shield, Lock as LockIcon, MessageSquare } from 'lucide-react';
import { formatMoney, currencies, MoneyInput, PROF_KEY, DEFAULT_PROFESIONALES, normalizeDate } from './CajaView';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { SEED_DAILY_COMMENTS } from './data/seedData';
import apiService from './services/apiService';

export const exportCajaDayToExcel = async (selectedDate, dateEntries, dailyComment = '') => {
  if (!dateEntries || dateEntries.length === 0) {
    alert("No hay datos para exportar en esta fecha");
    return;
  }
  
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Caja', {
      pageSetup: { orientation: 'landscape', fitToPage: true, paperSize: 9 }
    });

    // Try to load COAT logo
    try {
      const res = await fetch('/coat_logo.png');
      if (res.ok) {
        const blob = await res.blob();
        const base64Logo = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const resStr = reader.result || '';
            resolve(resStr.includes(',') ? resStr.split(',')[1] : null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (base64Logo) {
          const imageId = wb.addImage({
            base64: base64Logo,
            extension: 'png',
          });
          ws.addImage(imageId, {
            tl: { col: 0.1, row: 0.1 },
            ext: { width: 140, height: 46 }
          });
        }
      }
    } catch (err) {
      console.warn("Logo could not be added to Excel:", err);
    }

    // Spacing rows for header
    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 10;

    // Row 4: Title & Date
    const normDate = normalizeDate(selectedDate);
    const dateFormatted = normDate.includes('-') ? normDate.split('-').reverse().join('/') : normDate;
    const row4 = ws.getRow(4);
    row4.getCell(1).value = 'Caja de cirugía';
    row4.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
    row4.getCell(2).value = dateFormatted;
    row4.getCell(2).font = { name: 'Calibri', size: 11, bold: true };
    row4.height = 20;

    // Row 5: Monto COAT super-header over columns 14 & 15 (Coat $, Coat USD)
    const row5 = ws.getRow(5);
    row5.getCell(14).value = 'Monto COAT';
    row5.getCell(14).font = { name: 'Calibri', size: 9, bold: true };
    row5.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells('N5:O5');
    row5.height = 16;

    // Row 6: Table Headers
    const headers = [
      'Paciente', 'DNI', 'Obra social', 'Prof. 1', 'Prof. 2', 'Prof. 3',
      'Pesos', 'Dolares', 'Liq. P1', 'Liq. P2', 'Liq. P3', 'Anest.', 'Liq. Anest.',
      'Coat $', 'Coat USD'
    ];
    const row6 = ws.getRow(6);
    row6.values = headers;
    row6.height = 22;
    row6.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10, bold: true };
      cell.alignment = { 
        horizontal: colNum >= 7 ? 'right' : (colNum === 2 || colNum === 3 ? 'center' : 'left'), 
        vertical: 'middle' 
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
        bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } }
      };
    });

    // Data rows
    let rowIndex = 7;
    let totalCoatARS = 0;
    let totalCoatUSD = 0;

    dateEntries.forEach(item => {
      const row = ws.getRow(rowIndex);
      const pPesos = parseFloat(item.pesos) || 0;
      const pDolares = parseFloat(item.dolares) || 0;
      const liq1 = parseFloat(item.liq_prof_1) || 0;
      const liq2 = parseFloat(item.liq_prof_2) || 0;
      const liq3 = parseFloat(item.liq_prof_3) || 0;
      const liqAn = parseFloat(item.liq_anestesista) || 0;
      const coatPesos = parseFloat(item.coat_pesos) || 0;
      const coatUSD = parseFloat(item.coat_dolares) || 0;

      totalCoatARS += coatPesos;
      totalCoatUSD += coatUSD;

      const liq1Str = liq1 > 0 ? `${item.liq_prof_1_currency === 'USD' ? 'USD ' : '$ '}${formatMoney(liq1)}` : (item.prof_1 ? '$ 0,00' : '');
      const liq2Str = liq2 > 0 ? `${item.liq_prof_2_currency === 'USD' ? 'USD ' : '$ '}${formatMoney(liq2)}` : (item.prof_2 ? '$ 0,00' : '');
      const liq3Str = liq3 > 0 ? `${item.liq_prof_3_currency === 'USD' ? 'USD ' : '$ '}${formatMoney(liq3)}` : (item.prof_3 ? '$ 0,00' : '');
      const liqAnStr = liqAn > 0 ? `${item.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(liqAn)}` : (item.anestesista ? '-' : '');

      row.values = [
        item.paciente || '',
        item.dni ? String(item.dni) : '',
        item.obra_social || '',
        item.prof_1 || '',
        item.prof_2 || '',
        item.prof_3 || '',
        formatMoney(pPesos),
        formatMoney(pDolares),
        liq1Str,
        liq2Str,
        liq3Str,
        item.anestesista || '',
        liqAnStr,
        formatMoney(coatPesos),
        formatMoney(coatUSD)
      ];

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Calibri', size: 9 };
        cell.alignment = { 
          horizontal: colNum >= 7 ? 'right' : (colNum === 2 || colNum === 3 ? 'center' : 'left'), 
          vertical: 'middle' 
        };
      });
      row.height = 18;
      rowIndex++;
    });

    // Totals Row
    const totalRow = ws.getRow(rowIndex + 1);
    totalRow.getCell(12).value = 'Total';
    totalRow.getCell(12).font = { name: 'Calibri', size: 10, bold: true };
    totalRow.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };

    totalRow.getCell(14).value = formatMoney(totalCoatARS);
    totalRow.getCell(14).font = { name: 'Calibri', size: 10, bold: true };
    totalRow.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(14).border = {
      top: { style: 'thin' },
      bottom: { style: 'double' }
    };

    totalRow.getCell(15).value = formatMoney(totalCoatUSD);
    totalRow.getCell(15).font = { name: 'Calibri', size: 10, bold: true };
    totalRow.getCell(15).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(15).border = {
      top: { style: 'thin' },
      bottom: { style: 'double' }
    };
    totalRow.height = 20;

    // Observations
    if (dailyComment && dailyComment.trim()) {
      const obsRow = ws.getRow(rowIndex + 3);
      obsRow.getCell(1).value = `Observaciones: ${dailyComment.trim()}`;
      obsRow.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } };
    }

    // Column Widths
    ws.columns = [
      { width: 26 }, // Paciente
      { width: 14 }, // DNI
      { width: 16 }, // Obra social
      { width: 18 }, // Prof. 1
      { width: 18 }, // Prof. 2
      { width: 18 }, // Prof. 3
      { width: 14 }, // Pesos
      { width: 12 }, // Dolares
      { width: 15 }, // Liq. P1
      { width: 15 }, // Liq. P2
      { width: 15 }, // Liq. P3
      { width: 18 }, // Anest.
      { width: 15 }, // Liq. Anest.
      { width: 14 }, // Coat $
      { width: 12 }  // Coat USD
    ];

    const buf = await wb.xlsx.writeBuffer();
    const fileDate = normDate.replace(/\//g, '-');
    saveAs(new Blob([buf]), `CAJA_CX_${fileDate}.xlsx`);
  } catch(e) { 
    console.error("Error exporting excel:", e);
    alert("Error al exportar Excel: " + e.message); 
  }
};

export const printCajaDay = (selectedDate, dateEntries, dailyComment = '', totals = null) => {
  if (!dateEntries || dateEntries.length === 0) {
    alert("No hay datos para imprimir en esta fecha");
    return;
  }

  const printWin = window.open('', '_blank', 'height=800,width=1100');
  if (!printWin) return;

  const normDate = normalizeDate(selectedDate);
  const dateFormatted = normDate.includes('-') ? normDate.split('-').reverse().join('/') : normDate;
  
  // Requirement: "Al imprimir o descargar pdf p3 no sale si no se carga algun profesional"
  const hasProf3 = dateEntries.some(h => (h.prof_3 && h.prof_3.trim() !== '') || (parseFloat(h.liq_prof_3) > 0));

  let calcTotals = totals;
  if (!calcTotals) {
    calcTotals = dateEntries.reduce((acc, h) => {
      acc.pesos = (acc.pesos || 0) + (parseFloat(h.pesos) || 0);
      acc.dolares = (acc.dolares || 0) + (parseFloat(h.dolares) || 0);
      acc.coat_pesos = (acc.coat_pesos || 0) + (parseFloat(h.coat_pesos) || 0);
      acc.coat_dolares = (acc.coat_dolares || 0) + (parseFloat(h.coat_dolares) || 0);
      return acc;
    }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 });
  }

  const rowsHtml = dateEntries.map(h => {
    const pPesos = parseFloat(h.pesos) || 0;
    const pDolares = parseFloat(h.dolares) || 0;
    const liq1 = parseFloat(h.liq_prof_1) || 0;
    const liq2 = parseFloat(h.liq_prof_2) || 0;
    const liq3 = parseFloat(h.liq_prof_3) || 0;
    const liqAn = parseFloat(h.liq_anestesista) || 0;
    const coatPesos = parseFloat(h.coat_pesos) || 0;
    const coatUSD = parseFloat(h.coat_dolares) || 0;

    const liq1Str = liq1 > 0 ? `${h.liq_prof_1_currency === 'USD' ? 'USD ' : '$ '}${formatMoney(liq1)}` : (h.prof_1 ? '$ 0,00' : '-');
    const liq2Str = liq2 > 0 ? `${h.liq_prof_2_currency === 'USD' ? 'USD ' : '$ '}${formatMoney(liq2)}` : (h.prof_2 ? '$ 0,00' : '-');
    const liq3Str = liq3 > 0 ? `${h.liq_prof_3_currency === 'USD' ? 'USD ' : '$ '}${formatMoney(liq3)}` : (h.prof_3 ? '$ 0,00' : '-');
    const liqAnStr = liqAn > 0 ? `${h.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(liqAn)}` : (h.anestesista ? '-' : '-');

    return `
      <tr>
        <td class="font-bold">${h.paciente || ''}</td>
        <td class="text-center">${h.dni || '-'}</td>
        <td class="text-center">${h.obra_social || '-'}</td>
        <td>${h.prof_1 || '-'}</td>
        <td>${h.prof_2 || '-'}</td>
        ${hasProf3 ? `<td>${h.prof_3 || '-'}</td>` : ''}
        <td class="text-right">${pPesos > 0 ? '$ ' + formatMoney(pPesos) : '-'}</td>
        <td class="text-right">${pDolares > 0 ? 'U$D ' + formatMoney(pDolares) : '-'}</td>
        <td class="text-right">${liq1Str}</td>
        <td class="text-right">${liq2Str}</td>
        ${hasProf3 ? `<td class="text-right">${liq3Str}</td>` : ''}
        <td>${h.anestesista || '-'}</td>
        <td class="text-right">${liqAnStr}</td>
        <td class="text-right font-bold text-orange">${coatPesos > 0 ? '$ ' + formatMoney(coatPesos) : '-'}</td>
        <td class="text-right font-bold text-blue">${coatUSD > 0 ? 'U$D ' + formatMoney(coatUSD) : '-'}</td>
      </tr>
    `;
  }).join('');

  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Caja de Cirugía - ${dateFormatted}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #1e293b; padding: 15px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px; }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .header-left img { height: 42px; width: auto; object-fit: contain; }
    .header-left h2 { font-size: 14pt; color: #0f172a; font-weight: 800; }
    .header-right { text-align: right; }
    .header-right .date { font-size: 12pt; font-weight: 700; color: #0284c7; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 8pt; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: middle; }
    th { background-color: #f1f5f9; font-weight: 700; color: #334155; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
    tr:nth-child(even) { background-color: #f8fafc; }
    
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .text-orange { color: #c2410c; }
    .text-blue { color: #0369a1; }
    
    .totals-box { margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5pt; }
    .totals-grid { display: flex; gap: 20px; }
    .total-item strong { color: #64748b; font-size: 7.5pt; text-transform: uppercase; display: block; }
    .total-item span { font-weight: 800; font-size: 10.5pt; }
    
    .obs-box { margin-top: 10px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; font-size: 8.5pt; color: #92400e; }
    
    @media print {
      @page { size: landscape; margin: 8mm; }
      body { padding: 0; }
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <img src="${window.location.origin}/coat_logo.png" onerror="this.style.display='none'" />
      <div>
        <h2>Caja de Cirugía</h2>
        <p style="font-size: 8pt; color: #64748b;">Centro Otológico de Alta Tecnología</p>
      </div>
    </div>
    <div class="header-right">
      <div class="date">${dateFormatted}</div>
      <div style="font-size: 8pt; color: #64748b;">${dateEntries.length} ${dateEntries.length === 1 ? 'registro' : 'registros'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Paciente</th>
        <th>DNI</th>
        <th>OS</th>
        <th>Prof. 1</th>
        <th>Prof. 2</th>
        ${hasProf3 ? '<th>Prof. 3</th>' : ''}
        <th class="text-right">Pesos</th>
        <th class="text-right">USD</th>
        <th class="text-right">Liq. P1</th>
        <th class="text-right">Liq. P2</th>
        ${hasProf3 ? '<th class="text-right">Liq. P3</th>' : ''}
        <th>Anest.</th>
        <th class="text-right">Liq. Anest.</th>
        <th class="text-right">COAT $</th>
        <th class="text-right">COAT USD</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr style="background: #e2e8f0; font-weight: bold;">
        <td colspan="${hasProf3 ? 13 : 11}" style="text-align: right; padding: 6px 8px; font-size: 8.5pt;">TOTAL COAT:</td>
        <td class="text-right text-orange" style="font-size: 9pt; font-weight: 800;">$ ${formatMoney(calcTotals.coat_pesos)}</td>
        <td class="text-right text-blue" style="font-size: 9pt; font-weight: 800;">${calcTotals.coat_dolares > 0 ? 'U$D ' + formatMoney(calcTotals.coat_dolares) : 'U$D 0,00'}</td>
      </tr>
    </tfoot>
  </table>

  ${dailyComment && dailyComment.trim() ? `
    <div class="obs-box">
      <strong>Observaciones del día:</strong> ${dailyComment.trim()}
    </div>
  ` : ''}

  <div class="totals-box">
    <div class="totals-grid">
      <div class="total-item">
        <strong>Total Recaudado ARS</strong>
        <span>$ ${formatMoney(calcTotals.pesos)}</span>
      </div>
      <div class="total-item">
        <strong>Total Recaudado USD</strong>
        <span>U$D ${formatMoney(calcTotals.dolares)}</span>
      </div>
      <div class="total-item">
        <strong>Retención COAT ARS</strong>
        <span class="text-orange">$ ${formatMoney(calcTotals.coat_pesos)}</span>
      </div>
      <div class="total-item">
        <strong>Retención COAT USD</strong>
        <span class="text-blue">U$D ${formatMoney(calcTotals.coat_dolares)}</span>
      </div>
    </div>
    <div style="font-size: 7.5pt; color: #94a3b8; text-align: right;">
      Emitido el ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>
</body>
</html>`);

  printWin.document.close();
  setTimeout(() => {
    printWin.print();
  }, 400);
};

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

  const [showRangeModal, setShowRangeModal] = useState(false);

  const handleExportExcel = () => {
    exportCajaDayToExcel(selectedDate, dateEntries, dailyComment);
  };

  const handlePrint = () => {
    printCajaDay(selectedDate, dateEntries, dailyComment, totals);
  };

  const handleExportRange = async () => {
    if (!rangeStart || !rangeEnd) return alert("Seleccione fecha de inicio y fin.");
    if (rangeStart > rangeEnd) return alert("La fecha de inicio debe ser anterior o igual a la fecha de fin.");
    
    const dates = [];
    let d = new Date(rangeStart + 'T00:00:00');
    const end = new Date(rangeEnd + 'T00:00:00');
    while (d <= end) { 
      dates.push(d.toISOString().split('T')[0]); 
      d.setDate(d.getDate() + 1); 
    }

    const availableDays = dates.filter(ds => history.some(h => normalizeDate(h.fecha) === ds));
    if (availableDays.length === 0) {
      return alert("No se encontraron registros de caja en el rango de fechas seleccionado.");
    }

    setIsExportingRange(true);
    try {
      const comments = JSON.parse(localStorage.getItem('daily_comments_proto') || '{}');
      let exportedCount = 0;
      for (const ds of availableDays) {
        const data = history.filter(h => normalizeDate(h.fecha) === ds);
        if (data.length === 0) continue;
        await exportCajaDayToExcel(ds, data, comments[ds] || '');
        exportedCount++;
        await new Promise(r => setTimeout(r, 350));
      }
      setShowRangeModal(false);
      alert(`¡Exportación finalizada! Se descargaron ${exportedCount} archivos Excel.`);
    } catch(e) { 
      alert("Error al exportar rango: " + e.message); 
    } finally { 
      setIsExportingRange(false); 
    }
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
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
        <div className="flex items-center gap-2">
          <History size={18} className="text-indigo-500" />
          <h3 className="font-bold text-slate-700">Historial de Caja</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleBackup} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-all"><Download size={14} /> Backup</button>
          
          <button onClick={() => setShowRangeModal(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:text-emerald-600 hover:border-emerald-200 transition-all" title="Exportar un Excel por cada día dentro de un rango">
            <Download size={14} className="text-emerald-600" /> Rango Fechas
          </button>

          {view === 'table' && (
            <>
              <button onClick={handleExportExcel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-all"><Download size={14} /> Excel</button>
              <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all"><Printer size={14} /> Imprimir</button>
              <button onClick={() => { if (!isAdmin) setShowPinModal(true); else setShowAddModal(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-blue-600 transition-all"><Plus size={14} /> Agregar</button>
            </>
          )}
          {view !== 'years' && (
            <button onClick={navigateBack} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"><ChevronLeft size={14} /> Volver</button>
          )}
        </div>
      </div>

      {/* RANGE EXPORT MODAL */}
      {showRangeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isExportingRange && setShowRangeModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Download size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Exportar Rango de Fechas</h3>
                  <p className="text-[11px] text-slate-500">Descarga un archivo Excel individual por cada día</p>
                </div>
              </div>
              <button onClick={() => !isExportingRange && setShowRangeModal(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha Desde</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={rangeStart}
                    onChange={e => setRangeStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha Hasta</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={rangeEnd}
                    onChange={e => setRangeEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <p className="font-bold text-slate-700">Formato del Excel:</p>
                <p>• Incluye logo institucional de COAT</p>
                <p>• Desglose completo de profesionales (Prof 1, 2, 3) y anestesia</p>
                <p>• Retenciones COAT ARS y USD con totales</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRangeModal(false)}
                  disabled={isExportingRange}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExportRange}
                  disabled={isExportingRange || !rangeStart || !rangeEnd}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Download size={14} />
                  <span>{isExportingRange ? 'Exportando...' : 'Descargar Excels'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
