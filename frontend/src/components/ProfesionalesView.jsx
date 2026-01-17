import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Tag, Lock, Download, Printer, X, FileText } from 'lucide-react';
import API_URL from '../config';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const ProfesionalesView = () => {
    const [profesionales, setProfesionales] = useState([]);
    const [nombre, setNombre] = useState('');
    const [categoria, setCategoria] = useState('ORL');

    // Report State
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [showMatrixModal, setShowMatrixModal] = useState(false);
    const [matrixData, setMatrixData] = useState(null); // { dates: [], profs: [], matrix: {}, totals: {} }

    // Security State
    const [isAdmin, setIsAdmin] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');

    const handleUnlock = async () => {
        try {
            const res = await fetch(`${API_URL}/config/pin`);
            const data = await res.json();
            if (pinInput === data.pin) {
                setIsAdmin(true);
                setShowPinModal(false);
                setPinInput('');
            } else {
                alert("PIN Incorrecto");
                setPinInput('');
            }
        } catch (error) {
            console.error(error);
            alert("Error al verificar PIN");
        }
    };

    const fetchProfs = async () => {
        try {
            const response = await fetch(`${API_URL}/profesionales`);
            const result = await response.json();
            setProfesionales(result);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!nombre) return;
        try {
            const response = await fetch(`${API_URL}/profesionales`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, categoria })
            });
            if (response.ok) {
                setNombre('');
                fetchProfs();
                alert("Profesional agregado correctamente");
            } else {
                const err = await response.json();
                alert("Error al agregar profesional: " + (err.message || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error adding professional:", error);
            alert("Error de conexión al agregar profesional");
        }
    };

    useEffect(() => {
        fetchProfs();
    }, []);

    const handleDelete = async (id, nombre) => {
        if (!window.confirm(`¿Estás seguro de eliminar a ${nombre}?`)) return;
        try {
            const response = await fetch(`${API_URL}/profesionales/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchProfs();
                alert("Profesional eliminado");
            } else {
                alert("Error al eliminar");
            }
        } catch (error) {
            console.error("Error deleting professional:", error);
            alert("Error de conexión");
        }
    };

    // --- REPORT LOGIC ---

    const fetchMatrixData = async () => {
        // Calculate start and end date of the month
        const start = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        // End date: get last day of month
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const end = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;

        const response = await fetch(`${API_URL}/caja?start_date=${start}&end_date=${end}&include_manual=true`);
        if (!response.ok) throw new Error("Error obteniendo datos");
        const entries = await response.json();

        // Process Data
        const matrix = {};
        const activeProfs = new Set();
        const dates = new Set();

        entries.forEach(e => {
            const date = e.fecha;
            dates.add(date);
            if (!matrix[date]) matrix[date] = {};

            const processLiquidation = (profName, liqAmount, liqCurr) => {
                if (!profName || !liqAmount) return;
                activeProfs.add(profName);
                if (!matrix[date][profName]) matrix[date][profName] = { ARS: 0, USD: 0 };

                if (liqCurr === 'USD') matrix[date][profName].USD += liqAmount;
                else matrix[date][profName].ARS += liqAmount;
            };

            if (e.prof_1) processLiquidation(e.prof_1, e.liq_prof_1, e.liq_prof_1_currency);
            if (e.prof_2) processLiquidation(e.prof_2, e.liq_prof_2, e.liq_prof_2_currency);
            if (e.anestesista) processLiquidation(e.anestesista, e.liq_anestesista, e.liq_anestesista_currency);
        });

        if (activeProfs.size === 0) return null;

        const sortedProfs = Array.from(activeProfs).sort();
        const sortedDates = Array.from(dates).sort();

        // Filter out 'Tutoras' from Matrix Report
        const profNameToCategory = {};
        profesionales.forEach(p => profNameToCategory[p.nombre] = p.categoria);
        const filteredReportProfs = sortedProfs.filter(name => profNameToCategory[name] !== 'Tutoras');

        // Totals
        const totals = {};
        filteredReportProfs.forEach(p => totals[p] = { ARS: 0, USD: 0 });

        sortedDates.forEach(d => {
            filteredReportProfs.forEach(p => {
                const cell = matrix[d][p];
                if (cell) {
                    totals[p].ARS += cell.ARS;
                    totals[p].USD += cell.USD;
                }
            });
        });

        return { dates: sortedDates, profs: filteredReportProfs, matrix, totals };
    };

    const handleGeneralExcel = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return alert("No hay liquidaciones en el mes seleccionado.");
            const { dates, profs, matrix, totals } = data;

            // Create Excel
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Honorarios');

            // Styles
            const headerStyle = {
                font: { bold: true, name: 'Arial', size: 10 },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
            };

            // Title
            ws.mergeCells(1, 1, 1, profs.length + 1);
            ws.getCell(1, 1).value = `HONORARIOS CX - ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
            ws.getCell(1, 1).font = { bold: true, size: 14 };
            ws.getCell(1, 1).alignment = { horizontal: 'center' };

            // Headers
            ws.getCell(2, 1).value = "FECHA";
            ws.getCell(2, 1).style = headerStyle;
            profs.forEach((p, i) => {
                const c = ws.getCell(2, i + 2);
                c.value = p;
                c.style = headerStyle;
            });

            // Rows
            let currentRow = 3;
            dates.forEach(d => {
                const row = ws.getRow(currentRow);
                const [y, m, da] = d.split('-');
                row.getCell(1).value = `${da}/${m}/${y.slice(2)}`;
                row.getCell(1).style = { ...headerStyle, font: { ...headerStyle.font, bold: false } };

                profs.forEach((p, i) => {
                    const cell = matrix[d][p];
                    let val = "";
                    if (cell) {
                        if (cell.ARS > 0) val += `$${cell.ARS.toLocaleString('es-AR')}`;
                        if (cell.USD > 0) val += (val ? " + " : "") + `USD ${cell.USD.toLocaleString('es-AR')}`;
                    }
                    const c = row.getCell(i + 2);
                    c.value = val;
                    c.alignment = { horizontal: 'center' };
                    c.border = headerStyle.border;
                });
                currentRow++;
            });

            // Footers
            const rowPesos = ws.getRow(currentRow);
            rowPesos.getCell(1).value = "Pesos";
            rowPesos.getCell(1).style = headerStyle;

            const rowDolares = ws.getRow(currentRow + 1);
            rowDolares.getCell(1).value = "Dólares";
            rowDolares.getCell(1).style = headerStyle;

            profs.forEach((p, i) => {
                const t = totals[p];
                const cA = rowPesos.getCell(i + 2);
                cA.value = t.ARS > 0 ? `$${t.ARS.toLocaleString('es-AR')}` : "";
                cA.style = headerStyle;

                const cD = rowDolares.getCell(i + 2);
                cD.value = t.USD > 0 ? `$${t.USD.toLocaleString('es-AR')}` : "";
                cD.style = headerStyle;
            });

            // Auto Width
            ws.columns.forEach(column => {
                let max = 0;
                column.eachCell({ includeEmpty: true }, c => {
                    const l = c.value ? c.value.toString().length : 10;
                    if (l > max) max = l;
                });
                column.width = max < 12 ? 12 : max + 2;
            });

            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Honorarios_${selectedMonth}_${selectedYear}.xlsx`);

        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        }
    };

    const handlePrintMatrix = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return alert("No hay datos para imprimir.");
            setMatrixData(data);
            setShowMatrixModal(true);
        } catch (error) {
            alert("Error: " + error.message);
        }
    };

    const formatMoney = (val) => val ? val.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '0';

    return (
        <div className="space-y-6">
            {/* Reports Section */}
            <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg border border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <FileText size={24} className="text-emerald-400" />
                            Reporte Mensual de Honorarios
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">Genera la planilla general de liquidaciones por mes.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-slate-700/50 p-2 rounded-xl border border-slate-600">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('es-AR', { month: 'long' }).toUpperCase()}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                        >
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        <div className="w-px h-8 bg-slate-600 mx-2"></div>

                        <button onClick={handleGeneralExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-all shadow-lg shadow-emerald-900/20">
                            <Download size={18} /> Excel
                        </button>
                        <button onClick={handlePrintMatrix} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-all shadow-lg shadow-indigo-900/20">
                            <Printer size={18} /> Imprimir
                        </button>
                    </div>
                </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <UserPlus className="text-blue-600" size={24} />
                        Agregar Nuevo Profesional
                    </div>

                    {isAdmin ? (
                        <button onClick={() => setIsAdmin(false)} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-all font-bold text-sm">
                            <Lock size={16} /> Bloquear Admin
                        </button>
                    ) : (
                        <button onClick={() => setShowPinModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl border border-slate-200 font-bold text-sm hover:bg-slate-200 transition-colors">
                            <Lock size={16} /> Modo Admin
                        </button>
                    )}
                </h2>
                <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nombre Completo</label>
                        <input
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Ej: Dra. García"
                        />
                    </div>
                    <div className="w-48">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Categoría</label>
                        <select
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value)}
                        >
                            <option value="ORL">ORL</option>
                            <option value="Anestesista">Anestesista</option>
                            <option value="Estetica">Estética</option>
                            <option value="Tutoras">Tutoras</option>
                        </select>
                    </div>
                    <button type="submit" className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                        Guardar
                    </button>
                </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profesionales.map(prof => (
                    <div key={prof.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center group hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-blue-600">
                                <Tag size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900">{prof.nombre}</h3>
                                <p className="text-sm text-slate-400 font-medium">{prof.categoria}</p>
                            </div>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => handleDelete(prof.id, prof.nombre)}
                                className="text-slate-300 hover:text-red-500 transition-colors group-hover:opacity-100"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* PIN MODAL */}
            {showPinModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-4 text-center">Ingrese PIN de Admin</h3>
                        <input
                            type="password"
                            className="w-full text-center text-2xl tracking-widest font-bold py-3 border-2 border-slate-200 rounded-xl mb-6 focus:border-blue-500 focus:outline-none"
                            placeholder="****"
                            maxLength={4}
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowPinModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                            <button onClick={handleUnlock} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200">Desbloquear</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MATRIX PRINT MODAL */}
            {showMatrixModal && matrixData && (
                <div className="fixed inset-0 bg-white z-[100] overflow-auto">
                    <div className="p-8 print:p-0">
                        {/* Header Controls (No Print) */}
                        <div className="flex justify-between items-center mb-8 no-print border-b pb-4">
                            <h2 className="text-2xl font-bold">Vista Previa de Impresión</h2>
                            <div className="flex gap-4">
                                <button onClick={() => window.print()} className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800">
                                    <Printer size={20} /> Imprimir Ahora
                                </button>
                                <button onClick={() => setShowMatrixModal(false)} className="flex items-center gap-2 px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">
                                    <X size={20} /> Cerrar
                                </button>
                            </div>
                        </div>

                        {/* PRINT CONTENT */}
                        <div className="max-w-fit mx-auto print:w-full print:mx-0">
                            <h1 className="text-center font-bold text-2xl mb-6 uppercase border-b-2 border-black pb-2">
                                Honorarios CX - {new Date(selectedYear, selectedMonth - 1).toLocaleString('es-AR', { month: 'long' }).toUpperCase()} {selectedYear}
                            </h1>

                            <table className="w-full text-sm border-collapse border border-black">
                                <thead>
                                    <tr>
                                        <th className="border border-black px-2 py-2 bg-slate-100">FECHA</th>
                                        {matrixData.profs.map(p => (
                                            <th key={p} className="border border-black px-2 py-2 bg-slate-100">{p}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.dates.map(date => (
                                        <tr key={date}>
                                            <td className="border border-black px-2 py-1 text-center font-bold">
                                                {date.split('-').reverse().slice(0, 2).join('/')}
                                            </td>
                                            {matrixData.profs.map(prof => {
                                                const cell = matrixData.matrix[date][prof];
                                                return (
                                                    <td key={prof} className="border border-black px-2 py-1 text-center">
                                                        {cell ? (
                                                            <div className="flex flex-col text-xs">
                                                                {cell.ARS > 0 && <span>${formatMoney(cell.ARS)}</span>}
                                                                {cell.USD > 0 && <span className="font-bold">USD {formatMoney(cell.USD)}</span>}
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-black">
                                        <td className="border border-black px-2 py-2 font-bold bg-slate-200">PESOS</td>
                                        {matrixData.profs.map(prof => (
                                            <td key={prof} className="border border-black px-2 py-2 text-center font-bold bg-slate-100">
                                                {matrixData.totals[prof].ARS > 0 ? `$${formatMoney(matrixData.totals[prof].ARS)}` : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="border border-black px-2 py-2 font-bold bg-slate-200">DÓLARES</td>
                                        {matrixData.profs.map(prof => (
                                            <td key={prof} className="border border-black px-2 py-2 text-center font-bold bg-slate-100">
                                                {matrixData.totals[prof].USD > 0 ? `USD ${formatMoney(matrixData.totals[prof].USD)}` : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <style>{`
                            @media print {
                                @page { size: landscape; margin: 0.5cm; }
                                .no-print { display: none !important; }
                                body { background: white; }
                            }
                        `}</style>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfesionalesView;
