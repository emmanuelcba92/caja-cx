import React, { useState, useEffect } from 'react';
import { Search, Edit, Edit2, Trash2, Check, X, Calendar, DollarSign, User, Folder, ChevronRight, Home, ArrowLeft, FileText, Printer, Settings, Lock } from 'lucide-react';
import API_URL from '../config';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Helper to format month names
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const HistorialCaja = () => {
    // Force Landscape for this view
    const printStyle = `
      @media print {
      }
    `;

    // Helper for Currency
    const formatMoney = (val) => {
        return (parseFloat(val) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const [history, setHistory] = useState([]);
    const [profesionales, setProfesionales] = useState([]);

    // Navigation State
    const [view, setView] = useState('years'); // 'years', 'months', 'days', 'table'
    const [selectedYear, setSelectedYear] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);

    // Edit/Table State
    const [editId, setEditId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // Security & Admin
    const [isAdmin, setIsAdmin] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [newPin, setNewPin] = useState('');

    // Daily Comment for Export
    const [dailyComment, setDailyComment] = useState('');

    // --- ADD NEW ENTRY STATE ---
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEntry, setNewEntry] = useState({});

    const handleCreateEntry = async () => {
        if (!newEntry.paciente || !selectedDate) {
            return alert("Complete al menos el nombre del paciente.");
        }

        const payload = {
            entries: [{
                ...newEntry,
                fecha: selectedDate, // Force date to current view

                // Defaults if empty
                pesos: parseFloat(newEntry.pesos) || 0,
                dolares: parseFloat(newEntry.dolares) || 0,
                liq_prof_1: parseFloat(newEntry.liq_prof_1) || 0,
                liq_prof_2: parseFloat(newEntry.liq_prof_2) || 0,
                liq_anestesista: parseFloat(newEntry.liq_anestesista) || 0,
                coat_pesos: parseFloat(newEntry.coat_pesos) || 0,
                coat_dolares: parseFloat(newEntry.coat_dolares) || 0,
            }]
        };

        try {
            const response = await fetch(`${API_URL}/guardar-caja`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                alert("Paciente agregado correctamente");
                setShowAddModal(false);
                setNewEntry({});
                fetchHistory(); // Refresh list
            } else {
                alert("Error al guardar");
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión");
        }
    };

    const fetchHistory = async () => {
        try {
            const response = await fetch(`${API_URL}/caja`);
            const data = await response.json();
            if (Array.isArray(data)) {
                setHistory(data);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
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

    useEffect(() => {
        fetchHistory();
        fetchProfs();
    }, []);

    // Fetch daily comment when a date is selected
    useEffect(() => {
        if (selectedDate) {
            fetch(`${API_URL}/daily-comment/${selectedDate}`)
                .then(res => res.json())
                .then(data => setDailyComment(data.comment || ''))
                .catch(err => console.error("Error fetching comment", err));
        }
    }, [selectedDate]);

    // --- Data Processing for Hierarchy ---
    const getYears = () => {
        const years = [...new Set(history.map(item => item.fecha.split('-')[0]))];
        return years.sort().reverse();
    };

    const getMonths = (year) => {
        const months = [...new Set(history
            .filter(item => item.fecha.startsWith(year))
            .map(item => parseInt(item.fecha.split('-')[1]) - 1)
        )];
        return months.sort((a, b) => a - b);
    };

    const getDays = (year, month) => {
        // month is 0-indexed integer here
        const monthStr = (month + 1).toString().padStart(2, '0');
        const prefix = `${year}-${monthStr}`;
        const days = [...new Set(history
            .filter(item => item.fecha.startsWith(prefix))
            .map(item => item.fecha)
        )];
        return days.sort().reverse();
    };

    // --- Navigation Handlers ---
    const handleYearClick = (year) => {
        setSelectedYear(year);
        setView('months');
    };

    const handleMonthClick = (month) => {
        setSelectedMonth(month);
        setView('days');
    };

    const handleDayClick = (date) => {
        setSelectedDate(date);
        setView('table');
    };

    const navigateHome = () => {
        setView('years');
        setSelectedYear(null);
        setSelectedMonth(null);
        setSelectedDate(null);
    };

    const navigateUp = () => {
        if (view === 'table') setView('days');
        else if (view === 'days') setView('months');
        else if (view === 'months') setView('years');
    };

    // --- Security & Config ---
    const handleUnlock = async () => {
        try {
            const res = await fetch(`${API_URL}/config/pin`);
            const data = await res.json();
            const correctPin = data.pin;

            if (pinInput === correctPin) {
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

    const updatePin = async () => {
        if (newPin.length < 4) return alert("El PIN debe tener al menos 4 caracteres");
        try {
            const res = await fetch(`${API_URL}/config/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: newPin })
            });
            if (res.ok) {
                alert("PIN actualizado");
                setShowConfigModal(false);
                setNewPin('');
            }
        } catch (error) {
            console.error(error);
        }
    };

    // --- Daily Comment Logic ---
    const fetchDailyComment = async (date) => {
        try {
            const res = await fetch(`${API_URL}/daily-comment/${date}`);
            const data = await res.json();
            setDailyComment(data.comment || '');
        } catch (error) {
            console.error("Error fetching comment", error);
            setDailyComment('');
        }
    };

    const saveDailyComment = async () => {
        if (!selectedDate) return;
        try {
            const res = await fetch(`${API_URL}/daily-comment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: selectedDate, comment: dailyComment })
            });
            if (res.ok) {
                setIsEditingComment(false);
            } else {
                alert("Error al guardar comentario");
            }
        } catch (error) {
            console.error(error);
        }
    };

    // --- State for Comment Edit ---
    const [isEditingComment, setIsEditingComment] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    useEffect(() => {
        if (selectedDate) {
            fetchDailyComment(selectedDate);
        } else {
            setDailyComment('');
        }
    }, [selectedDate]);

    const handleLock = () => {
        setIsAdmin(false);
        setEditId(null);
    };

    // --- Table Actions ---
    const handleEditClick = (item) => {
        // console.log("Editing:", item); 
        if (!item.id) {
            alert("Error: Este registro no tiene ID válido. Recarga la página.");
            return;
        }
        setEditId(item.id);
        setEditFormData({ ...item });
    };

    const handleCancelEdit = () => {
        setEditId(null);
        setEditFormData({});
    };

    const handleChange = (field, value) => {
        setEditFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleCurrencyToggle = (field) => {
        setEditFormData(prev => ({
            ...prev,
            [field]: prev[field] === 'ARS' ? 'USD' : 'ARS'
        }));
    };

    const handleSave = async () => {
        try {
            const response = await fetch(`${API_URL}/caja/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            });
            if (response.ok) {
                setEditId(null);
                fetchHistory();
                alert("Entrada actualizada");
            } else {
                alert("Error al actualizar");
            }
        } catch (error) {
            console.error("Error updating:", error);
            alert("Error de conexión");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta entrada?")) return;
        try {
            const response = await fetch(`${API_URL}/caja/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchHistory();
                alert("Entrada eliminada");
            } else {
                alert("Error al eliminar");
            }
        } catch (error) {
            console.error("Error deleting:", error);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // --- EXCEL EXPORT ---
    const handleExportExcel = async () => {
        const dataToExport = history.filter(item => item.fecha === selectedDate);
        if (dataToExport.length === 0) return alert("No hay datos para exportar");

        const workbook = new ExcelJS.Workbook();

        // Helper to load image
        const loadImage = async (url) => {
            const response = await fetch(url);
            const blob = await response.blob();
            return blob.arrayBuffer();
        };

        // Styles
        const titleStyle = { font: { name: 'Arial', size: 14, bold: true }, alignment: { vertical: 'middle', horizontal: 'left' } };
        const headerStyle = { font: { name: 'Arial', size: 10, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border: { bottom: { style: 'thin' } } };
        const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // --- 1. MAIN SHEET (CAJA) ---
        const worksheet = workbook.addWorksheet('Caja');

        // Logo & Title Logic (Reusable)
        const addHeaderToSheet = async (ws, titlePrefix) => {
            try {
                const logoBuffer = await loadImage('/coat_logo.png');
                const logoId = workbook.addImage({
                    buffer: logoBuffer,
                    extension: 'png',
                });
                ws.addImage(logoId, {
                    tl: { col: 0, row: 0 },
                    ext: { width: 180, height: 60 }
                });
            } catch (e) {
                console.error("Could not load logo", e);
                ws.mergeCells('A1:C3');
                const logoCell = ws.getCell('A1');
                logoCell.value = 'COAT\nCENTRO OTORRINOLARINGOLÓGICO';
                logoCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
            }

            ws.getCell('A5').value = titlePrefix;
            ws.getCell('A5').font = { bold: true };
            ws.getCell('B5').value = selectedDate.split('-').reverse().join('/');
        };

        await addHeaderToSheet(worksheet, 'Caja de cirugía');

        // Headers
        worksheet.getRow(7).values = ['Paciente', 'DNI', 'Obra social', 'Profesional', 'Pesos', 'Dolares', 'Recibo', 'Liquidación Prof 1', 'Liquidacion prof 2', 'Anestesista', 'Pesos', 'Dólares'];

        // Merge Headers for Monto COAT
        worksheet.mergeCells('K6:L6');
        worksheet.getCell('K6').value = 'Monto COAT';
        worksheet.getCell('K6').alignment = { horizontal: 'center' };
        worksheet.getCell('K6').font = { bold: true };

        // Apply styles
        worksheet.getRow(7).eachCell((cell) => {
            cell.font = headerStyle.font;
            cell.alignment = headerStyle.alignment;
            cell.border = headerStyle.border;
        });

        // Data Rows
        let rowIndex = 8;
        let totalCoatPesos = 0;
        let totalCoatDolares = 0;

        dataToExport.forEach(item => {
            const row = worksheet.getRow(rowIndex);
            row.values = [
                item.paciente,
                item.dni,
                item.obra_social,
                `${item.prof_1 || ''} / ${item.prof_2 || ''}`,
                item.pesos,
                item.dolares,
                '',
                item.liq_prof_1,
                item.liq_prof_2,
                item.anestesista || '',
                item.coat_pesos,
                item.coat_dolares
            ];

            // Formatting
            [5, 6, 8, 9, 11, 12].forEach(col => row.getCell(col).numFmt = '#,##0.00');

            totalCoatPesos += item.coat_pesos || 0;
            totalCoatDolares += item.coat_dolares || 0;
            rowIndex++;
        });

        // Totals
        const totalRow = worksheet.getRow(rowIndex + 2);
        totalRow.getCell(10).value = 'Total';
        totalRow.getCell(10).font = { bold: true };
        totalRow.getCell(11).value = totalCoatPesos;
        totalRow.getCell(11).numFmt = '#,##0.00'; // Format money default
        totalRow.getCell(11).font = { bold: true, underline: true };
        totalRow.getCell(12).value = totalCoatDolares;
        totalRow.getCell(12).numFmt = '#,##0.00';
        totalRow.getCell(12).font = { bold: true, underline: true };

        // Global Comment
        const commentRowIndex = Math.max(18, rowIndex + 5);
        worksheet.mergeCells(`A${commentRowIndex}:E${commentRowIndex}`);
        const commentCell = worksheet.getCell(`A${commentRowIndex}`);
        commentCell.value = dailyComment || '';
        commentCell.font = { italic: true, color: { argb: 'FF666666' } };

        // Widths
        worksheet.columns = [
            { width: 20 }, { width: 15 }, { width: 20 }, { width: 30 },
            { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 },
            { width: 15 }, { width: 20 }, { width: 15 }, { width: 15 }
        ];

        // --- 2. INDIVIDUAL SHEETS (LIQUIDATIONS) ---
        const profs = new Set();
        dataToExport.forEach(item => {
            if (item.prof_1) profs.add(item.prof_1);
            if (item.prof_2) profs.add(item.prof_2);
            if (item.anestesista) profs.add(item.anestesista);
        });

        for (const prof of profs) {
            const sheetName = `Liq ${prof}`.substring(0, 31).replace(/[\\/?*[\]]/g, ''); // Sanitize
            const ps = workbook.addWorksheet(sheetName);
            await addHeaderToSheet(ps, `Liquidación: ${prof}`);

            // Headers
            ps.getRow(7).values = ['Paciente', 'DNI', 'Obra Social', 'Cobro Pesos', 'Cobro USD', 'Liquidación'];

            ps.getRow(7).eachCell((cell) => {
                cell.font = headerStyle.font;
                cell.alignment = headerStyle.alignment;
                cell.border = headerStyle.border;
            });

            let pRowIdx = 8;
            let totalLiqPesos = 0;
            let totalLiqDolares = 0;

            // Filter rows for this prof
            const profRows = dataToExport.filter(item =>
                item.prof_1 === prof || item.prof_2 === prof || item.anestesista === prof
            );

            profRows.forEach(item => {
                // Determine Liq Amount & Currency
                let liqAmount = 0;
                let liqCurrency = 'ARS'; // Default or assumption

                if (item.prof_1 === prof) {
                    liqAmount = item.liq_prof_1;
                    liqCurrency = item.liq_prof_1_currency || 'ARS';
                } else if (item.prof_2 === prof) {
                    liqAmount = item.liq_prof_2;
                    liqCurrency = item.liq_prof_2_currency || 'ARS';
                } else if (item.anestesista === prof) {
                    liqAmount = item.liq_anestesista;
                    liqCurrency = item.liq_anestesista_currency || 'ARS';
                }

                if (liqCurrency === 'USD') totalLiqDolares += (parseFloat(liqAmount) || 0);
                else totalLiqPesos += (parseFloat(liqAmount) || 0);

                const prow = ps.getRow(pRowIdx);
                prow.values = [
                    item.paciente,
                    item.dni,
                    item.obra_social,
                    item.pesos,
                    item.dolares,
                    `${liqCurrency === 'USD' ? 'USD' : '$'} ${formatMoney(liqAmount)}`
                ];

                prow.getCell(4).numFmt = '#,##0.00';
                prow.getCell(5).numFmt = '#,##0.00';
                prow.getCell(6).font = { bold: true };

                // Borders
                for (let i = 1; i <= 6; i++) prow.getCell(i).border = borderStyle;

                pRowIdx++;
            });

            // Totals
            const pTotalRow = ps.getRow(pRowIdx + 1);
            pTotalRow.getCell(5).value = 'Total Liquidación:';
            pTotalRow.getCell(5).font = { bold: true };
            pTotalRow.getCell(5).alignment = { horizontal: 'right' };

            const totalText = [];
            if (totalLiqPesos > 0) totalText.push(`$${formatMoney(totalLiqPesos)}`);
            if (totalLiqDolares > 0) totalText.push(`USD ${formatMoney(totalLiqDolares)}`);

            pTotalRow.getCell(6).value = totalText.join(' + ');
            pTotalRow.getCell(6).font = { bold: true, size: 12 };
            pTotalRow.getCell(6).alignment = { horizontal: 'right' };

            // Widths
            ps.columns = [
                { width: 25 }, { width: 15 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 25 }
            ];
        }

        // Save
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Caja_${selectedDate}_Completa.xlsx`);
    };

    const anestesistas = profesionales.filter(p => p.categoria === 'Anestesista');
    const tableData = selectedDate ? history.filter(item => item.fecha === selectedDate) : [];

    const handleDeleteDay = async () => {
        if (!selectedDate) return;
        if (!window.confirm(`ATENCIÓN: ¿Estás seguro de que quieres ELIMINAR TODOS los registros del día ${selectedDate}?\n\nEsta acción no se puede deshacer.`)) return;

        // Double confirmation for safety
        if (!window.confirm("¿De verdad? Se borrará toda la caja de ese día.")) return;

        try {
            const response = await fetch(`${API_URL}/caja/dia/${selectedDate}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert("Día eliminado correctamente.");
                setSelectedDate(null);
                setView('months');
                fetchHistory();
            } else {
                alert("Error al eliminar el día.");
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión");
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            {/* PIN MODAL */}
            {showPinModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm no-print">
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

            {/* CONFIG MODAL */}
            {showConfigModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm no-print">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-4 text-center">Configurar PIN</h3>
                        <p className="text-sm text-center text-slate-500 mb-4">Ingrese el nuevo PIN de seguridad</p>
                        <input
                            type="text"
                            className="w-full text-center text-2xl tracking-widest font-bold py-3 border-2 border-slate-200 rounded-xl mb-6 focus:border-blue-500 focus:outline-none"
                            placeholder="Nuevo PIN"
                            maxLength={8}
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowConfigModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                            <button onClick={updatePin} className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200">Guardar PIN</button>
                        </div>
                    </div>
                </div>
            )}

            {/* PRINT ONLY LAYOUT */}
            <div className="hidden print:block p-8 bg-white text-black">
                <div className="flex justify-between items-start mb-6 border-b border-black pb-4">
                    <img src="/coat_logo.png" alt="COAT" className="h-16 object-contain" />
                    <div className="text-right">
                        <h1 className="text-2xl font-bold uppercase">Caja de Cirugía</h1>
                        <p className="text-lg font-bold">{selectedDate ? selectedDate.split('-').reverse().join('/') : ''}</p>
                    </div>
                </div>

                {selectedDate && dailyComment && (
                    <div className="mb-4 p-2 border border-black rounded text-sm italic">
                        <strong>Comentario del día:</strong> {dailyComment}
                    </div>
                )}

                <table className="w-full text-xs border-collapse border border-black">
                    <thead>
                        <tr className="bg-slate-100">
                            <th className="border border-black px-2 py-1 text-center font-bold">Paciente</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">DNI</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Obra Social</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Profesional</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Pesos</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Dólares</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Recibo</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Liq. P1</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Liq. P2</th>
                            <th className="border border-black px-2 py-1 text-center font-bold">Anest.</th>
                            <th className="border border-black px-2 py-1 text-center font-bold bg-slate-200" colSpan="2">Monto COAT</th>
                        </tr>
                        <tr className="bg-slate-100">
                            <th className="border border-black px-1" colSpan="10"></th>
                            <th className="border border-black px-2 py-1 text-center font-bold bg-slate-200">Pesos</th>
                            <th className="border border-black px-2 py-1 text-center font-bold bg-slate-200">Dólares</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((item, idx) => (
                            <tr key={idx} className="border-b border-black">
                                <td className="border border-black px-2 py-1">{item.paciente}</td>
                                <td className="border border-black px-2 py-1">{item.dni}</td>
                                <td className="border border-black px-2 py-1">{item.obra_social}</td>
                                <td className="border border-black px-2 py-1">{`${item.prof_1 || ''} / ${item.prof_2 || ''}`}</td>
                                <td className="border border-black px-2 py-1 text-right">${formatMoney(item.pesos)}</td>
                                <td className="border border-black px-2 py-1 text-right">USD {formatMoney(item.dolares)}</td>
                                <td className="border border-black px-2 py-1"></td>
                                <td className="border border-black px-2 py-1 text-right">{formatMoney(item.liq_prof_1)}</td>
                                <td className="border border-black px-2 py-1 text-right">{formatMoney(item.liq_prof_2)}</td>
                                <td className="border border-black px-2 py-1">{item.anestesista}</td>
                                <td className="border border-black px-2 py-1 text-right font-bold">{formatMoney(item.coat_pesos)}</td>
                                <td className="border border-black px-2 py-1 text-right font-bold">{formatMoney(item.coat_dolares)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-800 text-white font-bold">
                            <td colSpan="10" className="border border-black px-2 py-2 text-right uppercase">Total Coat</td>
                            <td className="border border-black px-2 py-2 text-right">
                                ${formatMoney(tableData.reduce((acc, curr) => acc + (parseFloat(curr.coat_pesos) || 0), 0))}
                            </td>
                            <td className="border border-black px-2 py-2 text-right">
                                USD {formatMoney(tableData.reduce((acc, curr) => acc + (parseFloat(curr.coat_dolares) || 0), 0))}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* HEADER */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 no-print">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
                        <Calendar size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Registro de Cajas</h1>
                        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium mt-1">
                            <button onClick={navigateHome} className="hover:text-blue-600 flex items-center gap-1">
                                <Home size={14} /> Inicio
                            </button>
                            {selectedYear && (
                                <>
                                    <ChevronRight size={14} />
                                    <span onClick={() => { setView('months'); setSelectedDate(null); }} className="hover:text-blue-600 cursor-pointer">{selectedYear}</span>
                                </>
                            )}
                            {selectedMonth !== null && (
                                <>
                                    <ChevronRight size={14} />
                                    <span onClick={() => { setView('days'); setSelectedDate(null); }} className="hover:text-blue-600 cursor-pointer">{MONTH_NAMES[selectedMonth]}</span>
                                </>
                            )}
                            {selectedDate && (
                                <>
                                    <ChevronRight size={14} />
                                    <span className="text-slate-800 font-bold">{selectedDate}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {view === 'table' && (
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2 mr-4 border-r border-slate-200 pr-4">
                            <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-bold shadow-lg shadow-slate-200">
                                <Printer size={16} /> Imprimir
                            </button>
                            <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-bold border border-green-200">
                                <DollarSign size={16} /> Excel COAT
                            </button>
                        </div>

                        {isAdmin ? (
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200">
                                    <User size={16} /> Agregar Paciente
                                </button>
                                <button onClick={handleDeleteDay} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all font-bold shadow-lg shadow-red-200">
                                    <Trash2 size={16} /> Eliminar Día
                                </button>
                                <button onClick={() => isAdmin ? setIsAdmin(false) : setShowPinModal(true)} className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all ${isAdmin ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                    {isAdmin ? <><Lock size={16} /> Bloquear Edición</> : <><Lock size={16} /> Admin</>}
                                </button>
                                {isAdmin && (
                                    <button onClick={() => setShowConfigModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-bold shadow-lg shadow-slate-200">
                                        <Settings size={16} /> Cambiar PIN
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button onClick={() => setShowPinModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl border border-slate-200 font-bold text-sm hover:bg-slate-200 transition-colors">
                                <Lock size={16} /> Modo Admin
                            </button>
                        )}

                        <button onClick={navigateUp} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                    </div>
                )}
            </div>


            {/* ADD PATIENT MODAL */}
            {
                showAddModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm no-print overflow-y-auto">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                                <h3 className="text-xl font-bold text-slate-900">Agregar Nuevo Paciente</h3>
                                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Paciente</label>
                                    <input className="w-full p-2 border rounded-lg" value={newEntry.paciente || ''} onChange={(e) => setNewEntry({ ...newEntry, paciente: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">DNI</label>
                                    <input className="w-full p-2 border rounded-lg" value={newEntry.dni || ''} onChange={(e) => setNewEntry({ ...newEntry, dni: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Obra Social</label>
                                    <input className="w-full p-2 border rounded-lg" value={newEntry.obra_social || ''} onChange={(e) => setNewEntry({ ...newEntry, obra_social: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">Fecha</label>
                                    <input type="date" disabled className="w-full p-2 border rounded-lg bg-slate-100 text-slate-500" value={selectedDate} />
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <h4 className="font-bold text-sm text-slate-900 border-b pb-1">Profesionales</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Prof. 1</label>
                                        <select className="w-full p-2 border rounded-lg" value={newEntry.prof_1 || ''} onChange={(e) => setNewEntry({ ...newEntry, prof_1: e.target.value })}>
                                            <option value="">Seleccionar</option>
                                            {profesionales.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Prof. 2</label>
                                        <select className="w-full p-2 border rounded-lg" value={newEntry.prof_2 || ''} onChange={(e) => setNewEntry({ ...newEntry, prof_2: e.target.value })}>
                                            <option value="">Seleccionar</option>
                                            {profesionales.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Anestesista</label>
                                        <select className="w-full p-2 border rounded-lg" value={newEntry.anestesista || ''} onChange={(e) => setNewEntry({ ...newEntry, anestesista: e.target.value })}>
                                            <option value="">Seleccionar</option>
                                            {profesionales.filter(p => p.categoria === 'Anestesista').map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <h4 className="font-bold text-sm text-slate-900 border-b pb-1">Montos y Liquidaciones</h4>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                                        <p className="font-bold text-slate-700">Pagos Totales</p>
                                        <div>
                                            <label className="block text-slate-400">Pesos</label>
                                            <input type="number" className="w-full p-1 border rounded" value={newEntry.pesos || ''} onChange={(e) => setNewEntry({ ...newEntry, pesos: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-slate-400">Dólares</label>
                                            <input type="number" className="w-full p-1 border rounded" value={newEntry.dolares || ''} onChange={(e) => setNewEntry({ ...newEntry, dolares: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 space-y-2">
                                        <p className="font-bold text-blue-800">Liq. Prof 1</p>
                                        <div className="flex gap-1">
                                            <input type="number" className="w-full p-1 border rounded" value={newEntry.liq_prof_1 || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_1: e.target.value })} />
                                            <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_1_currency || 'ARS'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_1_currency: e.target.value })}>
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2">
                                        <p className="font-bold text-indigo-800">Liq. Prof 2</p>
                                        <div className="flex gap-1">
                                            <input type="number" className="w-full p-1 border rounded" value={newEntry.liq_prof_2 || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_2: e.target.value })} />
                                            <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_2_currency || 'ARS'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_2_currency: e.target.value })}>
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100 space-y-2">
                                        <p className="font-bold text-purple-800">Liq. Anestesista</p>
                                        <div className="flex gap-1">
                                            <input type="number" className="w-full p-1 border rounded" value={newEntry.liq_anestesista || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_anestesista: e.target.value })} />
                                            <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_anestesista_currency || 'ARS'} onChange={(e) => setNewEntry({ ...newEntry, liq_anestesista_currency: e.target.value })}>
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-orange-50/50 rounded-lg border border-orange-100 space-y-2 col-span-2">
                                        <p className="font-bold text-orange-800">Retención COAT (Manual)</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-slate-400">Pesos</label>
                                                <input type="number" className="w-full p-1 border rounded" value={newEntry.coat_pesos || ''} onChange={(e) => setNewEntry({ ...newEntry, coat_pesos: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="block text-slate-400">Dólares</label>
                                                <input type="number" className="w-full p-1 border rounded" value={newEntry.coat_dolares || ''} onChange={(e) => setNewEntry({ ...newEntry, coat_dolares: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                                <button onClick={handleCreateEntry} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200">Guardar Paciente</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Daily Comment Section (SCREEN VERSION - Interactive) */}
            {
                selectedDate && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 no-print animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                            <FileText size={18} className="text-blue-500" /> Comentario del Día
                        </h3>
                        {isEditingComment ? (
                            <div className="flex gap-2 items-start">
                                <textarea
                                    value={dailyComment}
                                    onChange={(e) => setDailyComment(e.target.value)}
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none min-h-[80px]"
                                    placeholder="Escribe un comentario global para este día..."
                                    autoFocus
                                />
                                <div className="flex flex-col gap-2">
                                    <button onClick={saveDailyComment} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm" title="Guardar">
                                        <Check size={20} />
                                    </button>
                                    <button onClick={() => { setIsEditingComment(false); fetchDailyComment(selectedDate); }} className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors" title="Cancelar">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-between items-start bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-slate-600 italic whitespace-pre-wrap break-words break-all overflow-hidden w-full">{dailyComment || 'Sin comentario asignado.'}</p>
                                {isAdmin && (
                                    <button onClick={() => setIsEditingComment(true)} className="text-blue-600 hover:text-blue-800 font-bold text-sm flex items-center gap-1 px-3 py-1 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors ml-4 shrink-0">
                                        <Edit size={16} /> Editar
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )
            }

            {/* VIEWS */}
            <div className="print:hidden">
                {view === 'years' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {getYears().map(year => (
                            <button key={year} onClick={() => handleYearClick(year)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 hover:bg-blue-50/30 transition-all group flex flex-col items-center gap-3">
                                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Folder size={32} fill="currentColor" className="opacity-80" />
                                </div>
                                <span className="font-bold text-lg text-slate-700 group-hover:text-blue-700">{year}</span>
                            </button>
                        ))}
                        {getYears().length === 0 && <div className="col-span-full text-center py-20 text-slate-400">No hay registros</div>}
                    </div>
                )}

                {view === 'months' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {getMonths(selectedYear).map(monthIndex => (
                            <button key={monthIndex} onClick={() => handleMonthClick(monthIndex)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 hover:bg-blue-50/30 transition-all group flex flex-col items-center gap-3">
                                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Folder size={32} fill="currentColor" className="opacity-80" />
                                </div>
                                <span className="font-bold text-lg text-slate-700 group-hover:text-blue-700">{MONTH_NAMES[monthIndex]}</span>
                            </button>
                        ))}
                        <button onClick={navigateUp} className="flex flex-col items-center justify-center p-6 text-slate-400 hover:text-slate-600 transition-colors"><ArrowLeft size={24} /> Volver</button>
                    </div>
                )}

                {view === 'days' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {getDays(selectedYear, selectedMonth).map(date => (
                            <button key={date} onClick={() => handleDayClick(date)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group flex flex-col items-center gap-3">
                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <FileText size={32} />
                                </div>
                                <span className="font-bold text-lg text-slate-700 group-hover:text-emerald-700">{date.split('-')[2]}</span>
                            </button>
                        ))}
                        <button onClick={navigateUp} className="flex flex-col items-center justify-center p-6 text-slate-400 hover:text-slate-600 transition-colors"><ArrowLeft size={24} /> Volver</button>
                    </div>
                )}

                {view === 'table' && (
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[2000px] print:min-w-0">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                                    <tr>
                                        <th className={`px-4 py-3 border-b sticky left-0 bg-slate-50 z-10 w-24 ${!isAdmin && 'opacity-30'}`}>Acciones</th>
                                        <th className="px-4 py-3 border-b">Fecha (Caja)</th>
                                        <th className="px-4 py-3 border-b">Paciente</th>
                                        <th className="px-4 py-3 border-b">DNI</th>
                                        <th className="px-4 py-3 border-b">Obra Social</th>
                                        <th className="px-4 py-3 border-b text-blue-800 bg-blue-50/30">Prof. 1</th>
                                        <th className="px-4 py-3 border-b text-indigo-800 bg-indigo-50/30">Prof. 2</th>
                                        <th className="px-4 py-3 border-b text-slate-700">Pago $</th>
                                        <th className="px-4 py-3 border-b text-emerald-700">Pago USD</th>
                                        <th className="px-4 py-3 border-b bg-blue-50/50 text-blue-900">Liq. P1</th>
                                        <th className="px-4 py-3 border-b bg-indigo-50/50 text-indigo-900">Liq. P2</th>
                                        <th className="px-4 py-3 border-b bg-purple-50/30 text-purple-900">Anest.</th>
                                        <th className="px-4 py-3 border-b bg-purple-50/50 text-purple-900">Liq. Anest.</th>
                                        <th className="px-4 py-3 border-b bg-orange-50/50 text-orange-900">Coat $</th>
                                        <th className="px-4 py-3 border-b bg-orange-50/50 text-orange-900">Coat USD</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-slate-100">
                                    {tableData.map((item) => {
                                        const isEditing = editId === item.id;
                                        return (
                                            <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${isEditing ? 'bg-blue-50/20' : ''}`}>
                                                <td className={`px-2 py-3 border-r sticky left-0 bg-white z-10 ${!isAdmin && 'opacity-30 pointer-events-none'}`}>
                                                    {isAdmin && (
                                                        isEditing ? (
                                                            <div className="flex gap-1">
                                                                <button onClick={handleSave} className="p-1.5 bg-green-100 text-green-600 rounded-lg"><Check size={16} /></button>
                                                                <button onClick={handleCancelEdit} className="p-1.5 bg-red-100 text-red-600 rounded-lg"><X size={16} /></button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => handleEditClick(item)} className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg"><Edit2 size={16} /></button>
                                                                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg"><Trash2 size={16} /></button>
                                                            </div>
                                                        )
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 font-mono text-xs">{item.fecha}</td>

                                                {/* Generic Field Render for Brevity - Real implementation should map all editable fields similar to CajaForm */}
                                                {['paciente', 'dni', 'obra_social'].map(f => (
                                                    <td key={f} className="px-4 py-3">{isEditing ? <input value={editFormData[f]} onChange={(e) => handleChange(f, e.target.value)} className="w-full bg-white border border-blue-300 rounded px-1" /> : item[f]}</td>
                                                ))}

                                                <td className="px-4 py-3">{item.prof_1}</td>
                                                <td className="px-4 py-3">{item.prof_2}</td>

                                                <td className="px-4 py-3 text-right">{isEditing ? <input type="number" value={editFormData.pesos} onChange={(e) => handleChange('pesos', e.target.value)} className="w-20 bg-white border rounded" /> : `$${formatMoney(item.pesos)}`}</td>
                                                <td className="px-4 py-3 text-right">{isEditing ? <input type="number" value={editFormData.dolares} onChange={(e) => handleChange('dolares', e.target.value)} className="w-20 bg-white border rounded" /> : `USD ${formatMoney(item.dolares)}`}</td>

                                                {/* Simplified editing for liq cols for brevity - Added formatMoney wrap */}
                                                <td className="px-4 py-3 text-right">
                                                    {isEditing ? (
                                                        <div className="flex gap-1">
                                                            <input type="number" value={editFormData.liq_prof_1 || 0} onChange={(e) => handleChange('liq_prof_1', e.target.value)} className="w-16 bg-white border rounded text-xs px-1" />
                                                            <select value={editFormData.liq_prof_1_currency || 'ARS'} onChange={(e) => handleChange('liq_prof_1_currency', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                <option value="ARS">ARS</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        `${item.liq_prof_1_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_prof_1)}`
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {isEditing ? (
                                                        <div className="flex gap-1">
                                                            <input type="number" value={editFormData.liq_prof_2 || 0} onChange={(e) => handleChange('liq_prof_2', e.target.value)} className="w-16 bg-white border rounded text-xs px-1" />
                                                            <select value={editFormData.liq_prof_2_currency || 'ARS'} onChange={(e) => handleChange('liq_prof_2_currency', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                <option value="ARS">ARS</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        `${item.liq_prof_2_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_prof_2)}`
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isEditing ? <input value={editFormData.anestesista || ''} onChange={(e) => handleChange('anestesista', e.target.value)} className="w-full bg-white border border-blue-300 rounded px-1" /> : item.anestesista}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {isEditing ? (
                                                        <div className="flex gap-1">
                                                            <input type="number" value={editFormData.liq_anestesista || 0} onChange={(e) => handleChange('liq_anestesista', e.target.value)} className="w-16 bg-white border rounded text-xs px-1" />
                                                            <select value={editFormData.liq_anestesista_currency || 'ARS'} onChange={(e) => handleChange('liq_anestesista_currency', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                <option value="ARS">ARS</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        `${item.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_anestesista)}`
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 text-right text-orange-800">{isEditing ? <input type="number" value={editFormData.coat_pesos} onChange={(e) => handleChange('coat_pesos', e.target.value)} className="w-20 bg-white border rounded" /> : `$${formatMoney(item.coat_pesos)}`}</td>
                                                <td className="px-4 py-3 text-right text-orange-800">{isEditing ? <input type="number" value={editFormData.coat_dolares} onChange={(e) => handleChange('coat_dolares', e.target.value)} className="w-20 bg-white border rounded" /> : `USD ${formatMoney(item.coat_dolares)}`}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            <style>{printStyle}</style>
        </div >
    );
};

export default HistorialCaja;
