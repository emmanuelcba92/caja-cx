import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { logAction, AUDIT_ACTIONS } from '../services/auditService';
import { Printer, Calendar, User, FileText, RefreshCw, PenTool, Trash2, Eye } from 'lucide-react';
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
    const [concept, setConcept] = useState('');
    const [isTransfer, setIsTransfer] = useState(false);

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
            const cleanName = match.paciente.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '');
            setPatientName(cleanName);

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
            
            await logAction(
                AUDIT_ACTIONS.CREATE_CAJA_ENTRY,
                docRef.id,
                `Creado Recibo Libre independiente para el profesional ${selectedProf} (Paciente: ${patientName})`,
                { receipt: receiptData }
            );

            alert("Recibo registrado con éxito. Se abrirá la ventana de impresión.");
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
        setConcept(receipt.concepto || '');
        setIsTransfer(!!receipt.isTransfer);
        alert("Los datos del recibo seleccionado han sido cargados en el formulario.");
    };

    const printStyle = `
      @media print {
        @page { size: auto; margin: 5mm; }
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
            transform-origin: top left;
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
        .no-print { display: none !important; }
      }
      .print-portal { display: none; }
    `;

    return (
        <div className="space-y-6">
            <style>{printStyle}</style>

            {/* Print Portal for perfect printed format (exact same style as Liquidaciones) */}
            {createPortal(
                <div className="print-portal bg-white text-black p-12">
                    <div className="max-w-3xl mx-auto border-none p-12 bg-white">
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
                            <div className="text-xs">{patientName || '—'}</div>
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
                                {montoPesos > 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-600">Efectivo</td>
                                        <td className="py-2"></td>
                                        <td className="py-2"></td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">${formatMoney(montoPesos)}</td>
                                    </tr>
                                )}
                                {montoDolares > 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-600">Dólares</td>
                                        <td className="py-2"></td>
                                        <td className="py-2"></td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">USD {formatMoney(montoDolares)}</td>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
                {/* Form Card */}
                <div className="premium-card p-6 bg-white dark:bg-slate-900 border-none shadow-xl">
                    <div className="flex items-center gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="w-12 h-12 bg-indigo-650 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <PenTool size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Recibo Libre / Especial</h2>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Formato oficial de liquidaciones</p>
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
                    
                    {/* Printable Receipt Frame (Matching Liquidaciones Receipt Style) */}
                    <div className="bg-white text-slate-900 p-12 rounded-3xl border border-slate-200 shadow-md">
                        {/* Header */}
                        <div className="mb-8">
                            <img src="/coat_logo.png" alt="COAT" className="h-20 object-contain mx-auto" />
                        </div>
                        {/* Detail Info Grid */}
                        <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm text-slate-800 mb-8 font-medium">
                            <div className="font-bold text-slate-900">Fecha:</div>
                            <div>{formatDate(date)}</div>
                            <div className="font-bold text-slate-900">Movimiento:</div>
                            <div>Egreso</div>
                            <div className="font-bold text-slate-900">Concepto:</div>
                            <div className="text-slate-900">{concept || `Honorarios por técnica en común de por cuenta y orden de ${selectedProf || '—'}`}</div>
                            <div className="font-bold text-slate-900">Referencia:</div>
                            <div className="text-xs text-slate-900">{patientName || '—'}</div>
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
                                {montoPesos > 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-600">Efectivo</td>
                                        <td className="py-2"></td>
                                        <td className="py-2"></td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">${formatMoney(montoPesos)}</td>
                                    </tr>
                                )}
                                {montoDolares > 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-600">Dólares</td>
                                        <td className="py-2"></td>
                                        <td className="py-2"></td>
                                        <td className="py-2 text-right font-mono font-bold text-slate-800">USD {formatMoney(montoDolares)}</td>
                                    </tr>
                                )}
                                {montoPesos === 0 && montoDolares === 0 && (
                                    <tr>
                                        <td className="py-2 text-slate-400 italic" colSpan="4">Ingrese montos en el formulario...</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Hand signature section (no digital image, exact same height as original layout) */}
                        <div className="mt-32 flex justify-end">
                            <div className="text-center w-64 border-t border-slate-900 pt-2">
                                <p className="font-bold text-slate-900 text-sm">Recibí conforme</p>
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
