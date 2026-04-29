import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, Trash2, Tag, Lock as LockIcon, Download, Printer, X, FileText, Edit3, Database, Cloud, Mail, MoreVertical, Briefcase, Award, ArrowLeft, Image as ImageIcon, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { db, USE_LOCAL_DB } from '../firebase/config';
import { supabase } from '../supabase/config';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, query, where, orderBy, updateDoc } from 'firebase/firestore';
import { apiService } from '../services/apiService';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_PROFESIONALES } from '../data/seedProfs';
import ModalPortal from './common/ModalPortal';
import { motion, AnimatePresence } from 'framer-motion';

const ProfesionalesView = () => {
    const { viewingUid, permission, catalogOwnerUid, userRole, permissions, isSuperAdmin } = useAuth();
    const isReadOnly = permission === 'viewer' || (permissions?.can_view_shared_catalog && viewingUid !== catalogOwnerUid);
    
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

    const shortProfName = (fullName) => {
        if (!fullName) return '';
        const parts = fullName.trim().split(' ');
        const prefixes = ['dr', 'dra', 'lic', 'dr.', 'dra.', 'lic.'];
        if (parts.length >= 2 && prefixes.includes(parts[0].toLowerCase())) {
            return `${parts[0]} ${parts[1]}`;
        }
        return parts.slice(0, 2).join(' ');
    };

    const [showEditModal, setShowEditModal] = useState(false);
    const [editingProf, setEditingProf] = useState(null);
    const [editForm, setEditForm] = useState({
        nombre: '',
        categoria: 'ORL',
        especialidad: '',
        mp: '',
        me: '',
        firmaUrl: ''
    });
    const [uploadingFirma, setUploadingFirma] = useState(false);


    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [showMatrixModal, setShowMatrixModal] = useState(false);
    const [matrixData, setMatrixData] = useState(null);

    const [isAdmin, setIsAdmin] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');

    const printStyle = `
        @media print {
            @page { size: landscape; margin: 5mm; }
            .no-print { display: none !important; }
            #root { display: none !important; }
            .print-portal-matrix { display: block !important; position: absolute; top: 0; left: 0; width: 100%; background: white !important; color: black !important; }
            body { background: white !important; color: black !important; }
        }
    `;

    const handleUnlock = async () => {
        if (USE_LOCAL_DB) {
            setIsAdmin(true);
            setShowPinModal(false);
            setPinInput('');
            return;
        }

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
                alert("No tiene un PIN configurado.");
                setPinInput('');
            }
        } catch (error) {
            console.error("Error verifying PIN:", error);
        }
    };

    const fetchProfs = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
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
        if (!ownerToUse) return;

        const fullName = prefijo ? `${prefijo.trim()} ${nombre.trim()}` : nombre.trim();

        try {
            await apiService.addDocument("profesionales", {
                nombre: fullName,
                categoria,
                userId: ownerToUse
            });
            setNombre('');
            fetchProfs();
        } catch (error) {
            console.error("Error adding professional:", error);
        }
    };

    const handleSeed = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        if (!window.confirm("¿Deseas cargar la lista predefinida de profesionales de COAT?")) return;

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
            alert(`Se agregaron ${addedCount} profesionales.`);
        } catch (error) {
            console.error("Error seeding professionals:", error);
        }
    };

    const handleEditClick = (prof) => {
        setEditingProf(prof);
        setEditForm({
            nombre: prof.nombre || '',
            categoria: prof.categoria || 'ORL',
            especialidad: prof.especialidad || '',
            mp: prof.mp || '',
            me: prof.me || '',
            firmaUrl: prof.firmaUrl || ''
        });

        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        if (!editingProf || !editForm.nombre) return;
        try {
            await apiService.updateDocument("profesionales", editingProf.id, {
                nombre: editForm.nombre.trim(),
                categoria: editForm.categoria,
                especialidad: editForm.especialidad.trim(),
                mp: editForm.mp.trim(),
                me: editForm.me.trim(),
                firmaUrl: editForm.firmaUrl
            });

            setShowEditModal(false);
            setEditingProf(null);
            fetchProfs();
        } catch (error) {
            console.error("Error updating professional:", error);
        }
    };

    useEffect(() => {
        fetchProfs();
    }, [viewingUid]);

    const handleDelete = async (id, nombre) => {
        if (!window.confirm(`¿Estás seguro de eliminar a ${nombre}?`)) return;
        try {
            await apiService.deleteDocument("profesionales", id);
            fetchProfs();
        } catch (error) {
            console.error("Error deleting professional:", error);
        }
    };

    const handleUploadFirma = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate image
        if (!file.type.startsWith('image/')) {
            alert("Por favor seleccione un archivo de imagen (PNG, JPG, etc)");
            return;
        }

        setUploadingFirma(true);
        try {
            const fileName = `${editingProf.id}_${Date.now()}.png`;
            const filePath = `firmas/${fileName}`;

            const { data, error } = await supabase.storage
                .from('Cirugias')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('Cirugias')
                .getPublicUrl(filePath);
            
            setEditForm(prev => ({ ...prev, firmaUrl: publicUrl }));
        } catch (error) {
            console.error("Error uploading signature to Supabase:", error);
            alert("Error al subir la firma a Supabase.");
        } finally {
            setUploadingFirma(false);
        }
    };

    const fetchMatrixData = async () => {

        const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;

        try {
            const allEntries = await apiService.getCollection("caja");
            const entries = allEntries.filter(e => e.fecha >= startDateStr && e.fecha <= endDateStr);

            const matrix = {};
            const activeProfs = new Set();
            const dates = new Set();

            entries.forEach(e => {
                const date = e.fecha;
                dates.add(date);
                if (!matrix[date]) matrix[date] = {};
                const process = (name, amt, cur) => {
                    if (!name || !amt) return;
                    activeProfs.add(name);
                    if (!matrix[date][name]) matrix[date][name] = { ARS: 0, USD: 0 };
                    if (cur === 'USD') matrix[date][name].USD += Number(amt);
                    else matrix[date][name].ARS += Number(amt);
                };
                if (e.prof_1) { process(e.prof_1, e.liq_prof_1, e.liq_prof_1_currency); process(e.prof_1, e.liq_prof_1_secondary, e.liq_prof_1_currency_secondary); }
                if (e.prof_2) { process(e.prof_2, e.liq_prof_2, e.liq_prof_2_currency); process(e.prof_2, e.liq_prof_2_secondary, e.liq_prof_2_currency_secondary); }
                if (e.prof_3) { process(e.prof_3, e.liq_prof_3, e.liq_prof_3_currency); process(e.prof_3, e.liq_prof_3_secondary, e.liq_prof_3_currency_secondary); }
                if (e.anestesista) process(e.anestesista, e.liq_anestesista, e.liq_anestesista_currency);
            });

            const monthlyDeductions = await apiService.getCollection("deducciones");
            const filteredDeductions = monthlyDeductions.filter(d => d.date >= startDateStr && d.date <= endDateStr);
            filteredDeductions.forEach(d => {
                const date = d.date;
                const prof = d.profesional;
                const amt = Math.abs(Number(d.amount || 0));
                const cur = d.currency || 'ARS';
                if (!matrix[date]) matrix[date] = {};
                if (!matrix[date][prof]) matrix[date][prof] = { ARS: 0, USD: 0 };
                dates.add(date); activeProfs.add(prof);
                if (cur === 'USD') matrix[date][prof].USD -= amt;
                else matrix[date][prof].ARS -= amt;
            });

            if (activeProfs.size === 0) return null;
            const sortedProfs = Array.from(activeProfs).sort();
            const sortedDates = Array.from(dates).sort();
            const profNameToCategory = {};
            profesionales.forEach(p => profNameToCategory[p.nombre] = p.categoria);
            const filteredReportProfs = sortedProfs.filter(name => {
                const cat = profNameToCategory[name];
                return cat !== 'Tutoras' && cat !== 'Tutoria' && name !== 'Tutoria' && name !== 'Tutoras';
            });
            const totals = {};
            filteredReportProfs.forEach(p => totals[p] = { ARS: 0, USD: 0 });
            sortedDates.forEach(d => {
                filteredReportProfs.forEach(p => {
                    const cell = matrix[d][p];
                    if (cell) { totals[p].ARS += cell.ARS; totals[p].USD += cell.USD; }
                });
            });
            return { dates: sortedDates, profs: filteredReportProfs, matrix, totals };
        } catch (err) {
            console.error(err);
            throw new Error("Error obteniendo datos");
        }
    };

    const handleGeneralExcel = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return;
            const { dates, profs, matrix, totals } = data;
            const ExcelJS = (await import('exceljs')).default || await import('exceljs');
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Honorarios');
            ws.getCell(1, 1).value = "FECHA";
            profs.forEach((p, i) => ws.getCell(1, i + 2).value = shortProfName(p));
            let currentRow = 2;
            dates.forEach(d => {
                const row = ws.getRow(currentRow);
                const [y, m, da] = d.split('-');
                row.getCell(1).value = `${da}/${m}/${y.slice(2)}`;
                profs.forEach((p, i) => {
                    const cell = matrix[d][p];
                    let val = "";
                    if (cell) {
                        if (cell.ARS > 0) val += `$${cell.ARS.toLocaleString('es-AR')}`;
                        if (cell.USD > 0) val += (val ? " + " : "") + `USD ${cell.USD.toLocaleString('es-AR')}`;
                    }
                    row.getCell(i + 2).value = val;
                });
                currentRow++;
            });
            const buffer = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buffer]), `Honorarios_${selectedMonth}_${selectedYear}.xlsx`);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSendEmail = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return;
            const { dates, profs, matrix } = data;
            const emailDoc = await getDoc(doc(db, "settings", "notifications"));
            if (!emailDoc.exists() || !emailDoc.data().scriptUrl) return;
            const { emails, scriptUrl } = emailDoc.data();
            let tableHtml = `<table border="1" style="border-collapse: collapse;"><tr><td>FECHA</td>`;
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
                    tableHtml += `<td>${val || "-"}</td>`;
                });
                tableHtml += `</tr>`;
            });
            tableHtml += `</table>`;
            await fetch(scriptUrl, {
                method: 'POST', mode: 'no-cors',
                body: JSON.stringify({ to: emails, subject: `Reporte Honorarios ${selectedMonth}/${selectedYear}`, body: tableHtml })
            });
            alert("Enviado.");
        } catch (error) {
            console.error(error);
        }
    };

    const handlePrintMatrix = async () => {
        try {
            const data = await fetchMatrixData();
            if (!data) return;
            setMatrixData(data);
            setShowMatrixModal(true);
        } catch (error) {
            console.error(error);
        }
    };

    const formatMoney = (val) => val ? val.toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '0';

    return (
        <div className="space-y-12 animate-in fade-in duration-700">
            <div className="premium-card p-1 bg-slate-50/50 dark:bg-slate-900/50 border-none shadow-premium overflow-hidden">
                <div className="bg-white dark:bg-slate-900 rounded-[2.9rem] p-8 md:p-10 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-teal-500 rounded-[1.5rem] shadow-lg shadow-teal-500/20 flex items-center justify-center text-white flex-shrink-0">
                            <Briefcase size={32} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none mb-2">Staff Médico</h2>
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg text-[10px] font-black uppercase tracking-widest border border-teal-100 dark:border-teal-500/20">
                                    Control Operativo
                                </span>
                                <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-sm">
                                    <Award size={14} />
                                    <span>{profesionales.length} Profesionales activos</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-white/5 p-3 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-inner">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="bg-white dark:bg-slate-800 border-none text-slate-700 dark:text-slate-200 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-teal-500 font-black text-xs uppercase tracking-widest shadow-sm"
                        >
                            {[...Array(12)].map((_, i) => (
                                <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('es-AR', { month: 'long' })}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="bg-white dark:bg-slate-800 border-none text-slate-700 dark:text-slate-200 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-teal-500 font-black text-xs uppercase tracking-widest shadow-sm"
                        >
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>

                        <div className="hidden md:block w-px h-8 bg-slate-200 dark:bg-white/10 mx-2"></div>

                        <div className="flex items-center gap-2">
                            <button onClick={handlePrintMatrix} className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-400 hover:text-teal-500 rounded-xl transition-all shadow-sm">
                                <Printer size={20} />
                            </button>
                            <button onClick={handleGeneralExcel} className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20">
                                <Download size={16} className="inline mr-2" /> Excel
                            </button>
                            <button onClick={handleSendEmail} className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20">
                                <Mail size={16} className="inline mr-2" /> Reporte Mail
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {!isReadOnly && (
                <div className="premium-card p-1 bg-slate-50/50 dark:bg-slate-900/50 border-none">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.9rem] p-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center">
                                    <UserPlus size={20} />
                                </div>
                                Gestionar Personal
                            </h3>
                            
                            <div className="flex items-center gap-3">
                                {isAdmin ? (
                                    <button onClick={() => setIsAdmin(false)} className="px-5 py-2.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-full font-black text-[10px] uppercase tracking-widest border border-red-100 dark:border-red-500/20 flex items-center gap-2">
                                        <LockIcon size={14} /> Bloquear Edición
                                    </button>
                                ) : (
                                    <button onClick={() => setShowPinModal(true)} className="px-5 py-2.5 bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-slate-500 rounded-full font-black text-[10px] uppercase tracking-widest border border-slate-100 dark:border-white/5 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
                                        <LockIcon size={14} /> Modo Admin
                                    </button>
                                )}
                            </div>
                        </div>

                        <form onSubmit={handleAdd} className="flex flex-wrap gap-6 items-end">
                            <div className="flex-1 min-w-[300px] space-y-3">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nombre Completo</label>
                                <div className="flex gap-3">
                                    <select
                                        className="w-24 px-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl focus:ring-4 focus:ring-blue-500/10 transition-all text-sm font-bold text-slate-700 dark:text-slate-200"
                                        value={prefijo}
                                        onChange={(e) => setPrefijo(e.target.value)}
                                    >
                                        <option value="Dr.">Dr.</option>
                                        <option value="Dra.">Dra.</option>
                                        <option value="Lic.">Lic.</option>
                                        <option value="">N/A</option>
                                    </select>
                                    <input
                                        type="text"
                                        className="flex-1 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                        value={nombre}
                                        onChange={(e) => setNombre(e.target.value)}
                                        placeholder="Ej: Pérez, Juan"
                                    />
                                </div>
                            </div>
                            <div className="w-full md:w-64 space-y-3">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Especialidad</label>
                                <select
                                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-slate-700 dark:text-slate-200"
                                    value={categoria}
                                    onChange={(e) => setCategoria(e.target.value)}
                                >
                                    <option value="ORL">Otorrinolaringología</option>
                                    <option value="Anestesista">Anestesiología</option>
                                    <option value="Estetica">Estética</option>
                                    <option value="Fonoaudiologa">Fonoaudiología</option>
                                    <option value="Residente">Residencia</option>
                                    <option value="Tutoras">Tutoras</option>
                                </select>
                            </div>
                            <button type="submit" className="h-14 px-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                                Registrar Profesional
                            </button>
                        </form>

                        <div className="mt-12 pt-8 border-t border-slate-50 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-3 text-slate-300 dark:text-slate-600">
                                <Database size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Base de Datos Centralizada COAT</span>
                            </div>
                            <button
                                onClick={handleSeed}
                                className="px-6 py-3 bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] hover:bg-amber-500 hover:text-white transition-all"
                            >
                                Sincronizar Staff Predeterminado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {profesionales.map(prof => (
                    <div key={prof.id} className="premium-card p-1 bg-slate-50/50 dark:bg-slate-900/50 border-none group cursor-pointer hover:scale-[1.02] transition-all duration-500">
                        <div className="bg-white dark:bg-slate-900 rounded-[2.8rem] p-8 min-h-[180px] flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 dark:bg-white/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            <div className="flex justify-between items-start relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-inner">
                                        <Tag size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-slate-900 dark:text-white tracking-tight leading-tight mb-1">{prof.nombre}</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest">{prof.categoria}</span>
                                            {prof.firmaUrl && (
                                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md text-[8px] font-bold uppercase tracking-tighter border border-emerald-100 dark:border-emerald-500/20">
                                                    <Check size={8} /> Firma OK
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-between relative z-10">
                                <div className="space-y-1">
                                    {prof.especialidad && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 italic uppercase">{prof.especialidad}</p>}
                                    {isSuperAdmin && (prof.mp || prof.me) && (
                                        <p className="font-mono text-[9px] text-amber-600/60 dark:text-amber-500/40 font-bold uppercase tracking-tighter">
                                            {prof.mp && `MP ${prof.mp}`} {prof.me && `• ME ${prof.me}`}
                                        </p>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-1 transition-all">
                                    {(isSuperAdmin || isAdmin) && !isReadOnly && (
                                        <>
                                            <button onClick={() => handleEditClick(prof)} className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-all">
                                                <Edit3 size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(prof.id, prof.nombre)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all">
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {showPinModal && (
                    <ModalPortal onClose={() => setShowPinModal(false)}>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] shadow-premium w-full max-w-sm border border-slate-100 dark:border-slate-800/50 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16 blur-3xl" />
                            <div className="flex justify-center mb-8">
                                <div className="w-20 h-20 bg-slate-950 dark:bg-white rounded-[2rem] flex items-center justify-center text-white dark:text-slate-900 shadow-xl">
                                    <LockIcon size={32} />
                                </div>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 text-center uppercase tracking-tighter">Acceso de Edición</h3>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mb-10 font-black uppercase tracking-widest">Ingrese su PIN de seguridad</p>
                            
                            <input
                                type="password"
                                className="w-full text-center text-5xl tracking-[0.5em] font-black py-6 border-none bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] mb-10 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 dark:text-white transition-all shadow-inner"
                                placeholder="••••"
                                maxLength={4}
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                                autoFocus
                            />
                            <div className="flex gap-4">
                                <button onClick={() => setShowPinModal(false)} className="flex-1 py-5 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/5 rounded-2xl transition-all">Cancelar</button>
                                <button onClick={handleUnlock} className="flex-1 py-5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/20 active:scale-95 transition-all uppercase text-[10px] tracking-widest">Desbloquear</button>
                            </div>
                        </motion.div>
                    </ModalPortal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showEditModal && (
                    <ModalPortal onClose={() => setShowEditModal(false)}>
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] shadow-premium w-full max-w-xl border border-slate-100 dark:border-slate-800/50"
                        >
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-8 uppercase tracking-tighter">Editar Perfil Médico</h3>
                            
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre y Apellido</label>
                                    <input
                                        type="text"
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl font-bold"
                                        value={editForm.nombre}
                                        onChange={(e) => setEditForm({...editForm, nombre: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">MP</label>
                                        <input
                                            type="text"
                                            className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl font-bold"
                                            value={editForm.mp}
                                            onChange={(e) => setEditForm({...editForm, mp: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ME</label>
                                        <input
                                            type="text"
                                            className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl font-bold"
                                            value={editForm.me}
                                            onChange={(e) => setEditForm({...editForm, me: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoría</label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50 rounded-2xl font-bold"
                                        value={editForm.categoria}
                                        onChange={(e) => setEditForm({...editForm, categoria: e.target.value})}
                                    >
                                        <option value="ORL">Otorrinolaringología</option>
                                        <option value="Anestesista">Anestesiología</option>
                                        <option value="Estetica">Estética</option>
                                        <option value="Fonoaudiologa">Fonoaudiología</option>
                                        <option value="Residente">Residencia</option>
                                        <option value="Tutoras">Tutoras</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-12">
                                <button onClick={() => setShowEditModal(false)} className="flex-1 py-5 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/5 rounded-2xl transition-all">Cancelar</button>
                                <button onClick={handleSaveEdit} className="flex-1 py-5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all uppercase text-[10px] tracking-widest">Guardar Cambios</button>
                            </div>
                        </motion.div>
                    </ModalPortal>
                )}
            </AnimatePresence>

            {showMatrixModal && matrixData && createPortal(
                <div className="fixed inset-0 bg-white text-slate-900 z-[100] overflow-auto print-portal-matrix force-light-preview">
                    <style>{printStyle}</style>
                    <div className="p-8 print:p-0">
                        <div className="flex justify-between items-center mb-8 no-print border-b pb-4">
                            <h2 className="text-2xl font-bold">Vista Previa de Impresión</h2>
                            <div className="flex gap-4">
                                <button onClick={() => window.print()} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 flex items-center gap-2">
                                    <Printer size={18} /> Imprimir
                                </button>
                                <button onClick={() => setShowMatrixModal(false)} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 flex items-center gap-2">
                                    <X size={18} /> Cerrar
                                </button>
                            </div>
                        </div>

                        <div className="max-w-fit mx-auto print:w-full print:mx-0">
                            <h1 className="text-center font-bold text-lg mb-4 uppercase border-b-2 border-black pb-1">
                                HONORARIOS CX • {new Date(selectedYear, selectedMonth - 1).toLocaleString('es-AR', { month: 'long' }).toUpperCase()} {selectedYear}
                            </h1>

                            <table className="w-full text-[10px] border-collapse border border-black">
                                <thead>
                                    <tr>
                                        <th className="border border-black px-1 py-1 bg-slate-100 font-bold uppercase">FECHA</th>
                                        {matrixData.profs.map(p => (
                                            <th key={p} className="border border-black px-1 py-1 bg-slate-100 font-bold uppercase">{shortProfName(p)}</th>
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
                                                            <div className="flex flex-col text-[9px] leading-tight font-medium">
                                                                {cell.ARS > 0 && <span>${formatMoney(cell.ARS)}</span>}
                                                                {cell.USD > 0 && <span className="font-bold">U$S {formatMoney(cell.USD)}</span>}
                                                            </div>
                                                        ) : '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td className="border border-black px-1 py-1 font-bold bg-slate-200 uppercase">TOTALES ARS</td>
                                        {matrixData.profs.map(prof => (
                                            <td key={prof} className="border border-black px-1 py-1 text-center font-bold bg-slate-100">
                                                {matrixData.totals[prof].ARS > 0 ? `$ ${formatMoney(matrixData.totals[prof].ARS)}` : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="border border-black px-1 py-1 font-bold bg-slate-200 uppercase">TOTALES USD</td>
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

                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-1">Firma Digital</label>
                                
                                <div className="flex items-center gap-6">
                                    <div className="w-32 h-20 bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center overflow-hidden relative group">
                                        {editForm.firmaUrl ? (
                                            <img src={editForm.firmaUrl} alt="Firma" className="max-w-full max-h-full object-contain" />
                                        ) : (
                                            <ImageIcon size={24} className="text-slate-300 dark:text-slate-600" />
                                        )}
                                        {uploadingFirma && (
                                            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex items-center justify-center">
                                                <RefreshCw size={18} className="text-teal-500 animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 space-y-2">
                                        <label className="inline-block px-4 py-2 bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-teal-500 hover:text-white transition-all border border-teal-100 dark:border-teal-500/20">
                                            {editForm.firmaUrl ? 'Cambiar Firma' : 'Subir Firma'}
                                            <input type="file" className="hidden" accept="image/*" onChange={handleUploadFirma} disabled={uploadingFirma} />
                                        </label>
                                        <p className="text-[9px] text-slate-400 leading-tight">Sube una imagen con fondo transparente o blanco para mejores resultados en el PDF.</p>
                                    </div>
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
