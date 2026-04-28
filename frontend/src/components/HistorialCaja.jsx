import React, { useState, useEffect } from 'react';
import { Search, Edit, Edit2, Trash2, Check, X, Calendar, DollarSign, User, Folder, ChevronRight, Home, ArrowLeft, FileText, Printer, Settings, Lock as LockIcon, Database, ChevronLeft, CircleHelp, Plus, Save, TrendingUp } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { isLocalEnv } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import ModalPortal from './common/ModalPortal';
import { scrollToTop } from '../utils/navigation';
// Dynamic import used for exceljs
// Helper function to wait for Firestore writes to propagate
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to format month names
const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];


const HistorialCaja = () => {
    const { currentUser: user, viewingUid, catalogOwnerUid, permission, permissions } = useAuth();
    const isReadOnly = permission === 'viewer' || permissions?.readonly_caja;
    // Force Landscape for this view
    const printStyle = `
      @media print {
        @page { size: landscape; margin: 10mm; }
        .no-print { display: none !important; }
        body { background: white !important; color: black !important; color-scheme: light !important; }
        * {
            color: black !important;
            background-color: transparent !important;
            border-color: #ccc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        /* Specific overrides for common dark headers in this app */
        .bg-slate-900, .bg-black, .bg-slate-800, .text-white {
            background-color: #f1f5f9 !important;
            color: black !important;
        }
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
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');
    const [isExportingRange, setIsExportingRange] = useState(false);

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
            userId: catalogOwnerUid || viewingUid,
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
            obra_social: newEntry.obra_social || '',
            createdBy: user?.email || 'unknown'
        };

        try {
            await addDoc(collection(db, "caja"), entryData);
            alert("Paciente agregado correctamente");
            setShowAddModal(false);
            setNewEntry({});
            fetchHistory(); // Refresh list
            scrollToTop();
        } catch (error) {
            console.error(error);
            alert("Error de conexión al guardar.");
        }
    };

    const fetchHistory = async () => {
        try {
            // "Todos ven todo": ya no filtramos por userId
            const q = query(collection(db, "caja"));
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
        try {
            // "Todos ven todo": ya no filtramos por userId para los profesionales
            const q = query(collection(db, "profesionales"));
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
    }, [viewingUid, catalogOwnerUid]);

    // Fetch daily comment when a date is selected
    useEffect(() => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (selectedDate && ownerToUse) {
            const fetchComment = async () => {
                const q = query(collection(db, "daily_comments"),
                    where("userId", "==", ownerToUse),
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
    }, [selectedDate, user, catalogOwnerUid, viewingUid]);

    const saveDailyComment = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            const q = query(collection(db, "daily_comments"),
                where("userId", "==", ownerToUse),
                where("date", "==", selectedDate)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                await apiService.updateDocument("daily_comments", snapshot.docs[0].id, {
                    comment: dailyComment,
                    timestamp: new Date().toISOString()
                });
            } else if (dailyComment.trim()) {
                await apiService.addDocument("daily_comments", {
                    date: selectedDate,
                    comment: dailyComment,
                    userId: ownerToUse,
                    timestamp: new Date().toISOString()
                });
            }
            setIsEditingComment(false);
            alert("Comentario general actualizado.");
        } catch (error) {
             console.error("Error saving daily comment", error);
             alert("Error guardando comentario: " + error.message);
        }
    };

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
        return months.sort((a, b) => b - a);
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
            // Fetch ALL boxes for current user/catalog
            const ownerToUse = catalogOwnerUid || viewingUid;
            const q = query(
                collection(db, "caja"),
                where("userId", "==", ownerToUse)
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
            const ownerToUse = catalogOwnerUid || viewingUid;
            if (!ownerToUse) {
                alert("Error de sesión. Recargue la página.");
                return;
            }
            const settingsRef = doc(db, "user_settings", ownerToUse);
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
        if (!item.id) {
            alert("Error: Este registro no tiene ID válido. Recarga la página.");
            return;
        }
        if (isReadOnly) return;

        // --- ENFORCE OWN RECORDS POLICY ---
        const canManageAny = permissions?.can_delete_data || isSuperAdmin;
        const isOwner = item.createdBy === user?.email;
        if (!canManageAny && !isOwner) {
            alert("Solo puedes editar registros cargados por ti mismo.");
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

    const handleDelete = async (item) => {
        if (isLocalEnv) {
            alert("🔒 SEGURIDAD: No se permite borrar el historial de la nube desde local.");
            return;
        }

        // --- ENFORCE OWN RECORDS POLICY ---
        const canManageAny = permissions?.can_delete_data || isSuperAdmin;
        const isOwner = item.createdBy === user?.email;
        if (!canManageAny && !isOwner) {
            alert("Solo puedes eliminar registros cargados por ti mismo.");
            return;
        }

        if (!window.confirm("¿Seguro que quieres eliminar este registro permanentemente?")) return;
        try {
            await deleteDoc(doc(db, "caja", item.id));
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
                        .flex-col { flex-direction: column; }
                        .items-center { align-items: center; }
                        .items-baseline { align-items: baseline; }
                        .justify-between { justify-content: space-between; }
                        .gap-4 { gap: 1rem; }
                        .gap-8 { gap: 2rem; }
                        
                        .text-3xl { font-size: 1.875rem; }
                        .text-2xl { font-size: 1.5rem; }
                        .text-xl { font-size: 1.25rem; }
                        .text-sm { font-size: 12px; }
                        .text-xs { font-size: 10px; }
                        .text-\\[10px\\] { font-size: 10px; }
                        
                        .font-black { font-weight: 900; }
                        .font-bold { font-weight: 700; }
                        .uppercase { text-transform: uppercase; }
                        .tracking-tighter { letter-spacing: -0.05em; }
                        .tracking-tight { letter-spacing: -0.025em; }
                        
                        .text-slate-500 { color: #64748b; }
                        .text-gray-400 { color: #9CA3AF; }
                        .text-gray-700 { color: #374151; }
                        .bg-gray-50 { background-color: #F9FAFB; }
                        .bg-gray-100 { background-color: #F3F4F6; }
                        
                        .border { border: 1px solid #E5E7EB; }
                        .border-b-4 { border-bottom: 4px solid black; }
                        .border-gray-200 { border-color: #E5E7EB; }
                        
                        .p-6 { padding: 1.5rem; }
                        .pb-6 { padding-bottom: 1.5rem; }
                        .mb-1 { margin-bottom: 0.25rem; }
                        .mb-8 { margin-bottom: 2rem; }
                        .m-0 { margin: 0; }
                        
                        .rounded-2xl { border-radius: 1rem; }
                        .italic { font-style: italic; }
                        .leading-relaxed { line-height: 1.625; }
                        
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
    const generateDailyExcelWorkbookBuffer = async (dataToExport, dateStr, commentStr) => {
        const ExcelJS = (await import('exceljs')).default || await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        
        const loadImage = async (url) => {
            const response = await fetch(url);
            const blob = await response.blob();
            return blob.arrayBuffer();
        };

        const headerStyle = { font: { name: 'Arial', size: 10, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border: { bottom: { style: 'thin' } } };
        const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const worksheet = workbook.addWorksheet('Caja', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });

        const addHeaderToSheet = async (ws, titlePrefix) => {
            try {
                const logoBuffer = await loadImage('/coat_logo.png');
                const logoId = workbook.addImage({ buffer: logoBuffer, extension: 'png' });
                ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 180, height: 60 } });
            } catch (e) {
                ws.mergeCells('A1:C3');
                const logoCell = ws.getCell('A1');
                logoCell.value = 'COAT\nCENTRO OTORRINOLARINGOLÓGICO';
                logoCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
            }
            ws.getCell('A5').value = titlePrefix;
            ws.getCell('A5').font = { bold: true };
            ws.getCell('B5').value = dateStr.split('-').reverse().join('/');
        };

        await addHeaderToSheet(worksheet, 'Caja de cirugía');

        worksheet.getRow(7).values = ['Paciente', 'DNI', 'Obra social', 'Prof. 1', 'Prof. 2', 'Prof. 3', 'Pesos', 'Dolares', 'Liq. P1', 'Liq. P2', 'Liq. P3', 'Anest.', 'Liq. Anest.', 'Coat $', 'Coat USD'];
        worksheet.mergeCells('N6:O6');
        worksheet.getCell('N6').value = 'Monto COAT';
        worksheet.getCell('N6').alignment = { horizontal: 'center' };
        worksheet.getCell('N6').font = { bold: true };

        worksheet.getRow(7).eachCell((cell) => {
            cell.font = headerStyle.font;
            cell.alignment = headerStyle.alignment;
            cell.border = headerStyle.border;
        });

        let rowIndex = 8;
        let totalCoatPesos = 0;
        let totalCoatDolares = 0;

        dataToExport.forEach(item => {
            const row = worksheet.getRow(rowIndex);
            row.values = [
                item.paciente, item.dni, item.obra_social, item.prof_1 || '', item.prof_2 || '', item.prof_3 || '',
                item.pesos, item.dolares,
                `${item.liq_prof_1_currency === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_1)}${item.liq_prof_1_secondary ? ' / ' + (item.liq_prof_1_currency_secondary === 'USD' ? 'USD' : '$') + ' ' + formatMoney(item.liq_prof_1_secondary) : ''}`,
                `${item.liq_prof_2_currency === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_2)}${item.liq_prof_2_secondary ? ' / ' + (item.liq_prof_2_currency_secondary === 'USD' ? 'USD' : '$') + ' ' + formatMoney(item.liq_prof_2_secondary) : ''}`,
                `${item.liq_prof_3_currency === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_3)}${item.liq_prof_3_secondary ? ' / ' + (item.liq_prof_3_currency_secondary === 'USD' ? 'USD' : '$') + ' ' + formatMoney(item.liq_prof_3_secondary) : ''}`,
                item.anestesista || '',
                item.liq_anestesista > 0 ? `${item.liq_anestesista_currency === 'USD' ? 'USD ' : '$'}${formatMoney(item.liq_anestesista)}` : '-',
                item.coat_pesos, item.coat_dolares
            ];
            [7, 8, 10, 11, 12, 14, 15].forEach(col => row.getCell(col).numFmt = '#,##0.00');
            totalCoatPesos += item.coat_pesos || 0;
            totalCoatDolares += item.coat_dolares || 0;
            rowIndex++;
        });

        const totalRow = worksheet.getRow(rowIndex + 2);
        totalRow.getCell(13).value = 'Total';
        totalRow.getCell(13).font = { bold: true };
        totalRow.getCell(14).value = totalCoatPesos;
        totalRow.getCell(14).numFmt = '#,##0.00';
        totalRow.getCell(14).font = { bold: true, underline: true };
        totalRow.getCell(15).value = totalCoatDolares;
        totalRow.getCell(15).numFmt = '#,##0.00';
        totalRow.getCell(15).font = { bold: true, underline: true };

        const commentRowIndex = Math.max(18, rowIndex + 5);
        worksheet.mergeCells(`A${commentRowIndex}:E${commentRowIndex}`);
        const commentCell = worksheet.getCell(`A${commentRowIndex}`);
        commentCell.value = commentStr || '';
        commentCell.font = { italic: true, color: { argb: 'FF666666' } };

        worksheet.columns = [{ width: 25 }, { width: 15 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 20 }, { width: 20 }, { width: 15 }, { width: 15 }];

        const profs = new Set();
        dataToExport.forEach(item => {
            if (item.prof_1) profs.add(item.prof_1);
            if (item.prof_2) profs.add(item.prof_2);
            if (item.prof_3) profs.add(item.prof_3);
            if (item.anestesista) profs.add(item.anestesista);
        });

        for (const prof of profs) {
            const sheetName = `Liq ${prof}`.substring(0, 31).replace(/[\\/?*[\]]/g, '');
            const ps = workbook.addWorksheet(sheetName, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
            await addHeaderToSheet(ps, `Liquidación: ${prof}`);

            ps.getRow(7).values = ['Paciente', 'DNI', 'Obra Social', 'Cobro Pesos', 'Cobro USD', 'Liquidación'];
            ps.getRow(7).eachCell((cell) => {
                cell.font = headerStyle.font;
                cell.alignment = headerStyle.alignment;
                cell.border = headerStyle.border;
            });

            let pRowIdx = 8;
            let totalLiqPesos = 0;
            let totalLiqDolares = 0;

            const profRows = dataToExport.filter(item => item.prof_1 === prof || item.prof_2 === prof || item.prof_3 === prof || item.anestesista === prof);

            profRows.forEach(item => {
                let liqAmount = 0;
                let liqCurrency = 'ARS';

                if (item.prof_1 === prof) {
                    liqAmount = item.liq_prof_1;
                    liqCurrency = item.liq_prof_1_currency || 'ARS';
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
                let liqDetail = `${liqCurrency === 'USD' ? 'USD' : '$'} ${formatMoney(liqAmount)}`;
                if (prof === item.prof_1 && item.liq_prof_1_secondary > 0) liqDetail += ` / ${item.liq_prof_1_currency_secondary === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_1_secondary)}`;
                else if (prof === item.prof_2 && item.liq_prof_2_secondary > 0) liqDetail += ` / ${item.liq_prof_2_currency_secondary === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_2_secondary)}`;
                else if (prof === item.prof_3 && item.liq_prof_3_secondary > 0) liqDetail += ` / ${item.liq_prof_3_currency_secondary === 'USD' ? 'USD' : '$'} ${formatMoney(item.liq_prof_3_secondary)}`;

                prow.values = [item.paciente, item.dni, item.obra_social, item.pesos, item.dolares, liqDetail];
                prow.getCell(4).numFmt = '#,##0.00';
                prow.getCell(5).numFmt = '#,##0.00';
                prow.getCell(6).font = { bold: true };
                for (let i = 1; i <= 6; i++) prow.getCell(i).border = borderStyle;
                pRowIdx++;
            });

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
            ps.columns = [{ width: 25 }, { width: 15 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 25 }];
        }

        return await workbook.xlsx.writeBuffer();
    };

    const triggerDownload = (buffer, dateStr) => {
        const [y, m, d] = dateStr.split('-');
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `CAJA CX ${d}-${m}-${y}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const handleExportExcel = async () => {
        const dataToExport = history.filter(item => item.fecha === selectedDate);
        if (dataToExport.length === 0) return alert("No hay datos para exportar");
        try {
            const buffer = await generateDailyExcelWorkbookBuffer(dataToExport, selectedDate, dailyComment);
            triggerDownload(buffer, selectedDate);
        } catch (error) {
            console.error(error);
            alert("Error al exportar");
        }
    };

    const fetchCommentForDate = async (dateStr) => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return '';
        try {
            const q = query(collection(db, "daily_comments"),
                where("userId", "==", ownerToUse),
                where("date", "==", dateStr)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) return snapshot.docs[0].data().comment;
        } catch (e) {
            console.error(e);
        }
        return '';
    };

    const handleExportRange = async () => {
        if (!rangeStart || !rangeEnd) return alert("Seleccione el rango de fechas.");
        if (rangeStart > rangeEnd) return alert("La fecha de inicio debe ser anterior a la de fin.");

        const datesInRange = [];
        let current = new Date(rangeStart + 'T00:00:00');
        const end = new Date(rangeEnd + 'T00:00:00');

        while (current <= end) {
            datesInRange.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        setIsExportingRange(true);
        try {
            for (const dateStr of datesInRange) {
                const dataForDate = history.filter(item => item.fecha === dateStr);
                if (dataForDate.length > 0) {
                    const comment = await fetchCommentForDate(dateStr);
                    const buffer = await generateDailyExcelWorkbookBuffer(dataForDate, dateStr, comment);
                    triggerDownload(buffer, dateStr);
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            alert("Exportación de rango finalizada.");
        } catch (error) {
            console.error(error);
            alert("Error al exportar rango.");
        } finally {
            setIsExportingRange(false);
        }
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

        const ownerToUse = catalogOwnerUid || viewingUid;
        try {
            const batch = writeBatch(db);
            const q = query(collection(db, "caja"),
                where("userId", "==", ownerToUse),
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
        <div className="space-y-8 animate-in fade-in duration-700 relative pb-24">
            {/* PIN MODAL (Sleek Redesign) */}
            {showPinModal && (
                <ModalPortal onClose={() => { setShowPinModal(false); setPinInput(''); }}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-sm border border-white/20 dark:border-slate-800 animate-in zoom-in-95 duration-300 text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-teal-500 to-emerald-500"></div>
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-slate-400 shadow-inner">
                            <LockIcon size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Modo Administrador</h3>
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-10">Validación de Identidad</p>
                        
                        <input
                            type="password"
                            className="w-full text-center text-4xl tracking-[0.6em] font-black py-6 bg-slate-50 dark:bg-slate-800/80 border-none rounded-3xl mb-10 focus:ring-4 focus:ring-teal-500/10 outline-none text-slate-900 dark:text-white transition-all shadow-inner placeholder:opacity-20"
                            placeholder="••••"
                            maxLength={8}
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            autoFocus
                        />
                        
                        <div className="flex gap-4">
                            <button onClick={() => { setShowPinModal(false); setPinInput(''); }} className="flex-1 py-4 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Cerrar</button>
                            <button onClick={handleUnlock} className="flex-1 py-4 bg-teal-600 text-white font-black rounded-2xl shadow-xl shadow-teal-500/20 hover:bg-teal-700 transition-all uppercase tracking-widest text-[10px] active:scale-95">Desbloquear</button>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* PRINT HIDDEN LAYOUT */}
            <div id="print-content" className="hidden print:block p-12 bg-white text-black font-sans">
                {/* Print content remains functionally identical but with slightly cleaner styles */}
                <div className="flex justify-between items-end border-b-4 border-black pb-6 mb-8">
                    <div className="flex items-center gap-8">
                        <img src="/coat_logo.png" alt="COAT" className="h-14" />
                        <div className="flex items-baseline gap-4">
                            <h1 className="text-2xl font-black uppercase tracking-tighter m-0">Caja de Cirugía</h1>
                            <span className="text-xl font-bold text-slate-500 tracking-tight">
                                {selectedDate ? selectedDate.split('-').reverse().join('/') : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {dailyComment && (
                    <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-2xl italic text-sm text-gray-700 leading-relaxed">
                        <strong className="not-italic block mb-1 uppercase text-[10px] tracking-widest text-gray-400">Observaciones:</strong>
                        {dailyComment}
                    </div>
                )}

                <table className="w-full border-collapse text-[10px]">
                    <thead>
                        <tr className="bg-gray-100 border-b-2 border-gray-300">
                            <th className="p-2 text-left border border-gray-300">PACIENTE</th>
                            <th className="p-2 text-left border border-gray-300">DNI</th>
                            <th className="p-2 text-left border border-gray-300">OS</th>
                            <th className="p-2 text-left border border-gray-300">PROFS</th>
                            <th className="p-2 text-right border border-gray-300">PESOS</th>
                            <th className="p-2 text-right border border-gray-300">DOLARES</th>
                            <th className="p-2 text-right border border-gray-300">LIQ P1</th>
                            <th className="p-2 text-right border border-gray-300">LIQ P2</th>
                            <th className="p-2 text-right border border-gray-300">LIQ P3</th>
                            <th className="p-2 text-right border border-gray-300">LIQ AN.</th>
                            <th className="p-2 text-right border border-gray-300">COAT $</th>
                            <th className="p-2 text-right border border-gray-300">COAT USD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.map((item, i) => (
                            <tr key={i} className="border-b border-gray-200">
                                <td className="p-2 border border-gray-200 font-bold">{item.paciente}</td>
                                <td className="p-2 border border-gray-200">{item.dni}</td>
                                <td className="p-2 border border-gray-200">{item.obra_social}</td>
                                <td className="p-2 border border-gray-200">{[item.prof_1, item.prof_2, item.prof_3].filter(Boolean).join(', ')}</td>
                                <td className="p-2 border border-gray-200 text-right">${formatMoney(item.pesos)}</td>
                                <td className="p-2 border border-gray-200 text-right">U$D {formatMoney(item.dolares)}</td>
                                <td className="p-2 border border-gray-200 text-right">${formatMoney(item.liq_prof_1)}</td>
                                <td className="p-2 border border-gray-200 text-right">${formatMoney(item.liq_prof_2)}</td>
                                <td className="p-2 border border-gray-200 text-right">${formatMoney(item.liq_prof_3)}</td>
                                <td className="p-2 border border-gray-200 text-right">${formatMoney(item.liq_anestesista)}</td>
                                <td className="p-2 border border-gray-200 text-right font-bold">${formatMoney(item.coat_pesos)}</td>
                                <td className="p-2 border border-gray-200 text-right font-bold">U$D {formatMoney(item.coat_dolares)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
                            <td colSpan={10} className="p-3 text-right uppercase tracking-widest text-[10px]">Total Neto COAT</td>
                            <td className="p-3 text-right">${formatMoney(tableData.reduce((a, b) => a + (Number(b.coat_pesos) || 0), 0))}</td>
                            <td className="p-3 text-right">U$D {formatMoney(tableData.reduce((a, b) => a + (Number(b.coat_dolares) || 0), 0))}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* MAIN DASHBOARD UI */}
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
                {/* PREMIUM HEADER & BREADCRUMBS */}
                <div className="premium-card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl no-print relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-teal-500/10 transition-colors"></div>
                    
                    <div className="relative flex items-center gap-6">
                        <div className="p-3 bg-teal-600 text-white rounded-2xl shadow-xl shadow-teal-500/20 active:scale-95 cursor-pointer" onClick={navigateHome}>
                            <Database size={28} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Historial</h1>
                            <nav className="flex items-center gap-2 mt-1">
                                <button onClick={navigateHome} className="text-[10px] font-black text-slate-400 hover:text-teal-500 uppercase tracking-widest transition-colors">Raíz</button>
                                {selectedYear && (
                                    <>
                                        <ChevronRight size={10} className="text-slate-300" />
                                        <button onClick={() => { setView('months'); setSelectedDate(null); }} className="text-[10px] font-black text-slate-400 hover:text-teal-500 uppercase tracking-widest transition-colors">{selectedYear}</button>
                                    </>
                                )}
                                {selectedMonth !== null && (
                                    <>
                                        <ChevronRight size={10} className="text-slate-300" />
                                        <button onClick={() => { setView('days'); setSelectedDate(null); }} className="text-[10px] font-black text-slate-400 hover:text-teal-500 uppercase tracking-widest transition-colors">{MONTH_NAMES[selectedMonth]}</button>
                                    </>
                                )}
                                {selectedDate && (
                                    <>
                                        <ChevronRight size={10} className="text-slate-300" />
                                        <span className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Día {selectedDate.split('-')[2]}</span>
                                    </>
                                )}
                            </nav>
                        </div>
                    </div>

                    <div className="relative flex items-center gap-3">
                        {view === 'table' ? (
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-100 dark:border-slate-800">
                                <button onClick={handlePrint} className="p-2.5 text-slate-500 hover:text-teal-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"><Printer size={20} /></button>
                                <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all"><FileText size={16} /> Excel</button>
                                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                                {isAdmin ? (
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowAddModal(true)} className="p-2.5 bg-teal-500/10 text-teal-600 rounded-xl hover:bg-teal-500/20 transition-all"><User size={20} /></button>
                                        <button onClick={handleDeleteDay} className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-all"><Trash2 size={20} /></button>
                                        <button onClick={() => setIsAdmin(false)} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95 flex items-center gap-2"><LockIcon size={14} /> Salir</button>
                                    </div>
                                ) : (
                                    !isReadOnly && <button onClick={() => setShowPinModal(true)} className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95">Admin</button>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Desde</span>
                                        <input type="date" className="bg-transparent border-none text-xs font-bold p-0 outline-none focus:ring-0 text-slate-900 dark:text-white" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                                    </div>
                                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Hasta</span>
                                        <input type="date" className="bg-transparent border-none text-xs font-bold p-0 outline-none focus:ring-0 text-slate-900 dark:text-white" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                                    </div>
                                </div>
                                <button 
                                    onClick={handleExportRange} 
                                    disabled={isExportingRange}
                                    className="h-11 px-6 bg-teal-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-teal-500/20 hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isExportingRange ? 'Procesando...' : 'Exportar Rango'}
                                </button>
                            </div>
                        )}
                        <button onClick={navigateUp} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-2xl transition-all active:scale-90"><ChevronLeft size={24} /></button>
                    </div>
                </div>

                {/* VIEWS SYSTEM */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {view === 'years' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {getYears().map(year => (
                                <button key={year} onClick={() => handleYearClick(year)} className="premium-card p-6 flex flex-col items-center gap-4 group hover:border-teal-500/50 shadow-xl hover:shadow-2xl transition-all duration-300 active:scale-95 overflow-hidden">
                                    <div className="w-20 h-20 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-3xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                        <Folder size={40} fill="currentColor" className="opacity-80" />
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{year}</span>
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2 block">Carpeta Anual</span>
                                    </div>
                                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity"><Folder size={120} /></div>
                                </button>
                            ))}
                        </div>
                    )}

                    {view === 'months' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {getMonths(selectedYear).map(mIdx => (
                                <button key={mIdx} onClick={() => handleMonthClick(mIdx)} className="premium-card p-6 flex flex-col items-center gap-4 group hover:border-teal-500/50 shadow-xl hover:shadow-2xl transition-all duration-300 active:scale-95 overflow-hidden">
                                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 text-teal-500 dark:text-teal-400 rounded-3xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                                        <Calendar size={40} fill="currentColor" className="opacity-80" />
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{MONTH_NAMES[mIdx]}</span>
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2 block">{selectedYear}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {view === 'days' && (
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-4">
                            {getDays(selectedYear, selectedMonth).map(date => (
                                <button key={date} onClick={() => handleDayClick(date)} className="premium-card p-4 flex flex-col items-center gap-2 group hover:border-teal-500 shadow-lg hover:shadow-2xl transition-all duration-300 active:scale-95">
                                    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl flex items-center justify-center font-black text-xl group-hover:bg-teal-600 group-hover:text-white transition-all shadow-inner">
                                        {date.split('-')[2]}
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{MONTH_NAMES[selectedMonth].substring(0, 3)}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {view === 'table' && (
                        <div className="space-y-4 animate-in slide-in-from-bottom-6 duration-500">
                            {/* COMMENT BOX */}
                            <div className="premium-card p-4 border-l-4 border-l-teal-500 bg-teal-50/10 dark:bg-teal-400/5">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <FileText size={16} /> Bitácora del Día
                                    </h3>
                                    {isAdmin && !isEditingComment && (
                                        <button onClick={() => setIsEditingComment(true)} className="text-[10px] font-black text-slate-400 hover:text-teal-600 uppercase tracking-widest transition-colors flex items-center gap-1"><Edit size={12} /> Editar</button>
                                    )}
                                </div>
                                {isEditingComment ? (
                                    <div className="flex flex-col gap-4">
                                        <textarea value={dailyComment} onChange={(e) => setDailyComment(e.target.value)} className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-6 text-sm font-medium focus:ring-4 focus:ring-teal-500/5 outline-none transition-all min-h-[120px]" placeholder="Escriba las observaciones del día..." autoFocus />
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => setIsEditingComment(false)} className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descartar</button>
                                            <button onClick={saveDailyComment} className="px-6 py-2 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-teal-500/20">Guardar Cambios</button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-slate-600 dark:text-slate-400 italic text-xs leading-relaxed whitespace-pre-wrap">{dailyComment || 'No hay observaciones registradas para este día.'}</p>
                                )}
                            </div>

                            {/* SUMMARY CARDS */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="premium-card p-4 border-l-4 border-l-slate-400 dark:border-l-slate-600 relative overflow-hidden bg-white dark:bg-slate-900">
                                    <div className="absolute -right-2 -top-2 text-slate-100 dark:text-slate-800/20 transform rotate-12 scale-100"><DollarSign size={48} /></div>
                                    <h4 className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 relative">Ingreso Bruto ARS</h4>
                                    <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums relative">${formatMoney(tableData.reduce((s, i) => s + (Number(i.pesos) || 0), 0))}</div>
                                </div>
                                <div className="premium-card p-4 border-l-4 border-l-emerald-400 dark:border-l-emerald-600 relative overflow-hidden bg-white dark:bg-slate-900">
                                    <div className="absolute -right-2 -top-2 text-emerald-50 dark:text-emerald-900/10 transform rotate-12 scale-100"><DollarSign size={48} /></div>
                                    <h4 className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1 relative">Ingreso Bruto USD</h4>
                                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums relative">U$D {formatMoney(tableData.reduce((s, i) => s + (Number(i.dolares) || 0), 0))}</div>
                                </div>
                                <div className="premium-card p-4 bg-slate-900 dark:bg-slate-950 border-l-4 border-l-teal-500 relative overflow-hidden text-white shadow-xl">
                                    <div className="absolute -right-2 -top-2 text-white/5 transform rotate-12 scale-100"><TrendingUp size={48} /></div>
                                    <h4 className="text-[9px] font-black text-teal-400/60 uppercase tracking-widest mb-1 relative">Neto COAT ARS</h4>
                                    <div className="text-xl font-black tabular-nums relative">${formatMoney(tableData.reduce((s, i) => s + (Number(i.coat_pesos) || 0), 0))}</div>
                                </div>
                                <div className="premium-card p-4 bg-slate-900 dark:bg-slate-950 border-l-4 border-l-teal-500 relative overflow-hidden text-white shadow-xl">
                                    <div className="absolute -right-2 -top-2 text-white/5 transform rotate-12 scale-100"><TrendingUp size={48} /></div>
                                    <h4 className="text-[9px] font-black text-teal-400/60 uppercase tracking-widest mb-1 relative">Neto COAT USD</h4>
                                    <div className="text-xl font-black tabular-nums relative">U$D {formatMoney(tableData.reduce((s, i) => s + (Number(i.coat_dolares) || 0), 0))}</div>
                                </div>
                            </div>

                            {/* MAIN DATA TABLE */}
                            <div className="premium-card overflow-hidden shadow-2xl border-none">
                                <div className="overflow-x-auto scrollbar-premium">
                                    <table className="w-full border-collapse min-w-[1000px]">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                                                <th className="px-2 py-2 sticky left-0 bg-slate-100 dark:bg-slate-950 z-30 w-24 border-r border-slate-200 dark:border-slate-800">Acciones</th>
                                                <th className="px-3 py-3 text-left min-w-[200px]">Paciente / Referencia</th>
                                                <th className="px-3 py-3 text-left">Obra Social</th>
                                                <th className="px-3 py-3 text-center bg-teal-500/5 dark:bg-teal-400/5 text-teal-600 dark:text-teal-400">Equipo Médico</th>
                                                <th className="px-3 py-3 text-right font-black text-slate-900 dark:text-white">Ingresos</th>
                                                <th className="px-3 py-3 text-right font-black text-slate-900 dark:text-white">Liquidaciones Profs</th>
                                                <th className="px-3 py-3 text-center">Anestesista</th>
                                                <th className="px-3 py-3 text-right font-black text-orange-600 dark:text-orange-400 bg-orange-500/[0.03] dark:bg-orange-400/[0.03]">Neto COAT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {tableData.map((item) => {
                                                const isEditing = editId === item.id;
                                                return (
                                                    <tr key={item.id} className={`group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${isEditing ? 'bg-teal-500/[0.05] dark:bg-teal-400/[0.05]' : ''}`}>
                                                        <td className="px-2 py-2 sticky left-0 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900 transition-colors z-20 border-r border-slate-100 dark:border-slate-800">
                                                            <div className="flex gap-2 justify-center">
                                                                {isEditing ? (
                                                                    <>
                                                                        <button onClick={handleSave} className="p-1.5 bg-teal-600 text-white rounded-lg shadow-lg shadow-teal-500/20 hover:scale-110 transition-all"><Check size={14} /></button>
                                                                        <button onClick={handleCancelEdit} className="p-1.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:scale-110 transition-all"><X size={14} /></button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button onClick={() => handleEditClick(item)} disabled={isReadOnly || (!isAdmin && item.createdBy !== user?.email)} className="p-1.5 text-slate-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-all disabled:opacity-0"><Edit2 size={14} /></button>
                                                                        <button onClick={() => handleDelete(item)} disabled={isReadOnly || (!isAdmin && item.createdBy !== user?.email)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all disabled:opacity-0"><Trash2 size={14} /></button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td className="px-3 py-2.5">
                                                            {isEditing ? (
                                                                <div className="space-y-1">
                                                                    <input value={editFormData.paciente} onChange={(e) => handleChange('paciente', e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-bold outline-none" />
                                                                    <input value={editFormData.dni} onChange={(e) => handleChange('dni', e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[9px] font-black outline-none" placeholder="DNI" />
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col">
                                                                    <span className="font-black text-slate-900 dark:text-white uppercase text-xs">{item.paciente}</span>
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{item.dni || 'DNI No Registrado'}</span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td className="px-3 py-2.5">
                                                            {isEditing ? (
                                                                <input value={editFormData.obra_social} onChange={(e) => handleChange('obra_social', e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[10px] font-bold outline-none" />
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md text-[9px] font-black uppercase tracking-widest">{item.obra_social}</span>
                                                            )}
                                                        </td>

                                                        <td className="px-3 py-2.5">
                                                            <div className="flex flex-col gap-0.5 items-center">
                                                                {[item.prof_1, item.prof_2, item.prof_3].filter(Boolean).map((p, i) => (
                                                                    <span key={i} className="text-[9px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-tight whitespace-nowrap bg-teal-500/5 px-2 py-0.2 rounded-full">{p}</span>
                                                                ))}
                                                            </div>
                                                        </td>

                                                        <td className="px-3 py-2.5 text-right font-mono font-black tabular-nums">
                                                            <div className="flex flex-col">
                                                                {isEditing ? (
                                                                    <>
                                                                        <div className="flex items-center justify-end gap-1"><span className="text-[9px] text-slate-400">$</span><input type="number" value={editFormData.pesos} onChange={(e) => handleChange('pesos', e.target.value)} className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-0.5 text-[10px] text-right" /></div>
                                                                        <div className="flex items-center justify-end gap-1"><span className="text-[9px] text-slate-400">U$D</span><input type="number" value={editFormData.dolares} onChange={(e) => handleChange('dolares', e.target.value)} className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-0.5 text-[10px] text-right" /></div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-slate-900 dark:text-white text-xs">${formatMoney(item.pesos)}</span>
                                                                        {item.dolares > 0 && <span className="text-emerald-500 text-[10px]">U$D {formatMoney(item.dolares)}</span>}
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td className="px-3 py-2.5 text-right font-mono font-black tabular-nums text-slate-500 dark:text-slate-400 text-[10px]">
                                                            <div className="flex flex-col gap-0.5">
                                                                {[1, 2, 3].map(n => item[`liq_prof_${n}`] > 0 && (
                                                                    <div key={n} className="flex flex-col items-end border-b border-slate-100 dark:border-slate-800/50 pb-0.5 mb-0.5 last:border-0">
                                                                        <span>{item[`liq_prof_${n}_currency`] === 'USD' ? 'U$D' : '$'} {formatMoney(item[`liq_prof_${n}`])}</span>
                                                                        {item[`liq_prof_${n}_secondary`] > 0 && <span className="text-[8px] opacity-60">/ {item[`liq_prof_${n}_currency_secondary`] === 'USD' ? 'U$D' : '$'} {formatMoney(item[`liq_prof_${n}_secondary`])}</span>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>

                                                        <td className="px-3 py-2.5 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase mb-0.5">{item.anestesista}</span>
                                                                {item.liq_anestesista > 0 && <span className="font-mono text-[10px] font-black text-slate-400">({item.liq_anestesista_currency === 'USD' ? 'U$D' : '$'}{formatMoney(item.liq_anestesista)})</span>}
                                                            </div>
                                                        </td>

                                                        <td className="px-3 py-2.5 text-right font-mono font-black tabular-nums bg-orange-500/[0.02] dark:bg-orange-400/[0.02]">
                                                            <div className="flex flex-col">
                                                                <span className="text-orange-600 dark:text-orange-400 text-xs">${formatMoney(item.coat_pesos)}</span>
                                                                {item.coat_dolares > 0 && <span className="text-orange-500/70 text-[10px]">U$D {formatMoney(item.coat_dolares)}</span>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-900 dark:bg-slate-950 text-white font-mono font-black">
                                                <td colSpan={7} className="px-6 py-4 text-right text-[9px] uppercase tracking-[0.3em] text-teal-400">Consolidado Final de Operaciones</td>
                                                <td className="px-4 py-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-xl">${formatMoney(tableData.reduce((a, b) => a + (Number(b.coat_pesos) || 0), 0))}</span>
                                                        <span className="text-[10px] text-orange-400">U$D {formatMoney(tableData.reduce((a, b) => a + (Number(b.coat_dolares) || 0), 0))}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ADD ENTRY MODAL (PREMIUM) */}
            {showAddModal && (
                <ModalPortal onClose={() => setShowAddModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-0 rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden border border-white/20 dark:border-slate-800 animate-in zoom-in-95 duration-300 flex flex-col no-print">
                        <div className="p-6 bg-slate-900 dark:bg-black relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                            <div className="relative z-10 flex justify-between items-center">
                                <div>
                                    <h3 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                                        <div className="w-12 h-12 bg-teal-600 rounded-2xl flex items-center justify-center shadow-xl shadow-teal-500/20">
                                            <Plus size={24} />
                                        </div>
                                        Nuevo Registro
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2 ml-16">{selectedDate}</p>
                                </div>
                                <button onClick={() => setShowAddModal(false)} className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center justify-center transition-all active:scale-90"><X size={24} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-premium">
                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 md:col-span-6">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Paciente / Referencia</label>
                                    <input className="input-premium w-full text-lg" placeholder="Nombre completo..." value={newEntry.paciente || ''} onChange={(e) => setNewEntry({ ...newEntry, paciente: e.target.value })} />
                                </div>
                                <div className="col-span-12 md:col-span-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">DNI</label>
                                    <input className="input-premium w-full font-mono" placeholder="Identificación..." value={newEntry.dni || ''} onChange={(e) => setNewEntry({ ...newEntry, dni: e.target.value })} />
                                </div>
                                <div className="col-span-12 md:col-span-3">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Obra Social</label>
                                    <input className="input-premium w-full uppercase" placeholder="Sigla..." value={newEntry.obra_social || ''} onChange={(e) => setNewEntry({ ...newEntry, obra_social: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                {[1, 2, 3].map(i => (
                                    <div key={i}>
                                        <label className="block text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-3 ml-1">Médico {i}</label>
                                        <select className="input-premium w-full appearance-none cursor-pointer text-xs" value={newEntry[`prof_${i}`] || ''} onChange={(e) => setNewEntry({ ...newEntry, [`prof_${i}`]: e.target.value })}>
                                            <option value="">Seleccionar...</option>
                                            {profesionales.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                        </select>
                                    </div>
                                ))}
                                <div>
                                    <label className="block text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-3 ml-1">Anestesista</label>
                                    <select className="input-premium w-full appearance-none cursor-pointer text-xs" value={newEntry.anestesista || ''} onChange={(e) => setNewEntry({ ...newEntry, anestesista: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        {anestesistas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="premium-card p-8 bg-slate-50 dark:bg-slate-800/50 border-dashed border-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Monto Cobrado (ARS)</label>
                                        <div className="relative">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-2xl">$</span>
                                            <input type="number" className="input-premium w-full pl-12 text-3xl font-black tabular-nums" placeholder="0.00" value={newEntry.pesos || ''} onChange={(e) => setNewEntry({ ...newEntry, pesos: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Monto Cobrado (USD)</label>
                                        <div className="relative">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-2xl">U$D</span>
                                            <input type="number" className="input-premium w-full pl-20 text-3xl font-black tabular-nums text-teal-600 dark:text-teal-400" placeholder="0.00" value={newEntry.dolares || ''} onChange={(e) => setNewEntry({ ...newEntry, dolares: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 flex items-center gap-4 text-slate-400">
                                    <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm"><CircleHelp size={20} /></div>
                                    <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Las liquidaciones individuales se calcularán automáticamente respetando los coeficientes vigentes para cada profesional.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-10 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-6">
                            <button onClick={() => setShowAddModal(false)} className="px-8 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors">Cerrar</button>
                            <button onClick={handleCreateEntry} className="px-12 py-4 bg-teal-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-500/20 hover:bg-teal-700 active:scale-95 transition-all flex items-center gap-3"><Save size={18} /> Guardar Registro</button>
                        </div>
                    </div>
                </ModalPortal>
            )}

            <style>{printStyle}</style>
            <div className="fixed bottom-2 right-4 text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em] pointer-events-none z-50 no-print">
                COAT Surgical Financial Management • History Engine v3.0
            </div>
        </div>
    );
};

export default HistorialCaja;

