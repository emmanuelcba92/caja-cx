import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Trash2, Tag, Lock as LockIcon, Download, Printer, X, FileText, Edit3, Database, Cloud, Mail } from 'lucide-react';
import { db, USE_LOCAL_DB } from '../firebase/config';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { apiService } from '../services/apiService';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_PROFESIONALES } from '../data/seedProfs';
import ModalPortal from './common/ModalPortal';

const ProfesionalesView = () => {
    const { viewingUid, permission, catalogOwnerUid, userRole, permissions, isSuperAdmin } = useAuth(); // Auth context
    const isReadOnly = permission === 'viewer' || (permissions?.can_view_shared_catalog && viewingUid !== catalogOwnerUid);
    // Note: COAT users can see professionals but maybe not edit them if they are managing someone else's?
    // Actually, COAT users are usually managing their own data but using a shared catalog.
    const [profesionales, setProfesionales] = useState([]);
    const [nombre, setNombre] = useState('');
    const [prefijo, setPrefijo] = useState('Dr.');
    const [categoria, setCategoria] = useState('ORL');

    useEffect(() => {
        if (categoria === 'Fonoaudiologa') {
            setPrefijo('Lic.');
        } else if (['ORL', 'Anestesista', 'Estetica', 'Residente'].includes(categoria)) {
            if (prefijo === 'Lic.' || !prefijo) setPrefijo('Dr.');
        } else if (categoria === 'Tutoras') {
            setPrefijo('');
        }
    }, [categoria]);

    // Helper to abbreviate name to "Prefix Surname"
    const shortProfName = (fullName) => {
        if (!fullName) return '';
        const parts = fullName.trim().split(' ');
        const prefixes = ['dr', 'dra', 'lic', 'dr.', 'dra.', 'lic.'];
        if (parts.length >= 2 && prefixes.includes(parts[0].toLowerCase())) {
            return `${parts[0]} ${parts[1]}`;
        }
        // If no known prefix, return just first 2 words max
        return parts.slice(0, 2).join(' ');
    };

    // Edit Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingProf, setEditingProf] = useState(null);
    const [editForm, setEditForm] = useState({
        nombre: '',
        categoria: 'ORL',
        especialidad: '',
        mp: '',
        me: ''
    });

    // Report State
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [showMatrixModal, setShowMatrixModal] = useState(false);
    const [matrixData, setMatrixData] = useState(null);

    // Security State
    const [isAdmin, setIsAdmin] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');

    const printStyle = `
        @media print {
            @page { size: landscape; margin: 5mm; }
            .no-print { display: none !important; }
            #root { display: none !important; }
            .print-portal-matrix {
                display: block !important;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                background: white;
                color: black;
            }
            body { background: white !important; }
        }
    `;

    const handleUnlock = async () => {
        if (USE_LOCAL_DB) {
            // Local mode: allow everything
            setIsAdmin(true);
            setShowPinModal(false);
            setPinInput('');
            return;
        }

        try {
            if (!viewingUid) {
                alert("Error de sesiÃ³n.");
                return;
            }
            const settingsRef = doc(db, "user_settings", viewingUid);
            const settingsSnap2 = await getDoc(settingsRef);

            if (settingsSnap2.exists() && settingsSnap2.data().adminPin) {
                const userPin = settingsSnap2.data().adminPin;
                if (pinInput === userPin) {
                    setIsAdmin(true);
                    setShowPinModal(false);
                    setPinInput('');
                } else {
                    alert("PIN Incorrecto");
                    setPinInput('');
                }
            } else {
                alert("No tiene un PIN configurado. Vaya a ConfiguraciÃ³n para crear uno.");
                setPinInput('');
            }
        } catch (error) {
            console.error("Error verifying PIN:", error);
            alert("Error al verificar PIN.");
        }
    };

    const toggleDBMode = () => {
        const currentMode = localStorage.getItem('USE_LOCAL_DB') === 'true';
        localStorage.setItem('USE_LOCAL_DB', (!currentMode).toString());
        window.location.reload();
    };

    const fetchProfs = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            // "Todos ven todo": ya no filtramos por userId para los profesionales
            const profs = await apiService.getCollection("profesionales");
            profs.sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProfesionales(profs);
        } catch (error) {
            console.error("Error fetching professionals:", error);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!nombre) return;
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return alert("Debes iniciar sesiÃ³n");

        const fullName = prefijo ? `${prefijo.trim()} ${nombre.trim()}` : nombre.trim();

        try {
            await apiService.addDocument("profesionales", {
                nombre: fullName,
                categoria,
                userId: ownerToUse
            });
            setNombre('');
            fetchProfs();
            alert("Profesional agregado correctamente");
        } catch (error) {
            console.error("Error adding professional:", error);
            alert("Error de conexiÃ³n al agregar profesional");
        }
    };

    const handleSeed = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return alert("Debes iniciar sesiÃ³n");
        if (!window.confirm("Â¿Deseas cargar la lista predefinida de profesionales de COAT? Solo se agregarÃ¡n los que falten.")) return;

        try {
            let addedCount = 0;
            for (const p of DEFAULT_PROFESIONALES) {
                const exists = profesionales.some(existing => existing.nombre.toLowerCase().includes(p.nombre.toLowerCase()));
                if (!exists) {
                    await apiService.addDocument("profesionales", {
                        ...p,
                        userId: ownerToUse
                    });
                    addedCount++;
                }
            }
            fetchProfs();
            alert(`Se agregaron ${addedCount} profesionales correctamente.`);
        } catch (error) {
            console.error("Error seeding professionals:", error);
            alert("Error al cargar la lista");
        }
    };

    // Open Edit Modal
    const handleEditClick = (prof) => {
        setEditingProf(prof);
        setEditForm({
            nombre: prof.nombre || '',
            categoria: prof.categoria || 'ORL',
            especialidad: prof.especialidad || '',
            mp: prof.mp || '',
            me: prof.me || ''
        });
        setShowEditModal(true);
    };

    // Save Edit
    const handleSaveEdit = async () => {
        if (!editingProf || !editForm.nombre) return;
        try {
            await apiService.updateDocument("profesionales", editingProf.id, {
                nombre: editForm.nombre.trim(),
                categoria: editForm.categoria,
                especialidad: editForm.especialidad.trim(),
                mp: editForm.mp.trim(),
                me: editForm.me.trim()
            });
            setShowEditModal(false);
            setEditingProf(null);
            fetchProfs();
            alert("Profesional actualizado");
        } catch (error) {
            console.error("Error updating professional:", error);
            alert("Error al actualizar");
        }
    };

    useEffect(() => {
        fetchProfs();
    }, [viewingUid]); // Re-fetch on user change

    const handleDelete = async (id, nombre) => {
        if (!window.confirm(`Â¿EstÃ¡s seguro de eliminar a ${nombre}?`)) return;
        try {
            await apiService.deleteDocument("profesionales", id);
            fetchProfs();
            alert("Profesional eliminado");
        } catch (error) {
            console.error("Error deleting professional:", error);
            alert("Error de conexiÃ³n");
        }
    };

    // --- REPORT LOGIC ---

    const fetchMatrixData = async () => {
        // Define range
        const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        // End date logic for query is tricky with strings.
        // It's easier if we store dates as strings "YYYY-MM-DD" and query where date >= start and date <= end
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;

        try {
            // "Todos ven todo": ya no filtramos por userId para el reporte global
            const allEntries = await apiService.getCollection("caja");

            // Filter by date range locally
            const entries = allEntries.filter(e => e.fecha >= startDateStr && e.fecha <= endDateStr);

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

                    if (liqCurr === 'USD') matrix[date][profName].USD += Number(liqAmount);
                    else matrix[date][profName].ARS += Number(liqAmount);
                };

                if (e.prof_1) {
                    processLiquidation(e.prof_1, Number(e.liq_prof_1) || 0, e.liq_prof_1_currency);
                    processLiquidation(e.prof_1, Number(e.liq_prof_1_secondary) || 0, e.liq_prof_1_currency_secondary);
                }
                if (e.prof_2) {
                    processLiquidation(e.prof_2, Number(e.liq_prof_2) || 0, e.liq_prof_2_currency);
                    processLiquidation(e.prof_2, Number(e.liq_prof_2_secondary) || 0, e.liq_prof_2_currency_secondary);
                }
                if (e.prof_3) {
                    processLiquidation(e.prof_3, Number(e.liq_prof_3) || 0, e.liq_prof_3_currency);
                    processLiquidation(e.prof_3, Number(e.liq_prof_3_secondary) || 0, e.liq_prof_3_currency_secondary);
                }
                if (e.anestesista) processLiquidation(e.anestesista, Number(e.liq_anestesista) || 0, e.liq_anestesista_currency);
            });

            // 2. Fetch and Process Deductions (Global Access)
            const monthlyDeductions = await apiService.getCollection("deducciones");

            const filteredDeductions = monthlyDeductions.filter(d => d.date >= startDateStr && d.date <= endDateStr);

            filteredDeductions.forEach(d => {
                const date = d.date;
                const prof = d.profesional;
                const amount = Math.abs(Number(d.amount || 0));
                const currency = d.currency || 'ARS';

                if (!matrix[date]) matrix[date] = {};
                if (!matrix[date][prof]) matrix[date][prof] = { ARS: 0, USD: 0 };

                dates.add(date);
                activeProfs.add(prof);

                if (currency === 'USD') {
                    matrix[date][prof].USD -= amount;
                } else {
                    matrix[date][prof].ARS -= amount;
                }
            });

            if (activeProfs.size === 0) return null;

            const sortedProfs = Array.from(activeProfs).sort();
            const sortedDates = Array.from(dates).sort();

            // Filter out 'Tutoras' by Category AND Name
            const profNameToCategory = {};
            profesionales.forEach(p => profNameToCategory[p.nombre] = p.categoria);
            const filteredReportProfs = sortedProfs.filter(name => {
                const cat = profNameToCategory[name];
                const isExcludedCategory = cat === 'Tutoras' || cat === 'Tutoria';
                const isExcludedName = name === 'Tutoria' || name === 'Tutoras' || name === 'TutorÃ­a';
                return !isExcludedCategory && !isExcludedName;
            });

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
        } catch (err) {
            console.error(err);
            throw new Error("Error obteniendo datos de Firebase");
        }
    };

    const handleGeneralExcel = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return alert("No hay liquidaciones en el mes seleccionado.");
            const { dates, profs, matrix, totals } = data;

            // Create Excel
            const ExcelJS = (await import('exceljs')).default || await import('exceljs');
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Honorarios', {
                pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
            });

            // Styles
            const headerStyle = {
                font: { bold: true, name: 'Arial', size: 10 },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
            };

            // Title
            // Removed title row
            // Headers
            ws.getCell(1, 1).value = "FECHA";
            ws.getCell(1, 1).style = headerStyle;





            profs.forEach((p, i) => {
                const c = ws.getCell(1, i + 2);
                c.value = shortProfName(p);
                c.style = headerStyle;
            });

            // Rows
            let currentRow = 2;
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

    const handleSendEmail = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return alert("No hay datos para enviar.");
            const { dates, profs, matrix, totals } = data;

            // Fetch email settings
            const emailDoc = await getDoc(doc(db, "settings", "notifications"));
            if (!emailDoc.exists() || !emailDoc.data().scriptUrl || !emailDoc.data().emails) {
                return alert("No se ha configurado el mail o la URL del script en la sección Admin.");
            }
            const { emails, scriptUrl } = emailDoc.data();

            // Create HTML table for the email body
            let tableHtml = `<table border="1" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px;">`;
            tableHtml += `<tr style="background-color: #f1f5f9; font-weight: bold;"><td>FECHA</td>`;
            profs.forEach(p => tableHtml += `<td>${shortProfName(p)}</td>`);
            tableHtml += `</tr>`;

            dates.forEach(d => {
                const [y, m, da] = d.split('-');
                tableHtml += `<tr><td>${da}/${m}/${y.slice(2)}</td>`;
                profs.forEach(p => {
                    const cell = matrix[d][p];
                    let val = "";
                    if (cell) {
                        if (cell.ARS > 0) val += `$${cell.ARS.toLocaleString('es-AR')}`;
                        if (cell.USD > 0) val += (val ? " + " : "") + `USD ${cell.USD.toLocaleString('es-AR')}`;
                    }
                    tableHtml += `<td align="center">${val || "-"}</td>`;
                });
                tableHtml += `</tr>`;
            });

            // Totals
            tableHtml += `<tr style="background-color: #f1f5f9; font-weight: bold;"><td>TOTAL ARS</td>`;
            profs.forEach(p => tableHtml += `<td align="center">$${totals[p].ARS.toLocaleString('es-AR')}</td>`);
            tableHtml += `</tr>`;
            tableHtml += `<tr style="background-color: #f1f5f9; font-weight: bold;"><td>TOTAL USD</td>`;
            profs.forEach(p => tableHtml += `<td align="center">USD ${totals[p].USD.toLocaleString('es-AR')}</td>`);
            tableHtml += `</tr></table>`;

            const emailBody = `Se adjunta el reporte de honorarios para ${new Date(0, selectedMonth - 1).toLocaleString('es-AR', { month: 'long' }).toUpperCase()} ${selectedYear}.<br><br>${tableHtml}`;

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    to: emails,
                    subject: `Reporte Honorarios: ${new Date(0, selectedMonth - 1).toLocaleString('es-AR', { month: 'long' }).toUpperCase()} ${selectedYear}`,
                    body: emailBody
                })
            });

            alert("Reporte enviado correctamente por email.");
        } catch (error) {
            console.error(error);
            alert("Error al enviar email: " + error.message);
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
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-md border border-slate-100 dark:border-slate-800 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 dark:bg-teal-900/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                            <div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-teal-600 dark:text-teal-400">
                                <FileText size={24} />
                            </div>
                            Reporte Mensual de Honorarios
                        </h2>
                        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Genera la planilla general de liquidaciones por mes.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-bold text-sm"
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('es-AR', { month: 'long' }).toUpperCase()}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-bold text-sm"
                        >
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-2"></div>

                        <div className="flex items-center gap-2">
                            <button onClick={handlePrintMatrix} title="Imprimir" className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                                <Printer size={20} />
                            </button>
                            <button onClick={handleGeneralExcel} className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all shadow-md shadow-teal-500/10">
                                <Download size={18} /> Excel
                            </button>
                            <button onClick={handleSendEmail} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-500/10">
                                <Mail size={18} /> Enviar Mail
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {!isReadOnly && (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-teal-100 dark:bg-teal-900/20 rounded-lg">
                                <UserPlus className="text-teal-600 dark:text-teal-400" size={24} />
                            </div>
                            Agregar Nuevo Profesional
                        </div>

                        {isAdmin ? (
                            <button onClick={() => setIsAdmin(false)} className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-200 dark:hover:bg-red-900/40 transition-all font-bold text-sm">
                                <LockIcon size={16} /> Bloquear Admin
                            </button>
                        ) : (
                            <button onClick={() => setShowPinModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                <LockIcon size={16} /> Modo Admin
                            </button>
                        )}
                    </h2>
                    <form onSubmit={handleAdd} className="flex flex-wrap gap-4 items-end">
                        <div className="w-24">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">TÃ­tulo</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-sm font-medium text-slate-700 dark:text-slate-200"
                                value={prefijo}
                                onChange={(e) => setPrefijo(e.target.value)}
                            >
                                <option value="Dr.">Dr.</option>
                                <option value="Dra.">Dra.</option>
                                <option value="Lic.">Lic.</option>
                                <option value="">(Nada)</option>
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Apellido y Nombres</label>
                             <input
                                type="text"
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white dark:focus:bg-slate-800 transition-all font-medium text-slate-700 dark:text-slate-200"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                placeholder="Ej: GarcÃ­a, Juan"
                            />
                        </div>
                        <div className="w-48">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">CategorÃ­a</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white dark:focus:bg-slate-800 transition-all text-slate-700 dark:text-slate-200"
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                            >
                                <option value="ORL">ORL</option>
                                <option value="Anestesista">Anestesista</option>
                                <option value="Estetica">EstÃ©tica</option>
                                <option value="Fonoaudiologa">Fonoaudiologa</option>
                                <option value="Residente">Residente</option>
                                <option value="Tutoras">Tutoras</option>
                            </select>
                        </div>
                        <button type="submit" className="px-8 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors shadow-md">
                            Guardar
                        </button>
                    </form>

                    {/* Seed Button - Only for Super Admin or owners */}
                    {!isReadOnly && (
                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                                <FileText size={16} />
                                <span className="text-xs font-medium italic">Acciones rÃ¡pidas para administraciÃ³n COAT</span>
                            </div>
                            <button
                                onClick={handleSeed}
                                className="px-6 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all"
                            >
                                Cargar Lista Profesionales COAT
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profesionales.map(prof => (
                    <div key={prof.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 group hover:border-teal-200 transition-colors">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
                                    <Tag size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-slate-100">{prof.nombre}</h3>
                                    <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">{prof.categoria}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {(isSuperAdmin || isAdmin) && !isReadOnly && (
                                    <button
                                        onClick={() => handleEditClick(prof)}
                                        className="p-2 text-teal-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"
                                        title="Editar"
                                    >
                                        <Edit3 size={16} />
                                    </button>
                                )}
                                {isAdmin && !isReadOnly && (
                                    <button
                                        onClick={() => handleDelete(prof.id, prof.nombre)}
                                        className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        {/* Show credentials if exist - MP/ME only for Super Admin */}
                        {(prof.especialidad || (isSuperAdmin && (prof.mp || prof.me))) && (
                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                                {prof.especialidad && <p>{prof.especialidad}</p>}
                                {isSuperAdmin && (prof.mp || prof.me) && (
                                    <p className="font-mono text-amber-600 dark:text-amber-500">
                                        {prof.mp && `MP ${prof.mp}`}{prof.mp && prof.me && ' - '}{prof.me && `ME ${prof.me}`}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* PIN MODAL */}
            {showPinModal && (
                <ModalPortal onClose={() => setShowPinModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] shadow-lg w-full max-w-sm border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-center mb-6">
                            <div className="p-4 bg-teal-50 dark:bg-teal-900/30 rounded-2xl text-teal-600 dark:text-teal-400">
                                <LockIcon size={32} />
                            </div>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mb-2 text-center uppercase tracking-tight">Modo Administrador</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-8 font-medium">Ingresa tu PIN de seguridad para habilitar la ediciÃ³n.</p>
                        
                        <input
                            type="password"
                            className="w-full text-center text-4xl tracking-[0.5em] font-black py-4 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-2xl mb-8 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 focus:outline-none text-slate-900 dark:text-slate-100 transition-all shadow-inner"
                            placeholder="****"
                            maxLength={10}
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                            autoFocus
                        />
                        <div className="flex gap-4">
                            <button onClick={() => setShowPinModal(false)} className="flex-1 py-4 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">Cancelar</button>
                            <button onClick={handleUnlock} className="flex-1 py-4 bg-teal-600 text-white font-black rounded-2xl hover:bg-teal-700 shadow-md shadow-teal-500/10 active:scale-95 transition-all uppercase text-xs tracking-widest">Desbloquear</button>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* MATRIX PRINT MODAL */}
            {showMatrixModal && matrixData && createPortal(
                <div className="fixed inset-0 bg-white z-[100] overflow-auto print-portal-matrix">
                    <style>{printStyle}</style>
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
                            <h1 className="text-center font-bold text-lg mb-4 uppercase border-b-2 border-black pb-1">
                                Honorarios CX - {new Date(selectedYear, selectedMonth - 1).toLocaleString('es-AR', { month: 'long' }).toUpperCase()} {selectedYear}
                            </h1>

                            <table className="w-full text-[10px] border-collapse border border-black">
                                <thead>
                                    <tr>
                                        <th className="border border-black px-1 py-1 bg-slate-100">FECHA</th>
                                        {matrixData.profs.map(p => (
                                            <th key={p} className="border border-black px-1 py-1 bg-slate-100">{shortProfName(p).toUpperCase()}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.dates.map(date => (
                                        <tr key={date}>
                                            <td className="border border-black px-1 py-0.5 text-center font-bold">
                                                {date.split('-').reverse().slice(0, 2).join('/')}
                                            </td>
                                            {matrixData.profs.map(prof => {
                                                const cell = matrixData.matrix[date][prof];
                                                return (
                                                    <td key={prof} className="border border-black px-1 py-0.5 text-center">
                                                        {cell ? (
                                                            <div className="flex flex-col text-[9px] leading-tight">
                                                                {cell.ARS > 0 && <span>${formatMoney(cell.ARS)}</span>}
                                                                {cell.USD > 0 && <span className="font-bold">U$S {formatMoney(cell.USD)}</span>}
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
                                        <td className="border border-black px-1 py-1 font-bold bg-slate-200">PESOS</td>
                                        {matrixData.profs.map(prof => (
                                            <td key={prof} className="border border-black px-1 py-1 text-center font-bold bg-slate-100">
                                                {matrixData.totals[prof].ARS > 0 ? `$${formatMoney(matrixData.totals[prof].ARS)}` : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="border border-black px-1 py-1 font-bold bg-slate-200">DÓLARES</td>
                                        {matrixData.profs.map(prof => (
                                            <td key={prof} className="border border-black px-1 py-1 text-center font-bold bg-slate-100">
                                                {matrixData.totals[prof].USD > 0 ? `U$S ${formatMoney(matrixData.totals[prof].USD)}` : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* EDIT PROFESSIONAL MODAL */}
            {showEditModal && editingProf && (
                <ModalPortal onClose={() => setShowEditModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight uppercase">
                                <div className="p-2 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400">
                                    <Edit3 size={24} />
                                </div>
                                Editar Profesional
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"><X size={20} /></button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 text-slate-900 dark:text-slate-100 font-bold transition-all shadow-inner"
                                    value={editForm.nombre}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">CategorÃ­a</label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 text-slate-900 dark:text-slate-100 font-bold transition-all"
                                        value={editForm.categoria}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, categoria: e.target.value }))}
                                    >
                                        <option value="ORL">ORL</option>
                                        <option value="Anestesista">Anestesista</option>
                                        <option value="Estetica">EstÃ©tica</option>
                                        <option value="Fonoaudiologa">Fonoaudiologa</option>
                                        <option value="Residente">Residente</option>
                                        <option value="Tutoras">Tutoras</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">Especialidad</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 text-slate-900 dark:text-slate-100 font-bold transition-all shadow-inner"
                                        value={editForm.especialidad}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, especialidad: e.target.value }))}
                                        placeholder="OtorrinolaringologÃ­a"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">MatrÃ­cula Provincial</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 text-slate-900 dark:text-slate-100 font-bold transition-all shadow-inner"
                                        value={editForm.mp}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, mp: e.target.value }))}
                                        placeholder="MP 12345"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">MatrÃ­cula Especialidad</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 text-slate-900 dark:text-slate-100 font-bold transition-all shadow-inner"
                                        value={editForm.me}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, me: e.target.value }))}
                                        placeholder="ME 6789"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 flex gap-4">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 py-4 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="flex-1 py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-slate-900/10 uppercase text-xs tracking-widest"
                            >
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </div>
    );
};

export default ProfesionalesView;
