import React, { useState, useEffect, useMemo } from 'react';
import { Briefcase, Award, Printer, Download, FileSpreadsheet } from 'lucide-react';
import { formatMoney } from '../CajaView';
import apiService from '../services/apiService';
import { getCanonicalProf, getShortProfHeader, isIgnoredProf } from '../utils/profUtils';

const saveAs = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function StaffLiquidacionesView({ history = [], professionals = [] }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [deductions, setDeductions] = useState([]);
  const [manualLiqs, setManualLiqs] = useState([]);

  useEffect(() => {
    const fetchDeductions = async () => {
      try {
        const fromDb = await apiService.getCollection('deducciones');
        if (fromDb && fromDb.length > 0) {
          setDeductions(fromDb);
        } else {
          const local = localStorage.getItem('deducciones_liquidacion');
          if (local) setDeductions(JSON.parse(local));
        }
      } catch (err) {
        const local = localStorage.getItem('deducciones_liquidacion');
        if (local) setDeductions(JSON.parse(local));
      }
    };
    fetchDeductions();

    try {
      const localManual = localStorage.getItem('liquidaciones_manuales');
      if (localManual) setManualLiqs(JSON.parse(localManual));
    } catch {}
  }, []);

  const shortProfName = (fullName) => getShortProfHeader(fullName);

  const matrixData = useMemo(() => {
    const monthStr = String(selectedMonth).padStart(2, '0');
    const startDateStr = `${selectedYear}-${monthStr}-01`;
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDateStr = `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const allEntries = [...(history || []), ...(manualLiqs || [])];
    const entries = allEntries.filter(e => e.fecha >= startDateStr && e.fecha <= endDateStr);

    const matrix = {};
    const activeProfs = new Set();
    const dates = new Set();

    const getDisplayName = (name) => getCanonicalProf(name, professionals);

    const processEntry = (date, name, amt, cur, isTransfer) => {
      if (!name || isNaN(Number(amt)) || Number(amt) <= 0 || isTransfer || isIgnoredProf(name)) return;
      const displayProf = getDisplayName(name);
      if (!displayProf || isIgnoredProf(displayProf)) return;
      activeProfs.add(displayProf);
      dates.add(date);
      if (!matrix[date]) matrix[date] = {};
      if (!matrix[date][displayProf]) matrix[date][displayProf] = { ARS: 0, USD: 0 };
      if (cur === 'USD') matrix[date][displayProf].USD += Number(amt);
      else matrix[date][displayProf].ARS += Number(amt);
    };

    entries.forEach(e => {
      const date = e.fecha;
      const isTransfer = e.isTransfer || false;
      if (e.prof_1) {
        processEntry(date, e.prof_1, e.liq_prof_1, e.liq_prof_1_currency, isTransfer);
        if (e.showSecondary_1) processEntry(date, e.prof_1, e.liq_prof_1_secondary, e.liq_prof_1_currency_secondary, isTransfer);
      }
      if (e.prof_2) {
        processEntry(date, e.prof_2, e.liq_prof_2, e.liq_prof_2_currency, isTransfer);
        if (e.showSecondary_2) processEntry(date, e.prof_2, e.liq_prof_2_secondary, e.liq_prof_2_currency_secondary, isTransfer);
      }
      if (e.prof_3) {
        processEntry(date, e.prof_3, e.liq_prof_3, e.liq_prof_3_currency, isTransfer);
        if (e.showSecondary_3) processEntry(date, e.prof_3, e.liq_prof_3_secondary, e.liq_prof_3_currency_secondary, isTransfer);
      }
      if (e.anestesista) {
        processEntry(date, e.anestesista, e.liq_anestesista, e.liq_anestesista_currency, isTransfer);
        if (e.showSecondaryAnes) processEntry(date, e.anestesista, e.liq_anestesista_secondary, e.liq_anestesista_currency_secondary, isTransfer);
      }
    });

    const filteredDeds = (deductions || []).filter(d => d.date >= startDateStr && d.date <= endDateStr && !isIgnoredProf(d.profesional));
    filteredDeds.forEach(d => {
      const date = d.date;
      const prof = getDisplayName(d.profesional);
      const amt = Math.abs(Number(d.amount || 0));
      const cur = d.currency || 'ARS';
      if (!prof || !amt || isIgnoredProf(prof)) return;
      if (!matrix[date]) matrix[date] = {};
      if (!matrix[date][prof]) matrix[date][prof] = { ARS: 0, USD: 0 };
      dates.add(date);
      activeProfs.add(prof);
      if (cur === 'USD') matrix[date][prof].USD -= amt;
      else matrix[date][prof].ARS -= amt;
    });

    if (activeProfs.size === 0) {
      return { dates: [], profs: [], matrix: {}, totals: {} };
    }

    const sortedProfs = Array.from(activeProfs).sort((a, b) => {
      const nameA = shortProfName(a);
      const nameB = shortProfName(b);
      return nameA.localeCompare(nameB);
    });
    const sortedDates = Array.from(dates).sort();
    
    const totals = {};
    sortedProfs.forEach(p => { totals[p] = { ARS: 0, USD: 0 }; });

    sortedDates.forEach(d => {
      sortedProfs.forEach(p => {
        const cell = matrix[d]?.[p];
        if (cell) {
          totals[p].ARS += cell.ARS || 0;
          totals[p].USD += cell.USD || 0;
        }
      });
    });

    return {
      dates: sortedDates,
      profs: sortedProfs,
      matrix,
      totals
    };
  }, [history, manualLiqs, deductions, selectedMonth, selectedYear, professionals]);

  const monthName = useMemo(() => {
    return new Date(selectedYear, selectedMonth - 1).toLocaleString('es-AR', { month: 'long' });
  }, [selectedMonth, selectedYear]);

  const handleExportExcel = async () => {
    if (!matrixData.profs.length) {
      alert('No hay movimientos registrados para este mes.');
      return;
    }
    try {
      const ExcelJS = (await import('exceljs')).default || await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Honorarios ${monthName.toUpperCase()}`);

      ws.mergeCells(1, 1, 1, matrixData.profs.length + 1);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = `HONORARIOS CX • ${monthName.toUpperCase()} ${selectedYear}`;
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 30;

      const headerRow = ws.getRow(3);
      headerRow.getCell(1).value = 'FECHA';
      headerRow.getCell(1).font = { bold: true, size: 10 };
      headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      headerRow.getCell(1).border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };

      matrixData.profs.forEach((p, i) => {
        const cell = headerRow.getCell(i + 2);
        cell.value = shortProfName(p);
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });
      headerRow.height = 24;

      let currentRow = 4;
      matrixData.dates.forEach(d => {
        const row = ws.getRow(currentRow);
        const [y, m, da] = d.split('-');
        const dateCell = row.getCell(1);
        dateCell.value = `${da}/${m}`;
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
        dateCell.font = { bold: true, size: 9 };
        dateCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        matrixData.profs.forEach((p, i) => {
          const cell = row.getCell(i + 2);
          const cellData = matrixData.matrix[d]?.[p];
          let val = '—';
          if (cellData) {
            const arr = [];
            if (cellData.ARS > 0) arr.push(`$ ${formatMoney(cellData.ARS)}`);
            if (cellData.USD > 0) arr.push(`U$S ${formatMoney(cellData.USD)}`);
            if (arr.length > 0) val = arr.join(' + ');
          }
          cell.value = val;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { size: 9 };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        row.height = 20;
        currentRow++;
      });

      const totArsRow = ws.getRow(currentRow);
      const labelArs = totArsRow.getCell(1);
      labelArs.value = 'TOTALES ARS';
      labelArs.font = { bold: true, size: 10 };
      labelArs.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      labelArs.alignment = { horizontal: 'center', vertical: 'middle' };
      labelArs.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

      matrixData.profs.forEach((p, i) => {
        const cell = totArsRow.getCell(i + 2);
        const tot = matrixData.totals[p]?.ARS || 0;
        cell.value = tot > 0 ? `$ ${formatMoney(tot)}` : '—';
        cell.font = { bold: true, size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      totArsRow.height = 22;
      currentRow++;

      const totUsdRow = ws.getRow(currentRow);
      const labelUsd = totUsdRow.getCell(1);
      labelUsd.value = 'TOTALES USD';
      labelUsd.font = { bold: true, size: 10 };
      labelUsd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      labelUsd.alignment = { horizontal: 'center', vertical: 'middle' };
      labelUsd.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };

      matrixData.profs.forEach((p, i) => {
        const cell = totUsdRow.getCell(i + 2);
        const tot = matrixData.totals[p]?.USD || 0;
        cell.value = tot > 0 ? `U$S ${formatMoney(tot)}` : '—';
        cell.font = { bold: true, size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
      });
      totUsdRow.height = 22;

      ws.getColumn(1).width = 16;
      matrixData.profs.forEach((_, i) => {
        ws.getColumn(i + 2).width = 18;
      });

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `HONORARIOS_STAFF_${monthName.toUpperCase()}_${selectedYear}.xlsx`);
    } catch (err) {
      console.error('Error al exportar Excel:', err);
      alert('Hubo un error al generar el archivo Excel.');
    }
  };

  const handlePrint = () => {
    if (!matrixData.profs.length) {
      alert('No hay movimientos registrados para imprimir.');
      return;
    }

    const printWin = window.open('', '_blank', 'height=850,width=1200');
    if (!printWin) return;

    const tableRows = matrixData.dates.map(date => {
      const formattedDate = date.split('-').reverse().slice(0, 2).join('/');
      const cells = matrixData.profs.map(prof => {
        const cell = matrixData.matrix[date]?.[prof];
        if (!cell) return '<td style="border:1px solid #000;padding:4px 6px;text-align:center;">—</td>';
        const parts = [];
        if (cell.ARS > 0) parts.push(`$ ${formatMoney(cell.ARS)}`);
        if (cell.USD > 0) parts.push(`<strong>U$S ${formatMoney(cell.USD)}</strong>`);
        return `<td style="border:1px solid #000;padding:4px 6px;text-align:center;font-size:10px;">${parts.join('<br>') || '—'}</td>`;
      }).join('');

      return `<tr><td style="border:1px solid #000;padding:4px 6px;text-align:center;font-weight:700;">${formattedDate}</td>${cells}</tr>`;
    }).join('');

    const totalsArsCells = matrixData.profs.map(prof => {
      const tot = matrixData.totals[prof]?.ARS || 0;
      return `<td style="border:1px solid #000;padding:6px 4px;text-align:center;font-weight:700;background:#f1f5f9;">${tot > 0 ? '$ ' + formatMoney(tot) : '—'}</td>`;
    }).join('');

    const totalsUsdCells = matrixData.profs.map(prof => {
      const tot = matrixData.totals[prof]?.USD || 0;
      return `<td style="border:1px solid #000;padding:6px 4px;text-align:center;font-weight:700;background:#f1f5f9;">${tot > 0 ? 'U$S ' + formatMoney(tot) : '—'}</td>`;
    }).join('');

    const profHeaders = matrixData.profs.map(p => {
      return `<th style="border:1px solid #000;padding:6px 4px;text-align:center;background:#f8fafc;font-size:10px;text-transform:uppercase;">${shortProfName(p)}</th>`;
    }).join('');

    printWin.document.write(`<!DOCTYPE html><html><head><title>HONORARIOS CX • ${monthName.toUpperCase()} ${selectedYear}</title><style>@page { size: landscape; margin: 8mm; } body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #000; font-size: 11px; } .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; } .header h1 { font-size: 16px; margin: 0; text-transform: uppercase; letter-spacing: 1px; } table { width: 100%; border-collapse: collapse; margin-top: 8px; } th, td { font-size: 10px; }</style></head><body><div class="header"><h1>HONORARIOS CX • ${monthName.toUpperCase()} ${selectedYear}</h1></div><table><thead><tr><th style="border:1px solid #000;padding:6px 8px;background:#f8fafc;width:70px;text-align:center;">FECHA</th>${profHeaders}</tr></thead><tbody>${tableRows}</tbody><tfoot><tr><td style="border:1px solid #000;padding:6px 4px;font-weight:700;background:#e2e8f0;text-align:center;">TOTALES ARS</td>${totalsArsCells}</tr><tr><td style="border:1px solid #000;padding:6px 4px;font-weight:700;background:#e2e8f0;text-align:center;">TOTALES USD</td>${totalsUsdCells}</tr></tfoot></table></body></html>`);

    printWin.document.close();
    setTimeout(() => {
      printWin.print();
    }, 400);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* HEADER CARD CON SELECTORES Y ACCIONES */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-teal-600 rounded-2xl shadow-lg shadow-teal-600/20 flex items-center justify-center text-white shrink-0">
            <Briefcase size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase leading-none mb-1.5">Staff Médico</h2>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 rounded-md text-[10px] font-black uppercase tracking-widest border border-teal-200">
                Control Operativo
              </span>
              <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs">
                <Award size={14} />
                <span>{matrixData.profs.length} Profesionales con liquidación</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 font-black text-xs uppercase tracking-widest shadow-sm cursor-pointer"
          >
            {[...Array(12)].map((_, i) => (
              <option key={i} value={i + 1}>
                {new Date(0, i).toLocaleString('es-AR', { month: 'long' })}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 font-black text-xs uppercase tracking-widest shadow-sm cursor-pointer"
          >
            {[2024, 2025, 2026, 2027, 2028].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div className="hidden md:block w-px h-7 bg-slate-200 mx-1"></div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="h-10 px-4 flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs transition-all border border-slate-200 shadow-sm active:scale-95 cursor-pointer"
              title="Imprimir o guardar como PDF"
            >
              <Printer size={16} />
              <span>Imprimir / PDF</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Download size={16} />
              <span>Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* TABLA MATRIZ DE HONORARIOS MENSUAL */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-teal-600" />
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">
              HONORARIOS CX • {monthName.toUpperCase()} {selectedYear}
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {matrixData.dates.length} días con actividad
          </span>
        </div>

        {matrixData.profs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No se registraron liquidaciones a profesionales en {monthName} de {selectedYear}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <th className="border-r border-slate-300 px-3 py-2.5 font-black uppercase text-center w-24">
                    FECHA
                  </th>
                  {matrixData.profs.map(prof => (
                    <th key={prof} className="border-r border-slate-300 px-3 py-2.5 font-black uppercase text-center whitespace-nowrap">
                      {shortProfName(prof)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {matrixData.dates.map(date => {
                  const [y, m, da] = date.split('-');
                  return (
                    <tr key={date} className="hover:bg-teal-50/40 transition-colors">
                      <td className="border-r border-slate-200 px-3 py-2 font-bold text-slate-700 text-center bg-slate-50/50">
                        {da}/{m}
                      </td>
                      {matrixData.profs.map(prof => {
                        const cell = matrixData.matrix[date]?.[prof];
                        return (
                          <td key={prof} className="border-r border-slate-200 px-3 py-2 text-center whitespace-nowrap">
                            {cell ? (
                              <div className="flex flex-col items-center justify-center leading-tight">
                                {cell.ARS > 0 && (
                                  <span className="font-medium text-slate-800">
                                    ${formatMoney(cell.ARS)}
                                  </span>
                                )}
                                {cell.USD > 0 && (
                                  <span className="font-bold text-blue-700">
                                    U$S {formatMoney(cell.USD)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 border-t-2 border-slate-400 font-bold">
                  <td className="border-r border-slate-300 px-3 py-2.5 font-black uppercase text-center text-slate-800">
                    TOTALES ARS
                  </td>
                  {matrixData.profs.map(prof => {
                    const tot = matrixData.totals[prof]?.ARS || 0;
                    return (
                      <td key={prof} className="border-r border-slate-300 px-3 py-2.5 text-center font-black text-slate-900 whitespace-nowrap">
                        {tot > 0 ? `$ ${formatMoney(tot)}` : '—'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-slate-200 border-t border-slate-300 font-bold">
                  <td className="border-r border-slate-300 px-3 py-2.5 font-black uppercase text-center text-slate-800">
                    TOTALES USD
                  </td>
                  {matrixData.profs.map(prof => {
                    const tot = matrixData.totals[prof]?.USD || 0;
                    return (
                      <td key={prof} className="border-r border-slate-300 px-3 py-2.5 text-center font-black text-blue-800 whitespace-nowrap">
                        {tot > 0 ? `U$S ${formatMoney(tot)}` : '—'}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}