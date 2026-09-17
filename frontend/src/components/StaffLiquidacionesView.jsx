import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Award, Printer, Download, Mail, RefreshCw, Calendar } from 'lucide-react';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { apiService } from '../services/apiService';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext';

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function StaffLiquidacionesView() {
    const { currentUser, viewingUid, catalogOwnerUid } = useAuth();

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loading, setLoading] = useState(false);
    const [matrixData, setMatrixData] = useState(null);
    const [profesionales, setProfesionales] = useState([]);
    const [filterByUser, setFilterByUser] = useState(false);

    // Helpers
    const formatMoney = (val) => {
        if (!val || isNaN(val)) return '0,00';
        return Number(val).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const shortProfName = (fullName) => {
        if (!fullName) return '';
        const parts = fullName.trim().split(' ');
        const prefixes = ['dr', 'dra', 'lic', 'dr.', 'dra.', 'lic.'];
        if (parts.length >= 2 && prefixes.includes(parts[0].toLowerCase())) {
            return `${parts[0].toUpperCase()} ${parts[1].toUpperCase()}`;
        }
        return parts.slice(0, 2).join(' ').toUpperCase();
    };

    // Fetch professionals
    const fetchProfs = async () => {
        try {
            const profs = await apiService.getCollection('profesionales');
            profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProfesionales(profs);
            return profs;
        } catch (error) {
            console.error('Error fetching professionals:', error);
            return [];
        }
    };

    // Calculate matrix data
    const loadMatrixData = async () => {
        setLoading(true);
        try {
            const profsList = profesionales.length > 0 ? profesionales : await fetchProfs();

            const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
            const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
            const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            // 1. Fetch Caja Entries
            const allEntries = await apiService.getCollection('caja');
            let entries = allEntries.filter(e => e.fecha >= startDateStr && e.fecha <= endDateStr);

            if (filterByUser && currentUser?.email) {
                entries = entries.filter(item => {
                    if (item.isManualLiquidation && !item.createdBy) return true;
                    return item.createdBy === currentUser.email;
                });
            }

            // 2. Build Category Map
            const profNameToCategory = {};
            profsList.forEach(p => {
                profNameToCategory[p.nombre] = p.categoria;
            });

            const isExcluded = (name) => {
                if (!name) return true;
                const cat = profNameToCategory[name];
                return cat === 'Tutoras' || cat === 'Tutoria' || name === 'Tutoria' || name === 'Tutoras';
            };

            const matrix = {}; // { "YYYY-MM-DD": { "Prof Name": { ARS: 0, USD: 0 } } }
            const activeProfs = new Set();
            const dates = new Set();

            const processLiquidation = (date, profName, amt, cur) => {
                if (!profName || !amt || isExcluded(profName)) return;
                const numAmt = parseFloat(amt) || 0;
                if (numAmt === 0) return;

                activeProfs.add(profName);
                dates.add(date);

                if (!matrix[date]) matrix[date] = {};
                if (!matrix[date][profName]) matrix[date][profName] = { ARS: 0, USD: 0 };

                if (cur === 'USD') {
                    matrix[date][profName].USD += numAmt;
                } else {
                    matrix[date][profName].ARS += numAmt;
                }
            };

            entries.forEach(e => {
                const date = e.fecha;
                if (!date) return;

                // Prof 1
                if (e.prof_1) {
                    processLiquidation(date, e.prof_1, e.liq_prof_1, e.liq_prof_1_currency);
                    processLiquidation(date, e.prof_1, e.liq_prof_1_secondary, e.liq_prof_1_currency_secondary);
                    if (e.liq_prof_1_ars > 0 && !e.liq_prof_1) processLiquidation(date, e.prof_1, e.liq_prof_1_ars, 'ARS');
                    if (e.liq_prof_1_usd > 0 && !e.liq_prof_1) processLiquidation(date, e.prof_1, e.liq_prof_1_usd, 'USD');
                }

                // Prof 2
                if (e.prof_2) {
                    processLiquidation(date, e.prof_2, e.liq_prof_2, e.liq_prof_2_currency);
                    processLiquidation(date, e.prof_2, e.liq_prof_2_secondary, e.liq_prof_2_currency_secondary);
                    if (e.liq_prof_2_ars > 0 && !e.liq_prof_2) processLiquidation(date, e.prof_2, e.liq_prof_2_ars, 'ARS');
                    if (e.liq_prof_2_usd > 0 && !e.liq_prof_2) processLiquidation(date, e.prof_2, e.liq_prof_2_usd, 'USD');
                }

                // Prof 3
                if (e.prof_3) {
                    processLiquidation(date, e.prof_3, e.liq_prof_3, e.liq_prof_3_currency);
                    processLiquidation(date, e.prof_3, e.liq_prof_3_secondary, e.liq_prof_3_currency_secondary);
                    if (e.liq_prof_3_ars > 0 && !e.liq_prof_3) processLiquidation(date, e.prof_3, e.liq_prof_3_ars, 'ARS');
                    if (e.liq_prof_3_usd > 0 && !e.liq_prof_3) processLiquidation(date, e.prof_3, e.liq_prof_3_usd, 'USD');
                }

                // Anestesista
                if (e.anestesista) {
                    processLiquidation(date, e.anestesista, e.liq_anestesista, e.liq_anestesista_currency);
                    processLiquidation(date, e.anestesista, e.liq_anestesista_secondary, e.liq_anestesista_currency_secondary);
                    if (e.liq_anestesista_ars > 0 && !e.liq_anestesista) processLiquidation(date, e.anestesista, e.liq_anestesista_ars, 'ARS');
                    if (e.liq_anestesista_usd > 0 && !e.liq_anestesista) processLiquidation(date, e.anestesista, e.liq_anestesista_usd, 'USD');
                }
            });

            // 3. Subtract Deductions
            const monthlyDeductions = await apiService.getCollection('deducciones');
            const filteredDeductions = monthlyDeductions.filter(d => d.date >= startDateStr && d.date <= endDateStr);

            filteredDeductions.forEach(d => {
                const date = d.date;
                const prof = d.profesional;
                if (!prof || isExcluded(prof)) return;

                const amt = Math.abs(parseFloat(d.amount || 0));
                const cur = d.currency || 'ARS';

                if (!matrix[date]) matrix[date] = {};
                if (!matrix[date][prof]) matrix[date][prof] = { ARS: 0, USD: 0 };

                dates.add(date);
                activeProfs.add(prof);

                if (cur === 'USD') {
                    matrix[date][prof].USD -= amt;
                } else {
                    matrix[date][prof].ARS -= amt;
                }
            });

            const sortedProfs = Array.from(activeProfs).sort((a, b) => a.localeCompare(b));
            const sortedDates = Array.from(dates).sort();

            const totals = {};
            sortedProfs.forEach(p => {
                totals[p] = { ARS: 0, USD: 0 };
            });

            sortedDates.forEach(d => {
                sortedProfs.forEach(p => {
                    const cell = matrix[d]?.[p];
                    if (cell) {
                        totals[p].ARS += cell.ARS || 0;
                        totals[p].USD += cell.USD || 0;
                    }
                });
            });

            setMatrixData({
                dates: sortedDates,
                profs: sortedProfs,
                matrix,
                totals,
                monthName: MONTH_NAMES[selectedMonth - 1] || '',
                year: selectedYear
            });
        } catch (error) {
            console.error('Error loading matrix data:', error);
            setMatrixData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMatrixData();
    }, [selectedMonth, selectedYear, filterByUser, viewingUid, catalogOwnerUid]);

    // Handle Excel Export matching user reference
    const handleDownloadExcel = async () => {
        if (!matrixData || matrixData.profs.length === 0) {
            alert('No hay datos para exportar en este período.');
            return;
        }

        try {
            const ExcelJS = (await import('exceljs')).default || await import('exceljs');
            const wb = new ExcelJS.Workbook();
            wb.creator = 'COAT';
            wb.created = new Date();

            const ws = wb.addWorksheet('Honorarios CX', {
                pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
            });

            const { dates, profs, matrix, totals, monthName, year } = matrixData;
            const totalCols = profs.length + 1;

            // Title Row
            ws.mergeCells(1, 1, 1, totalCols);
            const titleCell = ws.getCell(1, 1);
            titleCell.value = `HONORARIOS CX • ${monthName.toUpperCase()} ${year}`;
            titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF000000' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(1).height = 30;

            // Header Style
            const headerFill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF1F5F9' }
            };
            const thinBorder = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };

            // Headers (Row 3)
            ws.getRow(2).height = 10; // spacing row
            const headerRow = ws.getRow(3);
            headerRow.height = 24;

            headerRow.getCell(1).value = 'FECHA';
            headerRow.getCell(1).font = { name: 'Arial', size: 10, bold: true };
            headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            headerRow.getCell(1).fill = headerFill;
            headerRow.getCell(1).border = thinBorder;

            profs.forEach((p, idx) => {
                const cell = headerRow.getCell(idx + 2);
                cell.value = shortProfName(p);
                cell.font = { name: 'Arial', size: 10, bold: true };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = headerFill;
                cell.border = thinBorder;
            });

            // Data Rows
            let currentRowIdx = 4;
            dates.forEach(d => {
                const row = ws.getRow(currentRowIdx);
                row.height = 20;

                const [y, m, da] = d.split('-');
                row.getCell(1).value = `${da}/${m}`;
                row.getCell(1).font = { name: 'Arial', size: 9, bold: true };
                row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(1).border = thinBorder;

                profs.forEach((p, idx) => {
                    const cell = row.getCell(idx + 2);
                    const cellData = matrix[d]?.[p];
                    let val = '—';

                    if (cellData) {
                        const parts = [];
                        if (cellData.ARS > 0) parts.push(`$${cellData.ARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
                        if (cellData.USD > 0) parts.push(`U$S ${cellData.USD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
                        if (parts.length > 0) val = parts.join(' / ');
                    }

                    cell.value = val;
                    cell.font = { name: 'Arial', size: 9 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = thinBorder;
                });

                currentRowIdx++;
            });

            // Footer Rows: TOTALES ARS & TOTALES USD
            const footerFill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE2E8F0' }
            };

            // Totales ARS
            const rowTotARS = ws.getRow(currentRowIdx);
            rowTotARS.height = 22;
            rowTotARS.getCell(1).value = 'TOTALES ARS';
            rowTotARS.getCell(1).font = { name: 'Arial', size: 9, bold: true };
            rowTotARS.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            rowTotARS.getCell(1).fill = footerFill;
            rowTotARS.getCell(1).border = thinBorder;

            profs.forEach((p, idx) => {
                const cell = rowTotARS.getCell(idx + 2);
                const totARS = totals[p]?.ARS || 0;
                cell.value = totARS > 0 ? `$ ${totARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-';
                cell.font = { name: 'Arial', size: 9, bold: true };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = footerFill;
                cell.border = thinBorder;
            });
            currentRowIdx++;

            // Totales USD
            const rowTotUSD = ws.getRow(currentRowIdx);
            rowTotUSD.height = 22;
            rowTotUSD.getCell(1).value = 'TOTALES USD';
            rowTotUSD.getCell(1).font = { name: 'Arial', size: 9, bold: true };
            rowTotUSD.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            rowTotUSD.getCell(1).fill = footerFill;
            rowTotUSD.getCell(1).border = thinBorder;

            profs.forEach((p, idx) => {
                const cell = rowTotUSD.getCell(idx + 2);
                const totUSD = totals[p]?.USD || 0;
                cell.value = totUSD > 0 ? `U$S ${totUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-';
                cell.font = { name: 'Arial', size: 9, bold: true };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = footerFill;
                cell.border = thinBorder;
            });

            // Column Widths
            ws.getColumn(1).width = 10;
            for (let i = 2; i <= totalCols; i++) {
                ws.getColumn(i).width = 18;
            }

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `HONORARIOS_CX_${monthName.toUpperCase()}_${year}.xlsx`);
        } catch (error) {
            console.error('Error exporting Excel:', error);
            alert('Error al generar Excel: ' + error.message);
        }
    };

    // Handle Print / PDF View
    const handlePrintMatrix = () => {
        if (!matrixData || matrixData.profs.length === 0) {
            alert('No hay datos para imprimir en este período.');
            return;
        }
        window.print();
    };

    // Handle Send Email
    const handleSendEmail = async () => {
        if (!matrixData || matrixData.profs.length === 0) {
            alert('No hay datos para enviar.');
            return;
        }

        try {
            const emailDoc = await getDoc(doc(db, 'settings', 'notifications'));
            if (!emailDoc.exists() || !emailDoc.data().scriptUrl) {
                alert('No hay script de correo configurado en Sistema.');
                return;
            }

            const { emails, scriptUrl } = emailDoc.data();
            const { dates, profs, matrix, monthName, year } = matrixData;

            let tableHtml = `<table border="1" cellpadding="4" style="border-collapse: collapse; font-family: sans-serif; font-size: 12px;">`;
            tableHtml += `<tr style="background:#f1f5f9;"><th>FECHA</th>`;
            profs.forEach(p => tableHtml += `<th>${shortProfName(p)}</th>`);
            tableHtml += `</tr>`;

            dates.forEach(d => {
                const [y, m, da] = d.split('-');
                tableHtml += `<tr><td style="text-align:center;font-weight:bold;">${da}/${m}</td>`;
                profs.forEach(p => {
                    const cell = matrix[d]?.[p];
                    let val = '—';
                    if (cell) {
                        const parts = [];
                        if (cell.ARS > 0) parts.push(`$${cell.ARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
                        if (cell.USD > 0) parts.push(`USD ${cell.USD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
                        if (parts.length > 0) val = parts.join(' / ');
                    }
                    tableHtml += `<td style="text-align:center;">${val}</td>`;
                });
                tableHtml += `</tr>`;
            });
            tableHtml += `</table>`;

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    to: emails,
                    subject: `HONORARIOS CX • ${monthName.toUpperCase()} ${year}`,
                    body: tableHtml
                })
            });

            alert('Reporte de correo enviado correctamente.');
        } catch (error) {
            console.error('Error sending email:', error);
            alert('Error al enviar reporte: ' + error.message);
        }
    };

    const printStyle = `
        @media print {
            @page { size: landscape; margin: 6mm; }
            .no-print { display: none !important; }
            #root { display: none !important; }
            .print-portal-matrix {
                display: block !important;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                background: white !important;
                color: black !important;
                font-family: Arial, sans-serif !important;
            }
            .print-portal-matrix * {
                color: black !important;
                border-color: black !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            body { background: white !important; color: black !important; margin: 0 !important; }
        }
        .print-portal-matrix { display: none; }
    `;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <style>{printStyle}</style>

            {/* Top Control Card - Exact style from image 2 */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-6 no-print">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-teal-500 rounded-2xl shadow-lg shadow-teal-500/20 flex items-center justify-center text-white shrink-0">
                        <Briefcase size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase leading-none mb-2">
                            Staff Médico
                        </h2>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="px-3 py-1 bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-teal-100 dark:border-teal-500/20">
                                Control Operativo
                            </span>
                            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-xs">
                                <Award size={14} />
                                <span>{profesionales.length} Profesionales activos</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-white/5 p-2.5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-inner">
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                        className="bg-white dark:bg-slate-800 border-none text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 font-black text-xs uppercase tracking-widest shadow-sm cursor-pointer"
                    >
                        {MONTH_NAMES.map((name, i) => (
                            <option key={i} value={i + 1}>{name.toUpperCase()}</option>
                        ))}
                    </select>

                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="bg-white dark:bg-slate-800 border-none text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 font-black text-xs uppercase tracking-widest shadow-sm cursor-pointer"
                    >
                        {[2024, 2025, 2026, 2027, 2028].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    <div className="hidden md:block w-px h-6 bg-slate-200 dark:bg-white/10 mx-1"></div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrintMatrix}
                            title="Imprimir / Guardar PDF"
                            className="w-11 h-11 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-xl transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
                        >
                            <Printer size={18} />
                        </button>

                        <button
                            onClick={handleDownloadExcel}
                            className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 hover:scale-105 active:scale-95 cursor-pointer"
                        >
                            <Download size={16} />
                            <span>Excel</span>
                        </button>

                        <button
                            onClick={handleSendEmail}
                            className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 hover:scale-105 active:scale-95 cursor-pointer"
                        >
                            <Mail size={16} />
                            <span>Reporte Mail</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Matrix Table Preview on Screen */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-6 no-print overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                        <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                            HONORARIOS CX • {MONTH_NAMES[selectedMonth - 1]?.toUpperCase()} {selectedYear}
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            Matriz general consolidada de liquidaciones por profesional
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-500 dark:text-slate-400">
                            <input
                                type="checkbox"
                                checked={filterByUser}
                                onChange={(e) => setFilterByUser(e.target.checked)}
                                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500/20 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer"
                            />
                            <span>Mis registros únicamente</span>
                        </label>

                        <button
                            onClick={loadMatrixData}
                            disabled={loading}
                            className="p-2 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Actualizar datos"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
                        <div className="w-8 h-8 border-4 border-teal-200 dark:border-teal-900/30 border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-xs font-bold uppercase tracking-widest">Calculando matriz mensual...</p>
                    </div>
                ) : !matrixData || matrixData.profs.length === 0 ? (
                    <div className="py-20 text-center text-slate-400 dark:text-slate-500 space-y-2">
                        <Calendar size={48} className="mx-auto opacity-30 mb-2" />
                        <p className="text-base font-bold">No se encontraron liquidaciones para {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</p>
                        <p className="text-xs">Pruebe seleccionando otro mes o año en el selector superior.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-xs text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 uppercase text-[11px] font-black tracking-wider border-b border-slate-200 dark:border-slate-700">
                                    <th className="px-4 py-3.5 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 text-center min-w-[90px]">
                                        FECHA
                                    </th>
                                    {matrixData.profs.map(prof => (
                                        <th key={prof} className="px-4 py-3.5 border-r border-slate-200 dark:border-slate-700 text-center whitespace-nowrap min-w-[130px]">
                                            {shortProfName(prof)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                                {matrixData.dates.map(date => {
                                    const [y, m, da] = date.split('-');
                                    return (
                                        <tr key={date} className="hover:bg-teal-50/20 dark:hover:bg-teal-900/10 transition-colors">
                                            <td className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-white dark:bg-slate-900 z-10 text-center font-bold text-slate-700 dark:text-slate-300">
                                                {da}/{m}
                                            </td>
                                            {matrixData.profs.map(prof => {
                                                const cell = matrixData.matrix[date]?.[prof];
                                                return (
                                                    <td key={prof} className="px-3 py-2 border-r border-slate-100 dark:border-slate-800 text-center">
                                                        {cell ? (
                                                            <div className="flex flex-col gap-0.5 leading-tight">
                                                                {cell.ARS > 0 && (
                                                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                                                        ${formatMoney(cell.ARS)}
                                                                    </span>
                                                                )}
                                                                {cell.USD > 0 && (
                                                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                                        U$S {formatMoney(cell.USD)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 font-mono">—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {/* TOTALES ARS */}
                                <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                                    <td className="px-4 py-3 border-r border-slate-300 dark:border-slate-600 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 text-center font-black text-slate-900 dark:text-white uppercase text-[11px]">
                                        TOTALES ARS
                                    </td>
                                    {matrixData.profs.map(prof => (
                                        <td key={prof} className="px-3 py-3 border-r border-slate-200 dark:border-slate-700 text-center font-black text-slate-900 dark:text-white">
                                            {matrixData.totals[prof]?.ARS > 0 ? (
                                                `$ ${formatMoney(matrixData.totals[prof].ARS)}`
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                    ))}
                                </tr>
                                {/* TOTALES USD */}
                                <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700">
                                    <td className="px-4 py-3 border-r border-slate-300 dark:border-slate-600 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 text-center font-black text-slate-900 dark:text-white uppercase text-[11px]">
                                        TOTALES USD
                                    </td>
                                    {matrixData.profs.map(prof => (
                                        <td key={prof} className="px-3 py-3 border-r border-slate-200 dark:border-slate-700 text-center font-black text-emerald-600 dark:text-emerald-400">
                                            {matrixData.totals[prof]?.USD > 0 ? (
                                                `U$S ${formatMoney(matrixData.totals[prof].USD)}`
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* PRINT / PDF PORTAL - Exact layout from user image 1 */}
            {matrixData && createPortal(
                <div className="print-portal-matrix bg-white text-black p-4">
                    <div className="w-full">
                        <h1 className="text-center font-black text-base md:text-lg mb-3 uppercase tracking-wider border-b-2 border-black pb-1">
                            HONORARIOS CX • {matrixData.monthName.toUpperCase()} {matrixData.year}
                        </h1>

                        <table className="w-full text-[9px] border-collapse border border-black">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-black px-1.5 py-1 text-center font-bold uppercase w-16">FECHA</th>
                                    {matrixData.profs.map(p => (
                                        <th key={p} className="border border-black px-1 py-1 text-center font-bold uppercase">
                                            {shortProfName(p)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {matrixData.dates.map(date => {
                                    const [y, m, da] = date.split('-');
                                    return (
                                        <tr key={date}>
                                            <td className="border border-black px-1 py-0.5 text-center font-bold">
                                                {da}/{m}
                                            </td>
                                            {matrixData.profs.map(prof => {
                                                const cell = matrixData.matrix[date]?.[prof];
                                                return (
                                                    <td key={prof} className="border border-black px-1 py-0.5 text-center">
                                                        {cell ? (
                                                            <div className="flex flex-col text-[8.5px] leading-tight font-medium">
                                                                {cell.ARS > 0 && <span>${formatMoney(cell.ARS)}</span>}
                                                                {cell.USD > 0 && <span className="font-bold">U$S {formatMoney(cell.USD)}</span>}
                                                            </div>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td className="border border-black px-1.5 py-1 font-black bg-slate-200 text-center uppercase text-[9px]">
                                        TOTALES ARS
                                    </td>
                                    {matrixData.profs.map(prof => (
                                        <td key={prof} className="border border-black px-1 py-1 text-center font-bold bg-slate-100">
                                            {matrixData.totals[prof]?.ARS > 0 ? `$ ${formatMoney(matrixData.totals[prof].ARS)}` : '-'}
                                        </td>
                                    ))}
                                </tr>
                                <tr>
                                    <td className="border border-black px-1.5 py-1 font-black bg-slate-200 text-center uppercase text-[9px]">
                                        TOTALES USD
                                    </td>
                                    {matrixData.profs.map(prof => (
                                        <td key={prof} className="border border-black px-1 py-1 text-center font-bold bg-slate-100">
                                            {matrixData.totals[prof]?.USD > 0 ? `U$S ${formatMoney(matrixData.totals[prof].USD)}` : '-'}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
