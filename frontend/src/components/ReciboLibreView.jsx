import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { logAction, AUDIT_ACTIONS } from '../services/auditService';
import { Printer, Calendar, User, FileText, CheckCircle2, RefreshCw, PenTool, Trash2, Eye } from 'lucide-react';
import MoneyInput from './MoneyInput';

const ReciboLibreView = () => {
    const { currentUser, viewingUid, permission, catalogOwnerUid, permissions } = useAuth();
    const isReadOnly = permission === 'viewer' || permissions?.readonly_caja;
    const today = new Date().toISOString().split('T')[0];

    // Form States
    const [date, setDate] = useState(today);
    const [selectedProf, setSelectedProf] = useState('');
    const [patientType, setPatientType] = useState('manual'); // 'manual' or 'day'
    const [selectedDayPatientId, setSelectedDayPatientId] = useState('');
    const [patientName, setPatientName] = useState('');
    const [montoPesos, setMontoPesos] = useState(0);
    const [montoDolares, setMontoDolares] = useState(0);
    const [concept, setConcept] = useState('Liquidación de honorarios médicos de cirugía');
    const [isTransfer, setIsTransfer] = useState(false);

    // Dynamic Lists
    const [profesionales, setProfesionales] = useState([]);
    const [dayPatients, setDayPatients] = useState([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Receipts History States
    const [savedReceipts, setSavedReceipts] = useState([]);
    const [loadingReceipts, setLoadingReceipts] = useState(false);

    // Signature preview helper
    const selectedProfData = profesionales.find(p => p.nombre === selectedProf);

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

    // Fetch saved receipts from the independent collection
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
            // Sort client-side by date and createdAt desc
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

    // Handle patient selection change to autofill amounts
    const handleDayPatientChange = (patientId) => {
        setSelectedDayPatientId(patientId);
        if (!patientId) {
            setPatientName('');
            setMontoPesos(0);
            setMontoDolares(0);
            return;
        }

        const match = dayPatients.find(p => p.id === patientId);
        if (match) {
            // Clean "(Liq. Manual)" if it exists
            const cleanName = match.paciente.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '');
            setPatientName(cleanName);

            // Auto-detect liquidations for the currently selected professional
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
                setMontoPesos(parseFloat(match.pesos) || 0);
                setMontoDolares(parseFloat(match.dolares) || 0);
            } else {
                setMontoPesos(arVal);
                setMontoDolares(usVal);
            }
        }
    };

    const handleSaveAndPrint = async (e) => {
        e.preventDefault();
        if (isReadOnly) return;
        if (!selectedProf || !patientName || (montoPesos === 0 && montoDolares === 0)) {
            alert("Por favor complete el profesional, paciente y al menos un monto.");
            return;
        }

        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;

        setIsSaving(true);
        try {
            const receiptData = {
                fecha: date,
                paciente: patientName,
                profesional: selectedProf,
                montoPesos: montoPesos,
                montoDolares: montoDolares,
                concepto: concept,
                isTransfer: isTransfer,
                userId: ownerToUse,
                createdAt: new Date().toISOString(),
                createdBy: currentUser?.email || 'unknown'
            };

            const docRef = await addDoc(collection(db, "recibos_libres"), receiptData);
            
            // Log action in audit logs
            await logAction(
                AUDIT_ACTIONS.CREATE_CAJA_ENTRY,
                docRef.id,
                `Creado Recibo Libre independiente para el profesional ${selectedProf} (Paciente: ${patientName})`,
                { receipt: receiptData }
            );

            alert("Recibo registrado con éxito en la colección independiente. Se abrirá la ventana de impresión.");
            
            // Refresh history
            fetchSavedReceipts();

            setTimeout(() => {
                window.print();
            }, 150);

        } catch (error) {
            console.error("Error saving independent receipt:", error);
            alert("Error al registrar: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReceipt = async (id, prof, pat) => {
        if (isReadOnly) return;
        if (!window.confirm(`¿Está seguro que desea eliminar este recibo libre de ${prof} (Paciente: ${pat})?`)) return;

        try {
            await deleteDoc(doc(db, "recibos_libres", id));
            await logAction(
                AUDIT_ACTIONS.DELETE_CAJA_ENTRY,
                id,
                `Eliminado Recibo Libre para el profesional ${prof} (Paciente: ${pat})`
            );
            alert("Recibo eliminado con éxito.");
            fetchSavedReceipts();
        } catch (error) {
            console.error("Error deleting receipt:", error);
            alert("Error al eliminar el recibo: " + error.message);
        }
    };

    const handleLoadReceipt = (receipt) => {
        setDate(receipt.fecha);
        setSelectedProf(receipt.profesional);
        setPatientType('manual');
        setSelectedDayPatientId('');
        setPatientName(receipt.paciente);
        setMontoPesos(receipt.montoPesos || 0);
        setMontoDolares(receipt.montoDolares || 0);
        setConcept(receipt.concepto || 'Liquidación de honorarios médicos de cirugía');
        setIsTransfer(!!receipt.isTransfer);
        alert("Los datos del recibo seleccionado han sido cargados en el formulario.");
    };

    return (
        <div className="space-y-6">
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-area-receipt, .print-area-receipt * {
                        visibility: visible;
                    }
                    .print-area-receipt {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        background: white !important;
                        color: black !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
                {/* Form Card */}
                <div className="premium-card p-6 bg-white dark:bg-slate-900 border-none shadow-xl">
                    <div className="flex items-center gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="w-12 h-12 bg-indigo-650 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <PenTool size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Recibo Libre / Especial</h2>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Colección Independiente</p>
                        </div>
                    </div>

                    <form onSubmit={handleSaveAndPrint} className="space-y-4">
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

                        <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 block">Modo Paciente</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-350 cursor-pointer">
                                    <input type="radio" checked={patientType === 'manual'} onChange={() => { setPatientType('manual'); setSelectedDayPatientId(''); }} className="text-indigo-650 focus:ring-indigo-500" />
                                    Ingreso Manual
                                </label>
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-350 cursor-pointer">
                                    <input type="radio" checked={patientType === 'day'} onChange={() => setPatientType('day')} className="text-indigo-650 focus:ring-indigo-500" />
                                    Paciente del Día
                                </label>
                            </div>

                            {patientType === 'day' && (
                                <div className="mt-2 space-y-1">
                                    <select
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none text-slate-900 dark:text-white"
                                        value={selectedDayPatientId}
                                        onChange={(e) => handleDayPatientChange(e.target.value)}
                                        disabled={loadingPatients}
                                    >
                                        <option value="">{loadingPatients ? "Buscando pacientes..." : "Seleccione paciente del día..."}</option>
                                        {dayPatients.map(p => (
                                            <option key={p.id} value={p.id}>{p.paciente.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '')} ({p.obra_social || 'Particular'})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nombre del Paciente</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    required
                                    placeholder="Nombre y Apellido..."
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white"
                                    value={patientName}
                                    onChange={(e) => setPatientName(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1">Monto en Pesos (ARS)</label>
                                <MoneyInput
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-black text-emerald-700 dark:text-emerald-400"
                                    value={montoPesos}
                                    onChange={(val) => setMontoPesos(val)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-blue-650 uppercase tracking-widest ml-1">Monto en Dólares (USD)</label>
                                <MoneyInput
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-black text-blue-700 dark:text-blue-400"
                                    value={montoDolares}
                                    onChange={(val) => setMontoDolares(val)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Concepto / Detalle</label>
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
                <div className="premium-card p-6 bg-slate-50 dark:bg-slate-900/30 border-none shadow-inner">
                    <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 ml-1">Vista Previa Interactiva</h3>
                    
                    {/* Printable Receipt Frame */}
                    <div className="print-area-receipt bg-white text-slate-900 p-8 rounded-3xl border border-slate-200 shadow-md">
                        {/* Header */}
                        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center text-white font-black text-lg">
                                        C
                                    </div>
                                    <h1 className="text-xl font-black tracking-tighter uppercase leading-none text-black">COAT</h1>
                                </div>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Centro de Otorrinolaringología y Alergia</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Recibo de Honorarios</h2>
                                <p className="text-xs font-bold text-slate-900">Fecha: {date ? date.split('-').reverse().join('/') : today.split('-').reverse().join('/')}</p>
                                <p className="text-[10px] font-semibold text-slate-500 mt-1 uppercase tracking-tight">Recibo Especial (Libre)</p>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-6 text-sm">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="text-xs font-bold text-slate-400 uppercase">Profesional:</div>
                                    <div className="col-span-2 text-xs font-black text-slate-900">{selectedProf || '—'}</div>

                                    <div className="text-xs font-bold text-slate-400 uppercase">Paciente:</div>
                                    <div className="col-span-2 text-xs font-black text-slate-900">{patientName || '—'}</div>

                                    <div className="text-xs font-bold text-slate-400 uppercase">Concepto:</div>
                                    <div className="col-span-2 text-xs font-medium text-slate-750">{concept || '—'}</div>
                                </div>
                            </div>

                            {/* Amounts Table */}
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b-2 border-slate-900">
                                        <th className="py-2 font-black uppercase text-slate-400">Detalle de Valores</th>
                                        <th className="py-2 text-right font-black uppercase text-slate-400">Importe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {montoPesos > 0 && (
                                        <tr className="border-b border-slate-100">
                                            <td className="py-3 font-semibold text-slate-800">Honorarios en Pesos (ARS)</td>
                                            <td className="py-3 text-right font-bold tabular-nums text-slate-950">$ {montoPesos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    )}
                                    {montoDolares > 0 && (
                                        <tr className="border-b border-slate-100">
                                            <td className="py-3 font-semibold text-slate-800">Honorarios en Dólares (USD)</td>
                                            <td className="py-3 text-right font-bold tabular-nums text-slate-950">U$D {montoDolares.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    )}
                                    {(montoPesos === 0 && montoDolares === 0) && (
                                        <tr className="border-b border-slate-100">
                                            <td className="py-3 text-slate-400 italic">Ingrese montos en el formulario...</td>
                                            <td className="py-3 text-right font-bold">—</td>
                                        </tr>
                                    )}
                                    <tr className="font-black text-sm">
                                        <td className="py-4 uppercase text-slate-900">Total Entregado</td>
                                        <td className="py-4 text-right tabular-nums text-slate-950">
                                            <div className="flex flex-col items-end">
                                                {montoPesos > 0 && <span>$ {montoPesos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
                                                {montoDolares > 0 && <span>U$D {montoDolares.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>}
                                                {montoPesos === 0 && montoDolares === 0 && <span>—</span>}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Signature Block */}
                            <div className="pt-12 flex justify-between items-end">
                                <div className="text-[10px] text-slate-400 font-bold max-w-[280px]">
                                    {isTransfer ? (
                                        <span className="px-2 py-1 bg-amber-50 rounded text-amber-700 border border-amber-100">Liquidado vía transferencia bancaria</span>
                                    ) : (
                                        <span>Recibí conforme el importe total especificado en este comprobante.</span>
                                    )}
                                </div>
                                <div className="flex flex-col items-center min-w-[180px]">
                                    {selectedProfData?.firmaUrl ? (
                                        <div className="h-16 w-36 flex items-center justify-center border-b border-slate-300 pb-1 mb-1">
                                            <img src={selectedProfData.firmaUrl} alt="Firma digital" className="max-h-full max-w-full object-contain" />
                                        </div>
                                    ) : (
                                        <div className="h-16 w-36 border-b border-slate-350 border-dashed mb-1 flex items-center justify-center text-[9px] text-slate-400 italic">
                                            Sin firma digital
                                        </div>
                                    )}
                                    <span className="text-[9px] font-black uppercase text-slate-900">{selectedProf || 'Firma Profesional'}</span>
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Beneficiario</span>
                                </div>
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
                                    <th className="pb-3">Paciente</th>
                                    <th className="pb-3">Concepto</th>
                                    <th className="pb-3 text-right">Pesos (ARS)</th>
                                    <th className="pb-3 text-right">Dólares (USD)</th>
                                    <th className="pb-3 text-right">Tipo</th>
                                    <th className="pb-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {savedReceipts.map(receipt => (
                                    <tr key={receipt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 text-slate-700 dark:text-slate-350">
                                        <td className="py-3 font-semibold tabular-nums">{receipt.fecha.split('-').reverse().join('/')}</td>
                                        <td className="py-3 font-bold text-slate-900 dark:text-white">{receipt.profesional}</td>
                                        <td className="py-3 font-semibold">{receipt.paciente}</td>
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
                                                        onClick={() => handleDeleteReceipt(receipt.id, receipt.profesional, receipt.paciente)}
                                                        className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-650 dark:text-red-400 rounded-lg transition-all"
                                                        title="Eliminar Recibo"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReciboLibreView;
