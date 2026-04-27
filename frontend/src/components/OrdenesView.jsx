import React, { useState, useEffect, useRef, useMemo } from 'react';
import ModalPortal from './common/ModalPortal';
import {
    Save as SaveIcon, FileText, Printer, Download, Plus, X, Calendar, User, Building2, Hash,
    Stethoscope, Pill, ClipboardList, Edit3, Trash2, Package, FileStack, Search,
    CheckCircle2, ArchiveRestore, ShieldCheck, Truck, Folder, Phone, MessageCircle,
    AlertCircle, Clock, Home, StickyNote, LayoutGrid, List, Ban, Filter,
    TableProperties, Sparkles, Loader2, Lock as LockIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, USE_LOCAL_DB, isTestEnv } from '../firebase/config';
import { collection, addDoc, updateDoc, doc, getDocs, deleteDoc, query, where, getDoc, writeBatch } from 'firebase/firestore';
import apiService from '../services/apiService';
import { parseEmailToOrder } from '../services/aiService';
import { useAuth } from '../context/AuthContext';
import { scrollToTop } from '../utils/navigation';
import { createPortal } from 'react-dom';
import { CODIGOS_CIRUGIA, MODULOS_SM, CODIGOS_IOSFA, PRACTICAS_MEDICAS } from '../data/codigos';
import { CONSENTIMIENTOS_MAP, CONSENTIMIENTOS_COMBO, CONSENTIMIENTO_GENERICO } from '../data/consentimientos';
import { toast } from 'react-hot-toast';
import { generateOrdenPDF } from '../utils/pdfGenerator';
// Dynamic import used for html2pdf

// Map professional names to their signature image files
const FIRMAS_MAP = {
    'Dr. Jasin': 'dr_jasin.png',
    'Dr. Bruera': 'dr_bruera.png',
    'Dr. Curet': 'dr_curet.png',
    'Dr. Hoyos': 'dr_hoyos.png',
    'Dr. Paredes': 'dr_paredes.png',
    'Dr. Zernotti': 'dr_zernotti.png',
    'Dr. Zemotti': 'dr_zernotti.png',
    'Dr. Romero Orellano': 'dr_romero_orellano.png',
    'Dr. Hernandorena': 'dr_hernandorena.png',
    'Dra. Carranza': 'dra_carranza.png',
    'Dra. Romani': 'dra_romani.png',
    'Dra. Valeriani': 'dra_valeriani.png',
    'Dra. Venier': 'dra_venier.png',
    'Dra. Zalazar': 'dra_zalazar.png',
    'Dr. Pablo Jasin': 'dr_jasin.png',
};

// Helper to abbreviate name to "Prefix Surname"
const shortProfName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    const prefixes = ['dr', 'dra', 'lic', 'dr.', 'dra.', 'lic.'];
    if (parts.length >= 2 && prefixes.includes(parts[0].toLowerCase())) {
        return `${parts[0]} ${parts[1]}`;
    }
    return parts.slice(0, 2).join(' ');
};

const noop = () => { };

