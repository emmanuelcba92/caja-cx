import React, { useState, useEffect } from 'react';
import { Search, Edit, Edit2, Trash2, Check, X, Calendar, DollarSign, User, Folder, ChevronRight, Home, ArrowLeft, FileText, Printer, Settings, Lock, Database, ChevronLeft } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import ExcelJS from 'exceljs';
// Helper function to wait for Firestore writes to propagate
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to format month names
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const HistorialCaja = () => {
    const { currentUser: user, viewingUid, permission } = useAuth();
    const isReadOnly = permission === 'viewer';
    // Force Landscape for this view
    const printStyle = `
      @media print {
        @page { size: landscape; margin: 10mm; }
        .no-print { display: none !important; }
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
        if (!user) return alert("Debes estar logueado.");

        const entryData = {
            ...newEntry,
            fecha: selectedDate,
            userId: viewingUid,
            createdAt: new Date().toISOString(),
            // Defaults
            pesos: parseFloat(newEntry.pesos) || 0,
            dolares: parseFloat(newEntry.dolares) || 0,
            liq_prof_1: parseFloat(newEntry.liq_prof_1) || 0,
            liq_prof_1_secondary: parseFloat(newEntry.liq_prof_1_secondary) || 0,
            liq_prof_2: parseFloat(newEntry.liq_prof_2) || 0,
            liq_prof_2_secondary: parseFloat(newEntry.liq_prof_2_secondary) || 0,
            liq_prof_3: parseFloat(newEntry.liq_prof_3) || 0,
            liq_prof_3_secondary: parseFloat(newEntry.liq_prof_3_secondary) || 0,
            liq_prof_1_currency: newEntry.liq_prof_1_currency || 'ARS',
            liq_prof_1_currency_secondary: newEntry.liq_prof_1_currency_secondary || 'USD',
            liq_prof_2_currency: newEntry.liq_prof_2_currency || 'ARS',
            liq_prof_2_currency_secondary: newEntry.liq_prof_2_currency_secondary || 'USD',
            liq_prof_3_currency: newEntry.liq_prof_3_currency || 'ARS',
            liq_prof_3_currency_secondary: newEntry.liq_prof_3_currency_secondary || 'USD',
            showSecondary_1: !!newEntry.liq_prof_1_secondary,
            showSecondary_2: !!newEntry.liq_prof_2_secondary,
            showSecondary_3: !!newEntry.liq_prof_3_secondary,
            liq_anestesista: parseFloat(newEntry.liq_anestesista) || 0,
            liq_anestesista_currency: newEntry.liq_anestesista_currency || 'ARS',
            coat_pesos: parseFloat(newEntry.coat_pesos) || 0,
            coat_dolares: parseFloat(newEntry.coat_dolares) || 0,
            prof_1: newEntry.prof_1 || '',
            prof_2: newEntry.prof_2 || '',
            prof_3: newEntry.prof_3 || '',
            anestesista: newEntry.anestesista || '',
            paciente: newEntry.paciente,
            dni: newEntry.dni || '',
            obra_social: newEntry.obra_social || ''
        };

        try {
            await addDoc(collection(db, "caja"), entryData);
            alert("Paciente agregado correctamente");
            setShowAddModal(false);
            setNewEntry({});
            fetchHistory(); // Refresh list
        } catch (error) {
            console.error(error);
            alert("Error de conexión al guardar.");
        }
    };

    const fetchHistory = async () => {
        if (!viewingUid) return;
        try {
            const q = query(collection(db, "caja"), where("userId", "==", viewingUid));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort by date desc, then by createdAt asc (to preserve input order)
            data.sort((a, b) => {
                const dateA = new Date(a.fecha);
                const dateB = new Date(b.fecha);
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateB - dateA; // Newest date first
                }
                // Same date, sort by creation time (Oldest/First input first)
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
            setHistory(data.filter(item =>
                !item.isManualLiquidation &&
                !item.paciente.toLowerCase().includes('(liq. manual)')
            ));
        } catch (error) {
            console.error("Error fetching history:", error);
        }
    };

    const fetchProfs = async () => {
        if (!viewingUid) return;
        try {
            const q = query(collection(db, "profesionales"), where("userId", "==", viewingUid));
            const querySnapshot = await getDocs(q);
            const profs = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProfesionales(profs);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    useEffect(() => {
        fetchHistory();
        fetchProfs();
    }, [viewingUid]);

    // Fetch daily comment when a date is selected
    useEffect(() => {
        if (selectedDate && viewingUid) {
            const fetchComment = async () => {
                const q = query(collection(db, "daily_comments"),
                    where("userId", "==", viewingUid),
                    where("date", "==", selectedDate)
                );
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    setDailyComment(snapshot.docs[0].data().comment);
                } else {
                    setDailyComment('');
                }
            };
            fetchComment();
        }
    }, [selectedDate, user]);

    // --- Data Processing for Hierarchy ---
    const getYears = () => {
        if (!history) return [];
        const years = [...new Set(history.map(item => item.fecha ? item.fecha.split('-')[0] : ''))];
        return years.filter(y => y).sort().reverse();
    };

    const getMonths = (year) => {
        const months = [...new Set(history
            .filter(item => item.fecha && item.fecha.startsWith(year))
            .map(item => parseInt(item.fecha.split('-')[1]) - 1)
        )];
        return months.sort((a, b) => a - b);
    };

    const getDays = (year, month) => {
        // month is 0-indexed integer here
        const monthStr = (month + 1).toString().padStart(2, '0');
        const prefix = `${year}-${monthStr}`;
        const days = [...new Set(history
            .filter(item => item.fecha && item.fecha.startsWith(prefix))
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

    // --- Backup Feature ---
    const handleBackup = async () => {
        if (!isAdmin) return alert("Solo el administrador puede realizar copias de seguridad.");
        if (!window.confirm("¿Descargar copia de seguridad completa (JSON) de todas las cajas históricas?")) return;

        try {
            // Fetch ALL boxes for current user
            const q = query(
                collection(db, "caja"),
                where("userId", "==", viewingUid)
            );
            const snapshot = await getDocs(q);
            const allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Create Blob
            const jsonString = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            // Trigger Download
            const link = document.createElement('a');
            link.href = url;
            link.download = `backup_caja_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            alert(`Backup completado. ${allData.length} registros exportados.`);

        } catch (error) {
            console.error("Backup error:", error);
            alert("Error al generar backup.");
        }
    };

    // --- Security & Config ---
    // --- Security & Config ---
    const handleUnlock = async () => {
        try {
            if (!viewingUid) {
                alert("Error de sesión. Recargue la página.");
                return;
            }
            const settingsRef = doc(db, "user_settings", viewingUid);
            const settingsSnap = await getDoc(settingsRef);

            if (settingsSnap.exists() && settingsSnap.data().adminPin) {
                const userPin = settingsSnap.data().adminPin;
                if (pinInput === userPin) {
                    setIsAdmin(true);
                    setShowPinModal(false);
                    setPinInput('');
                } else {
                    alert("PIN Incorrecto");
                    setPinInput('');
                }
            } else {
                alert("No tiene un PIN configurado. Vaya a Configuración (Menú Usuario) para crear uno.");
                setPinInput('');
            }
        } catch (error) {
            console.error("Error verifying PIN:", error);
            alert("Error al verificar PIN. Intente nuevamente.");
        }
    };

    // --- Daily Comment Logic ---
    // (Already handled in useEffect)

    // --- State for Comment Edit ---
    const [isEditingComment, setIsEditingComment] = useState(false);


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
        if (isReadOnly) return;
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
            const docRef = doc(db, "caja", editId);
            await updateDoc(docRef, editFormData);
            setEditId(null);
            fetchHistory();
            alert("Entrada actualizada");
        } catch (error) {
            console.error("Error updating:", error);
            alert("Error de conexión al actualizar");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta entrada?")) return;
        try {
            await deleteDoc(doc(db, "caja", id));
            fetchHistory();
            alert("Entrada eliminada");
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Error al eliminar");
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('print-content');
        if (!printContent) return;

        // Clone the content to not affect the current view
        // Ensure image path is absolute
        const content = printContent.innerHTML.replace(/src="\/coat_logo.png"/g, `src="${window.location.origin}/coat_logo.png"`);

        // Open new window
        const printWindow = window.open('', '_blank', 'height=600,width=800');

        if (printWindow) {
            printWindow.document.write(`
                <html>
                <head>
                    <title>Caja de Cirugía - ${selectedDate || ''}</title>
                    <style>
                        /* Excel-like Styles */
                        body { font-family: Arial, sans-serif; padding: 15px; font-size: 10px; color: black; }
                        table { width: 100%; border-collapse: collapse; font-size: 10px; }
                        th { border: 1px solid #9CA3AF; padding: 3px 4px; text-align: left; font-weight: bold; background-color: #F3F4F6; }
                        td { border: 1px solid #D1D5DB; padding: 2px 4px; text-align: left; }
                        
                        .text-right { text-align: right; }
                        .text-left { text-align: left; }
                        .text-center { text-align: center; }
                        .font-bold { font-weight: bold; }
                        .font-medium { font-weight: 500; }
                        
                        .flex { display: flex; }
                        .items-start { align-items: flex-start; }
                        .gap-8 { gap: 2rem; }
                        .mb-4 { margin-bottom: 1rem; }
                        .mb-3 { margin-bottom: 0.75rem; }
                        
                        .text-sm { font-size: 12px; }
                        .text-xs { font-size: 10px; }
                        .text-\\[10px\\] { font-size: 10px; }
                        .text-\\[9px\\] { font-size: 9px; }
                        
                        .text-gray-500 { color: #6B7280; }
                        .text-gray-600 { color: #4B5563; }
                        .bg-gray-100 { background-color: #F3F4F6; }
                        
                        p { margin: 0; }
                        img { height: 56px; object-fit: contain; }
                        
                        /* Footer total row */
                        tfoot td { background-color: #F3F4F6; }
                        
                        @media print {
                            @page { size: landscape; margin: 0.5cm; }
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    ${content}
                </body>
                </html>
            `);

            printWindow.document.close();
            printWindow.focus();

            // Wait for image to load before printing
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
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
        const worksheet = workbook.addWorksheet('Caja', {
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

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
        worksheet.getRow(7).values = ['Paciente', 'DNI', 'Obra social', 'Prof. 1', 'Prof. 2', 'Prof. 3', 'Pesos', 'Dolares', 'Liq. P1', 'Liq. P2', 'Liq. P3', 'Anest.', 'Liq. Anest.', 'Coat $', 'Coat USD'];

        // Merge Headers for Monto COAT
        worksheet.mergeCells('N6:O6');
        worksheet.getCell('N6').value = 'Monto COAT';
        worksheet.getCell('N6').alignment = { horizontal: 'center' };
        worksheet.getCell('N6').font = { bold: true };

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
                item.prof_1 || '',
                item.prof_2 || '',
                item.prof_3 || '',
                item.pesos,
                item.dolares,
                // Liq P1
                `${item.liq_prof_1_currency === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_1)}${item.liq_prof_1_secondary ? ' / ' + (item.liq_prof_1_currency_secondary === 'USD' ? 'USD' : '$') + ' ' + formatMoney(item.liq_prof_1_secondary) : ''}`,
                // Liq P2
                `${item.liq_prof_2_currency === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_2)}${item.liq_prof_2_secondary ? ' / ' + (item.liq_prof_2_currency_secondary === 'USD' ? 'USD' : '$') + ' ' + formatMoney(item.liq_prof_2_secondary) : ''}`,
                // Liq P3
                `${item.liq_prof_3_currency === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_3)}${item.liq_prof_3_secondary ? ' / ' + (item.liq_prof_3_currency_secondary === 'USD' ? 'USD' : '$') + ' ' + formatMoney(item.liq_prof_3_secondary) : ''}`,
                item.anestesista || '',
                item.liq_anestesista > 0 ? `${item.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_anestesista)}` : '-',
                item.coat_pesos,
                item.coat_dolares
            ];

            // Formatting
            [7, 8, 10, 11, 12, 14, 15].forEach(col => row.getCell(col).numFmt = '#,##0.00');

            totalCoatPesos += item.coat_pesos || 0;
            totalCoatDolares += item.coat_dolares || 0;
            rowIndex++;
        });

        // Totals
        const totalRow = worksheet.getRow(rowIndex + 2);
        totalRow.getCell(13).value = 'Total';
        totalRow.getCell(13).font = { bold: true };
        totalRow.getCell(14).value = totalCoatPesos;
        totalRow.getCell(14).numFmt = '#,##0.00'; // Format money default
        totalRow.getCell(14).font = { bold: true, underline: true };
        totalRow.getCell(15).value = totalCoatDolares;
        totalRow.getCell(15).numFmt = '#,##0.00';
        totalRow.getCell(15).font = { bold: true, underline: true };

        // Global Comment
        const commentRowIndex = Math.max(18, rowIndex + 5);
        worksheet.mergeCells(`A${commentRowIndex}:E${commentRowIndex}`);
        const commentCell = worksheet.getCell(`A${commentRowIndex}`);
        commentCell.value = dailyComment || '';
        commentCell.font = { italic: true, color: { argb: 'FF666666' } };

        // Widths
        worksheet.columns = [
            { width: 25 }, { width: 15 }, { width: 20 },
            { width: 20 }, { width: 20 }, { width: 20 },
            { width: 15 }, { width: 15 },
            { width: 15 }, { width: 15 }, { width: 15 },
            { width: 20 }, { width: 20 },
            { width: 15 }, { width: 15 }
        ];

        // --- 2. INDIVIDUAL SHEETS (LIQUIDATIONS) ---
        const profs = new Set();
        dataToExport.forEach(item => {
            if (item.prof_1) profs.add(item.prof_1);
            if (item.prof_2) profs.add(item.prof_2);
            if (item.prof_3) profs.add(item.prof_3);
            if (item.anestesista) profs.add(item.anestesista);
        });

        for (const prof of profs) {
            const sheetName = `Liq ${prof}`.substring(0, 31).replace(/[\\/?*[\]]/g, ''); // Sanitize
            const ps = workbook.addWorksheet(sheetName, {
                pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
            });
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
                item.prof_1 === prof || item.prof_2 === prof || item.prof_3 === prof || item.anestesista === prof
            );

            profRows.forEach(item => {
                // Determine Liq Amount & Currency
                let liqAmount = 0;
                let liqCurrency = 'ARS'; // Default or assumption

                if (item.prof_1 === prof) {
                    liqAmount = item.liq_prof_1;
                    liqCurrency = item.liq_prof_1_currency || 'ARS';
                    // Check secondary
                    if (item.liq_prof_1_secondary > 0) {
                        if (item.liq_prof_1_currency_secondary === 'USD') totalLiqDolares += (parseFloat(item.liq_prof_1_secondary) || 0);
                        else totalLiqPesos += (parseFloat(item.liq_prof_1_secondary) || 0);
                    }
                } else if (item.prof_2 === prof) {
                    liqAmount = item.liq_prof_2;
                    liqCurrency = item.liq_prof_2_currency || 'ARS';
                    if (item.liq_prof_2_secondary > 0) {
                        if (item.liq_prof_2_currency_secondary === 'USD') totalLiqDolares += (parseFloat(item.liq_prof_2_secondary) || 0);
                        else totalLiqPesos += (parseFloat(item.liq_prof_2_secondary) || 0);
                    }
                } else if (item.prof_3 === prof) {
                    liqAmount = item.liq_prof_3;
                    liqCurrency = item.liq_prof_3_currency || 'ARS';
                    if (item.liq_prof_3_secondary > 0) {
                        if (item.liq_prof_3_currency_secondary === 'USD') totalLiqDolares += (parseFloat(item.liq_prof_3_secondary) || 0);
                        else totalLiqPesos += (parseFloat(item.liq_prof_3_secondary) || 0);
                    }
                } else if (item.anestesista === prof) {
                    liqAmount = item.liq_anestesista;
                    liqCurrency = item.liq_anestesista_currency || 'ARS';
                }

                if (liqCurrency === 'USD') totalLiqDolares += (parseFloat(liqAmount) || 0);
                else totalLiqPesos += (parseFloat(liqAmount) || 0);

                const prow = ps.getRow(pRowIdx);
                // Detail liquidation column with potential secondary
                let liqDetail = `${liqCurrency === 'USD' ? 'USD' : '$'} ${formatMoney(liqAmount)}`;
                if (prof === item.prof_1 && item.liq_prof_1_secondary > 0) liqDetail += ` / ${item.liq_prof_1_currency_secondary === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_1_secondary)}`;
                else if (prof === item.prof_2 && item.liq_prof_2_secondary > 0) liqDetail += ` / ${item.liq_prof_2_currency_secondary === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_2_secondary)}`;
                else if (prof === item.prof_3 && item.liq_prof_3_secondary > 0) liqDetail += ` / ${item.liq_prof_3_currency_secondary === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_3_secondary)}`;

                prow.values = [
                    item.paciente,
                    item.dni,
                    item.obra_social,
                    item.pesos,
                    item.dolares,
                    liqDetail
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

        // Check auth
        if (!viewingUid) return alert("Debes estar logueado");

        // Double confirmation for safety
        if (!window.confirm("¿De verdad? Se borrará toda la caja de ese día.")) return;

        try {
            const batch = writeBatch(db);
            const q = query(collection(db, "caja"),
                where("userId", "==", viewingUid),
                where("fecha", "==", selectedDate)
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                alert("No hay registros para eliminar en este día.");
                return;
            }

            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();

            alert("Día eliminado correctamente.");
            setSelectedDate(null);
            setView('months');
            fetchHistory();
        } catch (error) {
            console.error(error);
            alert("Error al eliminar el día: " + error.message);
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
                            maxLength={8}
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



            {/* PRINT ONLY LAYOUT - Formato Excel */}
            <div id="print-content" className="print-section p-4 bg-white text-black">
                {/* Header con Logo arriba */}
                <div className="mb-2">
                    <img src="/coat_logo.png" alt="COAT" className="h-14 object-contain" />
                </div>
                {/* Título y fecha debajo del logo */}
                <div className="mb-4 flex gap-8">
                    <p className="text-sm font-bold">Caja de cirugía</p>
                    <p className="text-sm">{selectedDate ? selectedDate.split('-').reverse().join('/') : ''}</p>
                </div>

                {selectedDate && dailyComment && (
                    <div className="mb-3 text-xs italic text-gray-600">
                        <strong>Comentario:</strong> {dailyComment}
                    </div>
                )}

                <table className="w-full text-[10px] border-collapse">
                    <thead>
                        <tr>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">Paciente</th>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">DNI</th>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">Obra social</th>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">Prof. 1</th>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">Prof. 2</th>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">Prof. 3</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Pesos</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Dolares</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Liq. P1</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Liq. P2</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Liq. P3</th>
                            <th className="border border-gray-400 px-1 py-1 text-left font-bold bg-gray-100">Anest.</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Liq. Anest.</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Coat $</th>
                            <th className="border border-gray-400 px-1 py-1 text-right font-bold bg-gray-100">Coat USD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((item, idx) => (
                            <tr key={idx}>
                                <td className="border border-gray-300 px-1 py-0.5">{item.paciente}</td>
                                <td className="border border-gray-300 px-1 py-0.5">{item.dni}</td>
                                <td className="border border-gray-300 px-1 py-0.5">{item.obra_social}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-[9px]">{item.prof_1 || ''}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-[9px]">{item.prof_2 || ''}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-[9px]">{item.prof_3 || ''}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatMoney(item.pesos)}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right">{formatMoney(item.dolares)}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right">
                                    {item.liq_prof_1_currency === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_1)}
                                    {item.liq_prof_1_secondary > 0 && <span className="text-gray-500"> / {item.liq_prof_1_currency_secondary === 'USD' ? 'USD' : '$'} {formatMoney(item.liq_prof_1_secondary)}</span>}
                                </td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right">
                                    {item.liq_prof_2_currency === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_2)}
                                    {item.liq_prof_2_secondary > 0 && <span className="text-gray-500"> / {item.liq_prof_2_currency_secondary === 'USD' ? 'USD' : '$'} {formatMoney(item.liq_prof_2_secondary)}</span>}
                                </td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right">
                                    {item.liq_prof_3_currency === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_3)}
                                    {item.liq_prof_3_secondary > 0 && <span className="text-gray-500"> / {item.liq_prof_3_currency_secondary === 'USD' ? 'USD' : '$'} {formatMoney(item.liq_prof_3_secondary)}</span>}
                                </td>
                                <td className="border border-gray-300 px-1 py-0.5 text-[9px]">{item.anestesista || ''}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right">
                                    {item.liq_anestesista > 0 ? `${item.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_anestesista)}` : '-'}
                                </td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right font-medium">{formatMoney(item.coat_pesos)}</td>
                                <td className="border border-gray-300 px-1 py-0.5 text-right font-medium">{formatMoney(item.coat_dolares)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold">
                            <td colSpan="13" className="border border-gray-400 px-1 py-1 text-right">Total</td>
                            <td className="border border-gray-400 px-1 py-1 text-right bg-gray-100">
                                {formatMoney(tableData.reduce((acc, curr) => acc + (parseFloat(curr.coat_pesos) || 0), 0))}
                            </td>
                            <td className="border border-gray-400 px-1 py-1 text-right bg-gray-100">
                                {formatMoney(tableData.reduce((acc, curr) => acc + (parseFloat(curr.coat_dolares) || 0), 0))}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* SCREEN CONTENT WRAPPER */}
            <div id="screen-content">
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
                                    <button onClick={handleBackup} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 text-sm">
                                        <Database size={16} /> Backup
                                    </button>
                                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200">
                                        <User size={16} /> Agregar Paciente
                                    </button>
                                    <button onClick={handleDeleteDay} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all font-bold shadow-lg shadow-red-200">
                                        <Trash2 size={16} /> Eliminar Día
                                    </button>
                                    <button onClick={() => isAdmin ? setIsAdmin(false) : setShowPinModal(true)} className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all ${isAdmin ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                        {isAdmin ? <><Lock size={16} /> Bloquear Edición</> : <><Lock size={16} /> Admin</>}
                                    </button>

                                </div>
                            ) : (
                                !isReadOnly && (
                                    <button onClick={() => setShowPinModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl border border-slate-200 font-bold text-sm hover:bg-slate-200 transition-colors">
                                        <Lock size={16} /> Modo Admin
                                    </button>
                                )
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
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                                            <label className="text-xs font-bold text-slate-500 uppercase">Prof. 3</label>
                                            <select className="w-full p-2 border rounded-lg" value={newEntry.prof_3 || ''} onChange={(e) => setNewEntry({ ...newEntry, prof_3: e.target.value })}>
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
                                            <div className="flex flex-col gap-1">
                                                <div className="flex gap-1">
                                                    <input type="number" className="w-full p-1 border rounded" value={newEntry.liq_prof_1 || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_1: e.target.value })} />
                                                    <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_1_currency || 'ARS'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_1_currency: e.target.value })}>
                                                        <option value="ARS">ARS</option>
                                                        <option value="USD">USD</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-1">
                                                    <input type="number" placeholder="Sec." className="w-full p-1 border rounded text-xs" value={newEntry.liq_prof_1_secondary || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_1_secondary: e.target.value })} />
                                                    <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_1_currency_secondary || 'USD'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_1_currency_secondary: e.target.value })}>
                                                        <option value="ARS">ARS</option>
                                                        <option value="USD">USD</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2">
                                            <p className="font-bold text-indigo-800">Liq. Prof 2</p>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex gap-1">
                                                    <input type="number" className="w-full p-1 border rounded" value={newEntry.liq_prof_2 || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_2: e.target.value })} />
                                                    <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_2_currency || 'ARS'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_2_currency: e.target.value })}>
                                                        <option value="ARS">ARS</option>
                                                        <option value="USD">USD</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-1">
                                                    <input type="number" placeholder="Sec." className="w-full p-1 border rounded text-xs" value={newEntry.liq_prof_2_secondary || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_2_secondary: e.target.value })} />
                                                    <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_2_currency_secondary || 'USD'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_2_currency_secondary: e.target.value })}>
                                                        <option value="ARS">ARS</option>
                                                        <option value="USD">USD</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100 space-y-2">
                                            <p className="font-bold text-teal-800">Liq. Prof 3</p>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex gap-1">
                                                    <input type="number" className="w-full p-1 border rounded" value={newEntry.liq_prof_3 || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_3: e.target.value })} />
                                                    <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_3_currency || 'ARS'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_3_currency: e.target.value })}>
                                                        <option value="ARS">ARS</option>
                                                        <option value="USD">USD</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-1">
                                                    <input type="number" placeholder="Sec." className="w-full p-1 border rounded text-xs" value={newEntry.liq_prof_3_secondary || ''} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_3_secondary: e.target.value })} />
                                                    <select className="w-20 p-1 border rounded text-xs" value={newEntry.liq_prof_3_currency_secondary || 'USD'} onChange={(e) => setNewEntry({ ...newEntry, liq_prof_3_currency_secondary: e.target.value })}>
                                                        <option value="ARS">ARS</option>
                                                        <option value="USD">USD</option>
                                                    </select>
                                                </div>
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
                                            <th className="px-4 py-3 border-b text-teal-800 bg-teal-50/30">Prof. 3</th>
                                            <th className="px-4 py-3 border-b text-slate-700">Pago $</th>
                                            <th className="px-4 py-3 border-b text-emerald-700">Pago USD</th>
                                            <th className="px-4 py-3 border-b bg-blue-50/50 text-blue-900">Liq. P1</th>
                                            <th className="px-4 py-3 border-b bg-indigo-50/50 text-indigo-900">Liq. P2</th>
                                            <th className="px-4 py-3 border-b bg-teal-50/50 text-teal-900">Liq. P3</th>
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
                                                    <td className="px-4 py-3">{item.prof_3}</td>

                                                    <td className="px-4 py-3 text-right">{isEditing ? <input type="number" value={editFormData.pesos} onChange={(e) => handleChange('pesos', e.target.value)} className="w-20 bg-white border rounded" /> : `$${formatMoney(item.pesos)}`}</td>
                                                    <td className="px-4 py-3 text-right">{isEditing ? <input type="number" value={editFormData.dolares} onChange={(e) => handleChange('dolares', e.target.value)} className="w-20 bg-white border rounded" /> : `USD ${formatMoney(item.dolares)}`}</td>

                                                    {/* Simplified editing for liq cols for brevity - Added formatMoney wrap */}
                                                    <td className="px-4 py-3 text-right">
                                                        {isEditing ? (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex gap-1">
                                                                    <input type="number" value={editFormData.liq_prof_1 || 0} onChange={(e) => handleChange('liq_prof_1', e.target.value)} className="w-16 bg-white border rounded text-xs px-1" />
                                                                    <select value={editFormData.liq_prof_1_currency || 'ARS'} onChange={(e) => handleChange('liq_prof_1_currency', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                        <option value="ARS">ARS</option>
                                                                        <option value="USD">USD</option>
                                                                    </select>
                                                                </div>
                                                                <div className="flex gap-1">
                                                                    <input type="number" value={editFormData.liq_prof_1_secondary || 0} onChange={(e) => handleChange('liq_prof_1_secondary', e.target.value)} className="w-16 bg-white border rounded text-[10px] px-1" />
                                                                    <select value={editFormData.liq_prof_1_currency_secondary || 'USD'} onChange={(e) => handleChange('liq_prof_1_currency_secondary', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                        <option value="ARS">ARS</option>
                                                                        <option value="USD">USD</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span>{item.liq_prof_1_currency === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_1)}</span>
                                                                {item.liq_prof_1_secondary > 0 && <span className="text-[10px] opacity-60">{(item.liq_prof_1_currency_secondary || 'USD') === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_1_secondary)}</span>}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {isEditing ? (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex gap-1">
                                                                    <input type="number" value={editFormData.liq_prof_2 || 0} onChange={(e) => handleChange('liq_prof_2', e.target.value)} className="w-16 bg-white border rounded text-xs px-1" />
                                                                    <select value={editFormData.liq_prof_2_currency || 'ARS'} onChange={(e) => handleChange('liq_prof_2_currency', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                        <option value="ARS">ARS</option>
                                                                        <option value="USD">USD</option>
                                                                    </select>
                                                                </div>
                                                                <div className="flex gap-1">
                                                                    <input type="number" value={editFormData.liq_prof_2_secondary || 0} onChange={(e) => handleChange('liq_prof_2_secondary', e.target.value)} className="w-16 bg-white border rounded text-[10px] px-1" />
                                                                    <select value={editFormData.liq_prof_2_currency_secondary || 'USD'} onChange={(e) => handleChange('liq_prof_2_currency_secondary', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                        <option value="ARS">ARS</option>
                                                                        <option value="USD">USD</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span>{item.liq_prof_2_currency === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_2)}</span>
                                                                {item.liq_prof_2_secondary > 0 && <span className="text-[10px] opacity-60">{(item.liq_prof_2_currency_secondary || 'USD') === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_2_secondary)}</span>}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {isEditing ? (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex gap-1">
                                                                    <input type="number" value={editFormData.liq_prof_3 || 0} onChange={(e) => handleChange('liq_prof_3', e.target.value)} className="w-16 bg-white border rounded text-xs px-1" />
                                                                    <select value={editFormData.liq_prof_3_currency || 'ARS'} onChange={(e) => handleChange('liq_prof_3_currency', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                        <option value="ARS">ARS</option>
                                                                        <option value="USD">USD</option>
                                                                    </select>
                                                                </div>
                                                                <div className="flex gap-1">
                                                                    <input type="number" value={editFormData.liq_prof_3_secondary || 0} onChange={(e) => handleChange('liq_prof_3_secondary', e.target.value)} className="w-16 bg-white border rounded text-[10px] px-1" />
                                                                    <select value={editFormData.liq_prof_3_currency_secondary || 'USD'} onChange={(e) => handleChange('liq_prof_3_currency_secondary', e.target.value)} className="w-12 bg-white border rounded text-[10px]">
                                                                        <option value="ARS">ARS</option>
                                                                        <option value="USD">USD</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span>{item.liq_prof_3_currency === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_3)}</span>
                                                                {item.liq_prof_3_secondary > 0 && <span className="text-[10px] opacity-60">{(item.liq_prof_3_currency_secondary || 'USD') === 'USD' ? 'USD ' : '$'}{formatMoney(item.liq_prof_3_secondary)}</span>}
                                                            </div>
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
            </div> {/* End screen-content */}
            <style>{printStyle}</style>
            <div className="fixed bottom-1 left-2 text-[10px] text-slate-300 font-mono pointer-events-none z-50 no-print">
                Ultima actualización: 26/01/2026 - 19:53
            </div>
        </div >
    );
};

export default HistorialCaja;
