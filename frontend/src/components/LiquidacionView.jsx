import React, { useEffect, useState } from 'react';
import { User, Printer, Download, Search, FileText, Plus, X, Pencil, Lock, Save, Trash2 } from 'lucide-react';
import API_URL from '../config';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const LiquidacionView = () => {
    // Force Portrait for this view
    const printStyle = `
      @media print {
        @page { size: portrait; }
      }
    `;

    // Helper for Currency
    const formatMoney = (val) => {
        return (val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Helper to clean patient name for display
    const cleanPatientName = (name) => {
        if (!name) return '';
        return name.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '');
    };

    const [profesionales, setProfesionales] = useState([]);
    const [selectedProf, setSelectedProf] = useState('');
    const [modelo, setModelo] = useState(1); // 1: Detallado, 2: Solo Liquidación
    // RECEIPT STATE (Moved to top level)
    const [showReceipt, setShowReceipt] = useState(false);

    // Default to Today
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [data, setData] = useState(null);

    const fetchProfs = async () => {
        try {
            const response = await fetch(`${API_URL}/profesionales`);
            const result = await response.json();
            setProfesionales(result);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    const [error, setError] = useState('');
    const [debugUrl, setDebugUrl] = useState('');

    const fetchLiquidation = async (nombre, start, end) => {
        setError('');
        try {
            let url = `${API_URL}/liquidacion/${encodeURIComponent(nombre)}?dummy=1`;
            if (start) url += `&start_date=${start}`;
            if (end) url += `&end_date=${end}`;

            setDebugUrl(url);

            const response = await fetch(url);

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server error: ${response.status} - ${text}`);
            }

            const result = await response.json();
            if (result.status !== 'error') {
                setData(result);
                // Si la categoría no es ORL, sugerir Modelo 2 por defecto
                if (result.categoria !== 'ORL') {
                    setModelo(2);
                }
            } else {
                setError(result.message || "Error desconocido del backend");
                setData(null);
            }
        } catch (err) {
            console.error("Error fetching liquidation:", err);
            setError(err.message);
            setData(null);
        }
    };

    useEffect(() => {
        fetchProfs();
    }, []);

    // Auto-switch Model based on Category
    useEffect(() => {
        if (selectedProf) {
            const p = profesionales.find(pr => pr.nombre === selectedProf);
            if (p) {
                if (p.categoria === 'Estetica') {
                    setModelo(2); // Estetica uses Model 2
                } else if (p.categoria === 'ORL') {
                    setModelo(1); // Default ORL to 1
                } else if (p.categoria === 'Anestesista') {
                    setModelo(2); // Always Model 2 for Anesthetist
                }
            }
        }
    }, [selectedProf, profesionales]);

    useEffect(() => {
        if (selectedProf) {
            setData(null);
            fetchLiquidation(selectedProf, startDate, endDate);
        }
    }, [selectedProf, startDate, endDate]);

    const [deductions, setDeductions] = useState([]);
    const [newDeductionDesc, setNewDeductionDesc] = useState('');
    const [newDeductionAmount, setNewDeductionAmount] = useState('');

    const addDeduction = () => {
        if (!newDeductionDesc || !newDeductionAmount) return;
        setDeductions([...deductions, { desc: newDeductionDesc, amount: parseFloat(newDeductionAmount) }]);
        setNewDeductionDesc('');
        setNewDeductionAmount('');
    };

    const removeDeduction = (index) => {
        const newDeductions = [...deductions];
        newDeductions.splice(index, 1);
        setDeductions(newDeductions);
    };

    const totalDeductions = deductions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const finalTotalPesos = data && data.totales ? (data.totales.liq_pesos - totalDeductions) : 0;

    // --- MANUAL LIQUIDATION STATE ---
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualForm, setManualForm] = useState({
        date: today,
        patient: '',
        prof: '', // will default to selectedProf
        amount: '',
        currency: 'ARS'
    });
    const [dayPatients, setDayPatients] = useState([]);

    // --- SECURE EDIT STATE ---
    // --- SECURE EDIT/DELETE STATE ---
    const [showEditPinModal, setShowEditPinModal] = useState(false);
    const [editPinInput, setEditPinInput] = useState('');
    const [editingEntry, setEditingEntry] = useState(null);
    const [pendingAction, setPendingAction] = useState(null); // 'edit' or 'delete'
    const [showEditFormModal, setShowEditFormModal] = useState(false);
    const [editFormData, setEditFormData] = useState({});

    const handleEditClick = (entry) => {
        setEditingEntry(entry);
        setPendingAction('edit');
        setEditPinInput('');
        setShowEditPinModal(true);
    };

    const handleDeleteClick = (entry) => {
        if (!window.confirm("¿Estás seguro de que deseas eliminar esta liquidación?")) return;
        setEditingEntry(entry);
        setPendingAction('delete');
        setEditPinInput('');
        setShowEditPinModal(true);
    };

    const handleVerifyEditPin = async () => {
        try {
            const res = await fetch(`${API_URL}/config/pin`);
            const data = await res.json();
            if (editPinInput === data.pin) {
                setShowEditPinModal(false);

                if (pendingAction === 'edit') {
                    // Pre-fill form
                    setEditFormData({
                        ...editingEntry,
                        pesos: editingEntry.monto_pesos,
                        dolares: editingEntry.monto_dolares,
                    });
                    setShowEditFormModal(true);
                } else if (pendingAction === 'delete') {
                    performDelete();
                }
            } else {
                alert("PIN Incorrecto");
            }
        } catch (error) {
            console.error(error);
            alert("Error validando PIN: " + error.message);
        }
    };

    const performDelete = async () => {
        try {
            const response = await fetch(`${API_URL}/caja/${editingEntry.id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert("Liquidación eliminada");
                setEditingEntry(null);
                fetchLiquidation(selectedProf, startDate, endDate);
            } else {
                alert("Error al eliminar");
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión: " + error.message);
        }
    };

    const handleUpdateEntry = async () => {
        try {
            const response = await fetch(`${API_URL}/caja/${editingEntry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            });

            if (response.ok) {
                alert("Entrada actualizada");
                setShowEditFormModal(false);
                setEditingEntry(null);
                fetchLiquidation(selectedProf, startDate, endDate); // Refresh
            } else {
                alert("Error al actualizar");
            }
        } catch (error) {
            console.error("Update error:", error);
            alert("Error de conexión: " + error.message);
        }
    };

    useEffect(() => {
        if (showManualModal && manualForm.date) {
            // Fetch patients for this date to help autocomplete
            fetch(`${API_URL}/caja?date=${manualForm.date}`)
                .then(res => res.json())
                .then(data => {
                    // Extract unique patients
                    const patients = [...new Set(data.map(item => item.paciente))];
                    setDayPatients(patients);
                })
                .catch(err => console.error(err));
        }
    }, [showManualModal, manualForm.date]);

    // Update manual form prof when selectedProf changes or modal opens
    useEffect(() => {
        if (selectedProf) {
            setManualForm(prev => ({ ...prev, prof: selectedProf }));
        }
    }, [selectedProf, showManualModal]);

    const handleSaveManual = async () => {
        if (!manualForm.patient || !manualForm.amount || !manualForm.prof) return alert("Complete los datos");

        const payload = {
            entries: [{
                fecha: manualForm.date,
                paciente: manualForm.patient + ' (Liq. Manual)',
                dni: '',
                obra_social: '',
                prof_1: manualForm.prof, // Assign to this prof so it appears in their liq
                prof_2: '',
                anestesista: '',
                pesos: 0, // No payment
                dolares: 0,
                liq_prof_1: manualForm.currency === 'ARS' ? parseFloat(manualForm.amount) : 0, // If ARS, put in ARS field
                liq_prof_1_currency: manualForm.currency,
                // We use prof 1 by default for this manual entry type
                // But wait, if we are in Role 2 view, maybe we should save as Prof 2?
                // Actually, to make it appear in "Liquidacion", we just need it to match the role filter.
                // If I am Prof 1, I look for prof_1_id. 
                // Let's assume we save as Prof 1 always unless specified. 
                // BUT if I am viewing as Prof 2, I want it to be Prof 2.
                // Current UI doesn't allow switching role in entry creation easily without complex logic.
                // Let's force it to be Prof 1 for now or allow user to choose?
                // The user usually views 'Tutores' as a Professional. So putting 'Tutores' in Prof 1 is correct.
            }]
        };

        // ADJUSTMENT: If role is 2, we should probably save as Prof 2?
        // But simply, if user selects "Tutores" in the modal (which defaults to selectedProf), we put that name in prof_1.
        // And our backend resolver will find the ID. 
        // Then `get_liquidacion` looks for `prof_1_id == tutores_id`. So it works.

        try {
            const response = await fetch(`${API_URL}/guardar-caja`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                alert("Liquidación agregada correctamente");
                setShowManualModal(false);
                setManualForm({ ...manualForm, patient: '', amount: '' });
                // Refresh
                fetchLiquidation(selectedProf, startDate, endDate);
            } else {
                alert("Error al guardar");
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión");
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // --- GENERAL MATRIX EXPORT ---
    const handleGeneralExcel = async () => {
        try {
            // 1. Fetch ALL data for the period
            let url = `${API_URL}/caja?start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("Error obteniendo datos globales");
            const entries = await response.json();

            // 2. Identify Active Professionals and their totals per day
            const matrix = {}; // { "YYYY-MM-DD": { "Prof Name": { ARS: 0, USD: 0 } } }
            const activeProfs = new Set();
            const dates = new Set();

            entries.forEach(e => {
                const date = e.fecha; // YYYY-MM-DD
                dates.add(date);
                if (!matrix[date]) matrix[date] = {};

                const processLiquidation = (profName, liqAmount, liqCurr) => {
                    if (!profName || !liqAmount) return;
                    activeProfs.add(profName);
                    if (!matrix[date][profName]) matrix[date][profName] = { ARS: 0, USD: 0 };

                    if (liqCurr === 'USD') matrix[date][profName].USD += liqAmount;
                    else matrix[date][profName].ARS += liqAmount;
                };

                // Prof 1
                if (e.prof_1) {
                    processLiquidation(e.prof_1, e.liq_prof_1, e.liq_prof_1_currency);
                }
                // Prof 2
                if (e.prof_2) {
                    processLiquidation(e.prof_2, e.liq_prof_2, e.liq_prof_2_currency);
                }
                // Anestesista
                if (e.anestesista) {
                    processLiquidation(e.anestesista, e.liq_anestesista, e.liq_anestesista_currency);
                }
            });

            if (activeProfs.size === 0) return alert("No hay liquidaciones en el rango seleccionado.");

            const sortedProfs = Array.from(activeProfs).sort();
            const sortedDates = Array.from(dates).sort();

            // 3. Create Excel
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Honorarios');

            // Header Style
            const headerStyle = {
                font: { bold: true, name: 'Arial', size: 10 },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
            };

            // Title Row
            ws.mergeCells(1, 1, 1, sortedProfs.length + 1);
            const titleCell = ws.getCell(1, 1);
            titleCell.value = `HONORARIOS CX - ${startDate} / ${endDate}`;
            titleCell.font = { bold: true, size: 14 };
            titleCell.alignment = { horizontal: 'center' };

            // Headers (Row 2)
            ws.getCell(2, 1).value = "FECHA";
            ws.getCell(2, 1).style = headerStyle;

            sortedProfs.forEach((prof, idx) => {
                const cell = ws.getCell(2, idx + 2);
                cell.value = prof;
                cell.style = headerStyle;
            });

            // Data Rows
            let currentRow = 3;
            // Accumulators for footer
            const totals = {}; // { "Prof": { ARS: 0, USD: 0 } }
            sortedProfs.forEach(p => totals[p] = { ARS: 0, USD: 0 });

            sortedDates.forEach(date => {
                const row = ws.getRow(currentRow);
                // Format Date (DD/MM/YY)
                const [y, m, d] = date.split('-');
                row.getCell(1).value = `${d}/${m}/${y.slice(2)}`;
                row.getCell(1).style = { ...headerStyle, font: { ...headerStyle.font, bold: false } }; // Use border but no bold

                sortedProfs.forEach((prof, idx) => {
                    const data = matrix[date][prof];
                    let cellValue = "";
                    if (data) {
                        if (data.ARS > 0) {
                            cellValue += `$${data.ARS.toLocaleString('es-AR')}`;
                            totals[prof].ARS += data.ARS;
                        }
                        if (data.USD > 0) {
                            if (cellValue) cellValue += " + ";
                            cellValue += `USD ${data.USD.toLocaleString('es-AR')}`;
                            totals[prof].USD += data.USD;
                        }
                    }
                    const cell = row.getCell(idx + 2);
                    cell.value = cellValue;
                    cell.alignment = { horizontal: 'center' };
                    cell.border = headerStyle.border;
                });
                currentRow++;
            });

            // Footer (Totals)
            const rowPesos = ws.getRow(currentRow);
            rowPesos.getCell(1).value = "Pesos";
            rowPesos.getCell(1).font = { bold: true };
            rowPesos.getCell(1).border = headerStyle.border;

            const rowDolares = ws.getRow(currentRow + 1);
            rowDolares.getCell(1).value = "Dólares";
            rowDolares.getCell(1).font = { bold: true };
            rowDolares.getCell(1).border = headerStyle.border;

            sortedProfs.forEach((prof, idx) => {
                // Pesos
                const cellARS = rowPesos.getCell(idx + 2);
                cellARS.value = totals[prof].ARS > 0 ? `$${totals[prof].ARS.toLocaleString('es-AR')}` : "";
                cellARS.style = { font: { bold: true }, alignment: { horizontal: 'center' }, border: headerStyle.border };

                // Dollars
                const cellUSD = rowDolares.getCell(idx + 2);
                cellUSD.value = totals[prof].USD > 0 ? `$${totals[prof].USD.toLocaleString('es-AR')}` : "";
                cellUSD.style = { font: { bold: true }, alignment: { horizontal: 'center' }, border: headerStyle.border };
            });

            // Auto-width columns
            ws.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    const columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) maxLength = columnLength;
                });
                column.width = maxLength < 12 ? 12 : maxLength + 2;
            });


            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Honorarios_General_${startDate}_${endDate}.xlsx`);

        } catch (err) {
            console.error(err);
            alert("Error al generar reporte: " + err.message);
        }
    };

    const handleExportExcel = async () => {
        if (!data || data.entradas.length === 0) return alert("No hay datos para exportar");

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Liquidación');

        // Load Logo Helper
        const loadImage = async (url) => {
            const response = await fetch(url);
            const blob = await response.blob();
            return blob.arrayBuffer();
        };

        // --- STYLES ---
        const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        const headerFont = { name: 'Arial', size: 10, bold: true };
        const centerStyle = { vertical: 'middle', horizontal: 'center' };

        // --- LOGO ---
        try {
            const logoBuffer = await loadImage('/coat_logo.png');
            const logoId = workbook.addImage({ buffer: logoBuffer, extension: 'png' });
            worksheet.addImage(logoId, {
                tl: { col: 0, row: 0 },
                ext: { width: 180, height: 60 }
            });
        } catch (e) {
            console.error("Logo load failed", e);
            worksheet.getCell('A1').value = 'COAT';
        }

        // --- TITLE ---
        const profName = profesionales.find(p => p.nombre === selectedProf)?.nombre || data.profesional || 'Profesional';
        const dateStr = startDate && endDate ? `${startDate.split('-').reverse().join('/')} al ${endDate.split('-').reverse().join('/')}` : new Date().toLocaleDateString('es-AR');

        worksheet.getCell('A4').value = `Liquidación ${profName}`;
        worksheet.getCell('A4').font = { size: 12, bold: true };
        worksheet.getCell('C4').value = dateStr;
        worksheet.getCell('C4').font = { size: 12, bold: true };

        // --- COLUMNS CONFIG ---
        // Model 1 (Profs): Paciente, DNI, Obra Social, Pago($/USD), Liq($/USD)
        // Model 2 (Anest): Paciente, DNI, Obra Social, Liq($/USD)

        let headerRowIdx = 7;
        let dataStartIdx = 8;

        // If data.entradas is filtered on backend, we use it directly. 
        // Backend returns mapped 'monto_pesos'/'monto_dolares' as the calculated liquidation amount based on role.
        // We just need to display it.

        const filteredLiq = data.entradas;

        if (modelo === 1) {
            // MODEL 1 headers
            worksheet.mergeCells('D6:E6');
            worksheet.getCell('D6').value = 'Pago';
            worksheet.getCell('D6').alignment = centerStyle;
            worksheet.getCell('D6').font = headerFont;

            worksheet.mergeCells('F6:G6');
            worksheet.getCell('F6').value = 'Liquidacion';
            worksheet.getCell('F6').alignment = centerStyle;
            worksheet.getCell('F6').font = headerFont;

            const headers = ['Paciente', 'DNI', 'Obra social', 'Pesos', 'Dolares', 'Pesos', 'Dolares'];
            const headerRow = worksheet.getRow(headerRowIdx);
            headerRow.values = headers;

            // Apply borders and styles to headers
            for (let i = 1; i <= 7; i++) {
                const cell = headerRow.getCell(i);
                cell.border = borderStyle;
                cell.font = headerFont;
                cell.alignment = centerStyle;
            }

            // Data
            let currentRow = dataStartIdx;

            filteredLiq.forEach(item => {
                const row = worksheet.getRow(currentRow);
                row.values = [
                    item.paciente,
                    item.dni,
                    item.obra_social,
                    item.pago_pesos,    // Pago Pesos
                    item.pago_dolares,  // Pago USD
                    item.liq_currency !== 'USD' ? item.liq_amount : 0, // Liq Pesos
                    item.liq_currency === 'USD' ? item.liq_amount : 0  // Liq USD
                ];

                // Formats: using currency format for Excel
                row.getCell(4).numFmt = '#,##0.00';
                row.getCell(5).numFmt = '#,##0.00';
                row.getCell(6).numFmt = '#,##0.00';
                row.getCell(7).numFmt = '#,##0.00';

                // Borders
                for (let i = 1; i <= 7; i++) row.getCell(i).border = borderStyle;

                currentRow++;
            });

            // Subtotals
            currentRow++;
            const subRow = worksheet.getRow(currentRow);
            subRow.getCell(5).value = 'Subtotal:';
            subRow.getCell(5).font = { bold: true };
            subRow.getCell(6).value = data.totales.liq_pesos;
            subRow.getCell(7).value = data.totales.liq_dolares;
            subRow.getCell(6).numFmt = '"$"#,##0.00'; // Show format
            subRow.getCell(7).numFmt = '"USD" #,##0.00';

            // Deductions
            if (deductions.length > 0) {
                currentRow++;
                worksheet.getRow(currentRow).getCell(5).value = 'Deducciones:';
                worksheet.getRow(currentRow).getCell(5).font = { bold: true, color: { argb: 'FFCC0000' } }; // Red

                deductions.forEach(d => {
                    currentRow++;
                    const dRow = worksheet.getRow(currentRow);
                    dRow.getCell(5).value = d.desc;
                    dRow.getCell(6).value = -d.amount; // Negative for Excel math visually
                    dRow.getCell(6).numFmt = '"-$"#,##0.00';
                    dRow.getCell(6).font = { color: { argb: 'FFCC0000' } };
                });
            }

            // Final Total
            currentRow++;
            const totalRow = worksheet.getRow(currentRow);
            totalRow.getCell(5).value = 'Total Final:';
            totalRow.getCell(5).font = { bold: true, size: 11 };
            totalRow.getCell(6).value = finalTotalPesos;
            totalRow.getCell(6).numFmt = '"$"#,##0.00';
            totalRow.getCell(6).font = { bold: true, underline: true, size: 11 };

            totalRow.getCell(7).value = data.totales.liq_dolares;
            totalRow.getCell(7).numFmt = '"USD" #,##0.00';
            totalRow.getCell(7).font = { bold: true, underline: true };

        } else {
            // MODEL 2 headers (Anesthetist - Simplified)
            worksheet.mergeCells('D6:E6');
            worksheet.getCell('D6').value = 'Liquidacion';
            worksheet.getCell('D6').alignment = centerStyle;
            worksheet.getCell('D6').font = headerFont;

            const headers = ['Paciente', 'DNI', 'Obra social', 'Pesos', 'Dolares'];
            const headerRow = worksheet.getRow(headerRowIdx);
            headerRow.values = headers;

            // Apply borders and styles to headers
            for (let i = 1; i <= 5; i++) {
                const cell = headerRow.getCell(i);
                cell.border = borderStyle;
                cell.font = headerFont;
                cell.alignment = centerStyle;
            }

            // Data
            let currentRow = dataStartIdx;

            filteredLiq.forEach(item => {
                const row = worksheet.getRow(currentRow);
                row.values = [
                    cleanPatientName(item.paciente),
                    item.dni,
                    item.obra_social,
                    item.liq_currency !== 'USD' ? item.liq_amount : 0, // Liq Pesos
                    item.liq_currency === 'USD' ? item.liq_amount : 0  // Liq USD
                ];

                // Formats
                row.getCell(4).numFmt = '"$"#,##0.00';
                row.getCell(5).numFmt = '"USD" #,##0.00';

                // Borders
                for (let i = 1; i <= 5; i++) row.getCell(i).border = borderStyle;
                currentRow++;
            });

            // Subtotals
            currentRow++;
            const subRow = worksheet.getRow(currentRow);
            subRow.getCell(3).value = 'Subtotal:';
            subRow.getCell(3).font = { bold: true };
            subRow.getCell(4).value = data.totales.liq_pesos;
            subRow.getCell(5).value = data.totales.liq_dolares;
            subRow.getCell(4).numFmt = '"$"#,##0.00';
            subRow.getCell(5).numFmt = '"USD" #,##0.00';

            // Deductions
            if (deductions.length > 0) {
                currentRow++;
                worksheet.getRow(currentRow).getCell(3).value = 'Deducciones:';
                worksheet.getRow(currentRow).getCell(3).font = { bold: true, color: { argb: 'FFCC0000' } };

                deductions.forEach(d => {
                    currentRow++;
                    const dRow = worksheet.getRow(currentRow);
                    dRow.getCell(3).value = d.desc;
                    dRow.getCell(4).value = -d.amount;
                    dRow.getCell(4).numFmt = '"-$"#,##0.00';
                    dRow.getCell(4).font = { color: { argb: 'FFCC0000' } };
                });
            }

            // Final Total
            currentRow++;
            const totalRow = worksheet.getRow(currentRow);
            totalRow.getCell(3).value = 'Total Final:';
            totalRow.getCell(3).font = { bold: true, size: 11 };
            totalRow.getCell(4).value = finalTotalPesos;
            totalRow.getCell(4).numFmt = '"$"#,##0.00';
            totalRow.getCell(4).font = { bold: true, underline: true, size: 11 };

            totalRow.getCell(5).value = data.totales.liq_dolares;
            totalRow.getCell(5).numFmt = '"USD" #,##0.00';
            totalRow.getCell(5).font = { bold: true, underline: true };
        }

        // Column Widths
        worksheet.columns = [
            { width: 25 }, { width: 15 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
        ];

        // Save
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Liquidacion_${profName}_${dateStr.replace(/\//g, '-')}.xlsx`);
    };

    // --- RECEIPT STATE ---
    // (State moved to top level)

    if (showReceipt && data && data.totales) {
        // Filter out Manual Liquidations for the Receipt
        const receiptEntries = data.entradas.filter(e => !e.paciente.toLowerCase().includes('(liq. manual)'));

        // Recalculate Totals for Receipt only
        const receiptLiqPesos = receiptEntries.filter(e => e.liq_currency !== 'USD').reduce((acc, e) => acc + e.liq_amount, 0);
        const receiptLiqDolares = receiptEntries.filter(e => e.liq_currency === 'USD').reduce((acc, e) => acc + e.liq_amount, 0);

        const receiptFinalPesos = receiptLiqPesos - totalDeductions;

        return (
            <div className="bg-white min-h-screen p-8 animate-in fade-in duration-300 relative">
                {/* Navigation / Actions for Receipt */}
                <div className="no-print flex gap-4 mb-8 border-b border-slate-100 pb-4">
                    <button onClick={() => setShowReceipt(false)} className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-800 font-bold transition-colors">
                        <Search size={16} /> Volver a Liquidación
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold shadow-lg">
                        <Printer size={16} /> Imprimir Recibo
                    </button>
                </div>

                {/* VISIBLE RECEIPT (Matches the PNG Model) */}
                <div className="max-w-3xl mx-auto border border-slate-200 shadow-sm p-12 bg-white print:border-none print:shadow-none print:p-0 print:w-full">

                    {/* Header: LOGO */}
                    <div className="mb-8">
                        <img src="/coat_logo.png" alt="COAT" className="h-20 object-contain mx-auto" />
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm text-slate-800 mb-8 font-medium">
                        <div className="font-bold text-slate-900">Fecha:</div>
                        <div>{new Date().toLocaleDateString('es-AR')}</div>

                        <div className="font-bold text-slate-900">Movimiento:</div>
                        <div>Egreso</div>

                        <div className="font-bold text-slate-900">Concepto:</div>
                        <div>Honorarios por técnica en común de por cuenta y orden de {data.profesional || 'Profesional'}</div>

                        <div className="font-bold text-slate-900">Referencia:</div>
                        <div className="text-xs">{receiptEntries.map(e => cleanPatientName(e.paciente)).join(', ')}</div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-sm mb-12 border-t border-slate-300">
                        <thead>
                            <tr className="border-b border-slate-300">
                                <th className="text-left py-2 font-bold text-slate-900 w-1/3">M. de Pago</th>
                                <th className="text-left py-2 font-bold text-slate-900">Número</th>
                                <th className="text-left py-2 font-bold text-slate-900">F. Cobro</th>
                                <th className="text-right py-2 font-bold text-slate-900">Importe</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* Pesos Row (Using Final Adjusted Total) */}
                            <tr>
                                <td className="py-2 text-slate-600">Efectivo</td>
                                <td className="py-2"></td>
                                <td className="py-2"></td>
                                <td className="py-2 text-right font-mono font-bold text-slate-800">${formatMoney(receiptFinalPesos)}</td>
                            </tr>
                            {/* Dolares Row */}
                            <tr>
                                <td className="py-2 text-slate-600">Dólares</td>
                                <td className="py-2"></td>
                                <td className="py-2"></td>
                                <td className="py-2 text-right font-mono font-bold text-slate-800">USD {formatMoney(receiptLiqDolares)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Signature Line */}
                    <div className="mt-32 flex justify-end">
                        <div className="text-center w-64 border-t border-slate-900 pt-2">
                            <p className="font-bold text-slate-900 text-sm">Recibí conforme</p>
                        </div>
                    </div>

                </div>

                <style>{`
                    @media print {
                        @page { size: portrait; margin: 1cm; }
                        body * { visibility: hidden; }
                        .animate-in { visibility: visible !important; }
                        .animate-in * { visibility: visible !important; }
                        .no-print { display: none !important; }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            {/* PRINT REPORT LAYOUT */}
            <div className="hidden print:block p-8 bg-white text-black">
                <div className="flex justify-between items-start mb-6 border-b border-black pb-4">
                    <img src="/coat_logo.png" alt="COAT" className="h-16 object-contain" />
                    <div className="text-right">
                        <h1 className="text-2xl font-bold uppercase">Liquidación: {data?.profesional || 'Profesional'}</h1>
                        <p className="text-lg font-bold">{startDate.split('-').reverse().join('/')} - {endDate.split('-').reverse().join('/')}</p>
                    </div>
                </div>

                {data && (
                    <>
                        <table className="w-full text-xs border-collapse border border-black mb-4">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-black px-2 py-1 text-left font-bold">Fecha</th>
                                    <th className="border border-black px-2 py-1 text-left font-bold">Paciente</th>
                                    {modelo === 1 && (
                                        <>
                                            <th className="border border-black px-2 py-1 text-right font-bold">Cobro $</th>
                                            <th className="border border-black px-2 py-1 text-right font-bold">Cobro USD</th>
                                        </>
                                    )}
                                    <th className="border border-black px-2 py-1 text-right font-bold bg-slate-200">Liquidación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.entradas.map((entry, idx) => (
                                    <tr key={idx} className="border-b border-black">
                                        <td className="border border-black px-2 py-1">{entry.fecha}</td>
                                        <td className="border border-black px-2 py-1">
                                            <div className="font-bold">{cleanPatientName(entry.paciente)}</div>
                                            <div className="text-[10px]">{entry.dni} - {entry.obra_social}</div>
                                        </td>
                                        {modelo === 1 && (
                                            <>
                                                <td className="border border-black px-2 py-1 text-right">${formatMoney(entry.pago_pesos)}</td>
                                                <td className="border border-black px-2 py-1 text-right">USD {formatMoney(entry.pago_dolares)}</td>
                                            </>
                                        )}
                                        <td className="border border-black px-2 py-1 text-right font-bold">
                                            {entry.liq_currency === 'USD' ? 'USD ' : '$'}{formatMoney(entry.liq_amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-black font-bold border-t border-black">
                                    <td colSpan={modelo === 1 ? 4 : 2} className="border border-black px-2 py-2 text-right uppercase">Subtotal</td>
                                    <td className="border border-black px-2 py-2 text-right">
                                        <div>${formatMoney(data.totales.liq_pesos)}</div>
                                    </td>
                                </tr>
                                {/* Deductions in Print */}
                                {deductions.map((d, i) => (
                                    <tr key={i} className="text-red-700 italic">
                                        <td colSpan={modelo === 1 ? 4 : 2} className="border border-black px-2 py-1 text-right">{d.desc}</td>
                                        <td className="border border-black px-2 py-1 text-right">
                                            -${formatMoney(d.amount)}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-slate-800 text-white font-bold">
                                    <td colSpan={modelo === 1 ? 4 : 2} className="border border-black px-2 py-2 text-right uppercase">Total Final</td>
                                    <td className="border border-black px-2 py-2 text-right">
                                        <div>${formatMoney(finalTotalPesos)}</div>
                                        {data.totales.liq_dolares > 0 && <div>USD {formatMoney(data.totales.liq_dolares)}</div>}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </>
                )}
            </div>



            {/* Error Message */}
            {
                error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )
            }

            {/* Cabecera de Filtros */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 no-print">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
                        <button
                            onClick={() => setModelo(1)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${modelo === 1 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                        >
                            Modelo 1 (Detalle)
                        </button>
                        <button
                            onClick={() => setModelo(2)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${modelo === 2 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                        >
                            Modelo 2 (Solo Liq)
                        </button>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-slate-400 uppercase">Filtrar:</span>
                        <input
                            type="date"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-500"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-500"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex gap-3 p-2 bg-slate-50/50 rounded-xl overflow-x-auto">
                    {profesionales.filter(p => p.categoria !== 'Tutoras').map(prof => (
                        <button
                            key={prof.id}
                            onClick={() => setSelectedProf(prof.nombre)}
                            className={`px-4 py-2 rounded-xl border transition-all whitespace-nowrap font-medium text-sm ${selectedProf === prof.nombre ? 'bg-white border-blue-200 text-blue-600 shadow-sm' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            {prof.nombre}
                        </button>
                    ))}
                </div>
            </div>

            {
                data && data.entradas && data.totales ? (
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden print:hidden">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-white to-slate-50/50">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center`}>
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                                            Liquidación: {data.profesional}
                                        </h2>
                                        <p className="text-slate-500 font-medium">Categoría: {data.categoria} | Modelo Seleccionado: {modelo === 1 ? 'Detallado' : 'Simplificado'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 no-print">
                                <button onClick={() => setShowManualModal(true)} className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-semibold shadow-lg shadow-emerald-200">
                                    <Plus size={20} /> Agregar Liquidación
                                </button>
                                <button onClick={handleExportExcel} className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-green-100 hover:text-green-800 transition-all font-semibold">
                                    <Download size={20} /> Excel
                                </button>
                                <button onClick={() => setShowReceipt(true)} className="flex items-center gap-2 px-5 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 font-semibold">
                                    <FileText size={20} /> Recibo
                                </button>
                                <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 font-semibold">
                                    <Printer size={20} /> Imprimir Detalle
                                </button>
                            </div>
                        </div>

                        {/* DEDUCTIONS UI */}
                        <div className="p-6 bg-slate-50 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Ajustes / Deducciones Manuales (Pesos)</h3>
                            <div className="flex gap-4 mb-4">
                                <input
                                    type="text"
                                    placeholder="Descripción (ej: Paciente X - Anestesia Y)"
                                    className="flex-1 p-2 border rounded-lg"
                                    value={newDeductionDesc}
                                    onChange={e => setNewDeductionDesc(e.target.value)}
                                />
                                <input
                                    type="number"
                                    placeholder="Monto"
                                    className="w-32 p-2 border rounded-lg"
                                    value={newDeductionAmount}
                                    onChange={e => setNewDeductionAmount(e.target.value)}
                                />
                                <button onClick={addDeduction} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-bold">Agregar</button>
                            </div>

                            {deductions.length > 0 && (
                                <div className="space-y-2">
                                    {deductions.map((d, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white p-3 rounded border border-red-100">
                                            <span className="text-slate-700 font-medium">{d.desc}</span>
                                            <div className="flex items-center gap-4">
                                                <span className="text-red-600 font-bold">-${formatMoney(d.amount)}</span>
                                                <button onClick={() => removeDeduction(idx)} className="text-slate-400 hover:text-red-500 ml-4"><Printer size={16} className="rotate-45" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                                        <th className="px-8 py-4 text-left">Fecha</th>
                                        <th className="px-8 py-4 text-left">Paciente</th>
                                        {modelo === 1 && (
                                            <>
                                                <th className="px-8 py-4 text-right">Cobro Pesos</th>
                                                <th className="px-8 py-4 text-right">Cobro USD</th>
                                            </>
                                        )}
                                        <th className={`px-8 py-4 text-right bg-blue-50/30`}>Su Liquidación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 font-medium text-slate-700 text-sm">
                                    {data.entradas.map((entry, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                                            <td className="px-8 py-4 text-slate-400 tabular-nums">{entry.fecha}</td>
                                            <td className="px-8 py-4">
                                                <div className="font-bold text-slate-900">{cleanPatientName(entry.paciente)}</div>
                                                <div className="text-xs text-slate-400">{entry.dni}</div>
                                            </td>
                                            {modelo === 1 && (
                                                <>
                                                    <td className="px-8 py-4 text-right tabular-nums text-slate-400">${formatMoney(entry.pago_pesos)}</td>
                                                    <td className="px-8 py-4 text-right tabular-nums text-slate-400">U$D {formatMoney(entry.pago_dolares)}</td>
                                                </>
                                            )}
                                            <td className={`px-8 py-4 text-right tabular-nums font-bold text-blue-600 bg-blue-50/5`}>
                                                <div className="flex items-center justify-end gap-3 group/cell">
                                                    <span>{entry.liq_currency === 'USD' ? 'U$D ' : '$'}{formatMoney(entry.liq_amount)}</span>
                                                    <button
                                                        onClick={() => handleEditClick(entry)}
                                                        className="opacity-0 group-hover/cell:opacity-100 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all no-print"
                                                        title="Editar (Requiere PIN)"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(entry)}
                                                        className="opacity-0 group-hover/cell:opacity-100 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all no-print"
                                                        title="Eliminar (Requiere PIN)"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t border-slate-200">
                                        <td colSpan={modelo === 1 ? 4 : 2} className="px-8 py-5 text-right font-bold uppercase tracking-widest text-xs opacity-50">Subtotal</td>
                                        <td className="px-8 py-5 text-right font-bold text-lg tabular-nums text-slate-500">${formatMoney(data.totales.liq_pesos)}</td>
                                    </tr>
                                    {deductions.map((d, i) => (
                                        <tr key={i} className="bg-red-50/50">
                                            <td colSpan={modelo === 1 ? 4 : 2} className="px-8 py-3 text-right font-medium italic text-red-800">{d.desc}</td>
                                            <td className="px-8 py-3 text-right font-bold text-red-600">-${formatMoney(d.amount)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-900 text-white">
                                        <td colSpan={modelo === 1 ? 4 : 2} className="px-8 py-5 text-right font-bold uppercase tracking-widest text-xs opacity-50">Total Final</td>
                                        <td className="px-8 py-5 text-right font-black text-lg tabular-nums">
                                            <div className="flex flex-col items-end gap-1">
                                                <span>${formatMoney(finalTotalPesos)}</span>
                                                {data.totales.liq_dolares > 0 && (
                                                    <span className="text-emerald-400">U$D {formatMoney(data.totales.liq_dolares)}</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="p-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-300">
                        <User size={64} className="mx-auto mb-4 opacity-10" />
                        <p className="text-xl font-medium">Selecciona un profesional para ver su liquidación</p>
                    </div>
                )
            }




            {/* MANUAL LIQUIDATION MODAL */}
            {
                showManualModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm no-print">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md">
                            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                                <h3 className="text-xl font-bold text-slate-900">Agregar Liquidación Manual</h3>
                                <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Profesional (Destino)</label>
                                    <select
                                        className="w-full p-2 border rounded-lg bg-slate-50"
                                        value={manualForm.prof}
                                        onChange={(e) => setManualForm({ ...manualForm, prof: e.target.value })}
                                    >
                                        {profesionales.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border rounded-lg"
                                        value={manualForm.date}
                                        onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            className="w-full p-2 border rounded-lg"
                                            placeholder="Nombre del Paciente"
                                            value={manualForm.patient}
                                            onChange={(e) => setManualForm({ ...manualForm, patient: e.target.value })}
                                        />
                                        {/* Suggestions */}
                                        {dayPatients.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {dayPatients.slice(0, 5).map(p => (
                                                    <button
                                                        key={p}
                                                        onClick={() => setManualForm({ ...manualForm, patient: p })}
                                                        className="text-xs bg-slate-100 px-2 py-1 rounded-md hover:bg-blue-100 hover:text-blue-700 transition"
                                                    >
                                                        {p}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monto a Liquidar</label>
                                        <input
                                            type="number"
                                            className="w-full p-2 border rounded-lg font-bold text-lg"
                                            placeholder="0.00"
                                            value={manualForm.amount}
                                            onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Moneda</label>
                                        <select
                                            className="w-full p-2 border rounded-lg"
                                            value={manualForm.currency}
                                            onChange={(e) => setManualForm({ ...manualForm, currency: e.target.value })}
                                        >
                                            <option value="ARS">Pesos ($)</option>
                                            <option value="USD">Dólares (USD)</option>
                                        </select>
                                    </div>
                                </div>

                                <button onClick={handleSaveManual} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 mt-4">
                                    Confirmar Liquidación
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* SECURE EDIT PIN MODAL */}
            {showEditPinModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm no-print">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-xs">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-500">
                                <Lock size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Seguridad</h3>
                            <p className="text-xs text-slate-500 mb-2">
                                {pendingAction === 'delete'
                                    ? "Ingrese PIN para ELIMINAR la liquidación"
                                    : "Ingrese PIN para editar la liquidación"}
                            </p>
                            {pendingAction === 'delete' && (
                                <div className="bg-red-50 text-red-600 text-xs p-2 rounded mb-4 font-bold border border-red-100">
                                    ¡Acción Irreversible!
                                </div>
                            )}
                        </div>
                        <input
                            type="password"
                            className="w-full text-center text-2xl tracking-widest font-bold py-3 border-2 border-slate-200 rounded-xl mb-6 focus:border-blue-500 focus:outline-none"
                            placeholder="****"
                            maxLength={4}
                            value={editPinInput}
                            onChange={(e) => setEditPinInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyEditPin()}
                            autoFocus
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setShowEditPinModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                            <button onClick={handleVerifyEditPin} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200">Verificar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT ENTRY MODAL */}
            {showEditFormModal && editFormData && (
                <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm no-print">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Pencil size={20} className="text-blue-500" /> Editar Liquidación
                            </h3>
                            <button onClick={() => setShowEditFormModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
                                <input
                                    type="date"
                                    className="w-full p-2 border rounded-lg"
                                    value={editFormData.fecha ? (typeof editFormData.fecha === 'string' ? editFormData.fecha : new Date(editFormData.fecha).toISOString().split('T')[0]) : ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, fecha: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded-lg"
                                    value={editFormData.paciente || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, paciente: e.target.value })}
                                />
                            </div>

                            {/* We only show fields relevant to current view/role ideally, but let's show Payment and Liq amounts */}
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="col-span-2 text-xs font-bold text-slate-400 uppercase">Cobros (Ingreso)</div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Pesos</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg bg-white"
                                        value={editFormData.monto_pesos || 0}
                                        onChange={(e) => setEditFormData({ ...editFormData, monto_pesos: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Dólares</label>
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg bg-white"
                                        value={editFormData.monto_dolares || 0}
                                        onChange={(e) => setEditFormData({ ...editFormData, monto_dolares: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 bg-blue-50 p-3 rounded-xl border border-blue-100">
                                <div className="col-span-2 text-xs font-bold text-blue-400 uppercase">Liquidación (Egreso)</div>

                                <div className="col-span-2 space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Liq. Prof 1 ($)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                className="w-full p-2 border rounded-lg bg-white"
                                                value={editFormData.liq_prof_1 || 0}
                                                onChange={(e) => setEditFormData({ ...editFormData, liq_prof_1: parseFloat(e.target.value) })}
                                            />
                                            <select
                                                className="p-2 border rounded-lg bg-white text-xs"
                                                value={editFormData.liq_prof_1_currency}
                                                onChange={(e) => setEditFormData({ ...editFormData, liq_prof_1_currency: e.target.value })}
                                            >
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Liq. Prof 2 ($)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                className="w-full p-2 border rounded-lg bg-white"
                                                value={editFormData.liq_prof_2 || 0}
                                                onChange={(e) => setEditFormData({ ...editFormData, liq_prof_2: parseFloat(e.target.value) })}
                                            />
                                            <select
                                                className="p-2 border rounded-lg bg-white text-xs"
                                                value={editFormData.liq_prof_2_currency}
                                                onChange={(e) => setEditFormData({ ...editFormData, liq_prof_2_currency: e.target.value })}
                                            >
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Liq. Anest ($)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                className="w-full p-2 border rounded-lg bg-white"
                                                value={editFormData.liq_anestesista || 0}
                                                onChange={(e) => setEditFormData({ ...editFormData, liq_anestesista: parseFloat(e.target.value) })}
                                            />
                                            <select
                                                className="p-2 border rounded-lg bg-white text-xs"
                                                value={editFormData.liq_anestesista_currency}
                                                onChange={(e) => setEditFormData({ ...editFormData, liq_anestesista_currency: e.target.value })}
                                            >
                                                <option value="ARS">ARS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleUpdateEntry} className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 flex justify-center items-center gap-2">
                                <Save size={20} /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{printStyle}</style>
        </div >
    );
};

export default LiquidacionView;
