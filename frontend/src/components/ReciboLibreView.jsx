import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { logAction, AUDIT_ACTIONS } from '../services/auditService';
import { Printer, Calendar, User, FileText, RefreshCw, PenTool, Trash2, Eye, Plus, PlusCircle, Trash } from 'lucide-react';
import MoneyInput from './MoneyInput';

const ReciboLibreView = () => {
    const { currentUser, viewingUid, permission, catalogOwnerUid, permissions } = useAuth();
    const isReadOnly = permission === 'viewer' || permissions?.readonly_caja;
    const today = new Date().toISOString().split('T')[0];

    // Form States
    const [date, setDate] = useState(today);
    const [selectedProf, setSelectedProf] = useState('');
    const [concept, setConcept] = useState('');
    const [isTransfer, setIsTransfer] = useState(false);

    // Multi-Patient List State
    const [patients, setPatients] = useState([
        {
            fecha: today,
            paciente: '',
            dni: '',
            obra_social: '',
            cobroPesos: 0,
            cobroDolares: 0,
            liqPesos: 0,
            liqDolares: 0
        }
    ]);

    // Autocomplete dropdown state
    const [selectedDayPatientId, setSelectedDayPatientId] = useState('');

    // Dynamic Lists
    const [profesionales, setProfesionales] = useState([]);
    const [dayPatients, setDayPatients] = useState([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Receipts History States
    const [savedReceipts, setSavedReceipts] = useState([]);
    const [loadingReceipts, setLoadingReceipts] = useState(false);

    // Sync concept with selected professional automatically if not modified manually
    useEffect(() => {
        if (selectedProf) {
            setConcept(`Honorarios por técnica en común de por cuenta y orden de ${selectedProf}`);
        } else {
            setConcept('');
        }
    }, [selectedProf]);

    // Fetch professionals
    useEffect(() => {
        const fetchProfs = async () => {
            try {
                const q = query(collection(db, "profesionales"));
                const querySnapshot = await getDocs(q);
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                list.sort((a, b) => a.nombre.localeCompare(b.nombre));
                setProfesionales(list);
            } catch (error) {
                console.error("Error fetching professionals:", error);
            }
        };
        fetchProfs();
    }, []);

    // Fetch patients for the selected date
    useEffect(() => {
        if (!date) return;
        const fetchDayPatients = async () => {
            setLoadingPatients(true);
            try {
                const q = query(collection(db, "caja"), where("fecha", "==", date));
                const querySnapshot = await getDocs(q);
                const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setDayPatients(list);
            } catch (error) {
                console.error("Error fetching patients for date:", error);
            } finally {
                setLoadingPatients(false);
            }
        };
        fetchDayPatients();
    }, [date]);

    // Fetch saved receipts
    const fetchSavedReceipts = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        setLoadingReceipts(true);
        try {
            const q = query(
                collection(db, "recibos_libres"),
                where("userId", "==", ownerToUse)
            );
            const querySnapshot = await getDocs(q);
            const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            list.sort((a, b) => {
                const dateCompare = b.fecha.localeCompare(a.fecha);
                if (dateCompare !== 0) return dateCompare;
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
            setSavedReceipts(list);
        } catch (error) {
            console.error("Error fetching saved receipts:", error);
        } finally {
            setLoadingReceipts(false);
        }
    };

    useEffect(() => {
        fetchSavedReceipts();
    }, [catalogOwnerUid, viewingUid]);

    const formatMoney = (val) => {
        return (val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('-')) {
            return dateStr.split('-').reverse().join('/');
        }
        return dateStr;
    };

    // Add empty manual patient row
    const handleAddManualPatient = () => {
        setPatients(prev => [
            ...prev,
            {
                fecha: date || today,
                paciente: '',
                dni: '',
                obra_social: '',
                cobroPesos: 0,
                cobroDolares: 0,
                liqPesos: 0,
                liqDolares: 0
            }
        ]);
    };

    // Remove patient row
    const handleRemovePatient = (index) => {
        if (patients.length <= 1) {
            // Reset the only row rather than deleting it
            setPatients([{
                fecha: date || today,
                paciente: '',
                dni: '',
                obra_social: '',
                cobroPesos: 0,
                cobroDolares: 0,
                liqPesos: 0,
                liqDolares: 0
            }]);
            return;
        }
        setPatients(prev => prev.filter((_, i) => i !== index));
    };

    // Edit patient field
    const handleEditPatientField = (index, field, value) => {
        setPatients(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    // Handle patient selection change to autofill amounts
    const handleAddDayPatient = (patientId) => {
        if (!patientId) return;

        const match = dayPatients.find(p => p.id === patientId);
        if (match) {
            const cleanName = match.paciente.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '');

            let arVal = 0;
            let usVal = 0;
            const normSelected = selectedProf.trim().toLowerCase();

            if (selectedProf) {
                if (match.prof_1?.trim().toLowerCase() === normSelected) {
                    if (match.liq_prof_1_currency === 'USD') usVal = parseFloat(match.liq_prof_1) || 0;
                    else arVal = parseFloat(match.liq_prof_1) || 0;
                    
                    if (match.showSecondary_1) {
                        if (match.liq_prof_1_currency_secondary === 'USD') usVal = parseFloat(match.liq_prof_1_secondary) || 0;
                        else arVal = parseFloat(match.liq_prof_1_secondary) || 0;
                    }
                } else if (match.prof_2?.trim().toLowerCase() === normSelected) {
                    if (match.liq_prof_2_currency === 'USD') usVal = parseFloat(match.liq_prof_2) || 0;
                    else arVal = parseFloat(match.liq_prof_2) || 0;
                    
                    if (match.showSecondary_2) {
                        if (match.liq_prof_2_currency_secondary === 'USD') usVal = parseFloat(match.liq_prof_2_secondary) || 0;
                        else arVal = parseFloat(match.liq_prof_2_secondary) || 0;
                    }
                } else if (match.prof_3?.trim().toLowerCase() === normSelected) {
                    if (match.liq_prof_3_currency === 'USD') usVal = parseFloat(match.liq_prof_3) || 0;
                    else arVal = parseFloat(match.liq_prof_3) || 0;
                    
                    if (match.showSecondary_3) {
                        if (match.liq_prof_3_currency_secondary === 'USD') usVal = parseFloat(match.liq_prof_3_secondary) || 0;
                        else arVal = parseFloat(match.liq_prof_3_secondary) || 0;
                    }
                } else if (match.anestesista?.trim().toLowerCase() === normSelected) {
                    if (match.liq_anestesista_currency === 'USD') usVal = parseFloat(match.liq_anestesista) || 0;
                    else arVal = parseFloat(match.liq_anestesista) || 0;
                    
                    if (match.showSecondaryAnes) {
                        if (match.liq_anestesista_currency_secondary === 'USD') usVal = parseFloat(match.liq_anestesista_secondary) || 0;
                        else arVal = parseFloat(match.liq_anestesista_secondary) || 0;
                    }
                }
            }

            // Fallback: If no professional matched or professional amounts are 0, use total patient payments
            if (arVal === 0 && usVal === 0) {
                arVal = parseFloat(match.pesos) || 0;
                usVal = parseFloat(match.dolares) || 0;
            }

            const newPatientRow = {
                fecha: match.fecha || date || today,
                paciente: cleanName,
                dni: match.dni || '',
                obra_social: match.obra_social || '',
                cobroPesos: parseFloat(match.pesos) || 0,
                cobroDolares: parseFloat(match.dolares) || 0,
                liqPesos: arVal,
                liqDolares: usVal
            };

            // If the first patient row is empty/pristine, replace it; otherwise append
            setPatients(prev => {
                if (prev.length === 1 && prev[0].paciente === '' && prev[0].liqPesos === 0 && prev[0].liqDolares === 0) {
                    return [newPatientRow];
                }
                return [...prev, newPatientRow];
            });

            // Reset dropdown select
            setSelectedDayPatientId('');
        }
    };

    // Calculate totals dynamically
    const totalLiqPesos = patients.reduce((acc, curr) => acc + (parseFloat(curr.liqPesos) || 0), 0);
    const totalLiqDolares = patients.reduce((acc, curr) => acc + (parseFloat(curr.liqDolares) || 0), 0);

    const handleSaveAndPrint = async (e) => {
        e.preventDefault();
        if (isReadOnly) return;
        if (!selectedProf || patients.some(p => !p.paciente) || (totalLiqPesos === 0 && totalLiqDolares === 0)) {
            alert("Por favor complete el profesional, los nombres de pacientes y al menos un importe de liquidación.");
            return;
        }

        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;

        setIsSaving(true);
        try {
            const receiptData = {
                fecha: date,
                profesional: selectedProf,
                concepto: concept,
                isTransfer: isTransfer,
                patients: patients,
                montoPesos: totalLiqPesos,
                montoDolares: totalLiqDolares,
                userId: ownerToUse,
                createdAt: new Date().toISOString(),
                createdBy: currentUser?.email || 'unknown'
            };

            const docRef = await addDoc(collection(db, "recibos_libres"), receiptData);
            
            await logAction(
                AUDIT_ACTIONS.CREATE_CAJA_ENTRY,
                docRef.id,
                `Creado Recibo Libre y Detalle de Liquidación para ${selectedProf} (${patients.length} pacientes)`,
                { receipt: receiptData }
            );

            alert("Liquidación registrada con éxito. Se abrirá la ventana de impresión (incluye Detalle y Recibo).");
            fetchSavedReceipts();

            setTimeout(() => {
                window.print();
            }, 150);

        } catch (error) {
            console.error("Error saving manual receipt:", error);
            alert("Error al registrar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReceipt = async (id, prof, count) => {
        if (isReadOnly) return;
        if (!window.confirm(`¿Está seguro que desea eliminar esta liquidación de ${prof} (${count} pacientes)?`)) return;

        try {
            await deleteDoc(doc(db, "recibos_libres", id));
            await logAction(
                AUDIT_ACTIONS.DELETE_CAJA_ENTRY,
                id,
                `Eliminado Recibo Libre para el profesional ${prof}`
            );
            alert("Liquidación eliminada con éxito.");
            fetchSavedReceipts();
        } catch (error) {
            console.error("Error deleting receipt:", error);
            alert("Error al eliminar la liquidación: " + error.message);
        }
    };

    const handleLoadReceipt = (receipt) => {
        setDate(receipt.fecha);
        setSelectedProf(receipt.profesional);
        setConcept(receipt.concepto || '');
        setIsTransfer(!!receipt.isTransfer);
        
        // Handle backwards compatibility for single-patient receipts
        if (receipt.patients && Array.isArray(receipt.patients)) {
            setPatients(receipt.patients);
        } else {
            setPatients([
                {
                    fecha: receipt.fecha,
                    paciente: receipt.paciente || '',
                    dni: '',
                    obra_social: '',
                    cobroPesos: 0,
                    cobroDolares: 0,
                    liqPesos: receipt.montoPesos || 0,
                    liqDolares: receipt.montoDolares || 0
                }
            ]);
        }
        alert("Los datos de la liquidación seleccionada han sido cargados en el formulario.");
    };

    const printStyle = `
      @media print {
        @page { size: auto; margin: 8mm; }
        html, body { 
            height: auto !important; 
            overflow: visible !important; 
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
            background: white !important;
            color: black !important;
        }
        #root { display: none !important; }
        .print-portal {
            display: block !important;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: auto;
            z-index: 9999;
            background: white !important;
            color: black !important;
        }
        .print-portal * {
            color: black !important;
            background-color: transparent !important;
            border-color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .print-portal img {
            background-color: transparent !important;
        }
        .page-break { 
            page-break-after: always !important; 
            break-after: page !important; 
            display: block !important; 
            min-height: 95vh;
            width: 100%;
            position: relative;
            background: white !important;
        }
        .page-break:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
            min-height: auto;
        }
        .no-print { display: none !important; }
      }
      .print-portal { display: none; }
    `;

    return (
        <div className="space-y-6">
            <style>{printStyle}</style>

            {/* Print Portal: Generates Page 1 (Detalle de Liquidación) and Page 2 (Recibo de Honorarios) */}
            {createPortal(
                <div className="print-portal bg-white text-black p-4">
                    {/* PAGE 1: DETALLE DE LIQUIDACIÓN */}
                    <div className="page-break p-8">
                        <div className="flex justify-between items-start mb-6 border-b border-black pb-4">
                            <img src="/coat_logo.png" alt="COAT" className="h-16 object-contain" />
                            <div className="text-right">
                                <h1 className="text-2xl font-bold uppercase">Liquidación: {selectedProf || '—'}</h1>
                                <p className="text-lg font-bold">{formatDate(date)}</p>
                            </div>
                        </div>

                        <table className="w-full text-xs border-collapse border border-black mb-4">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-black px-2 py-1.5 text-left font-bold w-[12%]">Fecha</th>
                                    <th className="border border-black px-2 py-1.5 text-left font-bold w-[45%]">Paciente</th>
                                    <th className="border border-black px-2 py-1.5 text-right font-bold w-[14%]">Cobro $</th>
                                    <th className="border border-black px-2 py-1.5 text-right font-bold w-[14%]">Cobro USD</th>
                                    <th className="border border-black px-2 py-1.5 text-right font-bold bg-slate-200 w-[15%]">Liquidación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map((entry, idx) => (
                                    <tr key={idx} className="border-b border-black">
                                        <td className="border border-black px-2 py-1.5">{formatDate(entry.fecha)}</td>
                                        <td className="border border-black px-2 py-1.5">
                                            <div className="font-bold">{entry.paciente || '—'}</div>
                                            {(entry.dni || entry.obra_social) && (
                                                <div className="text-[10px] text-slate-500">
                                                    {entry.dni} {entry.dni && entry.obra_social ? ' - ' : ''} {entry.obra_social}
                                                </div>
                                            )}
                                        </td>
                                        <td className="border border-black px-2 py-1.5 text-right">
                                            {entry.cobroPesos > 0 ? `$${formatMoney(entry.cobroPesos)}` : '—'}
                                        </td>
                                        <td className="border border-black px-2 py-1.5 text-right">
                                            {entry.cobroDolares > 0 ? `USD ${formatMoney(entry.cobroDolares)}` : '—'}
                                        </td>
                                        <td className="border border-black px-2 py-1.5 text-right font-bold">
                                            {entry.liqPesos > 0 && <div>${formatMoney(entry.liqPesos)}</div>}
                                            {entry.liqDolares > 0 && <div>USD {formatMoney(entry.liqDolares)}</div>}
                                            {!(entry.liqPesos > 0) && !(entry.liqDolares > 0) && <div>—</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-black font-bold border-t-2 border-black bg-slate-100">
                                    <td colSpan="4" className="border border-black px-2 py-2 text-right uppercase">Total Final</td>
                                    <td className="border border-black px-2 py-2 text-right">
                                        {totalLiqPesos > 0 && <div>${formatMoney(totalLiqPesos)}</div>}
                                        {totalLiqDolares > 0 && <div>USD {formatMoney(totalLiqDolares)}</div>}
                                        {totalLiqPesos === 0 && totalLiqDolares === 0 && <div>—</div>}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* PAGE 2: RECIBO DE HONORARIOS */}
                    <div className="page-break p-8">
                        <div className="mb-8">
                            <img src="/coat_logo.png" alt="COAT" className="h-20 object-contain mx-auto" />
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm text-slate-800 mb-8 font-medium">
                            <div className="font-bold text-slate-900">Fecha:</div>
                            <div>{formatDate(date)}</div>
                            <div className="font-bold text-slate-900">Movimiento:</div>
                            <div>Egreso</div>
                            <div className="font-bold text-slate-900">Concepto:</div>
                            <div>{concept || `Honorarios por técnica en común de por cuenta y orden de ${selectedProf || '—'}`}</div>
                            <div className="font-bold text-slate-900">Referencia:</div>
                            <div className="text-xs">
                                {patients.map(p => p.paciente).filter(Boolean).join(', ') || '—'}
                            </div>
                        </div>
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
                                {totalLiqPesos > 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-600">Efectivo</td>
                                        <td className="py-2"></td>
                                        <td className="py-2"></td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">${formatMoney(totalLiqPesos)}</td>
                                    </tr>
                                )}
                                {totalLiqDolares > 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-600">Dólares</td>
                                        <td className="py-2"></td>
                                        <td className="py-2"></td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">USD {formatMoney(totalLiqDolares)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        <div className="mt-32 flex justify-end">
                            <div className="text-center w-64 border-t border-slate-900 pt-2">
                                <p className="font-bold text-slate-900 text-sm">Recibí conforme</p>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 no-print">
                {/* Form Card */}
                <div className="premium-card p-6 bg-white dark:bg-slate-900 border-none shadow-xl">
                    <div className="flex items-center gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="w-12 h-12 bg-indigo-650 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <PenTool size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Recibo Libre / Especial</h2>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Carga múltiple de pacientes y liquidación de honorarios</p>
                        </div>
                    </div>

                    <form onSubmit={handleSaveAndPrint} className="space-y-6">
                        {/* Date & Professional Selector */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Fecha del Movimiento</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white dark:[color-scheme:dark]"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Profesional Beneficiario</label>
                                <select
                                    required
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                    value={selectedProf}
                                    onChange={(e) => setSelectedProf(e.target.value)}
                                >
                                    <option value="">Seleccione profesional...</option>
                                    {profesionales.map(p => (
                                        <option key={p.id} value={p.nombre}>{p.nombre} ({p.categoria})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Autocomplete Patient of the Day Section */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Autocompletar con Paciente del Día</label>
                                {loadingPatients && <span className="text-[10px] text-indigo-600 font-bold uppercase animate-pulse">Buscando...</span>}
                            </div>
                            <div className="flex gap-2">
                                <select
                                    className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none text-slate-900 dark:text-white"
                                    value={selectedDayPatientId}
                                    onChange={(e) => setSelectedDayPatientId(e.target.value)}
                                    disabled={loadingPatients || !selectedProf}
                                >
                                    <option value="">
                                        {!selectedProf 
                                            ? "Seleccione profesional primero..." 
                                            : loadingPatients 
                                                ? "Cargando pacientes del día..." 
                                                : dayPatients.length === 0 
                                                    ? "Sin pacientes en esta fecha" 
                                                    : "Seleccione paciente del día..."}
                                    </option>
                                    {dayPatients.map(p => (
                                        <option key={p.id} value={p.id}>{p.paciente.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '')} ({p.obra_social || 'Particular'})</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handleAddDayPatient(selectedDayPatientId)}
                                    disabled={!selectedDayPatientId}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase transition-all disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>
                        </div>

                        {/* Dynamic Patients List */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Detalle de Pacientes a Liquidar</h3>
                                <button
                                    type="button"
                                    onClick={handleAddManualPatient}
                                    className="text-xs font-black text-indigo-650 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1"
                                >
                                    <PlusCircle size={14} /> Cargar Paciente Manual
                                </button>
                            </div>

                            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                                {patients.map((pat, idx) => (
                                    <div 
                                        key={idx} 
                                        className="relative p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-150 dark:border-slate-800 space-y-3"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleRemovePatient(idx)}
                                            className="absolute top-3 right-3 p-1.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 text-slate-400 rounded-lg transition-colors"
                                            title="Eliminar este paciente"
                                        >
                                            <Trash size={14} />
                                        </button>

                                        <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Paciente #{idx + 1}</div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="space-y-1 col-span-1 md:col-span-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Nombre Completo</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="Nombre y Apellido..."
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                                    value={pat.paciente}
                                                    onChange={(e) => handleEditPatientField(idx, 'paciente', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Fecha Cirugía</label>
                                                <input
                                                    type="date"
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 dark:[color-scheme:dark]"
                                                    value={pat.fecha}
                                                    onChange={(e) => handleEditPatientField(idx, 'fecha', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">DNI (Opcional)</label>
                                                <input
                                                    type="text"
                                                    placeholder="DNI..."
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none"
                                                    value={pat.dni}
                                                    onChange={(e) => handleEditPatientField(idx, 'dni', e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Obra Social (Opcional)</label>
                                                <input
                                                    type="text"
                                                    placeholder="Obra Social / Prepaga..."
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none"
                                                    value={pat.obra_social}
                                                    onChange={(e) => handleEditPatientField(idx, 'obra_social', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Row values: Patient Paid vs Liquidation */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                                            <div className="space-y-0.5">
                                                <label className="text-[8px] font-black text-slate-400 uppercase block">Abonó $ (Opcional)</label>
                                                <MoneyInput
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-650 dark:text-slate-350"
                                                    value={pat.cobroPesos}
                                                    onChange={(val) => handleEditPatientField(idx, 'cobroPesos', val)}
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <label className="text-[8px] font-black text-slate-400 uppercase block">Abonó USD (Opcional)</label>
                                                <MoneyInput
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-650 dark:text-slate-350"
                                                    value={pat.cobroDolares}
                                                    onChange={(val) => handleEditPatientField(idx, 'cobroDolares', val)}
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <label className="text-[8px] font-black text-emerald-600 uppercase block">Liquidación ARS ($)</label>
                                                <MoneyInput
                                                    className="w-full bg-white dark:bg-slate-800 border border-emerald-250 dark:border-emerald-900/40 rounded-lg px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-bold"
                                                    value={pat.liqPesos}
                                                    onChange={(val) => handleEditPatientField(idx, 'liqPesos', val)}
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <label className="text-[8px] font-black text-blue-600 uppercase block">Liquidación USD (U$D)</label>
                                                <MoneyInput
                                                    className="w-full bg-white dark:bg-slate-800 border border-blue-250 dark:border-blue-900/40 rounded-lg px-2.5 py-1.5 text-xs text-blue-700 dark:text-blue-400 font-bold"
                                                    value={pat.liqDolares}
                                                    onChange={(val) => handleEditPatientField(idx, 'liqDolares', val)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Concept & Transfer Toggle */}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Concepto General del Recibo</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                    value={concept}
                                    onChange={(e) => setConcept(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-850">
                                <input
                                    id="transferCheck"
                                    type="checkbox"
                                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                    checked={isTransfer}
                                    onChange={(e) => setIsTransfer(e.target.checked)}
                                />
                                <label htmlFor="transferCheck" className="text-xs font-bold text-slate-650 dark:text-slate-350 cursor-pointer select-none">
                                    Liquidado vía transferencia bancaria
                                </label>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isSaving || isReadOnly}
                                className="w-full py-4 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-indigo-500/10 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <Printer size={18} />
                                {isSaving ? "Guardando..." : "Confirmar y Guardar Recibo"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Live Preview Card */}
                <div className="premium-card p-6 bg-slate-50 dark:bg-slate-900/30 border-none shadow-inner space-y-6">
                    <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Vista Previa de Impresión (2 Páginas)</h3>
                    
                    {/* Live Preview Page 1: Detalle de Liquidación */}
                    <div className="bg-white text-slate-900 p-8 rounded-3xl border border-slate-200 shadow-md">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                            <span className="text-[9px] font-black uppercase text-indigo-600 tracking-wider">PÁGINA 1: Detalle de Liquidación (Profesional)</span>
                        </div>
                        
                        <div className="flex justify-between items-start mb-6 border-b border-black pb-4">
                            <img src="/coat_logo.png" alt="COAT" className="h-16 object-contain" />
                            <div className="text-right">
                                <h1 className="text-2xl font-bold uppercase text-black leading-none mb-1">Liquidación: {selectedProf || '—'}</h1>
                                <p className="text-sm font-bold text-slate-700">{formatDate(date)}</p>
                            </div>
                        </div>

                        <table className="w-full text-[10px] border-collapse border border-black mb-4">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="border border-black px-2 py-1 text-left font-bold text-black">Fecha</th>
                                    <th className="border border-black px-2 py-1 text-left font-bold text-black">Paciente</th>
                                    <th className="border border-black px-2 py-1 text-right font-bold text-black">Cobro $</th>
                                    <th className="border border-black px-2 py-1 text-right font-bold text-black">Cobro USD</th>
                                    <th className="border border-black px-2 py-1 text-right font-bold bg-slate-200 text-black">Liquidación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map((entry, idx) => (
                                    <tr key={idx} className="border-b border-black">
                                        <td className="border border-black px-2 py-1">{formatDate(entry.fecha)}</td>
                                        <td className="border border-black px-2 py-1">
                                            <div className="font-bold text-black">{entry.paciente || '—'}</div>
                                            {(entry.dni || entry.obra_social) && (
                                                <div className="text-[8px] text-slate-500">
                                                    {entry.dni} {entry.dni && entry.obra_social ? ' - ' : ''} {entry.obra_social}
                                                </div>
                                            )}
                                        </td>
                                        <td className="border border-black px-2 py-1 text-right text-slate-700">
                                            {entry.cobroPesos > 0 ? `$${formatMoney(entry.cobroPesos)}` : '—'}
                                        </td>
                                        <td className="border border-black px-2 py-1 text-right text-slate-700">
                                            {entry.cobroDolares > 0 ? `USD ${formatMoney(entry.cobroDolares)}` : '—'}
                                        </td>
                                        <td className="border border-black px-2 py-1 text-right font-bold text-black">
                                            {entry.liqPesos > 0 && <div>${formatMoney(entry.liqPesos)}</div>}
                                            {entry.liqDolares > 0 && <div>USD {formatMoney(entry.liqDolares)}</div>}
                                            {!(entry.liqPesos > 0) && !(entry.liqDolares > 0) && <div>—</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-black font-bold border-t-2 border-black bg-slate-100">
                                    <td colSpan="4" className="border border-black px-2 py-1.5 text-right uppercase text-black">Total Final</td>
                                    <td className="border border-black px-2 py-1.5 text-right text-black font-black">
                                        {totalLiqPesos > 0 && <div>${formatMoney(totalLiqPesos)}</div>}
                                        {totalLiqDolares > 0 && <div>USD {formatMoney(totalLiqDolares)}</div>}
                                        {totalLiqPesos === 0 && totalLiqDolares === 0 && <div>—</div>}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Live Preview Page 2: Recibo de Honorarios */}
                    <div className="bg-white text-slate-900 p-8 rounded-3xl border border-slate-200 shadow-md">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                            <span className="text-[9px] font-black uppercase text-indigo-600 tracking-wider">PÁGINA 2: Recibo de Honorarios (Firma Física)</span>
                        </div>
                        
                        <div className="mb-6">
                            <img src="/coat_logo.png" alt="COAT" className="h-16 object-contain mx-auto" />
                        </div>
                        
                        <div className="grid grid-cols-[80px_1fr] gap-y-1 text-xs text-slate-800 mb-6 font-medium">
                            <div className="font-bold text-slate-950">Fecha:</div>
                            <div className="text-black">{formatDate(date)}</div>
                            <div className="font-bold text-slate-950">Movimiento:</div>
                            <div className="text-black">Egreso</div>
                            <div className="font-bold text-slate-950">Concepto:</div>
                            <div className="text-black">{concept || `Honorarios por técnica en común de por cuenta y orden de ${selectedProf || '—'}`}</div>
                            <div className="font-bold text-slate-950">Referencia:</div>
                            <div className="text-[10px] text-black">
                                {patients.map(p => p.paciente).filter(Boolean).join(', ') || '—'}
                            </div>
                        </div>

                        <table className="w-full text-xs mb-8 border-t border-slate-300">
                            <thead>
                                <tr className="border-b border-slate-300">
                                    <th className="text-left py-1 font-bold text-slate-900 w-1/3">M. de Pago</th>
                                    <th className="text-left py-1 font-bold text-slate-900">Número</th>
                                    <th className="text-left py-1 font-bold text-slate-900">F. Cobro</th>
                                    <th className="text-right py-1 font-bold text-slate-900">Importe</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {totalLiqPesos > 0 && (
                                    <tr>
                                        <td className="py-1.5 text-slate-600">Efectivo</td>
                                        <td className="py-1.5"></td>
                                        <td className="py-1.5"></td>
                                        <td className="py-1.5 text-right font-mono font-bold text-slate-800">${formatMoney(totalLiqPesos)}</td>
                                    </tr>
                                )}
                                {totalLiqDolares > 0 && (
                                    <tr>
                                        <td className="py-1.5 text-slate-600">Dólares</td>
                                        <td className="py-1.5"></td>
                                        <td className="py-1.5"></td>
                                        <td className="py-1.5 text-right font-mono font-bold text-slate-800">USD {formatMoney(totalLiqDolares)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className="mt-16 flex justify-end">
                            <div className="text-center w-52 border-t border-slate-900 pt-1">
                                <p className="font-bold text-slate-900 text-xs">Recibí conforme</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* History of Saved Receipts */}
            <div className="premium-card p-6 bg-white dark:bg-slate-900 border-none shadow-xl no-print">
                <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-xl flex items-center justify-center">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Historial de Recibos Libres</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Recibos guardados en esta cuenta</p>
                        </div>
                    </div>
                    <button 
                        onClick={fetchSavedReceipts} 
                        disabled={loadingReceipts}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                        title="Actualizar historial"
                    >
                        <RefreshCw size={18} className={loadingReceipts ? "animate-spin" : ""} />
                    </button>
                </div>

                {loadingReceipts ? (
                    <div className="text-center py-12 text-slate-400">Cargando historial de recibos...</div>
                ) : savedReceipts.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 italic">No hay recibos guardados en esta colección.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-slate-150 dark:border-slate-800 text-slate-400 font-black uppercase tracking-wider">
                                    <th className="pb-3 pr-2">Fecha</th>
                                    <th className="pb-3">Profesional</th>
                                    <th className="pb-3">Pacientes</th>
                                    <th className="pb-3">Concepto</th>
                                    <th className="pb-3 text-right">Pesos Liquidación</th>
                                    <th className="pb-3 text-right">Dólares Liquidación</th>
                                    <th className="pb-3 text-right">Tipo</th>
                                    <th className="pb-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {savedReceipts.map(receipt => {
                                    const patientsCount = receipt.patients ? receipt.patients.length : 1;
                                    const patientsNames = receipt.patients 
                                        ? receipt.patients.map(p => p.paciente).join(', ') 
                                        : receipt.paciente;

                                    return (
                                        <tr key={receipt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 text-slate-700 dark:text-slate-350">
                                            <td className="py-3 font-semibold tabular-nums">{receipt.fecha.split('-').reverse().join('/')}</td>
                                            <td className="py-3 font-bold text-slate-900 dark:text-white">{receipt.profesional}</td>
                                            <td className="py-3 font-semibold max-w-xs truncate" title={patientsNames}>
                                                {patientsNames} <span className="text-[10px] text-slate-400">({patientsCount})</span>
                                            </td>
                                            <td className="py-3 max-w-xs truncate" title={receipt.concepto}>{receipt.concepto}</td>
                                            <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                {receipt.montoPesos > 0 ? `$ ${receipt.montoPesos.toLocaleString('es-AR')}` : '—'}
                                            </td>
                                            <td className="py-3 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                                                {receipt.montoDolares > 0 ? `U$D ${receipt.montoDolares.toLocaleString('es-AR')}` : '—'}
                                            </td>
                                            <td className="py-3 text-right">
                                                {receipt.isTransfer ? (
                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded border border-amber-100 dark:border-amber-900/40">Transferencia</span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-700">Efectivo</span>
                                                )}
                                            </td>
                                            <td className="py-3">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => handleLoadReceipt(receipt)}
                                                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-650 dark:text-indigo-400 rounded-lg transition-all"
                                                        title="Cargar en Formulario para Editar/Imprimir"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {!isReadOnly && (
                                                        <button
                                                            onClick={() => handleDeleteReceipt(receipt.id, receipt.profesional, patientsCount)}
                                                            className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-650 dark:text-red-400 rounded-lg transition-all"
                                                            title="Eliminar Recibo"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReciboLibreView;
