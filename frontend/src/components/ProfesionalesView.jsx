import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Tag, Lock, Download, Printer, X, FileText, Edit3 } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_PROFESIONALES } from '../data/seedProfs';


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
        } else if (['ORL', 'Anestesista', 'Estetica'].includes(categoria)) {
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
        try {
            if (!viewingUid) {
                alert("Error de sesión.");
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
                alert("No tiene un PIN configurado. Vaya a Configuración para crear uno.");
                setPinInput('');
            }
        } catch (error) {
            console.error("Error verifying PIN:", error);
            alert("Error al verificar PIN.");
        }
    };

    const fetchProfs = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            const q = query(collection(db, "profesionales"), where("userId", "==", ownerToUse));
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

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!nombre) return;
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return alert("Debes iniciar sesión");

        const fullName = prefijo ? `${prefijo.trim()} ${nombre.trim()}` : nombre.trim();

        try {
            await addDoc(collection(db, "profesionales"), {
                nombre: fullName,
                categoria,
                userId: ownerToUse
            });
            setNombre('');
            fetchProfs();
            alert("Profesional agregado correctamente");
        } catch (error) {
            console.error("Error adding professional:", error);
            alert("Error de conexión al agregar profesional");
        }
    };

    const handleSeed = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return alert("Debes iniciar sesión");
        if (!window.confirm("¿Deseas cargar la lista predefinida de profesionales de COAT? Solo se agregarán los que falten.")) return;

        try {
            let addedCount = 0;
            for (const p of DEFAULT_PROFESIONALES) {
                const exists = profesionales.some(existing => existing.nombre.toLowerCase().includes(p.nombre.toLowerCase()));
                if (!exists) {
                    await addDoc(collection(db, "profesionales"), {
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
            await updateDoc(doc(db, "profesionales", editingProf.id), {
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
        if (!window.confirm(`¿Estás seguro de eliminar a ${nombre}?`)) return;
        try {
            await deleteDoc(doc(db, "profesionales", id));
            fetchProfs();
            alert("Profesional eliminado");
        } catch (error) {
            console.error("Error deleting professional:", error);
            alert("Error de conexión");
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
            // Fetch by userId and filter dates client-side to avoid Index requirements
            const q = query(
                collection(db, "caja"),
                where("userId", "==", viewingUid)
            );

            const querySnapshot = await getDocs(q);
            const allEntries = querySnapshot.docs.map(doc => doc.data());

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

            // 2. Fetch and Process Deductions
            const qDeductions = query(
                collection(db, "deducciones"),
                where("userId", "==", viewingUid)
            );
            const deductionSnapshot = await getDocs(qDeductions);
            const monthlyDeductions = deductionSnapshot.docs
                .map(d => d.data())
                .filter(d => d.date >= startDateStr && d.date <= endDateStr);

            monthlyDeductions.forEach(d => {
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
                const isExcludedName = name === 'Tutoria' || name === 'Tutoras' || name === 'Tutoría';
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
            ws.mergeCells(1, 1, 1, profs.length + 1);
            ws.getCell(1, 1).value = `HONORARIOS CX - ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
            ws.getCell(1, 1).font = { bold: true, size: 14 };
            ws.getCell(1, 1).alignment = { horizontal: 'center' };

            // Headers
            ws.getCell(2, 1).value = "FECHA";
            ws.getCell(2, 1).style = headerStyle;
            profs.forEach((p, i) => {
                const c = ws.getCell(2, i + 2);
                c.value = shortProfName(p);
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
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                            <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                <FileText size={24} />
                            </div>
                            Reporte Mensual de Honorarios
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">Genera la planilla general de liquidaciones por mes.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-bold text-sm"
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('es-AR', { month: 'long' }).toUpperCase()}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-white border border-slate-200 text-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 font-bold text-sm"
                        >
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        <div className="w-px h-8 bg-slate-200 mx-2"></div>

                        <button onClick={handleGeneralExcel} className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-50">
                            <Download size={18} /> Excel
                        </button>
                        <button onClick={handlePrintMatrix} className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-50">
                            <Printer size={18} /> Imprimir
                        </button>
                    </div>
                </div>
            </div>
            {!isReadOnly && (
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-teal-100 rounded-lg">
                                <UserPlus className="text-teal-600" size={24} />
                            </div>
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
                        <div className="w-24">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Título</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-sm font-medium text-slate-700"
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
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium text-slate-700"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                placeholder="Ej: García, Juan"
                            />
                        </div>
                        <div className="w-48">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Categoría</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                            >
                                <option value="ORL">ORL</option>
                                <option value="Anestesista">Anestesista</option>
                                <option value="Estetica">Estética</option>
                                <option value="Fonoaudiologa">Fonoaudiologa</option>
                                <option value="Tutoras">Tutoras</option>
                            </select>
                        </div>
                        <button type="submit" className="px-8 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all shadow-lg shadow-blue-100">
                            Guardar
                        </button>
                    </form>

                    {/* Seed Button - Only for Super Admin or owners */}
                    {!isReadOnly && (
                        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-400">
                                <FileText size={16} />
                                <span className="text-xs font-medium italic">Acciones rápidas para administración COAT</span>
                            </div>
                            <button
                                onClick={handleSeed}
                                className="px-6 py-2.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-100 transition-all"
                            >
                                Cargar Lista Profesionales COAT
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profesionales.map(prof => (
                    <div key={prof.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-teal-600">
                                    <Tag size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">{prof.nombre}</h3>
                                    <p className="text-sm text-slate-400 font-medium">{prof.categoria}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {isSuperAdmin && (
                                    <button
                                        onClick={() => handleEditClick(prof)}
                                        className="p-2 text-teal-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                        title="Editar"
                                    >
                                        <Edit3 size={16} />
                                    </button>
                                )}
                                {isAdmin && !isReadOnly && (
                                    <button
                                        onClick={() => handleDelete(prof.id, prof.nombre)}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        {/* Show credentials if exist - MP/ME only for Super Admin */}
                        {(prof.especialidad || (isSuperAdmin && (prof.mp || prof.me))) && (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-0.5">
                                {prof.especialidad && <p>{prof.especialidad}</p>}
                                {isSuperAdmin && (prof.mp || prof.me) && (
                                    <p className="font-mono text-amber-600">
                                        {prof.mp && `MP ${prof.mp}`}{prof.mp && prof.me && ' - '}{prof.me && `ME ${prof.me}`}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* PIN MODAL */}
            {
                showPinModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm">
                            <h3 className="text-lg font-bold text-slate-900 mb-4 text-center">Ingrese PIN de Admin</h3>
                            <input
                                type="password"
                                className="w-full text-center text-2xl tracking-widest font-bold py-3 border-2 border-slate-200 rounded-xl mb-6 focus:border-teal-500 focus:outline-none"
                                placeholder="****"
                                maxLength={10}
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button onClick={() => setShowPinModal(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Cancelar</button>
                                <button onClick={handleUnlock} className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 shadow-lg shadow-blue-200">Desbloquear</button>
                            </div>
                        </div>
                    </div>
                )
            }

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
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md">
                        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                            <Edit3 size={20} className="text-teal-600" />
                            Editar Profesional
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Nombre</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    value={editForm.nombre}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Categoría</label>
                                <select
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    value={editForm.categoria}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, categoria: e.target.value }))}
                                >
                                    <option value="ORL">ORL</option>
                                    <option value="Anestesista">Anestesista</option>
                                    <option value="Estetica">Estética</option>
                                    <option value="Fonoaudiologa">Fonoaudiologa</option>
                                    <option value="Tutoras">Tutoras</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Especialidad</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    value={editForm.especialidad}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, especialidad: e.target.value }))}
                                    placeholder="Otorrinolaringología"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">MP (Matrícula Prov.)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                                        value={editForm.mp}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, mp: e.target.value }))}
                                        placeholder="39500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ME (Mat. Esp.)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                                        value={editForm.me}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, me: e.target.value }))}
                                        placeholder="20651"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setShowEditModal(false); setEditingProf(null); }}
                                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 shadow-lg shadow-blue-200 transition-colors"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfesionalesView;
