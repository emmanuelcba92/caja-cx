import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Printer, Download, Search, FileText, Plus, X, Pencil, Lock as LockIcon, Save, Trash2, CircleHelp, Trash } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { isLocalEnv } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import ModalPortal from './common/ModalPortal';
// Dynamic import used for exceljs
import { saveAs } from 'file-saver';


const LiquidacionView = () => {
    const { viewingUid, permission, catalogOwnerUid, permissions } = useAuth();
    const isReadOnly = permission === 'viewer' || permissions?.readonly_caja;
    // Force Portrait for this view
    // v1.1.0 Fix USD
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
            transform-origin: top left;
        }
        @media only screen and (max-width: 768px) {
            .print-portal {
                width: 1100px; /* Force a standard desktop width for print layout */
                zoom: 0.7; /* Use zoom instead of transform for better print preview support */
                transform: none !important;
            }
        }
        .page-break { 
            page-break-after: always !important; 
            break-after: page !important; 
            display: block !important; 
            min-height: 90vh; /* Structure stability */
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
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      .print-portal { display: none; }
    `;

    // Helper for Currency
    const formatMoney = (val) => {
        return (val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDate = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
        // Handle YYYY-MM-DD
        if (dateStr.includes('-')) {
            return dateStr.split('-').reverse().join('/');
        }
        return dateStr;
    };

    // Helper to clean patient name for display
    const cleanPatientName = (name) => {
        if (!name) return '';
        return name.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '');
    };

    const today = new Date().toISOString().split('T')[0];
    const [profesionales, setProfesionales] = useState([]);
    const [selectedProf, setSelectedProf] = useState(() => localStorage.getItem('liq_selectedProf') || '');
    const [modelo, setModelo] = useState(1); // 1: Detallado, 2: Solo Liquidación
    // RECEIPT STATE (Moved to top level)
    const [showReceipt, setShowReceipt] = useState(false);

    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [data, setData] = useState(null);

    const normalize = (n) => n?.replace(/\./g, '').trim().toLowerCase() || '';

    const [batchData, setBatchData] = useState([]);
    const [isBatchPrint, setIsBatchPrint] = useState(false);
    const [batchPrintType, setBatchPrintType] = useState('liquidacion'); // 'liquidacion' or 'recibo'
    const [showBatchMenu, setShowBatchMenu] = useState(false);

    const fetchProfs = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
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

    const [error, setError] = useState('');

    // Helper to check transfer status for a specific professional
    const getTransferStatus = (item, profName) => {
        const norm = normalize(profName);
        if (normalize(item.prof_1) === norm) return item.isTransfer_prof_1 === true;
        if (normalize(item.prof_2) === norm) return item.isTransfer_prof_2 === true;
        if (normalize(item.prof_3) === norm) return item.isTransfer_prof_3 === true;
        if (normalize(item.anestesista) === norm) return item.isTransfer_anestesista === true;
        return item.isTransfer === true; // Fallback for legacy global flag
    };

    const handleToggleTransfer = async (entry) => {
        if (!viewingUid || !selectedProf) return;
        try {
            // Determine which field to toggle based on the CURRENTLY selected professional
            let fieldToUpdate = null;
            let currentStatus = false;
            const normSelected = normalize(selectedProf);

            if (normalize(entry.prof_1) === normSelected) {
                fieldToUpdate = 'isTransfer_prof_1';
                currentStatus = entry.isTransfer_prof_1 === true;
            } else if (normalize(entry.prof_2) === normSelected) {
                fieldToUpdate = 'isTransfer_prof_2';
                currentStatus = entry.isTransfer_prof_2 === true;
            } else if (normalize(entry.prof_3) === normSelected) {
                fieldToUpdate = 'isTransfer_prof_3';
                currentStatus = entry.isTransfer_prof_3 === true;
            } else if (normalize(entry.anestesista) === normSelected) {
                fieldToUpdate = 'isTransfer_anestesista';
                currentStatus = entry.isTransfer_anestesista === true;
            }

            if (!fieldToUpdate) {
                // Should not happen if entry is in the list
                // Fallback: try to guess or just use legacy? 
                // If we are here, it means the entry is displayed but the selectedProf is not in the known fields?
                // Possibly 1st or 2nd prof match?
                // But fetchLiquidation filters by selectedProf logic.
                console.warn("Could not determine professional role for transfer toggle");
                return;
            }

            const newStatus = !currentStatus;
            const docRef = doc(db, "caja", entry.id);
            await updateDoc(docRef, { [fieldToUpdate]: newStatus });

            // Reflect change locally immediately
            setData(prev => ({
                ...prev,
                entradas: prev.entradas.map(e => e.id === entry.id ? { ...e, [fieldToUpdate]: newStatus } : e)
            }));
            fetchLiquidation();
        } catch (error) {
            console.error("Error toggling transfer:", error);
            alert("Error al actualizar la transferencia");
        }
    };

    const fetchLiquidation = async () => {
        if (!viewingUid || !selectedProf) return;
        setError('');
        try {
            // 1. Fetch all caja entries for all users in date range (Global Access)
            const q = query(collection(db, "caja"));
            const querySnapshot = await getDocs(q);
            const allEntries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filter by Date Range client-side
            const entries = allEntries.filter(item => item.fecha >= startDate && item.fecha <= endDate);

            // 2. Filter locally for the selected professional and calculate "Liquidation Amount"
            const relevantEntries = [];
            let totalPesos = 0;
            let totalDolares = 0;

            const normalizedSelected = normalize(selectedProf);

            entries.forEach(item => {
                let liqPesosForEntry = 0;
                let liqDolaresForEntry = 0;
                let hasLiquidation = false;
                const isTransfer = getTransferStatus(item, selectedProf); // Use helper

                const isProf1 = normalize(item.prof_1) === normalizedSelected;
                const isProf2 = normalize(item.prof_2) === normalizedSelected;
                const isProf3 = normalize(item.prof_3) === normalizedSelected;
                const isAnes = normalize(item.anestesista) === normalizedSelected;

                // 1. Check Primary
                if (isProf1) {
                    const amt = parseFloat(item.liq_prof_1) || 0;
                    if (item.liq_prof_1_currency === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (isProf2) {
                    const amt = parseFloat(item.liq_prof_2) || 0;
                    if (item.liq_prof_2_currency === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (isProf3) {
                    const amt = parseFloat(item.liq_prof_3) || 0;
                    if (item.liq_prof_3_currency === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (isAnes) {
                    const amt = parseFloat(item.liq_anestesista) || 0;
                    if (item.liq_anestesista_currency === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                }

                // 2. Check Secondary (including Anesthesiologist)
                if (isProf1) {
                    const amt = parseFloat(item.liq_prof_1_secondary) || 0;
                    if (item.liq_prof_1_currency_secondary === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (isProf2) {
                    const amt = parseFloat(item.liq_prof_2_secondary) || 0;
                    if (item.liq_prof_2_currency_secondary === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (isProf3) {
                    const amt = parseFloat(item.liq_prof_3_secondary) || 0;
                    if (item.liq_prof_3_currency_secondary === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (isAnes) {
                    const amt = parseFloat(item.liq_anestesista_secondary) || 0;
                    if (item.liq_anestesista_currency_secondary === 'USD') liqDolaresForEntry += amt;
                    else liqPesosForEntry += amt;
                    if (amt !== 0) hasLiquidation = true;
                }

                // 3. Fallback to explicit _ars / _usd fields if available (from new CajaForm)
                if (isProf1) {
                    if (item.liq_prof_1_ars > 0 && liqPesosForEntry === 0) liqPesosForEntry = item.liq_prof_1_ars;
                    if (item.liq_prof_1_usd > 0 && liqDolaresForEntry === 0) liqDolaresForEntry = item.liq_prof_1_usd;
                } else if (isProf2) {
                    if (item.liq_prof_2_ars > 0 && liqPesosForEntry === 0) liqPesosForEntry = item.liq_prof_2_ars;
                    if (item.liq_prof_2_usd > 0 && liqDolaresForEntry === 0) liqDolaresForEntry = item.liq_prof_2_usd;
                } else if (isProf3) {
                    if (item.liq_prof_3_ars > 0 && liqPesosForEntry === 0) liqPesosForEntry = item.liq_prof_3_ars;
                    if (item.liq_prof_3_usd > 0 && liqDolaresForEntry === 0) liqDolaresForEntry = item.liq_prof_3_usd;
                } else if (isAnes) {
                    if (item.liq_anestesista_ars > 0 && liqPesosForEntry === 0) liqPesosForEntry = item.liq_anestesista_ars;
                    if (item.liq_anestesista_usd > 0 && liqDolaresForEntry === 0) liqDolaresForEntry = item.liq_anestesista_usd;
                }

                if (liqPesosForEntry !== 0 || liqDolaresForEntry !== 0) hasLiquidation = true;

                // 4. Add to list if relevant
                const isRelevantManual = item.isManualLiquidation && (isProf1 || isProf2 || isProf3 || isAnes);


                if (hasLiquidation || isRelevantManual) {


                    relevantEntries.push({
                        ...item,
                        liq_pesos_total: liqPesosForEntry,
                        liq_dolares_total: liqDolaresForEntry,
                        pago_pesos: parseFloat(item.pesos) || 0,
                        pago_dolares: parseFloat(item.dolares) || 0,
                        isTransfer: isTransfer
                    });

                    if (!isTransfer) {
                        totalPesos += liqPesosForEntry;
                        totalDolares += liqDolaresForEntry;
                    }
                }
            });

            // Sort: 1. Manual Last, 2. Date Asc, 3. CreatedAt Asc
            relevantEntries.sort((a, b) => {
                const isManualA = a.paciente.toLowerCase().includes('(liq. manual)');
                const isManualB = b.paciente.toLowerCase().includes('(liq. manual)');

                if (isManualA !== isManualB) {
                    return isManualA ? 1 : -1; // Manual last
                }

                const dateA = new Date(a.fecha);
                const dateB = new Date(b.fecha);
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateA - dateB; // Date Asc
                }

                // Same date, sort by creation time (Oldest/First input first)
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });

            // Determine Categoria from State
            const profObj = profesionales.find(p => p.nombre === selectedProf);
            const categoria = profObj ? profObj.categoria : 'ORL';

            fetchDeductions();
            setData({
                profesional: selectedProf,
                categoria: categoria,
                totales: {
                    liq_pesos: totalPesos,
                    liq_dolares: totalDolares
                },
                entradas: relevantEntries
            });

            // Auto Model Switch
            if (categoria !== 'ORL') {
                setModelo(2);
            } else {
                setModelo(1);
            }

        } catch (err) {
            console.error("Error fetching liquidation:", err);
            setError(err.message);
            setData(null);
        }
    };

    useEffect(() => {
        fetchProfs();
    }, [viewingUid, catalogOwnerUid]);

    // Auto-switch Model based on Category
    useEffect(() => {
        if (selectedProf && profesionales.length > 0) {
            const p = profesionales.find(pr => pr.nombre === selectedProf);
            if (p) {
                if (p.categoria === 'ORL') {
                    setModelo(1); // Default ORL to Detailed Model
                } else {
                    setModelo(2); // Everything else (Anestesista, Estetica, Fonoaudiologa, etc.) defaults to Model 2
                }
            }
        }
    }, [selectedProf, profesionales]);

    useEffect(() => {
        if (selectedProf) {
            setData(null);
            fetchLiquidation();
            localStorage.setItem('liq_selectedProf', selectedProf);
        }
    }, [selectedProf, startDate, endDate, viewingUid, profesionales]);



    const [deductions, setDeductions] = useState([]);
    const [newDeductionDesc, setNewDeductionDesc] = useState('');
    const [newDeductionAmount, setNewDeductionAmount] = useState('');
    const [newDeductionCurrency, setNewDeductionCurrency] = useState('ARS');
    const [newDeductionDate, setNewDeductionDate] = useState(today);
    const [newDeductionInReceipt, setNewDeductionInReceipt] = useState(false);

    const fetchDeductions = async () => {
        if (!viewingUid || !selectedProf) return;
        try {
            // Fetch all for this prof to avoid composite index requirements for date range
            const q = query(
                collection(db, "deducciones"),
                where("userId", "==", viewingUid),
                where("profesional", "==", selectedProf)
            );
            const snapshot = await getDocs(q);
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Client-side filtering
            const filtered = docs.filter(d => d.date >= startDate && d.date <= endDate);
            setDeductions(filtered);
        } catch (error) {
            console.error("Error fetching deductions:", error);
        }
    };

    const addDeduction = async () => {
        if (!newDeductionDesc || !newDeductionAmount || !selectedProf) return;
        try {
            const deductionData = {
                userId: viewingUid,
                profesional: selectedProf,
                desc: newDeductionDesc,
                amount: Math.abs(parseFloat(newDeductionAmount)),
                currency: newDeductionCurrency,
                inReceipt: newDeductionInReceipt,
                date: newDeductionDate,
                createdAt: new Date().toISOString()
            };
            await addDoc(collection(db, "deducciones"), deductionData);
            setNewDeductionDesc('');
            setNewDeductionAmount('');
            setNewDeductionInReceipt(false);
            fetchDeductions();
        } catch (error) {
            console.error("Error adding deduction:", error);
            alert("Error al agregar deducción");
        }
    };

    const removeDeduction = async (id) => {
        if (isLocalEnv) {
            alert("🔒 SEGURIDAD: No se puede eliminar deducciones de la nube desde local.");
            return;
        }
        if (!window.confirm("¿Seguro que deseas eliminar esta deducción?")) return;
        try {
            await deleteDoc(doc(db, "deducciones", id));
            fetchDeductions();
        } catch (error) {
            console.error("Error removing deduction:", error);
            alert("Error al eliminar deducción");
        }
    };

    const totalDeductionsPesos = deductions.filter(d => d.currency !== 'USD').reduce((acc, curr) => acc + Math.abs(curr.amount || 0), 0);
    const totalDeductionsUSD = deductions.filter(d => d.currency === 'USD').reduce((acc, curr) => acc + Math.abs(curr.amount || 0), 0);

    const finalTotalPesos = data && data.totales ? (data.totales.liq_pesos - totalDeductionsPesos) : 0;
    const finalTotalDolares = data && data.totales ? (data.totales.liq_dolares - totalDeductionsUSD) : 0;

    // --- MANUAL LIQUIDATION STATE ---
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualForm, setManualForm] = useState({
        date: today,
        patient: '',
        totalPayment: '',
        currency: 'ARS',
        includeInReceipt: false,
        profs: [{ prof: '', amount: '' }]
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
            if (!viewingUid) {
                alert("Error de sesión.");
                return;
            }
            const settingsRef = doc(db, "user_settings", viewingUid);
            const settingsSnap = await getDoc(settingsRef);

            if (settingsSnap.exists() && settingsSnap.data().adminPin) {
                const userPin = settingsSnap.data().adminPin;
                if (editPinInput === userPin) {
                    setShowEditPinModal(false);
                    if (pendingAction === 'edit') {
                        setEditFormData({
                            ...editingEntry,
                            pesos: editingEntry.pesos,
                            dolares: editingEntry.dolares,
                            liq_prof_1: editingEntry.liq_prof_1 || 0,
                            liq_prof_2: editingEntry.liq_prof_2 || 0,
                            liq_anestesista: editingEntry.liq_anestesista || 0,
                            liq_prof_1_currency: editingEntry.liq_prof_1_currency || 'ARS',
                            liq_prof_2_currency: editingEntry.liq_prof_2_currency || 'ARS',
                            liq_anestesista_currency: editingEntry.liq_anestesista_currency || 'ARS',
                            monto_pesos: editingEntry.pesos || 0,
                            monto_dolares: editingEntry.dolares || 0
                        });
                        setShowEditFormModal(true);
                    } else if (pendingAction === 'delete') {
                        performDelete();
                    }
                } else {
                    alert("PIN Incorrecto");
                }
            } else {
                alert("No tiene un PIN configurado. Vaya a Configuración para crear uno.");
            }
        } catch (error) {
            console.error("PIN Check Error:", error);
            alert("Error al verificar PIN.");
        }
    };

    const performDelete = async () => {
        if (isLocalEnv) {
            alert("🔒 SEGURIDAD: No se puede eliminar movimientos de caja de la nube desde local.");
            return;
        }
        if (!window.confirm("¿Seguro que deseas eliminar este movimiento? Esta acción no se puede deshacer.")) return;
        try {
            await deleteDoc(doc(db, "caja", editingEntry.id));

            alert("Liquidación eliminada");
            setEditingEntry(null);
            fetchLiquidation();
        } catch (error) {
            console.error(error);
            alert("Error al eliminar: " + error.message);
        }
    };

    const handleUpdateEntry = async () => {
        try {
            const docRef = doc(db, "caja", editingEntry.id);
            await updateDoc(docRef, editFormData);

            alert("Entrada actualizada");
            setShowEditFormModal(false);
            setEditingEntry(null);
            fetchLiquidation(); // Refresh
        } catch (error) {
            console.error("Update error:", error);
            alert("Error de conexión: " + error.message);
        }
    };

    useEffect(() => {
        if (showManualModal && manualForm.date && viewingUid) {
            // Fetch patients for this date to help autocomplete
            const fetchPatients = async () => {
                const q = query(collection(db, "caja"),
                    where("userId", "==", viewingUid),
                    where("fecha", "==", manualForm.date)
                );
                const snapshot = await getDocs(q);
                const patients = snapshot.docs.map(d => {
                    const data = d.data();
                    return {
                        name: data.paciente,
                        pesos: data.pesos || 0,
                        dolares: data.dolares || 0
                    };
                });
                // Remove duplicates by name but keep the one with amounts if possible
                const uniquePatients = [];
                const seen = new Set();
                patients.forEach(p => {
                    if (!seen.has(p.name)) {
                        seen.add(p.name);
                        uniquePatients.push(p);
                    }
                });
                setDayPatients(uniquePatients);
            }
            fetchPatients();
        }
    }, [showManualModal, manualForm.date, viewingUid]);

    // Update manual form prof when selectedProf changes or modal opens
    useEffect(() => {
        if (selectedProf && showManualModal) {
            setManualForm(prev => ({
                ...prev,
                profs: [{ prof: selectedProf, amount: '' }]
            }));
        }
    }, [selectedProf, showManualModal]);

    const addManualProfRow = () => {
        setManualForm(prev => ({
            ...prev,
            profs: [...prev.profs, { prof: '', amount: '' }]
        }));
    };

    const removeManualProfRow = (idx) => {
        if (manualForm.profs.length <= 1) return;
        setManualForm(prev => ({
            ...prev,
            profs: prev.profs.filter((_, i) => i !== idx)
        }));
    };

    const updateManualProfRow = (idx, field, value) => {
        setManualForm(prev => {
            const newProfs = [...prev.profs];
            newProfs[idx] = { ...newProfs[idx], [field]: value };
            return { ...prev, profs: newProfs };
        });
    };

    const handleSaveManual = async () => {
        if (!manualForm.patient || manualForm.profs.some(p => !p.prof || !p.amount)) {
            return alert("Complete todos los campos de profesionales y montos");
        }
        if (!viewingUid) return alert("Debes estar logueado");

        try {
            for (const item of manualForm.profs) {
                const manualEntry = {
                    fecha: manualForm.date,
                    paciente: manualForm.patient + ' (Liq. Manual)',
                    dni: '',
                    obra_social: '',
                    prof_1: item.prof,
                    prof_2: '',
                    anestesista: '',
                    pesos: 0, // Zero income for tutoring distribution
                    dolares: 0,
                    abonado_ref: parseFloat(manualForm.totalPayment.toString().replace(',', '.') || 0),
                    abonado_ref_currency: manualForm.currency,
                    liq_prof_1: parseFloat(item.amount.toString().replace(',', '.') || 0), /* FIX: Robust Parse & Save amount regardless of currency */
                    liq_prof_1_currency: manualForm.currency,
                    liq_prof_2: 0,
                    liq_anestesista: 0,
                    coat_pesos: 0,
                    coat_dolares: 0,
                    userId: viewingUid,
                    createdAt: new Date().toISOString(),
                    includeInReceipt: manualForm.includeInReceipt ?? false,
                    isManualLiquidation: true, // Flag to isolate from general history
                    isTransfer_prof_1: manualForm.isTransfer ?? false // Save specific transfer flag (manual usually uses prof_1)
                };
                await addDoc(collection(db, "caja"), manualEntry);
            }

            alert("Liquidaciones agregadas correctamente");
            setShowManualModal(false);
            setManualForm({ ...manualForm, patient: '', totalPayment: '', profs: [{ prof: selectedProf || '', amount: '' }] });
            fetchLiquidation();
        } catch (error) {
            console.error(error);
            alert("Error al guardar: " + error.message);
        }
    };

    const handlePrint = () => {
        setIsBatchPrint(false); // Ensure single mode
        setTimeout(() => window.print(), 100);
    };

    const handlePrintAll = async (type = 'liquidacion') => {
        if (!viewingUid) return;

        // 1. Fetch Entries
        const q = query(collection(db, "caja"), where("userId", "==", viewingUid));
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const entries = all.filter(item => item.fecha >= startDate && item.fecha <= endDate);

        // 2. Build Reports
        const reports = [];

        // Fetch Deductions
        const qDed = query(collection(db, "deducciones"), where("userId", "==", viewingUid));
        const snapDed = await getDocs(qDed);
        const allDeductions = snapDed.docs.map(d => ({ id: d.id, ...d.data() }));

        profesionales.forEach(prof => {
            // SKIP TUTORAS / TUTORIA
            if (prof.categoria === 'Tutoras' || prof.categoria === 'Tutoria') return;

            const profEntries = [];

            entries.forEach(item => {
                let liqPesosTotal = 0;
                let liqDolaresTotal = 0;
                let hasLiquidation = false;
                const isTransfer = getTransferStatus(item, prof.nombre);

                // Primary
                if (item.prof_1 === prof.nombre) {
                    const amt = parseFloat(item.liq_prof_1) || 0;
                    if (item.liq_prof_1_currency === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (item.prof_2 === prof.nombre) {
                    const amt = parseFloat(item.liq_prof_2) || 0;
                    if (item.liq_prof_2_currency === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (item.prof_3 === prof.nombre) {
                    const amt = parseFloat(item.liq_prof_3) || 0;
                    if (item.liq_prof_3_currency === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (item.anestesista === prof.nombre) {
                    const amt = parseFloat(item.liq_anestesista) || 0;
                    if (item.liq_anestesista_currency === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                }

                // Secondary
                if (item.prof_1 === prof.nombre) {
                    const amt = parseFloat(item.liq_prof_1_secondary) || 0;
                    if (item.liq_prof_1_currency_secondary === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (item.prof_2 === prof.nombre) {
                    const amt = parseFloat(item.liq_prof_2_secondary) || 0;
                    if (item.liq_prof_2_currency_secondary === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (item.prof_3 === prof.nombre) {
                    const amt = parseFloat(item.liq_prof_3_secondary) || 0;
                    if (item.liq_prof_3_currency_secondary === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                } else if (item.anestesista === prof.nombre) {
                    const amt = parseFloat(item.liq_anestesista_secondary) || 0;
                    if (item.liq_anestesista_currency_secondary === 'USD') liqDolaresTotal += amt; else liqPesosTotal += amt;
                    if (amt !== 0) hasLiquidation = true;
                }

                const isRelevantManual = item.isManualLiquidation && (
                    item.prof_1 === prof.nombre ||
                    item.prof_2 === prof.nombre ||
                    item.prof_3 === prof.nombre ||
                    item.anestesista === prof.nombre
                );

                if (hasLiquidation || isRelevantManual) {
                    profEntries.push({ ...item, liq_pesos_total: liqPesosTotal, liq_dolares_total: liqDolaresTotal, pago_pesos: parseFloat(item.pesos) || 0, pago_dolares: parseFloat(item.dolares) || 0, isTransfer: isTransfer });
                }
            });

            if (profEntries.length > 0) {
                // Sort
                profEntries.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

                // Calc totals for this prof
                const tPesos = profEntries.reduce((acc, e) => acc + (!e.isTransfer ? (e.liq_pesos_total || 0) : 0), 0);
                const tDolares = profEntries.reduce((acc, e) => acc + (!e.isTransfer ? (e.liq_dolares_total || 0) : 0), 0);

                // Deductions for this prof
                const profDeductions = allDeductions.filter(d =>
                    d.profesional === prof.nombre &&
                    d.date >= startDate &&
                    d.date <= endDate
                ).sort((a, b) => new Date(a.date) - new Date(b.date));

                reports.push({
                    profesional: prof.nombre,
                    categoria: prof.categoria,
                    entradas: profEntries,
                    deducciones: profDeductions,
                    totales: { liq_pesos: tPesos, liq_dolares: tDolares }
                });
            }
        });

        if (reports.length === 0) return alert("No hay datos para imprimir en este rango.");

        setBatchData(reports);
        setBatchPrintType(type);
        setIsBatchPrint(true);
        setShowBatchMenu(false);
        setTimeout(() => {
            window.print();
        }, 500);
    };

    // --- GENERAL MATRIX EXPORT ---
    const handleGeneralExcel = async () => {
        if (!viewingUid) return alert("Debes estar logueado");
        try {
            // 1. Fetch ALL data for the period
            const q = query(collection(db, "caja"),
                where("userId", "==", viewingUid)
            );
            const querySnapshot = await getDocs(q);
            const allEntries = querySnapshot.docs.map(doc => doc.data());
            const entries = allEntries.filter(item => item.fecha >= startDate && item.fecha <= endDate);

            // 2. Identify Active Professionals and their totals per day
            const matrix = {}; // { "YYYY-MM-DD": { "Prof Name": { ARS: 0, USD: 0 } } }
            const activeProfs = new Set();
            const dates = new Set();

            const profNameToCategory = {};
            profesionales.forEach(p => profNameToCategory[p.nombre] = p.categoria);

            entries.forEach(e => {
                const date = e.fecha; // YYYY-MM-DD
                dates.add(date);
                if (!matrix[date]) matrix[date] = {};

                const processLiquidation = (profName, liqAmount, liqCurr) => {
                    if (!profName || !liqAmount) return;

                    // Filter out Tutoras / Tutoria
                    const cat = profNameToCategory[profName];
                    if (cat === 'Tutoras' || cat === 'Tutoria') return;

                    activeProfs.add(profName);
                    if (!matrix[date][profName]) matrix[date][profName] = { ARS: 0, USD: 0 };

                    if (liqCurr === 'USD') matrix[date][profName].USD += liqAmount;
                    else matrix[date][profName].ARS += liqAmount;
                };

                // Prof 1
                // Prof 1
                if (e.prof_1) {
                    processLiquidation(e.prof_1, parseFloat(e.liq_prof_1), e.liq_prof_1_currency);
                    processLiquidation(e.prof_1, parseFloat(e.liq_prof_1_secondary), e.liq_prof_1_currency_secondary);
                }
                // Prof 2
                if (e.prof_2) {
                    processLiquidation(e.prof_2, parseFloat(e.liq_prof_2), e.liq_prof_2_currency);
                    processLiquidation(e.prof_2, parseFloat(e.liq_prof_2_secondary), e.liq_prof_2_currency_secondary);
                }
                // Prof 3
                if (e.prof_3) {
                    processLiquidation(e.prof_3, parseFloat(e.liq_prof_3), e.liq_prof_3_currency);
                    processLiquidation(e.prof_3, parseFloat(e.liq_prof_3_secondary), e.liq_prof_3_currency_secondary);
                }
                // Anestesista
                if (e.anestesista) {
                    processLiquidation(e.anestesista, parseFloat(e.liq_anestesista), e.liq_anestesista_currency);
                }
            });

            if (activeProfs.size === 0) return alert("No hay liquidaciones en el rango seleccionado.");

            const sortedProfs = Array.from(activeProfs).sort();
            const sortedDates = Array.from(dates).sort();

            // 3. Create Excel
            const ExcelJS = (await import('exceljs')).default || await import('exceljs');
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
                    item.liq_pesos_total,
                    item.liq_dolares_total
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
                    const isUSD = d.currency === 'USD';
                    const col = isUSD ? 7 : 6;
                    dRow.getCell(col).value = -d.amount;
                    dRow.getCell(col).numFmt = isUSD ? '"-USD"#,##0.00' : '"-$"#,##0.00';
                    dRow.getCell(col).font = { color: { argb: 'FFCC0000' } };
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

            totalRow.getCell(7).value = finalTotalDolares;
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
                    item.liq_pesos_total,
                    item.liq_dolares_total
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
                    const isUSD = d.currency === 'USD';
                    const col = isUSD ? 5 : 4;
                    dRow.getCell(col).value = -d.amount;
                    dRow.getCell(col).numFmt = isUSD ? '"-USD"#,##0.00' : '"-$"#,##0.00';
                    dRow.getCell(col).font = { color: { argb: 'FFCC0000' } };
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

            totalRow.getCell(5).value = finalTotalDolares;
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

    // --- RECEIPT LOGIC ---
    let receiptEntries = [];
    let receiptLiqPesos = 0;
    let receiptLiqDolares = 0;
    let receiptFinalPesos = 0;
    let receiptFinalDolares = 0;


    if (showReceipt && data && data.totales) {
        receiptEntries = data.entradas.filter(e => {
            if (e.isTransfer) return false; // Exclude transfers from receipt
            if (e.includeInReceipt === true) return true;
            if (e.includeInReceipt === false) return false;
            return !e.paciente.toLowerCase().includes('(liq. manual)');
        });
        receiptLiqPesos = receiptEntries.reduce((acc, e) => acc + (e.liq_pesos_total || 0), 0);
        receiptLiqDolares = receiptEntries.reduce((acc, e) => acc + (e.liq_dolares_total || 0), 0);
        receiptFinalPesos = receiptLiqPesos - totalDeductionsPesos;
        receiptFinalDolares = receiptLiqDolares - totalDeductionsUSD;
    }

    const [profSearch, setProfSearch] = useState('');

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            <style>{printStyle}</style>

            {createPortal(
                <div className="print-portal bg-white text-black">
                    {(isBatchPrint ? batchData : (data ? [data] : [])).map((rpt, rptIdx) => {
                        const isReceiptMode = (isBatchPrint && batchPrintType === 'recibo') || (!isBatchPrint && showReceipt);
                        const isSingle = !isBatchPrint; // Helper for deducciones

                        // Resolve Deductions for this report instance
                        const currentDeductions = isBatchPrint ? (rpt.deducciones || []) : deductions;
                        const currDedPesos = currentDeductions.filter(d => d.currency !== 'USD').reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
                        const currDedUSD = currentDeductions.filter(d => d.currency === 'USD').reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);

                        // Common Totals Calculation
                        let rptFinalPesos = 0;
                        let rptFinalDolares = 0;

                        if (isReceiptMode) {
                            const isSingleReceipt = !isBatchPrint && showReceipt;
                            const rptReceiptEntries = rpt.entradas.filter(e => {
                                if (e.isTransfer) return false; // Exclude transfers
                                if (e.includeInReceipt === true) return true;
                                if (e.includeInReceipt === false) return false;
                                return !e.paciente.toLowerCase().includes('(liq. manual)');
                            });

                            const rptLiqPesos = rptReceiptEntries.reduce((acc, e) => acc + (e.liq_pesos_total || 0), 0);
                            rptFinalPesos = rptLiqPesos - currDedPesos;
                            const rptLiqDolares = rptReceiptEntries.reduce((acc, e) => acc + (e.liq_dolares_total || 0), 0);
                            rptFinalDolares = rptLiqDolares - currDedUSD;

                            return (
                                <div key={rptIdx} className="page-break p-12 print:p-0">
                                    <div className="border border-slate-200 shadow-sm p-12 print:border-none print:shadow-none bg-white">
                                        <div className="mb-8">
                                            <img src="/coat_logo.png" alt="COAT" className="h-20 object-contain mx-auto" />
                                        </div>
                                        <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm text-slate-800 mb-8 font-medium">
                                            <div className="font-bold text-slate-900">Fecha:</div>
                                            <div>
                                                {startDate === endDate
                                                    ? formatDate(startDate)
                                                    : `${formatDate(startDate)} al ${formatDate(endDate)}`}
                                            </div>
                                            <div className="font-bold text-slate-900">Movimiento:</div>
                                            <div>Egreso</div>
                                            <div className="font-bold text-slate-900">Concepto:</div>
                                            <div>Honorarios por técnica en común de por cuenta y orden de {rpt.profesional}</div>
                                            <div className="font-bold text-slate-900">Referencia:</div>
                                            <div className="text-xs">
                                                {(() => {
                                                    const parts = rptReceiptEntries.map(e => cleanPatientName(e.paciente));
                                                    if (currentDeductions.length > 0) {
                                                        currentDeductions.forEach(d => {
                                                            if (d.inReceipt) parts.push(d.desc);
                                                        });
                                                    }
                                                    return parts.filter(Boolean).join(', ');
                                                })()}
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
                                                <tr>
                                                    <td className="py-2 text-slate-600">Efectivo</td>
                                                    <td className="py-2"></td>
                                                    <td className="py-2"></td>
                                                    <td className="py-2 text-right font-mono font-bold text-slate-800">${formatMoney(rptFinalPesos)}</td>
                                                </tr>
                                                <tr>
                                                    <td className="py-2 text-slate-600">Dólares</td>
                                                    <td className="py-2"></td>
                                                    <td className="py-2"></td>
                                                    <td className="py-2 text-right font-mono font-bold text-slate-800">USD {formatMoney(rptFinalDolares)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div className="mt-32 flex justify-end">
                                            <div className="text-center w-64 border-t border-slate-900 pt-2">
                                                <p className="font-bold text-slate-900 text-sm">Recibí conforme</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        } else {
                            // Calculate Totals for Report Mode
                            if (rpt.totales) {
                                rptFinalPesos = rpt.totales.liq_pesos;
                                rptFinalDolares = rpt.totales.liq_dolares;
                            }
                            rptFinalPesos -= currDedPesos;
                            rptFinalDolares -= currDedUSD;

                            return (
                                <div key={rptIdx} className="page-break p-8">
                                    <div className="flex justify-between items-start mb-6 border-b border-black pb-4">
                                        <img src="/coat_logo.png" alt="COAT" className="h-16 object-contain" />
                                        <div className="text-right">
                                            <h1 className="text-2xl font-bold uppercase">Liquidación: {rpt.profesional}</h1>
                                            <p className="text-lg font-bold">
                                                {startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} - ${formatDate(endDate)}`}
                                            </p>
                                        </div>
                                    </div>
                                    <table className="w-full text-xs border-collapse border border-black mb-4">
                                        <thead>
                                            <tr className="bg-slate-100">
                                                <th className="border border-black px-2 py-1 text-left font-bold">Fecha</th>
                                                <th className="border border-black px-2 py-1 text-left font-bold">Paciente</th>
                                                {(rpt.categoria === 'ORL' || !rpt.categoria) && (
                                                    <>
                                                        <th className="border border-black px-2 py-1 text-right font-bold">Cobro $</th>
                                                        <th className="border border-black px-2 py-1 text-right font-bold">Cobro USD</th>
                                                    </>
                                                )}
                                                <th className="border border-black px-2 py-1 text-right font-bold bg-slate-200">Liquidación</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rpt.entradas.map((entry, idx) => (
                                                <tr key={idx} className="border-b border-black">
                                                    <td className="border border-black px-2 py-1">{formatDate(entry.fecha)}</td>
                                                    <td className="border border-black px-2 py-1">
                                                        <div className="font-bold">{cleanPatientName(entry.paciente)}</div>
                                                        <div className="text-[10px]">{entry.dni} - {entry.obra_social}</div>
                                                    </td>
                                                    {(rpt.categoria === 'ORL' || !rpt.categoria) && (
                                                        <>
                                                            <td className="border border-black px-2 py-1 text-right">
                                                                {entry.abonado_ref > 0 && entry.abonado_ref_currency === 'ARS' ? (
                                                                    `$${formatMoney(entry.abonado_ref)}`
                                                                ) : (
                                                                    `$${formatMoney(entry.pago_pesos)}`
                                                                )}
                                                            </td>
                                                            <td className="border border-black px-2 py-1 text-right">
                                                                {entry.abonado_ref > 0 && entry.abonado_ref_currency === 'USD' ? (
                                                                    `USD ${formatMoney(entry.abonado_ref)}`
                                                                ) : (
                                                                    `USD ${formatMoney(entry.pago_dolares)}`
                                                                )}
                                                            </td>
                                                        </>
                                                    )}
                                                    <td className="border border-black px-2 py-1 text-right font-bold">
                                                        {(entry.liq_pesos_total !== 0 || entry.liq_dolares_total === 0) && <div>${formatMoney(entry.liq_pesos_total)}</div>}
                                                        {entry.liq_dolares_total !== 0 && <div>USD {formatMoney(entry.liq_dolares_total)}</div>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            {/* Spacer Row */}
                                            <tr>
                                                <td colSpan={(rpt.categoria === 'ORL' || !rpt.categoria) ? 5 : 3} className="border-x border-black py-4"></td>
                                            </tr>

                                            {currentDeductions.length > 0 && currentDeductions.map((d, i) => (
                                                <tr key={i} className="text-red-700">
                                                    <td className="border border-black px-2 py-1">{formatDate(d.date)}</td>
                                                    <td className="border border-black px-2 py-1 italic">{d.desc}</td>
                                                    <td colSpan={(rpt.categoria === 'ORL' || !rpt.categoria) ? 3 : 1} className="border border-black px-2 py-1 text-right">-{d.currency === 'USD' ? 'U$D' : '$'}{formatMoney(d.amount)}</td>
                                                </tr>
                                            ))}
                                            <tr className="text-black font-bold border-t-2 border-black bg-slate-100">
                                                <td colSpan={(rpt.categoria === 'ORL' || !rpt.categoria) ? 4 : 2} className="border border-black px-2 py-2 text-right uppercase">Total Final</td>
                                                <td className="border border-black px-2 py-2 text-right">
                                                    {(rptFinalPesos !== 0 || rptFinalDolares === 0) && <div>${formatMoney(rptFinalPesos)}</div>}
                                                    {rptFinalDolares !== 0 && <div>USD {formatMoney(rptFinalDolares)}</div>}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            );
                        }
                    })}
                </div>,
                document.body
            )}

            {error && (
                <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded relative mb-4">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{error}</span>
                </div>
            )}

            {showReceipt ? (
                <div className="bg-white dark:bg-slate-900 min-h-screen p-8 print:hidden animate-in fade-in duration-300 relative">
                    <div className="flex gap-4 mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <button onClick={() => setShowReceipt(false)} className="flex items-center gap-2 px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 font-bold transition-colors">
                            <Search size={16} /> Volver a Liquidación
                        </button>
                        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 font-bold shadow-lg">
                            <Printer size={16} /> Imprimir Recibo
                        </button>
                    </div>

                    <div className="max-w-3xl mx-auto border border-slate-200 dark:border-slate-800 shadow-sm p-12 bg-white dark:bg-slate-900">
                        <div className="mb-8">
                            <img src="/coat_logo.png" alt="COAT" className="h-20 object-contain mx-auto" />
                        </div>
                        <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm text-slate-800 dark:text-slate-200 mb-8 font-medium">
                            <div className="font-bold text-slate-900 dark:text-white">Fecha:</div>
                            <div>
                                {startDate === endDate
                                    ? formatDate(startDate)
                                    : `${formatDate(startDate)} al ${formatDate(endDate)}`}
                            </div>
                            <div className="font-bold text-slate-900 dark:text-white">Movimiento:</div>
                            <div>Egreso</div>
                            <div className="font-bold text-slate-900 dark:text-white">Concepto:</div>
                            <div>Honorarios por técnica en común de por cuenta y orden de {data?.profesional || 'Profesional'}</div>
                            <div className="font-bold text-slate-900 dark:text-white">Referencia:</div>
                            <div className="text-xs">{receiptEntries.map(e => cleanPatientName(e.paciente)).join(', ')}</div>
                        </div>
                        <table className="w-full text-sm mb-12 border-t border-slate-300 dark:border-slate-700">
                            <thead>
                                <tr className="border-b border-slate-300 dark:border-slate-700">
                                    <th className="text-left py-2 font-bold text-slate-900 dark:text-white w-1/3">M. de Pago</th>
                                    <th className="text-left py-2 font-bold text-slate-900 dark:text-white">Número</th>
                                    <th className="text-left py-2 font-bold text-slate-900 dark:text-white">F. Cobro</th>
                                    <th className="text-right py-2 font-bold text-slate-900 dark:text-white">Importe</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                <tr>
                                    <td className="py-2 text-slate-600 dark:text-slate-400">Efectivo</td>
                                    <td className="py-2"></td>
                                    <td className="py-2"></td>
                                    <td className="py-2 text-right font-mono font-bold text-slate-800 dark:text-slate-100">${formatMoney(receiptFinalPesos)}</td>
                                </tr>
                                <tr>
                                    <td className="py-2 text-slate-600 dark:text-slate-400">Dólares</td>
                                    <td className="py-2"></td>
                                    <td className="py-2"></td>
                                    <td className="py-2 text-right font-mono font-bold text-slate-800 dark:text-slate-100">USD {formatMoney(receiptFinalDolares)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="mt-32 flex justify-end">
                            <div className="text-center w-64 border-t border-slate-900 dark:border-white pt-2">
                                <p className="font-bold text-slate-900 dark:text-white text-sm">Recibí conforme</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Cabecera de Filtros */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 no-print">
                        <div className="flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700">
                                <button onClick={() => setModelo(1)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${modelo === 1 ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400'}`}>Modelo 1</button>
                                <button onClick={() => setModelo(2)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${modelo === 2 ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400'}`}>Modelo 2</button>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Filtrar:</span>
                                <input type="date" className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-600 dark:text-slate-200 focus:border-teal-500 outline-none" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                                <span className="text-slate-400 dark:text-slate-500">-</span>
                                <input type="date" className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-600 dark:text-slate-200 focus:border-teal-500 outline-none" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input type="text" placeholder="Buscar profesional..." className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:border-teal-500 outline-none text-slate-700 dark:text-slate-200" value={profSearch} onChange={(e) => setProfSearch(e.target.value)} />
                            </div>
                            <div className="flex flex-wrap gap-2 p-2 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl max-h-[200px] overflow-y-auto">
                                {profesionales.filter(p => p.categoria !== 'Tutoras').filter(p => p.nombre.toLowerCase().includes(profSearch.toLowerCase())).map(prof => (
                                    <button key={prof.id} onClick={() => setSelectedProf(prof.nombre)} className={`px-4 py-2 rounded-xl border transition-all font-medium text-sm ${selectedProf === prof.nombre ? 'bg-white dark:bg-slate-700 border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 shadow-sm' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{prof.nombre}</button>
                                ))}
                                {profesionales.filter(p => p.categoria !== 'Tutoras').filter(p => p.nombre.toLowerCase().includes(profSearch.toLowerCase())).length === 0 && <div className="w-full py-4 text-center text-slate-400 dark:text-slate-500 text-sm italic">No se encontraron profesionales</div>}
                            </div>
                        </div>
                    </div>

                    {data && data.entradas ? (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-800 overflow-hidden no-print">
                            <div className="p-4 md:p-8 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:justify-between items-start md:items-center gap-6 bg-gradient-to-r from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/50">
                                <div className="flex-1 w-full">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center shrink-0"><User size={24} /></div>
                                        <div>
                                            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight" title="v1.1.0">Liquidación: {data.profesional}</h2>
                                            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm md:text-base">{data.categoria} | Modelo: {modelo === 1 ? 'Detallado' : 'Simplificado'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3 w-full md:w-auto justify-start md:justify-end">
                                    {!isReadOnly && <button onClick={() => setShowManualModal(true)} className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-semibold shadow-lg shadow-emerald-200 dark:shadow-none transition-all text-sm md:text-base"><Plus size={20} /> Agregar</button>}
                                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-800 dark:hover:text-green-400 font-semibold transition-all text-sm md:text-base"><Download size={20} /> Excel</button>

                                    {data.categoria !== 'Tutoras' && (
                                        <>
                                            <button onClick={() => setShowReceipt(true)} className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold shadow-lg shadow-purple-200 dark:shadow-none transition-all text-sm md:text-base"><FileText size={20} /> Recibo</button>
                                            <div className="relative">
                                                <button onClick={() => setShowBatchMenu(!showBatchMenu)} className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-slate-700 dark:bg-slate-800 text-white rounded-xl hover:bg-slate-600 dark:hover:bg-slate-700 font-semibold shadow-md transition-all text-sm md:text-base"><Printer size={20} /> Imprimir Todo</button>
                                                {showBatchMenu && (
                                                    <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 p-2 z-50 min-w-[200px] flex flex-col gap-2">
                                                        <div onClick={() => { handlePrintAll('liquidacion'); setShowBatchMenu(false); }} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2"><FileText size={16} /> Liquidaciones</div>
                                                        <div onClick={() => { handlePrintAll('recibo'); setShowBatchMenu(false); }} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2"><div className="w-4 h-4 border border-slate-400 rounded-sm" /> Recibos</div>
                                                    </div>
                                                )}
                                            </div>
                                            <button onClick={handlePrint} className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-slate-900 dark:bg-slate-950 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-black font-semibold shadow-lg transition-all text-sm md:text-base"><Printer size={20} /> Imprimir Detalle</button>
                                        </>
                                    )}
                                </div>
                            </div>


                            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 mb-4">
                                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">Agregar deducción</h3>
                                    <div className="group relative">
                                        <CircleHelp size={16} className="text-slate-400 dark:text-slate-500 cursor-help" />
                                        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800 dark:bg-slate-950 text-white text-[11px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100] normal-case font-medium border border-slate-700 dark:border-slate-800">
                                            Utilice esta sección únicamente para agregar montos que deban **restarse** del total de la liquidación (ej: gastos, retenciones, etc).
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4 mb-4">
                                    <input type="date" className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 outline-none" value={newDeductionDate} onChange={e => setNewDeductionDate(e.target.value)} />
                                    <input type="text" placeholder="Descripción" className="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400" value={newDeductionDesc} onChange={e => setNewDeductionDesc(e.target.value)} />
                                    <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-700">
                                        <select
                                            className="p-2 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
                                            value={newDeductionCurrency}
                                            onChange={e => setNewDeductionCurrency(e.target.value)}
                                        >
                                            <option value="ARS">$</option>
                                            <option value="USD">U$S</option>
                                        </select>
                                        <input type="number" placeholder="Monto" className="w-24 p-2 bg-transparent focus:outline-none text-slate-700 dark:text-slate-200" value={newDeductionAmount} onChange={e => setNewDeductionAmount(e.target.value)} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="dedInReceipt" className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700" checked={newDeductionInReceipt} onChange={e => setNewDeductionInReceipt(e.target.checked)} />
                                        <label htmlFor="dedInReceipt" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase cursor-pointer">En recibo</label>
                                    </div>
                                    <button onClick={addDeduction} className="px-4 py-2 bg-slate-800 dark:bg-slate-950 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-black font-bold transition-colors">Agregar</button>
                                </div>
                                {deductions.length > 0 && (
                                    <div className="space-y-2">
                                        {deductions.map((d, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded border border-red-100 dark:border-red-900/30">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">{formatDate(d.date)}</span>
                                                    <span className="text-slate-700 dark:text-slate-200 font-medium">{d.desc}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-red-600 dark:text-red-400 font-bold">-{d.currency === 'USD' ? 'U$S' : '$'}{formatMoney(d.amount)}</span>
                                                    <button onClick={() => removeDeduction(d.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                                            <th className="px-8 py-4 text-left">Fecha</th>
                                            <th className="px-8 py-4 text-left">Paciente</th>
                                            <th className="px-2 py-4 text-center w-10">Transf.</th>
                                            {modelo === 1 && (
                                                <>
                                                    <th className="px-8 py-4 text-right">Cobro Pesos</th>
                                                    <th className="px-8 py-4 text-right">Cobro USD</th>
                                                </>
                                            )}
                                            <th className="px-8 py-4 text-right bg-teal-50/30 dark:bg-teal-900/10">Su Liquidación</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300 text-sm">
                                        {data.entradas.map((entry, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-8 py-4 text-slate-400 dark:text-slate-500 tabular-nums">{formatDate(entry.fecha)}</td>
                                                <td className="px-8 py-4">
                                                    <div className="font-bold text-slate-900 dark:text-slate-100">
                                                        {cleanPatientName(entry.paciente)}
                                                        {entry.isManualLiquidation && entry.isTransfer && <span className="ml-2 text-[10px] bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">Manual</span>}
                                                    </div>
                                                    <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">{entry.dni}</div>
                                                </td>
                                                <td className="px-2 py-4 text-center">
                                                    {!isReadOnly && (
                                                        <div className="flex justify-center">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-teal-600 rounded border-slate-300 dark:border-slate-700 dark:bg-slate-800 focus:ring-indigo-500 cursor-pointer"
                                                                checked={entry.isTransfer || false}
                                                                onChange={() => handleToggleTransfer(entry)}
                                                                title="Marcar como Transferencia (No suma al total)"
                                                            />
                                                        </div>
                                                    )}
                                                </td>
                                                {modelo === 1 && (
                                                    <>
                                                        <td className="px-8 py-4 text-right tabular-nums text-slate-400 dark:text-slate-500">
                                                            {entry.abonado_ref > 0 && entry.abonado_ref_currency === 'ARS' ? (
                                                                `$${formatMoney(entry.abonado_ref)}`
                                                            ) : (
                                                                `$${formatMoney(entry.pago_pesos)}`
                                                            )}
                                                        </td>
                                                        <td className="px-8 py-4 text-right tabular-nums text-slate-400 dark:text-slate-500">
                                                            {entry.abonado_ref > 0 && entry.abonado_ref_currency === 'USD' ? (
                                                                `U$D ${formatMoney(entry.abonado_ref)}`
                                                            ) : (
                                                                `U$D ${formatMoney(entry.pago_dolares)}`
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="px-8 py-4 text-right tabular-nums font-bold text-teal-600 dark:text-teal-400 bg-teal-50/5 dark:bg-teal-900/5 relative group/cell">
                                                    <div className="flex flex-col items-end gap-1">
                                                        {(entry.liq_pesos_total !== 0 || entry.liq_dolares_total === 0) && <span>${formatMoney(entry.liq_pesos_total)}</span>}
                                                        {entry.liq_dolares_total !== 0 && <span className="text-teal-600 dark:text-teal-400">U$D {formatMoney(entry.liq_dolares_total)}</span>}
                                                    </div>
                                                    {!isReadOnly && (
                                                        <div className="absolute top-1/2 -translate-y-1/2 right-2 flex gap-1 opacity-0 group-hover/cell:opacity-100 transition-all bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-slate-100 dark:border-slate-700 no-print">
                                                            <button
                                                                onClick={() => handleEditClick(entry)}
                                                                className="p-1.5 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-all"
                                                                title="Editar (Requiere PIN)"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteClick(entry)}
                                                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                                                                title="Eliminar (Requiere PIN)"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                                            <td colSpan={modelo === 1 ? 4 : 2} className="px-8 py-5 text-right font-bold uppercase tracking-widest text-xs opacity-50">Subtotal</td>
                                            <td className="px-8 py-5 text-right font-bold text-lg tabular-nums text-slate-500 dark:text-slate-400">
                                                <div className="flex flex-col items-end gap-1">
                                                    {(data.totales.liq_pesos !== 0 || data.totales.liq_dolares === 0) && <span>${formatMoney(data.totales.liq_pesos)}</span>}
                                                    {data.totales.liq_dolares !== 0 && <span className="text-teal-600 dark:text-teal-400">U$D {formatMoney(data.totales.liq_dolares)}</span>}
                                                </div>
                                            </td>
                                        </tr>
                                        {deductions.map((d, i) => (
                                            <tr key={i} className="bg-red-50/50 dark:bg-red-900/10">
                                                <td className="px-8 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{formatDate(d.date)}</td>
                                                <td colSpan={modelo === 1 ? 3 : 1} className="px-8 py-3 text-right font-medium italic text-red-800 dark:text-red-400">{d.desc}</td>
                                                <td className="px-8 py-3 text-right font-bold text-red-600 dark:text-red-400">-{d.currency === 'USD' ? 'U$D' : '$'}{formatMoney(d.amount)}</td>
                                            </tr>
                                        ))}

                                        <tr className="bg-slate-900 dark:bg-black text-white">
                                            <td colSpan={modelo === 1 ? 4 : 2} className="px-8 py-5 text-right font-bold uppercase tracking-widest text-xs opacity-50 text-slate-400">Total Final</td>
                                            <td className="px-8 py-5 text-right font-black text-lg tabular-nums">
                                                <div className="flex flex-col items-end gap-1">
                                                    {(finalTotalPesos !== 0 || finalTotalDolares === 0) && <span>${formatMoney(finalTotalPesos)}</span>}
                                                    {finalTotalDolares !== 0 && <span className="text-teal-400">U$D {formatMoney(finalTotalDolares)}</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="p-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm text-slate-300 dark:text-slate-600 animate-in fade-in duration-500">
                            <User size={64} className="mx-auto mb-4 opacity-20" />
                            <p className="text-xl font-bold text-slate-400 dark:text-slate-500">Selecciona un profesional para ver su liquidación</p>
                        </div>
                    )}
                </div>
            )
            }

            {/* MANUAL LIQUIDATION MODAL */}
            {showManualModal && (
                <ModalPortal onClose={() => setShowManualModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Agregar Liquidación Manual</h3>
                            <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors"><X size={24} /></button>
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-1">Fecha</label>
                                    <input type="date" className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:border-teal-500 outline-none" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-1">Paciente</label>
                                    <input
                                        list="manual-patients"
                                        type="text"
                                        placeholder="Buscar o escribir paciente..."
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:border-teal-500 outline-none placeholder:text-slate-400"
                                        value={manualForm.patient}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const found = dayPatients.find(p => p.name === val);
                                            if (found) {
                                                const amount = found.pesos > 0 ? found.pesos : (found.dolares > 0 ? found.dolares : '');
                                                const curr = found.dolares > 0 ? 'USD' : 'ARS';
                                                setManualForm({ ...manualForm, patient: val, totalPayment: amount, currency: curr });
                                            } else {
                                                setManualForm({ ...manualForm, patient: val });
                                            }
                                        }}
                                    />
                                    <datalist id="manual-patients">
                                        {dayPatients.map((p, i) => <option key={i} value={p.name} />)}
                                    </datalist>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6 p-4 bg-teal-50/30 dark:bg-teal-900/10 rounded-2xl border border-teal-100/50 dark:border-teal-800/30">
                                <div>
                                    <label className="block text-xs font-bold text-teal-600 dark:text-teal-400 uppercase mb-2 ml-1">Total Abonado</label>
                                    <input
                                        type="number"
                                        className="w-full p-3 bg-white dark:bg-slate-800 border border-teal-100 dark:border-teal-800 rounded-xl font-bold text-teal-900 dark:text-teal-100 text-lg focus:ring-2 focus:ring-teal-500/20 outline-none"
                                        placeholder="Monto"
                                        value={manualForm.totalPayment}
                                        onChange={(e) => setManualForm({ ...manualForm, totalPayment: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-1">Moneda</label>
                                    <select
                                        className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold outline-none"
                                        value={manualForm.currency}
                                        onChange={(e) => setManualForm({ ...manualForm, currency: e.target.value })}
                                    >
                                        <option value="ARS">Pesos ($)</option>
                                        <option value="USD">Dólares (USD)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Distribución por Profesionales</label>
                                    <button onClick={addManualProfRow} className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-2 bg-teal-50 dark:bg-teal-900/30 px-3 py-1.5 rounded-lg transition-all border border-teal-100 dark:border-teal-800">
                                        <Plus size={14} /> Añadir Profesional
                                    </button>
                                </div>
                                <div className="max-h-[250px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                                    {manualForm.profs.map((item, idx) => (
                                        <div key={idx} className="grid grid-cols-[1fr_120px_48px] gap-3 items-end bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 animate-in fade-in slide-in-from-right-4 duration-300">
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Profesional</label>
                                                <select className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-medium outline-none" value={item.prof} onChange={(e) => updateManualProfRow(idx, 'prof', e.target.value)}>
                                                    <option value="">Seleccionar</option>
                                                    {profesionales.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase ml-1">Monto</label>
                                                <input type="number" className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none" value={item.amount} onChange={(e) => updateManualProfRow(idx, 'amount', e.target.value)} />
                                            </div>
                                            <button onClick={() => removeManualProfRow(idx)} className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all mb-0.5" disabled={manualForm.profs.length <= 1}>
                                                <Trash size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-3 py-1">
                                    <input type="checkbox" id="includeReceipt" className="w-5 h-5 text-teal-600 rounded-lg dark:bg-slate-800 dark:border-slate-700" checked={manualForm.includeInReceipt} onChange={(e) => setManualForm({ ...manualForm, includeInReceipt: e.target.checked })} />
                                    <label htmlFor="includeReceipt" className="text-sm font-bold text-slate-600 dark:text-slate-300 cursor-pointer">Mostrar referencia en recibo</label>
                                </div>
                                <div className="flex items-center gap-3 py-1">
                                    <input type="checkbox" id="isTransfer" className="w-5 h-5 text-teal-600 rounded-lg dark:bg-slate-800 dark:border-slate-700" checked={manualForm.isTransfer || false} onChange={(e) => setManualForm({ ...manualForm, isTransfer: e.target.checked })} />
                                    <label htmlFor="isTransfer" className="text-sm font-bold text-teal-700 dark:text-teal-400 cursor-pointer flex items-center gap-2">
                                        Es Transferencia (No suma a total)
                                        <div className="group relative">
                                            <CircleHelp size={14} className="text-slate-400 dark:text-slate-500 cursor-help" />
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-slate-800 dark:bg-black text-white text-[10px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100] border border-slate-700 dark:border-slate-800 leading-relaxed font-medium">
                                                Si se marca, el nombre del paciente aparecerá en el listado de referencias del recibo impreso pero el monto no se incluirá en los totales de caja.
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <button onClick={handleSaveManual} className="w-full py-4 bg-teal-600 text-white font-black rounded-2xl hover:bg-teal-700 shadow-xl shadow-emerald-200/20 dark:shadow-none transition-all mt-4 text-lg">Confirmar Liquidación</button>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* SECURE EDIT PIN MODAL */}
            {showEditPinModal && (
                <ModalPortal onClose={() => setShowEditPinModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-xs border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-500 dark:text-slate-400 shadow-inner">
                                <LockIcon size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Seguridad</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{pendingAction === 'delete' ? "Ingrese PIN para ELIMINAR" : "Ingrese PIN para editar"}</p>
                        </div>
                        <input
                            type="password"
                            className="w-full text-center text-3xl tracking-[0.5em] font-black py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl mb-8 focus:border-teal-500 dark:focus:border-teal-400 outline-none text-slate-900 dark:text-white transition-all"
                            maxLength={8}
                            value={editPinInput}
                            onChange={(e) => setEditPinInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyEditPin()}
                            autoFocus
                        />
                        <div className="flex gap-4">
                            <button onClick={() => setShowEditPinModal(false)} className="flex-1 py-3 text-slate-500 dark:text-slate-400 font-bold hover:text-slate-800 dark:hover:text-slate-200 transition-colors">Cancelar</button>
                            <button onClick={handleVerifyEditPin} className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl shadow-lg shadow-teal-200 dark:shadow-none hover:bg-teal-700 transition-all">Verificar</button>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* EDIT ENTRY MODAL */}
            {showEditFormModal && editFormData && (
                <ModalPortal onClose={() => setShowEditFormModal(false)}>
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h3 className="text-2xl font-bold flex items-center gap-3 text-slate-900 dark:text-white"><Pencil size={24} className="text-teal-500" /> Editar Liquidación</h3>
                            <button onClick={() => setShowEditFormModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 transition-colors"><X size={24} /></button>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-1">Paciente</label>
                                <input type="text" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-bold focus:border-teal-500 outline-none transition-all" value={editFormData.paciente || ''} onChange={(e) => setEditFormData({ ...editFormData, paciente: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-6 p-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-1">Pesos ($)</label>
                                    <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-bold focus:border-teal-500 outline-none transition-all" value={editFormData.monto_pesos || 0} onChange={(e) => setEditFormData({ ...editFormData, monto_pesos: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-1">Dólares (USD)</label>
                                    <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-bold focus:border-teal-500 outline-none transition-all" value={editFormData.monto_dolares || 0} onChange={(e) => setEditFormData({ ...editFormData, monto_dolares: parseFloat(e.target.value) })} />
                                </div>
                            </div>
                            <button onClick={handleUpdateEntry} className="w-full py-4 bg-teal-600 text-white font-black rounded-2xl flex justify-center items-center gap-3 shadow-lg shadow-teal-200 dark:shadow-none hover:bg-teal-700 transition-all text-lg mt-4"><Save size={24} /> Guardar Cambios</button>
                        </div>
                    </div>
                </ModalPortal>
            )}
        </div >
    );
};

export default LiquidacionView;