const OrdenesView = (props) => {
    const { 
        initialTab = 'internacion', 
        draftData = null, 
        onDraftConsumed = noop, 
        modalMode = false, 
        onClose = null, 
        isAuditoria = false, 
        lowPerfMode = false 
    } = props;
    
    // Safety check for legacy browsers
    const isLowPerf = (lowPerfMode || false);
    const { viewingUid, catalogOwnerUid, isSuperAdmin, permissions, linkedProfesionalName, currentUser } = useAuth();

    // Permissions logic
    const canViewOrdenes = isSuperAdmin || permissions?.can_view_ordenes;
    const canShareOrdenes = isSuperAdmin || permissions?.can_share_ordenes;
    const canEditOrdenes = isSuperAdmin || permissions?.can_edit_data;
    const [profesionales, setProfesionales] = useState([]);
    const [allProfesionales, setAllProfesionales] = useState([]);
    const [isResidente, setIsResidente] = useState(false);
    const [ordenes, setOrdenes] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [previewType, setPreviewType] = useState('internacion'); // 'internacion' | 'material'
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [whatsappModal, setWhatsappModal] = useState(null); // { orden: ordenData } when open
    const [copiedToast, setCopiedToast] = useState(false); // Show toast when message is copied
    const [showAIInput, setShowAIInput] = useState(false); // Toggle AI paste area
    const [aiInputText, setAiInputText] = useState(''); // Raw email text
    const [aiLoading, setAiLoading] = useState(false); // AI processing spinner
    const [aiError, setAiError] = useState(''); // AI error message
    const [activeTab, setActiveTab] = useState(initialTab); // 'internacion' | 'control'
    const [whatsappTemplates, setWhatsappTemplates] = useState({
        paciente: 'Buen día, le escribe Emmanuel del área de internaciones COAT.\n\n *{paciente}* tiene agendada una cirugía el día *{fecha}* con *{profesional}*.\n\nLe informamos que en el caso de su obra social, la autorización debe ser gestionada personalmente por el paciente ante la misma. Cualquier duda quedamos a su disposición.',
        institucional: 'Buen día, le escribe Emmanuel del área de internaciones COAT.\n\n *{paciente}* tiene agendada una cirugía el día *{fecha}* con *{profesional}*.\n\nEn el caso de su obra social, la autorización la gestionamos nosotros.\n\nPara poder comenzar la gestión con su obra social le voy a solicitar que envíe estudios realizados de nariz, garganta y oído.'
    });

    // Load WhatsApp Templates
    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const docSnap = await getDoc(doc(db, "settings", "whatsapp_templates"));
                if (docSnap.exists()) {
                    setWhatsappTemplates(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching templates:", error);
            }
        };
        fetchTemplates();
    }, []);
    const [previewOrdenes, setPreviewOrdenes] = useState([]); // Preview for control tab
    const [selectedConsent, setSelectedConsent] = useState(null); // 'caratula', 'generico', or {code, type}
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');

    // Filter State
    const [filterProfesional, setFilterProfesional] = useState('');
    const [filterObraSocial, setFilterObraSocial] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterPeriodo, setFilterPeriodo] = useState('proximas'); // 'proximas' | 'realizadas' | 'todas'
    const [filterStatus, setFilterStatus] = useState('');
    const [filterAudit, setFilterAudit] = useState(''); // 'auditadas' | 'pendientes' | ''
    const [searchPaciente, setSearchPaciente] = useState('');
    const [visibleCount, setVisibleCount] = useState(15); // Limite inicial de items

    // Autocomplete State
    const [suggestions, setSuggestions] = useState([]);
    const [showProfSuggestions, setShowProfSuggestions] = useState(false);
    const [activeRow, setActiveRow] = useState(null); // { index: 0, field: 'codigo' | 'nombre' }
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [dynamicConsents, setDynamicConsents] = useState({});

    const searchTimeoutRef = useRef(null);

    // Fetch dynamic assets from Firestore
    const [storageFiles, setStorageFiles] = useState([]);

    useEffect(() => {
        const fetchStorageFiles = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, 'storage_files'));
                const files = [];
                querySnapshot.forEach(doc => {
                    files.push({ id: doc.id, ...doc.data() });
                });
                setStorageFiles(files);
            } catch (error) {
                console.error("Error fetching storage files from Firestore:", error);
            }
        };
        fetchStorageFiles();
    }, []);

    // State for PDF library (Firebase Storage URLs)
    const [consentPdfs, setConsentPdfs] = useState({});

    // 2. Fetch consent mappings + PDF library from Firestore
    useEffect(() => {
        const fetchConsents = async () => {
            try {
                const [mappingsSnap, pdfsSnap] = await Promise.all([
                    getDocs(collection(db, 'consent_mappings')),
                    getDocs(collection(db, 'consentimientos')),
                ]);

                // Build PDF lookup: { id -> { nombre, url } }
                const pdfMap = {};
                pdfsSnap.docs.forEach(d => {
                    pdfMap[d.id] = { nombre: d.data().nombre, url: d.data().url };
                });
                setConsentPdfs(pdfMap);

                // Build mappings: { code -> { nombre, adulto: url, menor: url } }
                const mappingsMap = {};
                mappingsSnap.docs.forEach(docSnap => {
                    const m = docSnap.data();
                    mappingsMap[m.code] = {
                        nombre: m.name,
                        adulto: m.adultoId ? (pdfMap[m.adultoId]?.url || null) : null,
                        menor: m.menorId ? (pdfMap[m.menorId]?.url || null) : null,
                    };
                });
                setDynamicConsents(mappingsMap);
            } catch (err) {
                console.error("Error fetching consent data from Firebase:", err);
            }
        };
        fetchConsents();
    }, []);

    const lastInitializedKey = useRef('');


    // Form State
    const emptyForm = {
        profesional: linkedProfesionalName || '',
        tutor: '', // New field for Resident's Tutor
        afiliado: '',
        obraSocial: '',
        numeroAfiliado: '',
        dni: '',
        edad: '', // Patient's age
        telefono: '', // Patient phone number for WhatsApp
        codigosCirugia: [
            { codigo: '', nombre: '' },
            { codigo: '', nombre: '' }
        ],
        tipoAnestesia: 'general',
        fechaCirugia: '',
        horaCirugia: '', // New field
        salaCirugia: '', // New field (Room)
        anotacionCalendario: '', // New field for calendar display
        incluyeMaterial: false, // Toggle for material order
        descripcionMaterial: '', // Material description
        diagnostico: '',
        habitacion: '',
        fechaDocumento: new Date().toISOString().split('T')[0],
        suspendida: false, // New field for "not performed" status
        practicas: ['', '', '', '', ''], // Array of strings (practice names)
        estudioBajoAnestesia: false, // New field
    };

    const [formData, setFormData] = useState(emptyForm);

    const printStyle = `
@media print {
    @page { size: A4; margin: 0; }
    .no-print { display: none !important; }
    .print-orden {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        height: auto !important;
        background: white !important;
        color: black !important;
        overflow: visible !important;
        z-index: 9999;
    }
    body { background: white !important; overflow: visible !important; }
    #root { height: 0 !important; overflow: hidden !important; }
}
/* Force light mode for preview on screen and for html2canvas/PDF */
.print-orden #preview-content, 
.print-orden #preview-content * {
    background-color: white !important;
    color: black !important;
    border-color: #cbd5e1 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-scheme: light !important;
}
.print-orden #preview-content img {
    background-color: transparent !important;
}
`;

    // Fetch Professionals
    useEffect(() => {
        const fetchProfs = async () => {
            const ownerToUse = catalogOwnerUid || viewingUid;
            if (!ownerToUse) return;
            try {
                // "Todos ven todo": ya no filtramos por userId para los profesionales
                const profsAll = await apiService.getCollection("profesionales");
                setAllProfesionales(profsAll);

                // Identify if the linked professional is a "Residente"
                if (linkedProfesionalName) {
                    const linkedProfObj = profsAll.find(p => p.nombre === linkedProfesionalName);
                    if (linkedProfObj && linkedProfObj.categoria === 'Residente') {
                        setIsResidente(true);
                    }
                }

                const profs = profsAll
                    .filter(p => p.categoria === 'ORL' || p.categoria === 'Estetica' || p.categoria === 'Tutoras') // Allow tutors to be selectable
                    .sort((a, b) => a.nombre.localeCompare(b.nombre));
                setProfesionales(profs);
            } catch (error) {
                console.error("Error fetching professionals:", error);
            }
        };
        fetchProfs();
    }, [viewingUid, catalogOwnerUid]);

    // Fetch Orders History
    const fetchOrdenes = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            // "Todos ven todo": ya no filtramos por userId ni por profesional vinculado
            const items = await apiService.getCollection("ordenes_internacion");

            items.sort((a, b) => {
                const dateA = a.fechaCirugia || a.createdAt;
                const dateB = b.fechaCirugia || b.createdAt;
                return new Date(dateB) - new Date(dateA);
            });
            setOrdenes(items);
        } catch (error) {
            console.error("Error fetching orders:", error);
        }
    };

    useEffect(() => {
        fetchOrdenes();
    }, [viewingUid, catalogOwnerUid]);

    // Update preview when dates change in Control tab
    useEffect(() => {
        if (activeTab === 'control' && (rangeStart || rangeEnd)) {
            const start = rangeStart ? new Date(rangeStart) : new Date(0);
            const end = rangeEnd ? new Date(rangeEnd) : new Date(8640000000000000);
            
            const filtered = ordenes.filter(o => {
                if (o.suspendida) return false;
                if (!o.fechaCirugia) return false;
                const d = new Date(o.fechaCirugia);
                return d >= start && d <= end;
            }).sort((a, b) => new Date(a.fechaCirugia) - new Date(b.fechaCirugia));
            
            setPreviewOrdenes(filtered);
        }
    }, [rangeStart, rangeEnd, ordenes, activeTab]);

    // Update document title for printing
    useEffect(() => {
        if (showPreview && previewData) {
            const originalTitle = document.title;
            let newTitle = 'Documento';
            if (previewType === 'reporte_semanal') {
                newTitle = `Control_Facturacion_${previewData.fechaInicio}_al_${previewData.fechaFin}`.replace(/\//g, '-');
            } else if (previewType === 'caratula') {
                newTitle = `Caratula_${previewData.afiliado || 'Paciente'}`;
            } else {
                newTitle = `Orden_${previewData.afiliado || 'Paciente'}`;
            }
            document.title = newTitle;
            return () => {
                document.title = originalTitle;
            };
        }
    }, [showPreview, previewData, previewType]);

    useEffect(() => {
        if (draftData) {
            const currentKey = `${draftData.id || 'new'} -${activeTab} `;
            if (lastInitializedKey.current === currentKey) return;

            // Processing draftData for robust form loading
            const processedData = { ...draftData };

            // Age compatibility
            if (!processedData.edad && draftData.edad) processedData.edad = draftData.edad;

            // Practice codes compatibility and padding
            let codigos = processedData.codigosCirugia;
            if (!codigos || !Array.isArray(codigos)) {
                codigos = processedData.codigoCirugia
                    ? [{ codigo: processedData.codigoCirugia, nombre: '' }]
                    : [{ codigo: '', nombre: '' }];
            }
            while (codigos.length < 3) {
                codigos.push({ codigo: '', nombre: '' });
            }
            processedData.codigosCirugia = codigos;

            setFormData(prev => ({
                ...prev,
                ...processedData
            }));

            if (draftData.id) {
                setEditingId(draftData.id);
            }
            setShowForm(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });

            lastInitializedKey.current = currentKey;
            onDraftConsumed();
        } else {
            lastInitializedKey.current = '';
        }
    }, [draftData, onDraftConsumed, activeTab]);

    const handleExportWeeklyExcel = async () => {
        try {
            // Dynamically import libraries to save bundle size
            const ExcelJS = (await import('exceljs')).default || await import('exceljs');
            const { saveAs } = await import('file-saver');
            const { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } = await import('date-fns');

            const now = new Date();
            const start = rangeStart ? parseISO(rangeStart) : startOfWeek(now, { weekStartsOn: 1 }); // Monday
            const end = rangeEnd ? parseISO(rangeEnd) : endOfWeek(now, { weekStartsOn: 1 }); // Sunday

            const weekOrdenes = ordenes.filter(o => {
                if (o.suspendida) return false;
                if (!o.fechaCirugia) return false;
                try {
                    const date = parseISO(o.fechaCirugia);
                    return isWithinInterval(date, { start, end });
                } catch (e) {
                    return false;
                }
            }).sort((a, b) => new Date(a.fechaCirugia) - new Date(b.fechaCirugia));

            if (weekOrdenes.length === 0) {
                alert("No hay cirugías registradas (no suspendidas) para esta semana.");
                return;
            }

            // Create workbook and worksheet
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Control Semanal');

            ws.columns = [
                { header: 'Fecha', key: 'fecha', width: 15 },
                { header: 'Paciente', key: 'paciente', width: 35 },
                { header: 'Obra Social', key: 'obraSocial', width: 25 },
                { header: 'Códigos', key: 'codigos', width: 45 },
                { header: 'Cirujano', key: 'cirujano', width: 30 },
            ];

            ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ws.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF0F766E' } // teal-700
            };

            weekOrdenes.forEach(o => {
                const codigosStr = (o.codigosCirugia || [])
                    .map(c => c.codigo)
                    .filter(Boolean)
                    .join(' - ');

                ws.addRow({
                    fecha: formatDate(o.fechaCirugia),
                    paciente: (o.afiliado || '').toUpperCase(),
                    obraSocial: (o.obraSocial || '').toUpperCase(),
                    codigos: codigosStr,
                    cirujano: shortProfName(o.profesional) || ''
                });
            });

            // Alternate row colors for readability
            ws.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: rowNumber % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } // slate-50 alternating
                    };
                }
            });

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const startDateStr = format(start, 'dd-MM-yyyy');
            const endDateStr = format(end, 'dd-MM-yyyy');
            saveAs(blob, `Control_Facturacion_${startDateStr}_al_${endDateStr}.xlsx`);

        } catch (error) {
            console.error("Error generating Excel:", error);
            alert("Hubo un error al generar el Excel. Verifica la consola para más detalles.");
        }
    };

    const handlePrintWeeklyReport = async () => {
        try {
            const { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } = await import('date-fns');

            const now = new Date();
            const start = rangeStart ? parseISO(rangeStart) : startOfWeek(now, { weekStartsOn: 1 }); // Monday
            const end = rangeEnd ? parseISO(rangeEnd) : endOfWeek(now, { weekStartsOn: 1 }); // Sunday

            const weekOrdenes = ordenes.filter(o => {
                if (o.suspendida) return false;
                if (!o.fechaCirugia) return false;
                try {
                    const date = parseISO(o.fechaCirugia);
                    return isWithinInterval(date, { start, end });
                } catch (e) {
                    return false;
                }
            }).sort((a, b) => new Date(a.fechaCirugia) - new Date(b.fechaCirugia));

            if (weekOrdenes.length === 0) {
                alert("No hay cirugías registradas (no suspendidas) en el rango seleccionado.");
                return;
            }

            setPreviewData({
                ordenesSemana: weekOrdenes,
                fechaInicio: format(start, 'dd/MM/yyyy'),
                fechaFin: format(end, 'dd/MM/yyyy')
            });
            setPreviewType('reporte_semanal');
            setShowPreview(true);
        } catch (error) {
            console.error("Error preparing print:", error);
            alert("Hubo un error al preparar el reporte.");
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleDniBlur = async (dni) => {
        if (!dni || dni.length < 7) return;
        
        try {
            const q = query(collection(db, 'pacientes'), where('dni', '==', dni));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const pacienteData = querySnapshot.docs[0].data();
                // Autofill existing form data with patient record
                setFormData(prev => ({
                    ...prev,
                    afiliado: pacienteData.nombre || prev.afiliado,
                    obraSocial: pacienteData.obraSocial || prev.obraSocial,
                    numeroAfiliado: pacienteData.numeroAfiliado || prev.numeroAfiliado,
                    telefono: pacienteData.telefono || prev.telefono,
                    edad: pacienteData.edad || prev.edad
                }));
                toast.success('Paciente encontrado: datos completados', { icon: '👤', duration: 2000 });
            }
        } catch (error) {
            console.error("Error searching patient by DNI:", error);
        }
    };

    const handleDownloadPDF = async () => {
        const typeToGen = selectedConsent || previewType;

        if (typeToGen === 'reporte_semanal') {
            const element = document.getElementById('preview-content');
            if (!element) return;
            const opt = {
                margin: 0,
                filename: `Reporte_${previewData.fechaInicio}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            const html2pdf = (await import('html2pdf.js')).default || await import('html2pdf.js');
            html2pdf().from(element).set(opt).save();
        } else if (typeToGen === 'generico') {
            const url = getConsentUrl('generico');
            if (url) window.open(url, '_blank');
        } else if (typeof typeToGen === 'object' && typeToGen !== null) {
            // It's a specific consent object {code, isMinor}
            const url = getConsentUrl('especifico', typeToGen.code, typeToGen.isMinor);
            if (url) window.open(url, '_blank');
        } else {
            setLoading(true);
            const profData = getProfesionalData(previewData.profesional);
            const enrichedData = {
                ...previewData,
                firmaUrl: getSignatureUrl(previewData.profesional),
                profesionalData: profData
            };
            await generateOrdenPDF(enrichedData, typeToGen, 'save');
            setLoading(false);
        }
    };

    const handlePrint = async () => {
        const typeToGen = selectedConsent || previewType;

        if (typeToGen === 'generico') {
            const url = getConsentUrl('generico');
            if (url) window.open(url, '_blank');
            return;
        }

        if (typeof typeToGen === 'object' && typeToGen !== null) {
            const url = getConsentUrl('especifico', typeToGen.code, typeToGen.isMinor);
            if (url) window.open(url, '_blank');
            return;
        }

        if (typeToGen === 'reporte_semanal') {
            window.print();
        } else {
            setLoading(true);
            const profData = getProfesionalData(previewData.profesional);
            const enrichedData = {
                ...previewData,
                firmaUrl: getSignatureUrl(previewData.profesional),
                profesionalData: profData
            };
            await generateOrdenPDF(enrichedData, typeToGen, 'print');
            setLoading(false);
        }
    };

    const addCodigo = () => {
        setFormData(prev => ({
            ...prev,
            codigosCirugia: [...prev.codigosCirugia, { codigo: '', nombre: '' }]
        }));
    };

    const addPracticaAnestesia = () => {
        setFormData(prev => ({
            ...prev,
            codigosCirugia: [...prev.codigosCirugia, { codigo: '', nombre: '' }]
        }));
    };

    const removeCodigo = (index) => {
        if (formData.codigosCirugia.length === 1) return;
        setFormData(prev => ({
            ...prev,
            codigosCirugia: prev.codigosCirugia.filter((_, i) => i !== index)
        }));
    };

    const resetForm = () => {
        setFormData({ ...emptyForm, profesional: linkedProfesionalName || '' });
        setEditingId(null);
        setShowForm(false);
        setSuggestions([]);
        setActiveRow(null);
        if (onClose) onClose();
    };

    const renderFormFields = () => {
        const isPedido = activeTab === 'pedidos';
        const accentColor = isPedido ? 'pink' : 'emerald';
        const ringClass = isPedido ? 'focus:ring-pink-100 focus:border-pink-500' : 'focus:ring-emerald-100 focus:border-emerald-500';
        const bgInput = 'bg-white border border-slate-300';

        return (
            <div className="space-y-4 max-w-5xl mx-auto">
                {/* Main Form Card */}
                <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-5">
                    {/* Header with Title + AI Button */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-50 dark:border-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className={`p-1.5 bg-${accentColor}-50 dark:bg-${accentColor}-900/20 rounded-lg text-${accentColor}-600 dark:text-${accentColor}-400`}>
                                {editingId ? <Edit3 size={18} /> : <Plus size={18} />}
                            </div>
                            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">
                                {editingId ? 'Editar Documento' : `Nueva ${isPedido ? 'Pedido' : 'Orden'}`}
                            </h3>
                        </div>
                        {!editingId && !isPedido && (
                            <button
                                type="button"
                                onClick={() => { setShowAIInput(!showAIInput); setAiError(''); }}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest ${showAIInput
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                                    : 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-800 hover:bg-violet-100'
                                    }`}
                            >
                                <Sparkles size={14} />
                                IA Auto-fill
                            </button>
                        )}
                    </div>

                    {/* AI Paste Area - Premium Redesign */}
                    {showAIInput && !isPedido && (
                        <div className="relative overflow-hidden animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="relative bg-slate-50 dark:bg-slate-900/50 border border-violet-100 dark:border-violet-900/30 p-5 rounded-2xl shadow-xl">
                                <div className="flex items-center justify-between mb-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                                            <Sparkles size={20} className="text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white tracking-tight uppercase">
                                                Asistente IA <span className="text-violet-500">PARSER</span>
                                            </h3>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-tighter">
                                                Pega el email de la cirugía para procesar
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-2 py-1 bg-violet-100/50 dark:bg-violet-900/30 rounded-lg border border-violet-200 dark:border-violet-800">
                                        <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
                                        <span className="text-[8px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest">Active</span>
                                    </div>
                                </div>

                                <div className="relative">
                                    <textarea
                                        value={aiInputText}
                                        onChange={(e) => setAiInputText(e.target.value)}
                                        placeholder={'Pega el texto del email aquí...'}
                                        className="w-full px-4 py-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-violet-500/50 transition-all text-xs font-mono text-slate-700 dark:text-slate-300 min-h-[120px] shadow-inner"
                                        disabled={aiLoading}
                                    />
                                </div>

                                {aiError && (
                                    <div className="mt-3 flex items-center gap-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 px-4 py-3 rounded-xl border border-red-100 dark:border-red-900/30 animate-in shake duration-500">
                                        <AlertCircle size={16} />
                                        {aiError}
                                    </div>
                                )}

                                <div className="flex items-center justify-end gap-3 mt-5">
                                    <button
                                        type="button"
                                        onClick={() => { setShowAIInput(false); setAiInputText(''); setAiError(''); }}
                                        className="px-4 py-2 text-[10px] font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-widest"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!aiInputText.trim() || aiLoading}
                                        onClick={async () => {
                                            setAiLoading(true);
                                            setAiError('');
                                            try {
                                                const result = await parseEmailToOrder(aiInputText, profesionales);
                                                setFormData(prev => {
                                                    const merged = { ...prev };
                                                    if (result.profesional) {
                                                        const signatureUrl = getSignatureUrl(result.profesional);
                                                        const extracted = result.profesional;
                                                        const normalizedExtracted = extracted.toLowerCase().replace(/^(dr\.|dra\.|lic\.|dr|dra|lic)\s+/i, '').trim();
                                                        const match = profesionales.find(p => {
                                                            const name = p.nombre.toLowerCase();
                                                            const nameWithoutPrefix = name.replace(/^(dr\.|dra\.|lic\.)\s+/i, '').trim();
                                                            return name === extracted.toLowerCase() || 
                                                                   nameWithoutPrefix === normalizedExtracted ||
                                                                   (normalizedExtracted.length > 4 && nameWithoutPrefix.includes(normalizedExtracted)) ||
                                                                   (normalizedExtracted.length > 4 && normalizedExtracted.includes(nameWithoutPrefix));
                                                        });
                                                        merged.profesional = match ? match.nombre : extracted;
                                                        merged.firmaUrl = signatureUrl;
                                                    }
                                                    if (result.afiliado) merged.afiliado = result.afiliado.toUpperCase();
                                                    if (result.obraSocial) merged.obraSocial = result.obraSocial;
                                                    if (result.numeroAfiliado) merged.numeroAfiliado = result.numeroAfiliado;
                                                    if (result.dni) merged.dni = result.dni;
                                                    if (result.edad) merged.edad = String(result.edad);
                                                    if (result.telefono) merged.telefono = result.telefono;
                                                    if (result.tutor) merged.tutor = result.tutor;
                                                    if (result.diagnostico) merged.diagnostico = result.diagnostico;
                                                    if (result.habitacion) merged.habitacion = result.habitacion;
                                                    if (result.tipoAnestesia) merged.tipoAnestesia = result.tipoAnestesia;
                                                    if (result.fechaCirugia) merged.fechaCirugia = result.fechaCirugia;
                                                    if (result.horaCirugia) merged.horaCirugia = result.horaCirugia;
                                                    if (result.salaCirugia) merged.salaCirugia = result.salaCirugia;
                                                    if (result.anotacionCalendario) merged.anotacionCalendario = result.anotacionCalendario;
                                                    if (result.codigosCirugia && result.codigosCirugia.length > 0) {
                                                        const codes = result.codigosCirugia.map(c => ({
                                                            codigo: c.codigo || '',
                                                            nombre: c.nombre || ''
                                                        }));
                                                        while (codes.length < 3) codes.push({ codigo: '', nombre: '' });
                                                        merged.codigosCirugia = codes;
                                                    }
                                                    if (result.incluyeMaterial) {
                                                        merged.incluyeMaterial = true;
                                                        merged.descripcionMaterial = result.descripcionMaterial || '';
                                                    }
                                                    return merged;
                                                });
                                                setShowAIInput(false);
                                                setAiInputText('');
                                                toast.success("¡Formulario auto-completado!");
                                            } catch (err) {
                                                console.error('AI parse error:', err);
                                                setAiError(err.message || 'Error al procesar con IA');
                                            } finally {
                                                setAiLoading(false);
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!aiInputText.trim() || aiLoading
                                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            : 'bg-violet-600 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-700 active:scale-95'
                                            }`}
                                    >
                                        {aiLoading ? (
                                            <><Loader2 size={14} className="animate-spin" /> Procesando...</>
                                        ) : (
                                            <><Sparkles size={14} /> Procesar con IA</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}


                    {/* Professional Selection */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                            <User size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Profesional
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={formData.profesional}
                                onChange={(e) => {
                                    if (linkedProfesionalName) return;
                                    handleInputChange('profesional', e.target.value);
                                    setShowProfSuggestions(true);
                                }}
                                onFocus={() => {
                                    if (!linkedProfesionalName) setShowProfSuggestions(true);
                                }}
                                disabled={!!linkedProfesionalName}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all ${ringClass} ${linkedProfesionalName ? 'bg-slate-50 dark:bg-slate-900/50 cursor-not-allowed font-bold text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}
                                placeholder="Escribe para buscar..."
                                required
                            />
                            {!linkedProfesionalName && showProfSuggestions && (
                                <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                    {profesionales
                                        .filter(p => p.nombre.toLowerCase().includes(formData.profesional.toLowerCase()))
                                        .map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    handleInputChange('profesional', p.nombre);
                                                    setShowProfSuggestions(false);
                                                }}
                                                className={`px-5 py-3.5 cursor-pointer hover:bg-${accentColor}-50 dark:hover:bg-${accentColor}-900/20 transition-colors border-b border-slate-50 dark:border-slate-700 last:border-0`}
                                            >
                                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{p.nombre}</p>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tutor (if active) */}
                    {isResidente && (
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Stethoscope size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Tutor a Cargo
                            </label>
                            <select
                                value={formData.tutor}
                                onChange={(e) => handleInputChange('tutor', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
                                required={isResidente}
                            >
                                <option value="">-- Seleccionar Tutor --</option>
                                {profesionales.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Patient Data Row 1: Afiliado | Obra Social */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <User size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Afiliado
                            </label>
                            <input
                                type="text"
                                value={formData.afiliado}
                                onChange={(e) => handleInputChange('afiliado', e.target.value.toUpperCase())}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all font-bold uppercase ${ringClass} text-slate-900 dark:text-slate-100`}
                                placeholder="APELLIDO NOMBRE"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Building2 size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Obra Social
                            </label>
                            <input
                                type="text"
                                value={formData.obraSocial}
                                onChange={(e) => handleInputChange('obraSocial', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
                                placeholder="Galeno, OSDE, etc."
                            />
                        </div>
                    </div>

                    {/* Patient Data Row 2: N Afiliado | DNI | Habitacion */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Hash size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> N° Afiliado
                            </label>
                            <input
                                type="text"
                                value={formData.numeroAfiliado}
                                onChange={(e) => handleInputChange('numeroAfiliado', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
                                placeholder="14843"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Hash size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> DNI
                            </label>
                            <input
                                type="text"
                                value={formData.dni}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    handleInputChange('dni', val);
                                }}
                                onBlur={() => handleDniBlur(formData.dni)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleDniBlur(formData.dni);
                                    }
                                }}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
                                placeholder="45836670"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Home size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Habitación
                            </label>
                            <input
                                type="text"
                                value={formData.habitacion}
                                onChange={(e) => handleInputChange('habitacion', e.target.value.toUpperCase())}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all uppercase ${ringClass} text-slate-900 dark:text-slate-100`}
                                placeholder="B, 101, etc."
                            />
                        </div>
                    </div>

                    {/* Estudio bajo anestesia toggle */}
                    <div className={`p-6 rounded-[2rem] border-2 transition-all ${formData.estudioBajoAnestesia ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/20' : 'border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30'}`}>
                        <label className="flex items-center gap-4 cursor-pointer group">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${formData.estudioBajoAnestesia ? 'bg-amber-600 text-white shadow-lg shadow-amber-200 dark:shadow-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600'}`}>
                                <Stethoscope size={18} />
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.estudioBajoAnestesia}
                                onChange={(e) => handleInputChange('estudioBajoAnestesia', e.target.checked)}
                                className="hidden"
                            />
                            <div className="flex flex-col">
                                <span className={`font-black text-sm uppercase tracking-tight transition-colors ${formData.estudioBajoAnestesia ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                                    Estudio bajo anestesia
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Cambia el título y omite códigos obligatorios</span>
                            </div>
                        </label>
                    </div>

                    {/* Codes Section */}
                    {!formData.estudioBajoAnestesia && (
                        <div className="space-y-4 pt-6 border-t border-slate-50 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                    <Hash size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Códigos de Cirugía
                                </label>
                                <button
                                    type="button"
                                    onClick={addCodigo}
                                    className={`flex items-center gap-1.5 px-4 py-1.5 bg-${accentColor}-50 dark:bg-${accentColor}-900/20 text-${accentColor}-700 dark:text-${accentColor}-400 rounded-xl text-xs font-bold hover:bg-${accentColor}-100 dark:hover:bg-${accentColor}-900/30 transition-all border border-${accentColor}-100 dark:border-${accentColor}-800`}
                                >
                                    <Plus size={14} /> Agregar
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formData.codigosCirugia.map((cod, index) => (
                                    <div key={index} className="flex gap-3 items-center group">
                                        <div className="w-32">
                                            <input
                                                type="text"
                                                value={cod.codigo}
                                                onChange={(e) => handleCodigoChangeAndSearch(index, 'codigo', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                className={`w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-sm font-mono font-bold text-teal-700 dark:text-teal-400`}
                                                placeholder="031301"
                                            />
                                        </div>
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={cod.nombre}
                                                onChange={(e) => handleCodigoChangeAndSearch(index, 'nombre', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                className={`w-full px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-sm font-medium text-slate-900 dark:text-slate-100`}
                                                placeholder="Nombre de la cirugía"
                                            />
                                            {activeRow?.index === index && suggestions.length > 0 && (
                                                <div className="absolute z-50 top-full mt-2 left-0 w-full bg-white border border-slate-100 rounded-2xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {suggestions.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectSuggestion(s, index)}
                                                            className={`px-5 py-3.5 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400">
                                                                    {s.codigo}
                                                                </span>
                                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{s.nombre}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeCodigo(index)}
                                            className="p-2.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Practice Names section if "Estudio bajo anestesia" is active */}
                    {formData.estudioBajoAnestesia && (
                        <div className="space-y-4 pt-6 border-t border-slate-50 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                    <Hash size={12} className="text-amber-500" /> Prácticas a realizar
                                </label>
                                <button
                                    type="button"
                                    onClick={addPracticaAnestesia}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all border border-amber-100 dark:border-amber-800"
                                >
                                    <Plus size={14} /> Agregar estudio
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formData.codigosCirugia.map((cod, index) => (
                                    <div key={index} className="flex gap-3 items-center group">
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={cod.nombre}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setFormData(prev => {
                                                        const newCodigos = [...prev.codigosCirugia];
                                                        newCodigos[index] = { ...newCodigos[index], nombre: val.toUpperCase() };
                                                        return { ...prev, codigosCirugia: newCodigos };
                                                    });
                                                }}
                                                className={`w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-sm font-bold uppercase text-slate-900 dark:text-slate-100`}
                                                placeholder="Ej: VIDEOFIBROLARINGOSCOPIA..."
                                            />
                                        </div>
                                        {formData.codigosCirugia.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeCodigo(index)}
                                                className="p-2.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                            >
                                                <X size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* WhatsApp */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                            <Phone size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Teléfono (WhatsApp)
                        </label>
                        <input
                            type="tel"
                            value={formData.telefono}
                            onChange={(e) => handleInputChange('telefono', e.target.value)}
                            className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
                            placeholder="3512345678 (sin 0 ni 15)"
                        />
                    </div>

                    {/* Surgery Details: Anesthesia | Date | Time */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6 border-t border-slate-50 dark:border-slate-800">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Stethoscope size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Tipo de Anestesia
                            </label>
                            <select
                                value={formData.tipoAnestesia}
                                onChange={(e) => handleInputChange('tipoAnestesia', e.target.value)}
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold text-slate-700 dark:text-slate-200 ${ringClass}`}
                            >
                                <option value="general">General</option>
                                <option value="local">Local</option>
                                <option value="regional">Regional</option>
                                <option value="sedación">Sedación</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Calendar size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Fecha Cirugía
                            </label>
                            <input
                                type="date"
                                value={formData.fechaCirugia}
                                onChange={(e) => handleInputChange('fechaCirugia', e.target.value)}
                                className={`w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all font-bold text-slate-700 dark:text-slate-200 ${ringClass}`}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Clock size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Hora
                            </label>
                            <input
                                type="time"
                                value={formData.horaCirugia}
                                onChange={(e) => handleInputChange('horaCirugia', e.target.value)}
                                className={`w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all font-black text-slate-700 dark:text-slate-200 ${ringClass}`}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Calendar size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Fecha Documento
                            </label>
                            <input
                                type="date"
                                value={formData.fechaDocumento}
                                onChange={(e) => handleInputChange('fechaDocumento', e.target.value)}
                                className={`w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all font-bold text-slate-700 dark:text-slate-200 ${ringClass}`}
                            />
                        </div>
                    </div>

                    {/* Material Section */}
                    <div className={`p-4 rounded-xl border-2 transition-all ${formData.incluyeMaterial ? 'border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-900/20' : 'border-slate-100 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-900/30'}`}>
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${formData.incluyeMaterial ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 dark:shadow-none' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600'}`}>
                                <Package size={16} />
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.incluyeMaterial}
                                onChange={(e) => handleInputChange('incluyeMaterial', e.target.checked)}
                                className="hidden"
                            />
                            <span className={`font-black text-xs uppercase tracking-tight transition-colors ${formData.incluyeMaterial ? 'text-purple-700 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                                Incluir Material
                            </span>
                        </label>

                        {formData.incluyeMaterial && (
                            <div className="mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                                <label className="block text-[10px] font-black text-purple-400 dark:text-purple-500 uppercase tracking-widest mb-1.5 ml-1">
                                    Descripción del Material
                                </label>
                                <textarea
                                    value={formData.descripcionMaterial}
                                    onChange={(e) => handleInputChange('descripcionMaterial', e.target.value)}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/50 rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/10 transition-all min-h-[100px] shadow-sm text-slate-700 dark:text-slate-200 text-sm"
                                    placeholder="Especifique materiales necesarios..."
                                />
                            </div>
                        )}
                    </div>

                    {/* Bottom Row: Diagnosis | Observations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-50 dark:border-slate-800/50">
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <ClipboardList size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Diagnóstico
                            </label>
                            <textarea
                                value={formData.diagnostico}
                                onChange={(e) => handleInputChange('diagnostico', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all min-h-[80px] ${ringClass} text-xs font-medium text-slate-700 dark:text-slate-200`}
                                placeholder="SAHOS, IVN, etc."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <StickyNote size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Anotaciones
                            </label>
                            <textarea
                                value={formData.anotacionCalendario}
                                onChange={(e) => handleInputChange('anotacionCalendario', e.target.value)}
                                className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl focus:outline-none ring-offset-0 transition-all min-h-[80px] ${ringClass} text-xs font-medium text-slate-700 dark:text-slate-200`}
                                placeholder="Notas internas..."
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-3">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-[2] py-3 bg-${accentColor}-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-${accentColor}-700 transition-all shadow-xl shadow-${accentColor}-500/20 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-50`}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <SaveIcon size={16} />
                                    Crear Documento
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const Caratula = ({ previewData, profInfo }) => {
        return (
            <div className="hidden print:flex max-w-[210mm] mx-auto bg-white p-20 flex-col items-center justify-center text-center overflow-hidden" style={{ height: '297mm', fontFamily: 'Arial, sans-serif' }}>
                <div className="space-y-8 uppercase">
                    <h2 className="text-[16pt] font-black leading-tight tracking-tighter" style={{ color: '#000' }}>
                        {previewData.afiliado}
                    </h2>

                    <div className="space-y-4 text-[12pt] font-bold" style={{ color: '#000' }}>
                        <p>DNI {previewData.dni}</p>
                        <p>{previewData.obraSocial}</p>
                        <p>{profInfo ? profInfo.nombre : previewData.profesional}</p>
                        <p>{formatDate(previewData.fechaCirugia)}</p>
                    </div>

                    <div className="mt-12 text-[11pt] font-medium" style={{ color: '#000' }}>
                        ALERGIA ({previewData.alergias || '-'})
                    </div>
                </div>
            </div>
        );
    };

    const handleCodigoChangeAndSearch = (index, field, value) => {
        // Update form state directly
        setFormData(prev => {
            const newCodigos = [...prev.codigosCirugia];
            newCodigos[index] = { ...newCodigos[index], [field]: value };
            return { ...prev, codigosCirugia: newCodigos };
        });

        // Setup autocomplete
        setActiveRow({ index, field });

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        const currentOS = field === 'obraSocial' ? value : formData.obraSocial;

        searchTimeoutRef.current = setTimeout(() => {
            handleSearch(value, field, currentOS);
        }, 300);
    };

    // Autocomplete Logic
    const handleSearch = (value, field, currentOS) => {
        try {
            if (!value || value.length < 2) {
                setSuggestions([]);
                return;
            }

            const term = value.toLowerCase();

            // IF WE ARE IN "INTERNACION"
            const os = (currentOS || formData.obraSocial || '').toLowerCase().trim();
            const isSwissMedical = os.includes('swiss') || os.includes('medical') || os.includes('sm') || os.includes('suiza');
            const isIOSFA = os.includes('iosfa');

            // Search in General Codes
            const generalMatches = (CODIGOS_CIRUGIA || []).filter(c => {
                if (field === 'codigo') {
                    return c.codigo && c.codigo.toString().startsWith(term);
                } else {
                    return c.nombre && c.nombre.toLowerCase().includes(term);
                }
            }).map(surgery => {
                // REVERSE LOOKUP: Only check for SM Modules if the patient belongs to Swiss Medical
                if ((isSwissMedical || !os) && MODULOS_SM) {
                    const parentModule = MODULOS_SM.find(m => m.incluye && m.incluye.includes(surgery.codigo));
                    if (parentModule) {
                        return { ...surgery, parentModule };
                    }
                }
                return surgery;
            });

            // Search in Swiss Medical Modules (Always searchable, but priority if Swiss Medical)
            let smMatches = [];
            if ((isSwissMedical || !os || term.startsWith('03')) && MODULOS_SM) {
                smMatches = MODULOS_SM.filter(c => {
                    if (field === 'codigo') {
                        return c.codigo && c.codigo.toString().startsWith(term);
                    } else {
                        return c.nombre && c.nombre.toLowerCase().includes(term);
                    }
                }).map(m => ({ ...m, isModule: true, nombre: `${m.nombre} (Swiss Medical)` }));
            }

            // 3. Search in IOSFA Codes (Only if IOSFA)
            let iosfaMatches = [];
            if (isIOSFA && Array.isArray(CODIGOS_IOSFA)) {
                iosfaMatches = CODIGOS_IOSFA.filter(c => {
                    const codeMatch = c.codigo && c.codigo.toString().toLowerCase().startsWith(term);
                    const cleanGeneral = c.codigoGeneral ? c.codigoGeneral.replace(/\./g, '') : '';
                    const generalCodeMatch = cleanGeneral.startsWith(term);
                    const nameMatch = c.nombre && c.nombre.toLowerCase().includes(term);
                    return codeMatch || generalCodeMatch || nameMatch;
                }).map(c => ({
                    ...c,
                    isIOSFA: true,
                    displayLabel: `${c.codigo} (${c.codigoGeneral}) - ${c.nombre}`
                }));
            }

            // 4. Search in Dynamic Mappings (Admin created)
            const dynamicMatches = Object.entries(dynamicConsents)
                .filter(([code, data]) => {
                    if (field === 'codigo') {
                        return code.startsWith(term);
                    } else {
                        return data.nombre && data.nombre.toLowerCase().includes(term);
                    }
                })
                .map(([code, data]) => ({
                    codigo: code,
                    nombre: data.nombre,
                    isDynamic: true
                }));

            // Combine: Dynamic -> IOSFA -> Modules -> General
            const combined = [...dynamicMatches, ...iosfaMatches, ...smMatches, ...generalMatches].slice(0, 15);
            setSuggestions(combined);
            setHighlightedIndex(0);
        } catch (error) {
            console.error("Auto-search error handled:", error);
            setSuggestions([]);
        }
    };

    const selectSuggestion = (suggestion, index) => {
        setFormData(prev => {
            const newCodigos = [...prev.codigosCirugia];
            
            let finalCode = suggestion.codigo;
            let finalNombre = suggestion.nombre;

            // LOGICA ESPECIAL PARA MODULOS DE SWISS MEDICAL
            // Si la sugerencia tiene un modulo padre (detectado en handleSearch)
            if (suggestion.parentModule) {
                finalCode = suggestion.parentModule.codigo;
                // Formato: MODULO X ORL - 03XXXX NOMBRE CIRUGIA
                finalNombre = `${suggestion.parentModule.nombre} - ${suggestion.codigo} ${suggestion.nombre}`;
            } else if (suggestion.isModule) {
                // Si seleccionó el módulo directamente, limpiamos el "(Swiss Medical)" del label de búsqueda
                finalNombre = suggestion.nombre.replace(' (Swiss Medical)', '');
            }

            if (activeRow.field === 'codigo') {
                newCodigos[index] = { 
                    ...newCodigos[index], 
                    codigo: finalCode, 
                    nombre: finalNombre 
                };
            } else {
                newCodigos[index] = { 
                    ...newCodigos[index], 
                    nombre: finalNombre,
                    codigo: finalCode || newCodigos[index].codigo
                };
            }
            return { ...prev, codigosCirugia: newCodigos };
        });
        setSuggestions([]);
        setActiveRow(null);
    };

    const handleKeyDown = (e, index) => {
        if (suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev + 1) % suggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            selectSuggestion(suggestions[highlightedIndex], index);
        } else if (e.key === 'Escape') {
            setSuggestions([]);
            setActiveRow(null);
        }
    };

    // Hide suggestions on click outside
    useEffect(() => {
        const handleClick = (e) => {
            if (!e.target.closest('.suggestions-container') && !e.target.closest('input')) {
                setSuggestions([]);
                setActiveRow(null);
                setShowProfSuggestions(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const handleFormKeyDown = (e) => {
        if (e.key === 'Enter') {
            const el = e.target;
            const tagName = el.tagName.toLowerCase();
            // Allow default behavior for textareas, buttons, and autocomplete items
            if (tagName === 'textarea' || tagName === 'button') return;
            if (el.closest('.suggestions-container')) return;

            e.preventDefault();
            const form = e.currentTarget;
            const elements = Array.from(form.elements).filter(el => !el.disabled && el.tabIndex !== -1 && el.type !== 'hidden');
            const index = elements.indexOf(el);
            if (index > -1 && index + 1 < elements.length) {
                elements[index + 1].focus();
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.profesional || !formData.afiliado) {
            alert("Completa al menos el profesional y el afiliado.");
            return;
        }

        setLoading(true);
        const ownerToUse = catalogOwnerUid || viewingUid;

        try {
            const cleanedCodigos = formData.codigosCirugia.filter(c => c.codigo || c.nombre);

            const orderData = {
                ...formData,
                codigosCirugia: cleanedCodigos.length > 0 ? cleanedCodigos : [{ codigo: '', nombre: '' }],
                userId: ownerToUse,
                status: isAuditoria ? 'auditada' : (formData.status || 'pendiente'),
                auditedAt: isAuditoria ? new Date().toISOString() : (formData.auditedAt || null),
                updatedAt: new Date().toISOString()
            };

            if (isTestEnv && !editingId) {
                orderData.isTest = true;
            }

            const collectionName = "ordenes_internacion";

            if (editingId) {
                if (isTestEnv) {
                    const original = ordenes.find(o => o.id === editingId);
                    if (original && !original.isTest) {
                        toast.error('No puedes editar registros de producción desde el entorno de pruebas.');
                        setLoading(false);
                        return;
                    }
                }
                await apiService.updateDocument(collectionName, editingId, orderData);
            } else {
                orderData.createdAt = new Date().toISOString();
                await apiService.addDocument(collectionName, orderData);
            }

            // --- SYNC PATIENT DATA ---
            if (orderData.dni && orderData.afiliado) {
                const patientData = {
                    dni: orderData.dni,
                    nombre: orderData.afiliado,
                    obraSocial: orderData.obraSocial,
                    numeroAfiliado: orderData.numeroAfiliado,
                    telefono: orderData.telefono,
                    email: orderData.email || '',
                    lastUpdate: new Date().toISOString()
                };
                
                // We use dni as id for patients to avoid duplicates
                try {
                    const existingPatient = await apiService.getDocument('pacientes', orderData.dni);
                    if (existingPatient) {
                        await apiService.updateDocument('pacientes', orderData.dni, patientData);
                    } else {
                        await apiService.addDocument('pacientes', { ...patientData, id: orderData.dni });
                    }
                } catch (pError) {
                    console.error("Error syncing patient:", pError);
                    // Non-blocking error for the main order saving
                }
            }

            await fetchOrdenes();
            setPreviewType(orderData.incluyeMaterial && orderData.descripcionMaterial ? 'ambas' : 'internacion');

            toast.success(editingId ? "Actualizado" : "Registrado", {
                icon: '✅',
                style: { borderRadius: '16px', background: '#333', color: '#fff' }
            });

            setPreviewData(orderData);
            setShowPreview(true);
            resetForm();

        } catch (error) {
            console.error("Error saving order:", error);
            alert("Error al guardar la orden.");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (orden) => {
        const canManageAny = isSuperAdmin || permissions?.can_edit_data;
        const canManageOwn = permissions?.can_edit_own;
        const isOwner = orden?.createdBy === currentUser?.email;

        if (!canManageAny && !(canManageOwn && isOwner)) {
            alert("No tienes permiso para editar este registro.");
            return;
        }

        // Scroll to top automatically when editing
        scrollToTop();

        let codigosCirugia = orden.codigosCirugia;
        if (!codigosCirugia || !Array.isArray(codigosCirugia)) {
            codigosCirugia = orden.codigoCirugia
                ? [{ codigo: orden.codigoCirugia, nombre: '' }]
                : [{ codigo: '', nombre: '' }];
        }

        // Ensure at least 3 rows
        while (codigosCirugia.length < 3) {
            codigosCirugia.push({ codigo: '', nombre: '' });
        }

        setFormData({
            profesional: orden.profesional || '',
            afiliado: orden.afiliado || '',
            obraSocial: orden.obraSocial || '',
            numeroAfiliado: orden.numeroAfiliado || '',
            dni: orden.dni || '',
            edad: orden.edad || '',
            telefono: orden.telefono || '',
            habitacion: orden.habitacion || '',
            tutor: orden.tutor || '',
            codigosCirugia,
            practicas: emptyForm.practicas,
            tipoAnestesia: orden.tipoAnestesia || 'general',
            fechaCirugia: orden.fechaCirugia || '',
            horaCirugia: orden.horaCirugia || '',
            salaCirugia: orden.salaCirugia || '',
            anotacionCalendario: orden.anotacionCalendario || '',
            incluyeMaterial: orden.incluyeMaterial || false,
            descripcionMaterial: orden.descripcionMaterial || '',
            diagnostico: orden.diagnostico || '',
            observaciones: orden.observaciones || '',
            suspendida: orden.suspendida || false,
            fechaDocumento: orden.fechaDocumento || new Date().toISOString().split('T')[0]
        });
        setEditingId(orden.id);
        setShowForm(true);
        scrollToTop();
    };

    const handlePreview = (orden, type = 'internacion') => {
        let codigosCirugia = orden.codigosCirugia;
        if (!codigosCirugia || !Array.isArray(codigosCirugia)) {
            codigosCirugia = orden.codigoCirugia
                ? [{ codigo: orden.codigoCirugia, nombre: '' }]
                : [];
        }
        setPreviewData({ ...orden, codigosCirugia });
        setPreviewType(type);
        setShowPreview(true);
    };

    const handleToggleStatus = async (orden) => {
        if (!canEditOrdenes) {
            alert("No tienes permiso para realizar esta acción.");
            return;
        }
        if (isTestEnv && !orden.isTest) {
            toast.error('No puedes modificar registros de producción desde el entorno de pruebas.');
            return;
        }
        const newStatus = !orden.enviada;
        const collectionName = "ordenes_internacion";

        // Optimistic update
        setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, enviada: newStatus } : o));

        try {
            await apiService.updateDocument(collectionName, orden.id, { enviada: newStatus });
        } catch (error) {
            console.error("Error updating status:", error);
            // Revert on error
            setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, enviada: !newStatus } : o));
            alert("No se pudo actualizar el estado.");
        }
    };

    const handleToggleField = async (orden, field) => {
        if (!canEditOrdenes) {
            alert("No tienes permiso para realizar esta acción.");
            return;
        }
        if (isTestEnv && !orden.isTest) {
            toast.error('No puedes modificar registros de producción desde el entorno de pruebas.');
            return;
        }
        const newValue = !orden[field];
        const collectionName = "ordenes_internacion";

        // Optimistic update
        setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, [field]: newValue } : o));

        try {
            await apiService.updateDocument(collectionName, orden.id, { [field]: newValue });
        } catch (error) {
            console.error(`Error updating ${field}: `, error);
            // Revert on error
            setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, [field]: !newValue } : o));
            alert("No se pudo actualizar. Verifica tus permisos.");
        }
    };

    const handleDelete = async (id) => {
        const item = ordenes.find(o => o.id === id);
        
        // --- ENFORCE OWN RECORDS POLICY ---
        const canManageAny = isSuperAdmin || permissions?.can_delete_data;
        const canManageOwn = permissions?.can_delete_own;
        const isOwner = item?.createdBy === currentUser?.email;

        if (!canManageAny && !(canManageOwn && isOwner)) {
            alert("No tienes permiso para eliminar este registro.");
            return;
        }

        if (isTestEnv) {
            if (item && !item.isTest) {
                toast.error('No puedes eliminar registros de producción desde el entorno de pruebas.');
                return;
            }
        }
        if (!window.confirm("¿Confirmar eliminación definitiva de este documento? No se podrá deshacer.")) return;

        setLoading(true);
        const collectionName = "ordenes_internacion";

        try {
            await apiService.deleteDocument(collectionName, id);
            setOrdenes(prev => prev.filter(o => o.id !== id));
        } catch (error) {
            console.error("Error deleting order:", error);
            alert(`Error al eliminar: ${error.message || 'Permiso denegado.'} `);
        } finally {
            setLoading(false);
        }
    };



    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const formatLongDate = (dateStr) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return `${parseInt(d, 10)} de ${months[parseInt(m, 10) - 1]} de ${y}`;
    };

    const getSignatureUrl = (profesionalName) => {
        if (!profesionalName) return '';

        // 0. Check professional data from Firestore first
        const profData = getProfesionalData(profesionalName);
        if (profData.firmaUrl) return profData.firmaUrl;
        if (profData.firma) return profData.firma;

        // 1. Try dynamic signatures from Firestore state (storageFiles)
        const sigFile = storageFiles.find(f => {
            if (f.type !== 'signature') return false;
            
            const profClean = profesionalName.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, '');
            
            // Match by name in DB
            if (f.name) {
                const nameClean = f.name.toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]/g, '');
                if (profClean.includes(nameClean) || nameClean.includes(profClean)) return true;
            }

            // Match by filename/url
            if (f.url) {
                const urlParts = f.url.split('/');
                const filename = urlParts[urlParts.length - 1].toLowerCase().replace(/\.[^/.]+$/, "");
                const fileClean = filename.replace(/_/g, '');
                if (profClean.includes(fileClean) || fileClean.includes(profClean)) return true;
            }

            return false;
        });

        if (sigFile) return sigFile.url;

        // 2. Try direct map match
        if (FIRMAS_MAP[profesionalName]) return `/firmas/${FIRMAS_MAP[profesionalName]}`;

        // 3. Fallback logic
        const cleanName = profesionalName
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9 ]/g, '')
            .trim();

        const parts = cleanName.split(/\s+/);
        let filename = cleanName.replace(/\s+/g, '_');

        const prefixes = ['dr', 'dra', 'lic'];
        if (parts.length >= 2 && prefixes.includes(parts[0])) {
            const shorthand = `${parts[0]}_${parts[1]}`;
            const knownFiles = [
                'dr_bruera', 'dr_curet', 'dr_hernandorena', 'dr_hoyos', 'dr_jasin',
                'dr_paredes', 'dr_romero_orellano', 'dr_zernotti',
                'dra_carranza', 'dra_romani', 'dra_valeriani', 'dra_venier', 'dra_zalazar'
            ];
            if (knownFiles.includes(shorthand)) {
                filename = shorthand;
            } else if (shorthand.includes('romero') && knownFiles.includes('dr_romero_orellano')) {
                filename = 'dr_romero_orellano';
            }
        }

        return `/firmas/${filename}.png`;
    };

    // Returns the Firebase Storage URL for a given consent selection
    const getConsentUrl = (type, surgeryCode = null, isMinor = false) => {
        if (type === 'generico') {
            // Generic: first PDF in the library that matches 'genérico' or 'generico' in name
            const genericPdf = Object.values(consentPdfs).find(p =>
                p.nombre.toLowerCase().includes('gen')
            );
            return genericPdf?.url || null;
        }
        if (type === 'especifico' && surgeryCode) {
            const consent = dynamicConsents[surgeryCode];
            if (consent) {
                return isMinor ? (consent.menor || consent.adulto) : (consent.adulto || consent.menor);
            }
        }
        return null;
    };


    const getProfesionalData = (profesionalName) => {
        return allProfesionales.find(p => p.nombre === profesionalName) || {};
    };

    // Get applicable consents based on order codes
    // Get applicable consents based on order codes
    const getApplicableConsents = (orden) => {
        if (!orden?.codigosCirugia) return [];
        const consents = [];
        const addedNames = new Set();

        // Resolve effective codes for each order item
        const resolvedCodes = orden.codigosCirugia.map(item => {
            if (!item.codigo) return null;

            // 1. BUSCAR CÓDIGO DE 6 DÍGITOS EN EL NOMBRE (Prioridad absoluta para Swiss Medical y otros)
            // Cuando elegimos una cirugía de un módulo, el nombre queda como "MODULO X - 03XXXX CIRUGIA"
            if (item.nombre) {
                const codeMatch = item.nombre.match(/\b(03\d{4})\b/);
                const extractedCode = codeMatch ? codeMatch[1] : null;
                
                if (extractedCode && (dynamicConsents[extractedCode] || CONSENTIMIENTOS_MAP[extractedCode])) {
                    return extractedCode;
                }
            }

            // 2. Coincidencia directa (si el código ya es de 6 dígitos o si hay un mapeo específico para el módulo)
            if (dynamicConsents[item.codigo] || CONSENTIMIENTOS_MAP[item.codigo]) return item.codigo;

            // 3. Búsqueda en IOSFA (fallback)
            const iosfaMatch = CODIGOS_IOSFA.find(c => c.codigo === item.codigo);
            if (iosfaMatch && (dynamicConsents[iosfaMatch.codigoGeneral] || CONSENTIMIENTOS_MAP[iosfaMatch.codigoGeneral])) {
                return iosfaMatch.codigoGeneral;
            }

            return item.codigo;
        }).filter(Boolean);

        const usedCodes = new Set();
        const normalizedResolved = resolvedCodes.map(c => String(c).trim().toLowerCase());

        // 1. Check for DYNAMIC COMBO consents (keys like "030202 + 030207" in Firestore)
        Object.entries(dynamicConsents).forEach(([keyCode, data]) => {
            if (keyCode.includes('+')) {
                const requiredCodes = keyCode.split('+').map(c => c.trim().toLowerCase());
                const hasAllCodes = requiredCodes.every(code => normalizedResolved.includes(code));
                
                if (hasAllCodes && !addedNames.has(data.nombre)) {
                    // Check if it has at least one PDF assigned
                    if (data.adulto || data.menor) {
                        addedNames.add(data.nombre);
                        consents.push({ ...data, code: keyCode });
                        requiredCodes.forEach(code => usedCodes.add(code));
                    }
                }
            }
        });

        // 2. Check for STATIC COMBO consents
        CONSENTIMIENTOS_COMBO.forEach(combo => {
            const comboCodes = combo.codigos.map(c => String(c).trim().toLowerCase());
            const hasAllCodes = comboCodes.every(code => normalizedResolved.includes(code));
            if (hasAllCodes && !addedNames.has(combo.nombre)) {
                addedNames.add(combo.nombre);
                consents.push(combo);
                comboCodes.forEach(code => usedCodes.add(code));
            }
        });

        // Then check individual consents
        resolvedCodes.forEach(code => {
            const consent = dynamicConsents[code] || CONSENTIMIENTOS_MAP[code];
            if (consent && !usedCodes.has(code)) {
                if ((consent.adulto || consent.menor) && !addedNames.has(consent.nombre)) {
                    addedNames.add(consent.nombre);
                    consents.push({ ...consent, code }); // Keep the code for the UI
                }
            }
        });
        // 4. ORDEN ALFABÉTICO FINAL
        return consents.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    };

    // Open consent PDF(s) for printing — uses Firebase Storage URLs
    const handlePrintConsents = (orden) => {
        const consents = getApplicableConsents(orden);
        if (consents.length === 0) {
            alert("No se encontraron consentimientos específicos para estos códigos.");
            return;
        }
        consents.forEach(consent => {
            const url = orden.edad < 18 ? (consent.menor || consent.adulto) : (consent.adulto || consent.menor);
            if (url) window.open(url, '_blank');
        });
    };


    const renderPrintContent = (type) => {
        // Handle Reporte Semanal
        if (type === 'reporte_semanal') {
            return (
                <div className="max-w-[210mm] mx-auto bg-white px-8 py-10 print:max-w-none print:px-0" style={{ minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
                    <div className="mb-6 text-center">
                        <h1 className="text-xl font-bold uppercase mb-2">Control de Facturación - Cirugías</h1>
                        <p className="text-sm text-slate-600 font-medium">Semana del {previewData.fechaInicio} al {previewData.fechaFin}</p>
                    </div>

                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-teal-700 text-white !print:bg-teal-700 !print:text-white" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                <th className="border border-slate-300 p-2 text-left w-[12%]">Fecha</th>
                                <th className="border border-slate-300 p-2 text-left w-[28%]">Paciente</th>
                                <th className="border border-slate-300 p-2 text-left w-[20%]">Obra Social</th>
                                <th className="border border-slate-300 p-2 text-left w-[20%]">Códigos</th>
                                <th className="border border-slate-300 p-2 text-left w-[20%]">Cirujano</th>
                            </tr>
                        </thead>
                        <tbody>
                            {previewData.ordenesSemana?.map((o, idx) => {
                                const codigosStr = (o.codigosCirugia || [])
                                    .map(c => c.codigo)
                                    .filter(Boolean)
                                    .join(' - ');
                                return (
                                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50 !print:bg-slate-50"} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                        <td className="border border-slate-300 p-2 text-center text-[10px]">{formatDate(o.fechaCirugia)}</td>
                                        <td className="border border-slate-300 p-2 font-bold text-[10px]">{(o.afiliado || '').toUpperCase()}</td>
                                        <td className="border border-slate-300 p-2 text-[10px]">{(o.obraSocial || '').toUpperCase()}</td>
                                        <td className="border border-slate-300 p-2 text-center font-mono">{codigosStr}</td>
                                        <td className="border border-slate-300 p-2">{shortProfName(o.profesional)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            );
        }

        // Handle Carátula
        if (type === 'caratula') {
            return (
                <div className="max-w-[210mm] mx-auto bg-white flex flex-col items-center justify-start text-center overflow-hidden" 
                     style={{ 
                        height: '297mm', 
                        width: '210mm',
                        fontFamily: 'Arial, sans-serif', 
                        boxSizing: 'border-box',
                        position: 'relative',
                        color: '#000',
                        lineHeight: '1.2',
                        paddingTop: '4.5cm'
                     }}>
                    {previewData.habitacion && (
                        <div style={{ position: 'absolute', top: '1cm', right: '2cm', fontSize: '18pt' }}>
                            {previewData.habitacion}
                        </div>
                    )}
                    <div className="space-y-1">
                        <span style={{ fontSize: '24pt', display: 'block' }}>{(previewData.afiliado || '').toUpperCase()}</span>
                        <span style={{ fontSize: '24pt', display: 'block' }}>DNI {previewData.dni || '-'}</span>
                        <span style={{ fontSize: '24pt', display: 'block' }}>{(previewData.obraSocial || '').toUpperCase()}</span>
                        <span style={{ fontSize: '24pt', display: 'block' }}>{(shortProfName(previewData.profesional) || '').toUpperCase()}</span>
                        <span style={{ fontSize: '24pt', display: 'block' }}>{formatDate(previewData.fechaCirugia || previewData.fechaDocumento)}</span>
                        <span style={{ fontSize: '24pt', display: 'block' }}>ALERGIA ({previewData.alergias?.toUpperCase() || '-'})</span>
                    </div>
                </div>
            );
        }

        // Handle Pedido Médico
        if (type === 'pedido') {
            return (
                <div className="max-w-[210mm] mx-auto bg-white px-16 py-12 overflow-hidden" 
                     style={{ 
                        height: '297mm', 
                        width: '210mm',
                        boxSizing: 'border-box', 
                        fontFamily: 'Arial, sans-serif',
                        position: 'relative'
                     }}>

                    {/* Header: Logo and Date */}
                    <div className="mb-12 text-center flex justify-between items-center px-4">
                        <img
                            src="/coat_logo.png"
                            alt="COAT"
                            className="h-20 object-contain"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <p className="text-[11pt]" style={{ color: '#000' }}>
                            Córdoba, {formatLongDate(previewData.fechaDocumento)}
                        </p>
                    </div>

                    {/* Patient Info */}
                    <div className="space-y-4 mb-16 px-4" style={{ color: '#000', fontSize: '11pt' }}>
                        <p><span className="font-bold">PACIENTE:</span> {previewData.afiliado?.toUpperCase()}</p>
                        <p><span className="font-bold">OBRA SOCIAL:</span> {previewData.obraSocial?.toUpperCase()}</p>
                        <p><span className="font-bold">Nº DE AF:</span> {previewData.numeroAfiliado}</p>
                        <p><span className="font-bold">DIAGNÓSTICO:</span> {previewData.diagnostico?.toUpperCase()}</p>
                    </div>

                    {/* Body: Practices */}
                    <div className="mb-12 px-4">
                        <h3 className="text-[12pt] font-bold underline mb-6">Rp/</h3>
                        <div className="space-y-3 uppercase" style={{ fontSize: '11pt' }}>
                            {previewData.practicas && previewData.practicas.map((p, idx) => (
                                p && <p key={idx} className="font-bold tracking-tight">{p}</p>
                            ))}
                        </div>
                    </div>

                    {/* Footer: Signature at bottom right */}
                    <div className="absolute bottom-24 right-16 text-center">
                        <div className="flex flex-col items-center">
                            <img
                                src={getSignatureUrl(previewData.profesional)}
                                alt={`Firma`}
                                className="h-28 object-contain mb-1"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <div className="text-[8pt] font-black uppercase leading-tight" style={{fontFamily: '"Arial Black", Arial, sans-serif'}}>
                                <p>{previewData.profesional}</p>
                                <p>{getProfesionalData(previewData.profesional).especialidad || 'Médico'}</p>
                                <p>
                                    MP {getProfesionalData(previewData.profesional).mp || '—'}
                                    {getProfesionalData(previewData.profesional).me && ` - ME ${getProfesionalData(previewData.profesional).me}`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Handle Default (Internacion / Material)
        const isInternacion = type === 'internacion';
        const isEstudio = previewData.estudioBajoAnestesia;
        const title = isInternacion
            ? (isEstudio ? 'PEDIDO DE ESTUDIO BAJO ANESTESIA' : 'ORDEN DE INTERNACIÓN')
            : 'ORDEN DE PEDIDO DE MATERIAL';

        return (
            <div className="max-w-[210mm] mx-auto bg-white px-16 py-12 overflow-hidden" 
                 style={{ 
                    height: '297mm', 
                    width: '210mm',
                    boxSizing: 'border-box', 
                    fontFamily: 'Arial, sans-serif',
                    position: 'relative'
                }}>
                <div className="mb-4">
                    <img
                        src="/coat_logo.png"
                        alt="COAT"
                        className="h-16 object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <p className="text-[11pt] text-right -mt-4" style={{ color: '#000' }}>
                        Córdoba, {formatLongDate(previewData.fechaDocumento)}
                    </p>
                </div>

                <h1 className="text-center text-[12pt] font-bold mb-10 tracking-wide uppercase" style={{ color: '#000' }}>
                    {title}
                </h1>

                <div className="space-y-3 text-[11pt] leading-relaxed" style={{ color: '#000' }}>
                    <p><span className="font-bold">Afiliado:</span> {previewData.afiliado?.toUpperCase()}</p>
                    <p><span className="font-bold">Obra social:</span> {previewData.obraSocial?.toUpperCase()}</p>
                    <p><span className="font-bold">Número de afiliado:</span> {previewData.numeroAfiliado}</p>
                    {previewData.dni && <p><span className="font-bold">DNI:</span> {previewData.dni}</p>}

                    {isInternacion ? (
                        <div className="pt-2 flex gap-2">
                            <span className="font-bold shrink-0">{isEstudio ? 'Estudio a realizar:' : 'Códigos de cirugía:'}</span>
                            {previewData.codigosCirugia && previewData.codigosCirugia.length > 0 ? (
                                <div className="space-y-0.5">
                                    {previewData.codigosCirugia.map((cod, idx) => (
                                        <p key={idx} className="leading-tight">{isEstudio ? '' : cod.codigo}{cod.nombre ? ` ${cod.nombre.toUpperCase()} ` : ''}</p>
                                    ))}
                                </div>
                            ) : <span className="">-</span>}
                        </div>
                    ) : (
                        <p className="pt-2 whitespace-pre-wrap">{previewData.descripcionMaterial}</p>
                    )}

                    <p className="pt-2"><span className="font-bold">Tipo de anestesia:</span> {previewData.tipoAnestesia}</p>
                    <p className="pt-2"><span className="font-bold">Fecha de cirugía:</span> {formatDate(previewData.fechaCirugia)}</p>
                    
                    {isInternacion && <p className="pt-2"><span className="font-bold">Material:</span> {previewData.incluyeMaterial ? 'si' : 'no'}</p>}
                    
                    <p className="pt-2"><span className="font-bold">Diagnóstico:</span> {previewData.diagnostico}</p>
                </div>

                {/* Footer: Signature at bottom right */}
                <div className="absolute bottom-24 right-16 text-center">
                    <div className="flex flex-col items-center">
                        <img
                            src={getSignatureUrl(previewData.profesional)}
                            alt={`Firma`}
                            className="h-28 object-contain mb-1"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div className="text-[8pt] font-black uppercase leading-tight" style={{fontFamily: '"Arial Black", Arial, sans-serif'}}>
                            <p>{previewData.profesional}</p>
                            <p>{getProfesionalData(previewData.profesional).especialidad || 'Médico'}</p>
                            <p>
                                MP {getProfesionalData(previewData.profesional).mp || '—'}
                                {getProfesionalData(previewData.profesional).me && ` - ME ${getProfesionalData(previewData.profesional).me}`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };



    const renderSelectedConsent = () => {
        if (!selectedConsent) return null;
        
        // Caratula is generated by code, not a PDF
        if (selectedConsent === 'caratula') {
            return renderPrintContent('caratula');
        }

        let url = '';
        if (selectedConsent === 'generico') url = getConsentUrl('generico');
        else url = getConsentUrl('especifico', selectedConsent.code, selectedConsent.isMinor);

        if (!url) return (
            <div className="w-[210mm] h-[297mm] mx-auto bg-white shadow-2xl flex items-center justify-center">
                <div className="text-center p-10 border-2 border-dashed border-slate-200 rounded-3xl">
                    <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Documento no disponible</p>
                    <p className="text-[10px] text-slate-400 mt-2">No se encontró el archivo PDF para este consentimiento</p>
                </div>
            </div>
        );

        return (
            <div className="w-[210mm] h-[297mm] mx-auto bg-white shadow-2xl overflow-hidden">
                <iframe 
                    src={`${url}#toolbar=0&navpanes=0&scrollbar=0`} 
                    className="w-full h-full border-none" 
                    title="Consentimiento" 
                    onError={(e) => console.error("Iframe error:", e)}
                />
            </div>
        );
    };

    if (!canViewOrdenes) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center text-slate-400">
                    <FileText size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No tienes acceso a esta sección.</p>
                </div>
            </div>
        );
    }

    // Determined logic for filtered and sorted items
    const listToFilter = ordenes;

    const sortedOrdenes = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const offset = today.getTimezoneOffset();
        const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
        const todayStr = todayLocal.toISOString().split('T')[0];

        const checkUrgency = (orden) => {
            if (orden.autorizada) return false;
            const surgeryDateStr = orden.fechaCirugia || orden.fechaDocumento;
            if (!surgeryDateStr) return false;
            const surgDate = new Date(surgeryDateStr);
            surgDate.setHours(0, 0, 0, 0);
            const diffTime = surgDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 15;
        };

        const filtered = listToFilter.filter(orden => {
            // IF CONTROL TAB: Only filter by range
            if (activeTab === 'control') {
                if (orden.suspendida) return false;
                if (!orden.fechaCirugia) return false;
                
                const surgDate = orden.fechaCirugia;
                const start = rangeStart || '0000-00-00';
                const end = rangeEnd || '9999-99-99';
                
                const matchRange = surgDate >= start && surgDate <= end;
                const matchPaciente = !searchPaciente || orden.afiliado?.toLowerCase().includes(searchPaciente.toLowerCase());
                
                return matchRange && matchPaciente;
            }

            // IF INTERNACION TAB: Full filters
            const matchProfesional = !filterProfesional || orden.profesional === filterProfesional;
            const matchObraSocial = !filterObraSocial || (orden.obraSocial?.trim().toUpperCase() === filterObraSocial.toUpperCase());
            const matchDate = !filterDate || orden.fechaCirugia === filterDate;
            const matchStatus = !filterStatus || (
                filterStatus === 'enviadas' ? (orden.enviada && !orden.suspendida) :
                    (!orden.enviada && !orden.suspendida)
            );
            const matchAudit = !filterAudit || (
                filterAudit === 'auditadas' ? orden.status === 'auditada' :
                    filterAudit === 'pendientes' ? orden.status !== 'auditada' : true
            );
            const matchPaciente = !searchPaciente || orden.afiliado?.toLowerCase().includes(searchPaciente.toLowerCase());

            const targetDateStr = orden.fechaCirugia || orden.fechaDocumento;
            let matchPeriodo = true;
            if (targetDateStr && filterPeriodo !== 'todas') {
                if (filterPeriodo === 'proximas') {
                    matchPeriodo = targetDateStr >= todayStr && !orden.suspendida;
                } else if (filterPeriodo === 'realizadas') {
                    matchPeriodo = targetDateStr < todayStr && !orden.suspendida;
                } else if (filterPeriodo === 'suspendidas') {
                    matchPeriodo = orden.suspendida;
                }
            } else if (filterPeriodo === 'todas') {
                matchPeriodo = true;
            } else if (!targetDateStr && filterPeriodo !== 'todas') {
                matchPeriodo = false;
            }

            return matchProfesional && matchObraSocial && matchDate && matchStatus && matchAudit && matchPaciente && matchPeriodo;
        });

        return filtered.sort((a, b) => {
            const urgentA = checkUrgency(a);
            const urgentB = checkUrgency(b);
            
            // Prioridad 1: Urgentes primero
            if (urgentA && !urgentB) return -1;
            if (!urgentA && urgentB) return 1;

            // Prioridad 2: Fecha (más recientes primero)
            const dateA = a.fechaCirugia || a.createdAt || a.fechaDocumento;
            const dateB = b.fechaCirugia || b.createdAt || b.fechaDocumento;
            return new Date(dateB) - new Date(dateA);
        });
    }, [activeTab, ordenes, filterProfesional, filterObraSocial, filterDate, filterStatus, filterAudit, searchPaciente, filterPeriodo, rangeStart, rangeEnd]);

    const checkUrgency = (orden) => {
        if (orden.autorizada) return false;
        const surgeryDateStr = orden.fechaCirugia || orden.fechaDocumento;
        if (!surgeryDateStr) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const surgDate = new Date(surgeryDateStr);
        surgDate.setHours(0, 0, 0, 0);
        const diffTime = surgDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 15;
    };

    return (
        <>
            <div className="space-y-8">
            {/* Master Header - Rediseño Compacto */}
            <div className="relative overflow-hidden rounded-3xl shadow-xl shadow-teal-500/5">
                {/* Decorative gradients */}
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-teal-400/10 rounded-full blur-[80px]"></div>
                
                <div className="relative bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800 text-white p-5 md:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-inner group transition-all duration-500 hover:scale-105 hover:bg-white/20">
                                {activeTab === 'control' ? (
                                    <Printer size={32} className="text-white drop-shadow-md" />
                                ) : (
                                    <FileText size={32} className="text-white drop-shadow-md" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black tracking-tight drop-shadow-md">
                                    {activeTab === 'control' ? 'Control Quirúrgico' : 'Gestión de Órdenes'}
                                </h2>
                                <p className="text-teal-50/70 text-sm mt-1 font-medium tracking-wide">
                                    {activeTab === 'control' 
                                        ? 'Auditoría de facturación e impresiones semanales.' 
                                        : 'Consola central de internaciones y materiales.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="flex bg-black/20 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-xl">
                                <button
                                    onClick={() => { resetForm(); setActiveTab('internacion'); }}
                                    className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === 'internacion' ? 'bg-white text-teal-800 shadow-xl scale-105' : 'text-teal-50 hover:bg-white/10'}`}
                                >
                                    Internación
                                </button>
                                <button
                                    onClick={() => { setActiveTab('control'); }}
                                    className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === 'control' ? 'bg-white text-teal-800 shadow-xl scale-105' : 'text-teal-50 hover:bg-white/10'}`}
                                >
                                    Control
                                </button>
                            </div>

                            {activeTab === 'internacion' && canShareOrdenes && (
                                <button
                                    onClick={() => { resetForm(); setShowForm(true); }}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-white text-teal-900 rounded-xl font-black uppercase tracking-[0.15em] text-[9px] hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 shadow-md group"
                                >
                                    <Plus size={16} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-500" />
                                    Nueva Orden
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Filters / Period in Header if Control */}
                    {activeTab === 'control' && (
                        <div className="mt-8 flex flex-wrap items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="flex items-center gap-6 bg-white/10 backdrop-blur-xl px-6 py-4 rounded-2xl border border-white/20 shadow-xl">
                                <div className="flex items-center gap-4">
                                    <Calendar size={20} className="text-teal-200" />
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-teal-200 uppercase tracking-[0.1em]">Inicio</span>
                                        <input
                                            type="date"
                                            value={rangeStart}
                                            onChange={(e) => setRangeStart(e.target.value)}
                                            className="bg-transparent text-white text-sm border-0 focus:ring-0 p-0 w-[120px] cursor-pointer font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="w-px h-8 bg-white/10"></div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-teal-200 uppercase tracking-[0.1em]">Fin</span>
                                    <input
                                        type="date"
                                        value={rangeEnd}
                                        onChange={(e) => setRangeEnd(e.target.value)}
                                        className="bg-transparent text-white text-sm border-0 focus:ring-0 p-0 w-[120px] cursor-pointer font-bold"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleExportWeeklyExcel}
                                    className="flex items-center gap-3 px-6 py-3.5 bg-emerald-500/20 backdrop-blur-xl text-emerald-50 rounded-xl font-black uppercase tracking-[0.1em] text-[10px] hover:bg-emerald-500/40 transition-all border border-emerald-400/30"
                                >
                                    <TableProperties size={18} />
                                    Excel
                                </button>
                                <button
                                    onClick={handlePrintWeeklyReport}
                                    className="flex items-center gap-3 px-6 py-3.5 bg-white/10 backdrop-blur-xl text-white rounded-xl font-black uppercase tracking-[0.1em] text-[10px] hover:bg-white/20 transition-all border border-white/20"
                                >
                                    <Printer size={18} />
                                    Reporte
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {/* INLINE FORM (Opens from the top) */}
            <AnimatePresence>
                {showForm && !modalMode && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
                        exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-md border border-slate-100 dark:border-slate-800 overflow-hidden relative">
                            <button
                                onClick={resetForm}
                                className="absolute top-6 right-6 p-2 h-10 w-10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors z-10"
                            >
                                <X size={20} />
                            </button>
                            <div className="p-8">
                                <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
                                    {renderFormFields()}
                                </form>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            {modalMode ? (
                <div className="p-6 h-full flex flex-col">
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-[3.5rem] shadow-3xl overflow-hidden border border-white/20 dark:border-slate-800/50 animate-in zoom-in-95 duration-500 flex flex-col flex-1 min-h-0">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center z-10 shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                            <div className="flex items-center gap-6">
                                <div className={`w-14 h-14 rounded-[1.8rem] ${editingId ? 'bg-teal-600' : 'bg-emerald-600'} flex items-center justify-center text-white shadow-2xl shadow-teal-500/20`}>
                                    {editingId ? <Edit3 size={32} /> : <Plus size={32} />}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                        {editingId ? 'Editar Documento' : 'Nueva Orden'}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 font-medium text-lg mt-1 tracking-wide">Actualice los datos quirúrgicos con precisión.</p>
                                </div>
                            </div>
                            <button type="button" onClick={onClose} className="p-5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-all active:scale-90 hover:rotate-90">
                                <X size={32} />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-8 space-y-10">
                                {renderFormFields()}
                            </form>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative">
                    {/* Filters Dashboard - Rediseño Compacto */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-lg overflow-hidden mb-6">
                        <div className="p-5">
                            <div className="flex flex-wrap items-center justify-between gap-6">
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-6 bg-teal-500 rounded-full"></div>
                                        <h3 className="font-black text-lg text-slate-900 dark:text-slate-100 tracking-tight">Historial</h3>
                                    </div>
                                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all font-black text-[10px] uppercase tracking-[0.1em] ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-teal-700 shadow-sm' : 'text-slate-400'}`}
                                        >
                                            <List size={14} /> Lista
                                        </button>
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all font-black text-[10px] uppercase tracking-[0.1em] ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-teal-700 shadow-sm' : 'text-slate-400'}`}
                                        >
                                            <LayoutGrid size={14} /> Grid
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                    {/* Advanced Search Bar */}
                                    <div className="relative group/search">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Search size={16} className="text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Paciente o DNI..."
                                            value={searchPaciente}
                                            onChange={(e) => setSearchPaciente(e.target.value)}
                                            className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-teal-500/5 transition-all w-64 shadow-inner"
                                        />
                                    </div>

                                    {activeTab === 'internacion' && (
                                        <div className="flex items-center gap-3">
                                            <select
                                                value={filterPeriodo}
                                                onChange={(e) => setFilterPeriodo(e.target.value)}
                                                className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 focus:outline-none transition-all shadow-inner"
                                            >
                                                <option value="proximas">Próximas</option>
                                                <option value="realizadas">Historial</option>
                                                <option value="suspendidas">Canceladas</option>
                                                <option value="todas">Todas</option>
                                            </select>
                                            
                                            <button 
                                                onClick={() => { setFilterDate(''); setFilterProfesional(''); setFilterObraSocial(''); setFilterStatus(''); setFilterAudit(''); setSearchPaciente(''); }}
                                                className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl hover:text-teal-600 border border-slate-200 dark:border-slate-700"
                                                title="Limpiar filtros"
                                            >
                                                <Filter size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Secondary Filters Grid */}
                            {activeTab === 'internacion' && (
                                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-in fade-in slide-in-from-top-2 duration-500">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">Profesional</label>
                                        <select
                                            value={filterProfesional}
                                            onChange={(e) => setFilterProfesional(e.target.value)}
                                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                                        >
                                            <option value="">Todos</option>
                                            {profesionales.map(p => (
                                                <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">Obra Social</label>
                                        <select
                                            value={filterObraSocial}
                                            onChange={(e) => setFilterObraSocial(e.target.value)}
                                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                                        >
                                            <option value="">Todas</option>
                                            {[...new Set(listToFilter.map(o => o.obraSocial?.trim().toUpperCase()).filter(Boolean))].sort().map(os => (
                                                <option key={os} value={os}>{os}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">Envío</label>
                                        <select
                                            value={filterStatus}
                                            onChange={(e) => setFilterStatus(e.target.value)}
                                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                                        >
                                            <option value="">Todos</option>
                                            <option value="pendientes">Pendientes</option>
                                            <option value="enviadas">Enviadas</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">Auditoría</label>
                                        <select
                                            value={filterAudit}
                                            onChange={(e) => setFilterAudit(e.target.value)}
                                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none"
                                        >
                                            <option value="">Todas</option>
                                            <option value="pendientes">Pendientes</option>
                                            <option value="auditadas">Auditadas</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-3">Fecha</label>
                                        <input
                                            type="date"
                                            value={filterDate}
                                            onChange={(e) => setFilterDate(e.target.value)}
                                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    {sortedOrdenes.length === 0 ? (
                        <div className="p-20 text-center bg-white dark:bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-500">
                            <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                                <ClipboardList size={40} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Sin registros</h3>
                            <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto">
                                {listToFilter.length === 0 ? 'No hay documentos creados aún en esta sección.' : 'No se encontraron documentos que coincidan con los filtros aplicados.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className={viewMode === 'list' ? "space-y-3 px-2 pb-6" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4"}>
                            {sortedOrdenes.slice(0, visibleCount).map(orden => {
                                    const isUrgent = checkUrgency(orden);
                                    if (viewMode === 'list') {
                                        return (
                                            <div
                                                key={orden.id}
                                                className={`group relative flex items-center justify-between p-2.5 rounded-xl transition-all duration-300 border ${orden.suspendida ? 'bg-slate-100/50 dark:bg-slate-800/30 opacity-60 grayscale border-slate-200 dark:border-slate-700' :
                                                    orden.enviada ? 'bg-slate-50/80 dark:bg-slate-900/40 opacity-80 border-slate-100 dark:border-slate-800' :
                                                        isUrgent ? 'bg-white dark:bg-slate-900 border-red-200 dark:border-red-900 shadow-sm shadow-red-500/5' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-lg'
                                                    } `}
                                            >
                                                {isUrgent && !orden.suspendida && (
                                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-red-500 rounded-r-full"></div>
                                                )}
                                                
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${orden.suspendida ? 'bg-slate-200 text-slate-500' : (isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : (orden.enviada ? 'bg-emerald-100 text-emerald-600' : 'bg-teal-100 text-teal-600'))}`}>
                                                        {orden.suspendida ? <Ban size={20} /> : (isUrgent ? <AlertCircle size={20} className="animate-pulse" /> : (orden.enviada ? <CheckCircle2 size={20} /> : <FileText size={20} />))}
                                                    </div>
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <h4 className={`text-sm font-black truncate tracking-tight ${orden.suspendida ? 'text-slate-400 line-through' : (orden.enviada ? 'text-slate-500' : 'text-slate-900 dark:text-white')}`}>
                                                                {orden.afiliado?.toUpperCase()} 
                                                                <span className="ml-3 text-[10px] text-slate-400 dark:text-slate-500 font-bold tracking-normal">DNI: {orden.dni || 'S/D'}</span>
                                                            </h4>
                                                            <div className="flex gap-1.5">
                                                                {isUrgent && !orden.suspendida && (
                                                                    <span className="px-2 py-0.5 bg-red-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full">Urgente</span>
                                                                )}
                                                                {orden.autorizada ? (
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleToggleField(orden, 'autorizada'); }}
                                                                        className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full flex items-center gap-1 hover:bg-emerald-600 transition-all shadow-sm"
                                                                        title="Hacer click para desmarcar como autorizada"
                                                                    >
                                                                        <ShieldCheck size={10} /> Autorizada
                                                                    </button>
                                                                ) : (
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleToggleField(orden, 'autorizada'); }}
                                                                        className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 text-[8px] font-black uppercase tracking-widest rounded-full hover:bg-teal-500 hover:text-white transition-all border border-slate-200 dark:border-slate-700"
                                                                    >
                                                                        Autorizar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                            <span className="flex items-center gap-1.5">
                                                                <User size={12} className="text-slate-300" />
                                                                {orden.profesional}
                                                            </span>
                                                            <span className="flex items-center gap-1.5 font-bold text-teal-600 dark:text-teal-400 uppercase">
                                                                <Building2 size={12} className="opacity-50" />
                                                                {orden.obraSocial?.toUpperCase()}
                                                            </span>
                                                            <span className="flex items-center gap-1.5">
                                                                <Calendar size={12} className="text-slate-300" />
                                                                {formatDate(orden.fechaCirugia || orden.fechaDocumento)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 ml-4">
                                                    <div className="flex items-center bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                                        {/* Acción: Marcar como Enviada */}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleToggleField(orden, 'enviada'); }} 
                                                            className={`p-2 rounded-lg transition-all ${orden.enviada ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'text-slate-400 hover:text-emerald-500'}`}
                                                            title={orden.enviada ? 'Marcada como enviada' : 'Marcar como enviada'}
                                                        >
                                                            <CheckCircle2 size={16} />
                                                        </button>

                                                        {/* Acción: Suspender */}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleToggleField(orden, 'suspendida'); }} 
                                                            className={`p-2 rounded-lg transition-all ${orden.suspendida ? 'text-rose-500 bg-rose-50 dark:bg-rose-950/30' : 'text-slate-400 hover:text-rose-500'}`}
                                                            title={orden.suspendida ? 'Cirugía suspendida' : 'Suspender cirugía'}
                                                        >
                                                            <Ban size={16} />
                                                        </button>

                                                        <div className="w-px h-4 bg-slate-200 dark:border-slate-700 mx-1"></div>

                                                        <button onClick={() => handlePreview(orden, 'internacion')} className="p-2 text-slate-400 hover:text-teal-600 rounded-lg transition-all" title="Imprimir"><Printer size={16} /></button>
                                                        <button onClick={() => handleEdit(orden)} className="p-2 text-slate-400 hover:text-amber-600 rounded-lg transition-all" title="Editar"><Edit3 size={16} /></button>
                                                        {orden.telefono && (
                                                            <button onClick={() => setWhatsappModal(orden)} className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg transition-all" title="WhatsApp"><MessageCircle size={16} /></button>
                                                        )}
                                                        <div className="w-px h-4 bg-slate-200 dark:border-slate-700 mx-1"></div>
                                                        <button onClick={() => handleDelete(orden.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition-all" title="Eliminar"><Trash2 size={16} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }                                        // GRID VIEW - Rediseño Compacto
                                    return (
                                        <div
                                            key={orden.id}
                                            className={`group relative bg-white dark:bg-slate-900 rounded-2xl border p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-xl ${orden.suspendida ? 'opacity-60 grayscale border-slate-200 dark:border-slate-800' :
                                                orden.enviada ? 'opacity-80 border-slate-100 dark:border-slate-800' :
                                                    isUrgent ? 'border-red-100 dark:border-red-900 shadow-md shadow-red-500/5' : 'border-slate-100 dark:border-slate-800'
                                                } `}
                                        >
                                            {isUrgent && !orden.suspendida && (
                                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-xl flex items-center justify-center shadow-lg animate-bounce z-10">
                                                    <AlertCircle size={16} />
                                                </div>
                                            )}

                                            <div>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md transition-transform duration-300 group-hover:rotate-3 ${isUrgent ? 'bg-red-100 text-red-600' :
                                                        activeTab === 'pedidos' ? 'bg-pink-100 text-pink-600' : (orden.incluyeMaterial ? 'bg-violet-100 text-violet-600' : 'bg-teal-100 text-teal-600')
                                                        } `}>
                                                        {isUrgent ? <AlertCircle size={24} /> : (orden.enviada ? <CheckCircle2 size={24} /> : (orden.incluyeMaterial ? <FileStack size={24} /> : <FileText size={24} />))}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1.5">
                                                        {orden.status === 'aprobada' ? (
                                                            <span className="px-2 py-1 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-lg">Aprobada</span>
                                                        ) : (
                                                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${orden.enviada ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-amber-500 text-white border-amber-600'}`}>
                                                                {orden.enviada ? 'Enviada' : 'Pendiente'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <h4 className={`text-base font-black mb-4 tracking-tight line-clamp-2 uppercase ${orden.enviada ? 'text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                                    {orden.afiliado?.toUpperCase()}
                                                </h4>

                                                <div className="grid grid-cols-2 gap-2 mt-4">
                                                    <div className="flex items-center gap-3 text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                                        <User size={12} className="text-slate-300" />
                                                        <span className="truncate">{shortProfName(orden.profesional)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                                        <Calendar size={12} className="text-slate-300" />
                                                        <span>{formatDate(orden.fechaCirugia || orden.fechaDocumento)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                                        <Hash size={12} className="text-slate-300" />
                                                        <span>{orden.dni || 'S/D'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 p-2 rounded-xl border border-teal-100 dark:border-teal-900/30">
                                                        <Building2 size={12} className="opacity-50" />
                                                        <span className="truncate uppercase">{orden.obraSocial?.toUpperCase()}</span>
                                                    </div>
                                                    {orden.telefono && (
                                                        <div className="col-span-2 flex items-center gap-3 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                                                            <MessageCircle size={12} className="opacity-50" />
                                                            <span>WhatsApp: {orden.telefono}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {orden.observaciones && (
                                                    <div className="mt-4 p-3 bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-amber-400 text-[10px] text-amber-800 dark:text-amber-300 font-medium rounded-lg italic">
                                                        {orden.observaciones}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => handlePreview(orden, 'internacion')} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-teal-600 rounded-xl transition-all border border-transparent"><Printer size={18} /></button>
                                                    <button onClick={() => handleEdit(orden)} className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-amber-600 rounded-xl transition-all border border-transparent"><Edit3 size={18} /></button>
                                                </div>
                                                <button
                                                    onClick={() => handleToggleField(orden, 'autorizada')}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${orden.autorizada ? 'bg-teal-600 text-white border-teal-700 shadow-md' : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'}`}
                                                >
                                                    <ShieldCheck size={16} />
                                                    {orden.autorizada ? 'Aprobado' : 'Aprobar'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {sortedOrdenes.length > visibleCount && (
                                <div className="p-14 text-center">
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 15)}
                                        className="relative group px-14 py-6 bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 rounded-[2.5rem] font-black uppercase tracking-[0.2em] text-xs hover:shadow-3xl hover:shadow-teal-500/10 transition-all border-2 border-teal-500/10 hover:border-teal-500/30 active:scale-95 overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-teal-500/0 via-teal-500/5 to-teal-500/0 -translate-x-full group-hover:animate-shimmer"></div>
                                        <span className="flex items-center gap-4">
                                            <Plus size={24} strokeWidth={3} />
                                            Explorar más ({sortedOrdenes.length - visibleCount} restantes)
                                        </span>
                                    </button>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-6">
                                        Mostrando {visibleCount} de {sortedOrdenes.length} registros
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            {/* PRINT PREVIEW MODAL */}
            {showPreview && previewData && createPortal(
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xl z-[100] flex flex-col animate-in fade-in duration-500 overflow-hidden print-orden">
                    <style>{`
                        @media print {
                            @page { size: A4; margin: 0; }
                            body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; -webkit-print-color-adjust: exact; background: white !important; }
                            #root, header, .sidebar, .no-print, [class*="no-print"] { display: none !important; opacity: 0 !important; visibility: hidden !important; height: 0 !important; width: 0 !important; }
                            .print-orden { position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; background: white !important; overflow: hidden !important; display: block !important; visibility: visible !important; z-index: 99999 !important; }
                            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; text-shadow: none !important; }
                        }
                        /* FORCE WHITE BACKGROUNDS - NO GREY BLOCKS */
                        .print-orden, .print-preview-container, #preview-content {
                            background-color: white !important;
                            background: white !important;
                        }
                        .print-orden #preview-content, .print-orden #preview-content * {
                            background-color: white !important;
                            color: black !important;
                            border-color: #cbd5e1 !important;
                        }
                    `}</style>
                    
                    {/* TOP BAR - COMPACT PREMIUM CONTROLS */}
                    <div className={`w-full h-16 ${(lowPerfMode || false) ? 'bg-white' : 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl'} border-b border-slate-200 dark:border-slate-800/50 flex items-center justify-between px-6 shrink-0 no-print`}>
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Consola de Impresión</h2>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">{previewType.replace('_', ' ')} • v4.0</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-slate-100/50 dark:bg-black/20 p-2 rounded-[1.5rem] border border-slate-200/50 dark:border-slate-800/50">
                            {previewType !== 'reporte_semanal' && (() => {
                                const hasSurgeryCodes = previewData.codigosCirugia?.some(c => (c.codigo && String(c.codigo).trim() !== '') || (c.nombre && String(c.nombre).trim() !== ''));
                                const hasPractices = previewData.practicas?.some(p => p && String(p).trim() !== '');
                                const isPedidoDoc = hasPractices && !hasSurgeryCodes;
                                const isInternacionDoc = !isPedidoDoc;
                                const isMaterialDoc = previewData.incluyeMaterial && previewData.descripcionMaterial;

                                return (
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => { setPreviewType(isPedidoDoc ? 'pedido' : 'internacion'); setSelectedConsent(null); }} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${!selectedConsent && (previewType === 'internacion' || previewType === 'pedido') ? 'bg-white dark:bg-slate-800 text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{isInternacionDoc ? 'Internación' : 'Pedido'}</button>
                                        {isInternacionDoc && isMaterialDoc && (
                                            <>
                                                <button onClick={() => { setPreviewType('material'); setSelectedConsent(null); }} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${!selectedConsent && previewType === 'material' ? 'bg-white dark:bg-slate-800 text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Material</button>
                                                <button onClick={() => { setPreviewType('ambas'); setSelectedConsent(null); }} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${!selectedConsent && previewType === 'ambas' ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Ambas (2 pág.)</button>
                                            </>
                                        )}
                                        <button onClick={() => setSelectedConsent('caratula')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${selectedConsent === 'caratula' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Carátula</button>
                                        <button onClick={() => setSelectedConsent('generico')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${selectedConsent === 'generico' ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Genérico</button>
                                        
                                        {(() => {
                                            const applicableConsents = getApplicableConsents(previewData);
                                            if (applicableConsents.length === 0) return null;

                                            return (
                                                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200 dark:border-slate-800">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">CONSENTIMIENTOS:</span>
                                                    {applicableConsents.map((consent, idx) => {
                                                        // Extract the effective code (might be a combo or the 6-digit one)
                                                        const effectiveCode = consent.code || (consent.codigos ? consent.codigos.join('+') : null);
                                                        if (!effectiveCode) return null;

                                                        return (
                                                            <div key={idx} className="flex items-center gap-1 bg-slate-100 dark:bg-black/30 p-1 rounded-xl border border-slate-200 dark:border-slate-800/50">
                                                                <span className="text-[9px] font-black text-slate-500 px-2 uppercase truncate max-w-[150px]" title={consent.nombre}>
                                                                    {consent.nombre}
                                                                </span>
                                                                <button 
                                                                    onClick={() => {
                                                                        const url = getConsentUrl('especifico', effectiveCode, false);
                                                                        if (url) window.open(url, '_blank');
                                                                        else alert('PDF no disponible');
                                                                    }} 
                                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all bg-white dark:bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white shadow-sm`}
                                                                >
                                                                    Adulto
                                                                </button>
                                                                <button 
                                                                    onClick={() => {
                                                                        const url = getConsentUrl('especifico', effectiveCode, true);
                                                                        if (url) window.open(url, '_blank');
                                                                        else alert('PDF no disponible');
                                                                    }} 
                                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all bg-white dark:bg-slate-800 text-slate-400 hover:bg-pink-600 hover:text-white shadow-sm`}
                                                                >
                                                                    Menor
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={handleDownloadPDF} className="h-10 px-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center gap-2">
                                <Download size={14} /> PDF
                            </button>
                            <button onClick={handlePrint} className="h-10 px-4 bg-teal-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-teal-700 transition-all shadow-md shadow-teal-500/10 flex items-center gap-2">
                                <Printer size={14} /> Imprimir
                            </button>
                            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1"></div>
                            <button onClick={() => setShowPreview(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className={`flex-1 overflow-auto bg-white p-0 md:p-10 flex justify-center items-start custom-scrollbar print-preview-container`}>
                        <div id="preview-content" className={`${(lowPerfMode || false) ? 'shadow-none ring-0 border border-slate-200' : 'bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5'}`}>
                            {selectedConsent ? (
                                renderSelectedConsent()
                            ) : previewType === 'ambas' ? (
                                <>
                                    {renderPrintContent('internacion')}
                                    <div className="page-break" style={{ pageBreakAfter: 'always', breakAfter: 'page' }}></div>
                                    {renderPrintContent('material')}
                                </>
                            ) : (
                                renderPrintContent(previewType)
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* WHATSAPP MODAL - COMPACT REDESIGN */}
            {whatsappModal && (
                <ModalPortal onClose={() => setWhatsappModal(null)}>
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-500/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                    <MessageCircle size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">Enviar WhatsApp</h3>
                                    <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Gestión de Autorización</p>
                                </div>
                            </div>
                            <button onClick={() => setWhatsappModal(null)} className="text-slate-400 hover:text-rose-500 transition-colors p-2">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 text-center">
                            <div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Paciente</p>
                                <p className="text-sm font-black text-slate-800 dark:text-white">{whatsappModal.afiliado}</p>
                                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center justify-center gap-1">
                                    <span className="opacity-50">📱</span> {whatsappModal.telefono}
                                </p>
                            </div>

                            <div className="pt-2 space-y-3">
                                <button
                                    onClick={async () => {
                                        const fecha = whatsappModal.fechaCirugia ?
                                            new Date(whatsappModal.fechaCirugia + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                            : 'sin fecha';
                                        
                                        const mensaje = whatsappTemplates.paciente
                                            .replace(/{paciente}/g, whatsappModal.afiliado || '')
                                            .replace(/{fecha}/g, fecha)
                                            .replace(/{profesional}/g, whatsappModal.profesional || '');

                                        await navigator.clipboard.writeText(mensaje);
                                        setWhatsappModal(null);
                                        setCopiedToast(true);
                                        setTimeout(() => setCopiedToast(false), 3000);
                                    }}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <User size={16} className="group-hover:scale-110 transition-transform" />
                                    Copiar Mensaje Paciente
                                </button>

                                <button
                                    onClick={async () => {
                                        const fecha = whatsappModal.fechaCirugia ?
                                            new Date(whatsappModal.fechaCirugia + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                            : 'sin fecha';
                                        
                                        const mensaje = whatsappTemplates.institucional
                                            .replace(/{paciente}/g, whatsappModal.afiliado || '')
                                            .replace(/{fecha}/g, fecha)
                                            .replace(/{profesional}/g, whatsappModal.profesional || '');

                                        await navigator.clipboard.writeText(mensaje);
                                        setWhatsappModal(null);
                                        setCopiedToast(true);
                                        setTimeout(() => setCopiedToast(false), 3000);
                                    }}
                                    className="w-full py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <Building2 size={16} className="group-hover:scale-110 transition-transform" />
                                    Copiar Mensaje Institucional
                                </button>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-3">El mensaje se copiará al portapapeles</p>
                            </div>
                        </div>
                    </div>
                </ModalPortal>
            )}

            {/* COPIED TO CLIPBOARD TOAST */}
            {copiedToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-medium">
                        <CheckCircle2 size={20} />
                        <span>✅ Mensaje copiado. Pegalo en WhatsApp (Ctrl+V)</span>
                    </div>
                </div>
            )}
            </div>
        </>
    );
};

export default OrdenesView;
