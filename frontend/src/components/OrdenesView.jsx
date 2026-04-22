import React, { useState, useEffect, useRef, useMemo } from 'react';
import ModalPortal from './common/ModalPortal';
import {
    Save as SaveIcon, FileText, Printer, Download, Plus, X, Calendar, User, Building2, Hash,
    Stethoscope, Pill, ClipboardList, Edit3, Trash2, Package, FileStack, Search,
    CheckCircle2, ArchiveRestore, ShieldCheck, Truck, Folder, Phone, MessageCircle,
    AlertCircle, Clock, Home, StickyNote, LayoutGrid, List, Ban,
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

const OrdenesView = ({ initialTab = 'internacion', draftData = null, onDraftConsumed = noop, modalMode = false, onClose = null, isAuditoria = false }) => {
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
    const [previewOrdenes, setPreviewOrdenes] = useState([]); // Preview for control tab
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
    const [visibleCount, setVisibleCount] = useState(30); // Limite inicial de items

    // Autocomplete State
    const [suggestions, setSuggestions] = useState([]);
    const [showProfSuggestions, setShowProfSuggestions] = useState(false);
    const [activeRow, setActiveRow] = useState(null); // { index: 0, field: 'codigo' | 'nombre' }
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const searchTimeoutRef = useRef(null);
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
    .page-break {
        display: block !important;
        page-break-after: always !important;
        break-after: page !important;
        height: 0;
        width: 100%;
        clear: both;
        visibility: hidden;
    }
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

    const handleDownloadPDF = async () => {
        const element = document.getElementById('preview-content');
        if (!element) {
            console.error('Element preview-content not found');
            return;
        }

        let pdfFilename = 'documento.pdf';
        if (previewType === 'reporte_semanal') {
            pdfFilename = `Control_Facturacion_${previewData.fechaInicio}_al_${previewData.fechaFin}`.replace(/\//g, '-') + '.pdf';
        } else if (previewType === 'caratula') {
            pdfFilename = `Caratula_${previewData.afiliado || 'Paciente'}.pdf`;
        } else {
            pdfFilename = `Orden_${previewData.afiliado || 'Paciente'}_${previewData.fechaCirugia || previewData.fechaDocumento || ''}.pdf`;
        }

        const opt = {
            margin: 0,
            filename: pdfFilename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, windowHeight: element.scrollHeight },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        const html2pdf = (await import('html2pdf.js')).default || await import('html2pdf.js');
        html2pdf().from(element).set(opt).save();
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
            <div className="space-y-6 max-w-4xl mx-auto">
                {/* Main Form Card */}
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 space-y-8">
                    {/* Header with Title + AI Button */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 bg-${accentColor}-50 dark:bg-${accentColor}-900/20 rounded-xl text-${accentColor}-600 dark:text-${accentColor}-400`}>
                                {editingId ? <Edit3 size={20} /> : <Plus size={20} />}
                            </div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">
                                {editingId ? 'Editar Documento' : `Nueva ${isPedido ? 'Pedido' : 'Orden'}`}
                            </h3>
                        </div>
                        {!editingId && !isPedido && (
                            <button
                                type="button"
                                onClick={() => { setShowAIInput(!showAIInput); setAiError(''); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showAIInput
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-200 dark:shadow-none'
                                    : 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:shadow-md hover:shadow-violet-100 dark:hover:shadow-none'
                                    }`}
                            >
                                <Sparkles size={16} />
                                Auto-completar con IA
                            </button>
                        )}
                    </div>

                    {/* AI Paste Area */}
                    {showAIInput && !isPedido && (
                        <div className="bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 dark:from-violet-950/40 dark:via-purple-950/40 dark:to-indigo-950/40 p-6 rounded-2xl border border-violet-200 dark:border-violet-800 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">
                                <Sparkles size={16} className="text-violet-500" />
                                Pegá el contenido del email y la IA completará el formulario
                            </div>
                            <textarea
                                value={aiInputText}
                                onChange={(e) => setAiInputText(e.target.value)}
                                placeholder={'Pegá acá el texto del email...\n\nEjemplo:\nNombre y Apellido del Profesional: Dr. Pérez\nFecha de la Cirugia: Abr 10, 2026\nNombre y Apellido del Paciente: GONZALEZ JUAN\nObra Social: OSDE\nDNI: 12345678\n...'}
                                className="w-full px-5 py-4 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-700 rounded-xl focus:outline-none focus:ring-4 focus:ring-violet-100 dark:focus:ring-violet-900 focus:border-violet-400 dark:focus:border-violet-600 transition-all min-h-[160px] text-sm font-mono text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-y"
                                disabled={aiLoading}
                            />
                            {aiError && (
                                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
                                    <AlertCircle size={14} />
                                    {aiError}
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    disabled={!aiInputText.trim() || aiLoading}
                                    onClick={async () => {
                                        setAiLoading(true);
                                        setAiError('');
                                        try {
                                            const result = await parseEmailToOrder(aiInputText, profesionales);
                                            // Merge AI result into form, respecting the data structure
                                            setFormData(prev => {
                                                const merged = { ...prev };
                                                
                                                // Improved professional matching
                                                if (result.profesional) {
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
                                            alert("¡Formulario auto-completado con éxito!");
                                        } catch (err) {
                                            console.error('AI parse error:', err);
                                            setAiError(err.message || 'Error al procesar con IA');
                                        } finally {
                                            setAiLoading(false);
                                        }
                                    }}
                                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${!aiInputText.trim() || aiLoading
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300'
                                        }`}
                                >
                                    {aiLoading ? (
                                        <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                                    ) : (
                                        <><Sparkles size={16} /> Procesar con IA</>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowAIInput(false); setAiInputText(''); setAiError(''); }}
                                    className="px-4 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                >
                                    Cancelar
                                </button>
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} ${linkedProfesionalName ? 'bg-slate-50 dark:bg-slate-900/50 cursor-not-allowed font-bold text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}
                                placeholder="Escribe para buscar..."
                                required
                            />
                            {!linkedProfesionalName && showProfSuggestions && (
                                <div className="absolute z-50 top-full mt-2 left-0 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold uppercase ${ringClass} text-slate-900 dark:text-slate-100`}
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-slate-900 dark:text-slate-100`}
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
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all uppercase ${ringClass} text-slate-900 dark:text-slate-100`}
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
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Calendar size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Fecha Cirugía
                            </label>
                            <input
                                type="date"
                                value={formData.fechaCirugia}
                                onChange={(e) => handleInputChange('fechaCirugia', e.target.value)}
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold text-slate-700 dark:text-slate-200 ${ringClass}`}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Clock size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Hora
                            </label>
                            <input
                                type="time"
                                value={formData.horaCirugia}
                                onChange={(e) => handleInputChange('horaCirugia', e.target.value)}
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all font-black text-slate-700 dark:text-slate-200 ${ringClass}`}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <Calendar size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Fecha Documento
                            </label>
                            <input
                                type="date"
                                value={formData.fechaDocumento}
                                onChange={(e) => handleInputChange('fechaDocumento', e.target.value)}
                                className={`w-full px-5 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold text-slate-700 dark:text-slate-200 ${ringClass}`}
                            />
                        </div>
                    </div>

                    {/* Material Section */}
                    <div className={`p-6 rounded-[2rem] border-2 transition-all ${formData.incluyeMaterial ? 'border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-900/20' : 'border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30'}`}>
                        <label className="flex items-center gap-4 cursor-pointer group">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${formData.incluyeMaterial ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 dark:shadow-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600'}`}>
                                <Package size={18} />
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.incluyeMaterial}
                                onChange={(e) => handleInputChange('incluyeMaterial', e.target.checked)}
                                className="hidden"
                            />
                            <span className={`font-black text-sm uppercase tracking-tight transition-colors ${formData.incluyeMaterial ? 'text-purple-700 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                                Incluir Material
                            </span>
                        </label>

                        {formData.incluyeMaterial && (
                            <div className="mt-6 animate-in slide-in-from-top-2 fade-in duration-300">
                                <label className="block text-[10px] font-black text-purple-400 dark:text-purple-500 uppercase tracking-widest mb-2 ml-1">
                                    Descripción del Material
                                </label>
                                <textarea
                                    value={formData.descripcionMaterial}
                                    onChange={(e) => handleInputChange('descripcionMaterial', e.target.value)}
                                    className="w-full px-5 py-4 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-900/50 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900 focus:border-purple-300 dark:focus:border-purple-600 transition-all min-h-[120px] shadow-sm text-slate-700 dark:text-slate-200 font-medium"
                                    placeholder="Especifique materiales necesarios..."
                                />
                            </div>
                        )}
                    </div>

                    {/* Bottom Row: Diagnosis | Observations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-50 dark:border-slate-800">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <ClipboardList size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Diagnóstico
                            </label>
                            <textarea
                                value={formData.diagnostico}
                                onChange={(e) => handleInputChange('diagnostico', e.target.value)}
                                className={`w-full px-5 py-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all min-h-[100px] ${ringClass} text-sm font-medium text-slate-700 dark:text-slate-200`}
                                placeholder="SAHOS, IVN, etc."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                                <StickyNote size={12} className={`text-${accentColor}-500 dark:text-${accentColor}-400`} /> Anotaciones
                            </label>
                            <textarea
                                value={formData.anotacionCalendario}
                                onChange={(e) => handleInputChange('anotacionCalendario', e.target.value)}
                                className={`w-full px-5 py-4 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:outline-none ring-offset-0 transition-all min-h-[100px] ${ringClass} text-sm font-medium text-slate-700 dark:text-slate-200`}
                                placeholder="Notas internas..."
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-4 pt-4">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-[2] py-4 bg-${accentColor}-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-${accentColor}-700 transition-all shadow-xl shadow-${accentColor}-200 dark:shadow-none flex items-center justify-center gap-2 disabled:opacity-50`}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <SaveIcon size={18} />
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

            // IF WE ARE IN "INTERNACION" TAB: Standard behavior
            const os = (currentOS || formData.obraSocial || '').toLowerCase();
            const isSwissMedical = os.includes('swiss');
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
                if (isSwissMedical && MODULOS_SM) {
                    const parentModule = MODULOS_SM.find(m => m.incluye && m.incluye.includes(surgery.codigo));
                    if (parentModule) {
                        return { ...surgery, parentModule };
                    }
                }
                return surgery;
            });

            // Search in Swiss Medical Modules (Only if Swiss Medical)
            let smMatches = [];
            if (isSwissMedical && MODULOS_SM) {
                smMatches = MODULOS_SM.filter(c => {
                    if (field === 'codigo') {
                        return c.codigo && c.codigo.toString().startsWith(term);
                    } else {
                        return c.nombre && c.nombre.toLowerCase().includes(term);
                    }
                }).map(m => ({ ...m, isModule: true }));
            }

            // Search in IOSFA Codes (Only if IOSFA)
            let iosfaMatches = [];
            if (isIOSFA && Array.isArray(CODIGOS_IOSFA)) {
                iosfaMatches = CODIGOS_IOSFA.filter(c => {
                    const codeMatch = c.codigo && c.codigo.toString().toLowerCase().startsWith(term);
                    // Remove dots for comparison (e.g. 03.13.01 matches 031301)
                    const cleanGeneral = c.codigoGeneral ? c.codigoGeneral.replace(/\./g, '') : '';
                    const generalCodeMatch = cleanGeneral.startsWith(term);
                    const nameMatch = c.nombre && c.nombre.toLowerCase().includes(term);
                    return codeMatch || generalCodeMatch || nameMatch;
                }).map(c => ({
                    ...c,
                    isIOSFA: true,
                    // Display label helper
                    displayLabel: `${c.codigo} (${c.codigoGeneral}) - ${c.nombre}`
                }));
            }

            // Combine: IOSFA -> Modules -> General
            const combined = [...iosfaMatches, ...smMatches, ...generalMatches].slice(0, 15);
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
            if (activeRow.field === 'codigo') {
                newCodigos[index] = { 
                    ...newCodigos[index], 
                    codigo: suggestion.codigo, 
                    nombre: suggestion.nombre 
                };
            } else {
                newCodigos[index] = { 
                    ...newCodigos[index], 
                    nombre: suggestion.nombre,
                    codigo: suggestion.codigo || newCodigos[index].codigo
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

        // Try direct map match first
        if (FIRMAS_MAP[profesionalName]) return `/firmas/${FIRMAS_MAP[profesionalName]}`;

        // Handle names like "Dr Paredes Ariel" -> "dr_paredes.png"
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
            // Search in filenames we know exist in public/firmas
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

    const getProfesionalData = (profesionalName) => {
        return profesionales.find(p => p.nombre === profesionalName) || {};
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

            // 1. Direct match
            if (CONSENTIMIENTOS_MAP[item.codigo]) return item.codigo;

            // 2. IOSFA lookup
            const iosfaMatch = CODIGOS_IOSFA.find(c => c.codigo === item.codigo);
            if (iosfaMatch && CONSENTIMIENTOS_MAP[iosfaMatch.codigoGeneral]) {
                return iosfaMatch.codigoGeneral;
            }

            // 3. Name Regex Search (for Swiss Medical modules like "MODULO 1 ... 031301 ...")
            // Search for patterns like "03XXXX" in the name
            if (item.nombre) {
                const codeMatch = item.nombre.match(/\b(03\d{4})\b/);
                if (codeMatch && CONSENTIMIENTOS_MAP[codeMatch[1]]) {
                    return codeMatch[1];
                }
            }

            return item.codigo; // Return original if no better resolution found
        }).filter(Boolean);

        const usedCodes = new Set();

        // First check for COMBO consents (require multiple codes together)
        CONSENTIMIENTOS_COMBO.forEach(combo => {
            const hasAllCodes = combo.codigos.every(code => resolvedCodes.includes(code));
            if (hasAllCodes && !addedNames.has(combo.nombre)) {
                addedNames.add(combo.nombre);
                consents.push(combo);
                // Mark these codes as used so they don't show individual consents
                combo.codigos.forEach(code => usedCodes.add(code));
            }
        });

        // Then check individual consents using resolved codes
        resolvedCodes.forEach(code => {
            if (CONSENTIMIENTOS_MAP[code] && !usedCodes.has(code)) {
                const consent = CONSENTIMIENTOS_MAP[code];
                // Only add if it has at least one PDF and hasn't been added
                if ((consent.adulto || consent.menor) && !addedNames.has(consent.nombre)) {
                    addedNames.add(consent.nombre);
                    consents.push(consent);
                }
            }
        });
        return consents;
    };

    // Open consent PDF(s) for printing
    const handlePrintConsents = (orden) => {
        const consents = getApplicableConsents(orden);
        if (consents.length === 0) {
            alert("No se encontraron consentimientos específicos para estos códigos.");
            return;
        }
        
        consents.forEach(consent => {
            const pdfUrl = orden.edad < 18 ? (consent.menor || consent.adulto) : (consent.adulto || consent.menor);
            if (pdfUrl) {
                window.open(pdfUrl, '_blank');
            }
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

                    {/* Footer: Signature */}
                    <div className="absolute bottom-32 left-16 right-16">
                        <div className="flex justify-end pr-8">
                            <img
                                src={getSignatureUrl(previewData.profesional)}
                                alt={`Firma`}
                                className="h-32 object-contain"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
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

                <h1 className="text-center text-[12pt] font-bold mb-10 tracking-wide" style={{ color: '#000' }}>
                    {title}
                </h1>

                <div className="space-y-2 text-[11pt] leading-relaxed" style={{ color: '#000' }}>
                    <p><span className="font-bold">Afiliado:</span> {previewData.afiliado}</p>
                    <p><span className="font-bold">Obra social:</span> {previewData.obraSocial}</p>
                    <p><span className="font-bold">Número de afiliado:</span> {previewData.numeroAfiliado}</p>
                    {previewData.dni && <p><span className="font-bold">DNI:</span> {previewData.dni}</p>}

                    {isInternacion ? (
                        <div className="pt-4 flex gap-2">
                            <span className="font-bold shrink-0">{isEstudio ? 'Estudio a realizar:' : 'Códigos de cirugía:'}</span>
                            {previewData.codigosCirugia && previewData.codigosCirugia.length > 0 ? (
                                <div className="space-y-0.5">
                                    {previewData.codigosCirugia.map((cod, idx) => (
                                        <p key={idx} className="leading-tight">{isEstudio ? '' : cod.codigo}{cod.nombre ? ` ${cod.nombre} ` : ''}</p>
                                    ))}
                                </div>
                            ) : <span className="">-</span>}
                        </div>
                    ) : (
                        <p className="pt-4 whitespace-pre-wrap">{previewData.descripcionMaterial}</p>
                    )}

                    <p className="pt-4"><span className="font-bold">Tipo de anestesia:</span> {previewData.tipoAnestesia}</p>
                    <p className="pt-4"><span className="font-bold">Fecha de cirugía:</span> {formatDate(previewData.fechaCirugia)}</p>
                    <p className="pt-4"><span className="font-bold">Material:</span> {previewData.incluyeMaterial ? 'sí' : 'no'}</p>
                    <p className="pt-4"><span className="font-bold">Diagnóstico:</span> {previewData.diagnostico}</p>
                </div>

                <div className="absolute bottom-24 left-16 right-16 flex justify-end">
                    <div className="text-center">
                        <img
                            src={getSignatureUrl(previewData.profesional)}
                            alt={`Firma ${previewData.profesional} `}
                            className="h-32 object-contain mx-auto"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    </div>
                </div>
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
            return diffDays <= 14;
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
            if (activeTab === 'control') {
                return new Date(a.fechaCirugia) - new Date(b.fechaCirugia);
            }
            const urgentA = checkUrgency(a);
            const urgentB = checkUrgency(b);
            if (urgentA && !urgentB) return -1;
            if (!urgentA && urgentB) return 1;
            const dateA = a.fechaCirugia || a.createdAt;
            const dateB = b.fechaCirugia || b.createdAt;
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
        return diffDays <= 14;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-br from-teal-600 to-teal-700 text-white p-6 rounded-2xl shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            {activeTab === 'control' ? <Printer size={28} /> : <FileText size={28} />}
                            {activeTab === 'control' ? 'Control de Cirugías' : 'Órdenes de Internación'}
                        </h2>
                        <p className="text-teal-100 text-sm mt-1">
                            {activeTab === 'control' 
                                ? 'Control de facturación e impresión por fechas.' 
                                : canShareOrdenes 
                                    ? 'Crea órdenes de internación y pedidos de material.' 
                                    : 'Visualiza el historial de documentos.'}
                        </p>
                    </div>
                    <div className="flex bg-teal-800/30 p-1 rounded-xl">
                        <button
                            onClick={() => { resetForm(); setActiveTab('internacion'); }}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'internacion' ? 'bg-white text-teal-700 shadow-md' : 'text-teal-100 hover:bg-white/10'}`}
                        >
                            Internación
                        </button>
                        <button
                            onClick={() => { setActiveTab('control'); }}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'control' ? 'bg-white text-teal-700 shadow-md' : 'text-teal-100 hover:bg-white/10'}`}
                        >
                            Control
                        </button>
                    </div>

                    {!modalMode && canViewOrdenes && (
                        <div className="flex items-center gap-3">
                            {activeTab === 'control' && (
                                <>
                                    <div className="flex items-center gap-4 bg-teal-800/40 p-2.5 rounded-2xl border border-teal-600/30 shadow-inner">
                                        <div className="flex items-center gap-3">
                                            <Calendar size={18} className="text-teal-300/80" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-teal-300 uppercase tracking-wider">Inicio</span>
                                                <input
                                                    type="date"
                                                    value={rangeStart}
                                                    onChange={(e) => setRangeStart(e.target.value)}
                                                    className="bg-transparent text-white text-sm border-0 focus:ring-0 p-0 w-[110px] cursor-pointer font-bold"
                                                />
                                            </div>
                                        </div>
                                        <div className="w-px h-8 bg-teal-600/30"></div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-teal-300 uppercase tracking-wider">Fin</span>
                                                <input
                                                    type="date"
                                                    value={rangeEnd}
                                                    onChange={(e) => setRangeEnd(e.target.value)}
                                                    className="bg-transparent text-white text-sm border-0 focus:ring-0 p-0 w-[110px] cursor-pointer font-bold"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleExportWeeklyExcel}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-800 text-teal-100 rounded-xl font-bold hover:bg-teal-900 transition-all shadow-md shadow-teal-950/10 border border-teal-600"
                                        title="Descargar Excel con Rango"
                                    >
                                        <TableProperties size={20} />
                                        <span className="hidden sm:inline">Excel</span>
                                    </button>
                                    <button
                                        onClick={handlePrintWeeklyReport}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-md shadow-slate-950/10 border border-slate-700"
                                        title="Imprimir Reporte"
                                    >
                                        <Printer size={20} />
                                        <span className="hidden sm:inline">Imprimir Reporte</span>
                                    </button>
                                </>
                            )}
                            {activeTab === 'internacion' && canShareOrdenes && (
                                <button
                                    onClick={() => { resetForm(); setShowForm(true); }}
                                    className="flex items-center gap-2 px-6 py-3 bg-white text-teal-700 rounded-xl font-bold hover:bg-teal-50 transition-all shadow-md ml-2"
                                >
                                    <Plus size={20} />
                                    Nueva Orden
                                </button>
                            )}
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
                <div className="p-4 h-full flex flex-col">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden border-4 border-teal-500 animate-in zoom-in-95 duration-300 flex flex-col flex-1 min-h-0">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10 font-sans shrink-0">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                                {editingId ? <Edit3 size={28} className="text-teal-600" /> : <Plus size={28} className="text-teal-600" />}
                                {editingId ? 'Editar Documento' : 'Nueva Orden'}
                            </h3>
                            <button type="button" onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1">
                            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-8 space-y-8">
                                {renderFormFields()}
                            </form>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <h3 className="font-bold text-slate-700 dark:text-slate-300">Historial de Órdenes</h3>
                                <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1 rounded-lg">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-teal-600 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                        title="Vista de Lista"
                                    >
                                        <List size={18} />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-teal-600 shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                        title="Vista de Mosaico"
                                    >
                                        <LayoutGrid size={18} />
                                    </button>
                                </div>
                            </div>
                            {activeTab === 'internacion' ? (
                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Filter by Period */}
                                    <select
                                        value={filterPeriodo}
                                        onChange={(e) => setFilterPeriodo(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-teal-700 dark:text-teal-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="proximas">Próximas Cirugías</option>
                                        <option value="realizadas">Cirugías Realizadas (Historial)</option>
                                        <option value="suspendidas">Cirugías Canceladas</option>
                                        <option value="todas">Ver Todas</option>
                                    </select>

                                    {/* Filter by Date */}
                                    <input
                                        type="date"
                                        value={filterDate}
                                        onChange={(e) => {
                                            const newDate = e.target.value;
                                            setFilterDate(newDate);
                                            if (newDate) {
                                                const today = new Date();
                                                today.setHours(0, 0, 0, 0);
                                                const offset = today.getTimezoneOffset();
                                                const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
                                                const todayStr = todayLocal.toISOString().split('T')[0];
                                                
                                                if (newDate < todayStr) {
                                                    setFilterPeriodo('todas');
                                                }
                                            }
                                        }}
                                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    />
                                    {/* Filter by Professional */}
                                    <select
                                        value={filterProfesional}
                                        onChange={(e) => setFilterProfesional(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="">Todos los profesionales</option>
                                        {profesionales.map(p => (
                                            <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                        ))}
                                    </select>
                                    {/* Filter by Obra Social */}
                                    <select
                                        value={filterObraSocial}
                                        onChange={(e) => setFilterObraSocial(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="">Todas las Obras Sociales</option>
                                        {[...new Set(listToFilter.map(o => o.obraSocial?.trim().toUpperCase()).filter(Boolean))].sort().map(os => (
                                            <option key={os} value={os}>{os}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="">Todos los estados</option>
                                        <option value="pendientes">Pendientes</option>
                                        <option value="enviadas">Enviadas</option>
                                    </select>
                                    {/* Filter by Audit Status */}
                                    <select
                                        value={filterAudit}
                                        onChange={(e) => setFilterAudit(e.target.value)}
                                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="">Auditoría (Todas)</option>
                                        <option value="pendientes">Pendientes</option>
                                        <option value="auditadas">Auditadas</option>
                                    </select>
                                    {/* Search by Patient */}
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente..."
                                            value={searchPaciente}
                                            onChange={(e) => setSearchPaciente(e.target.value)}
                                            className="pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-48"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente..."
                                            value={searchPaciente}
                                            onChange={(e) => setSearchPaciente(e.target.value)}
                                            className="pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => { setRangeStart(''); setRangeEnd(''); setSearchPaciente(''); }}
                                        className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-teal-600 transition-colors"
                                    >
                                        Limpiar filtros
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    {sortedOrdenes.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <ClipboardList size={48} className="mx-auto mb-4 opacity-50" />
                            <p>{listToFilter.length === 0 ? 'No hay documentos creados aún.' : 'No se encontraron documentos con los filtros aplicados.'}</p>
                        </div>
                    ) : (
                        <>
                            <div className={viewMode === 'list' ? "divide-y divide-slate-100 dark:divide-slate-800" : "grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-100/30 dark:bg-slate-950"}>
                                {sortedOrdenes.slice(0, visibleCount).map(orden => {
                                    const isUrgent = checkUrgency(orden);
                                    if (viewMode === 'list') {
                                        return (
                                            <div
                                                key={orden.id}
                                                className={`p-4 flex items-center justify-between transition-colors ${orden.suspendida ? 'bg-slate-100 dark:bg-slate-800/50 opacity-60 grayscale-[0.8]' :
                                                    orden.enviada ? 'bg-slate-50 dark:bg-slate-900/50 opacity-75 grayscale-[0.5]' :
                                                        isUrgent ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 border-l-4 border-red-500' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                                    } `}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse' :
                                                        activeTab === 'pedidos' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400' : (orden.incluyeMaterial ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400')
                                                        } `}>
                                                        {isUrgent ? <AlertCircle size={20} /> : (orden.enviada ? <CheckCircle2 size={20} /> : (orden.incluyeMaterial ? <FileStack size={20} /> : <FileText size={20} />))}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className={`font-bold ${orden.enviada ? 'text-slate-500 dark:text-slate-400' : isUrgent ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                                {orden.afiliado}
                                                            </p>
                                                            {isUrgent && orden.status !== 'aprobada' && !orden.autorizada ? (
                                                                <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full flex items-center gap-1 animate-pulse">
                                                                    <AlertCircle size={10} /> Urgente
                                                                </span>
                                                            ) : orden.status === 'aprobada' ? (
                                                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Aprobada
                                                                </span>
                                                            ) : orden.status === 'rechazada' ? (
                                                                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Rechazada
                                                                </span>
                                                            ) : orden.enviada ? (
                                                                <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Enviada
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Pendiente
                                                                </span>
                                                            )}
                                                            {isTestEnv && !orden.isTest && (
                                                                <span className="px-2 py-0.5 bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wide rounded-full flex items-center gap-1">
                                                                    <LockIcon size={10} /> Producción (L)
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                                            {orden.profesional} • {orden.obraSocial} • {orden.dni && <span className="font-bold text-slate-700 dark:text-slate-300">DNI: {orden.dni} • </span>}Fecha: {formatDate(orden.fechaCirugia || orden.fechaDocumento)}
                                                            {orden.habitacion && <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">• Hab: {orden.habitacion}</span>}
                                                            {orden.incluyeMaterial && <span className="ml-2 text-purple-600 dark:text-purple-400 font-medium">+ Material</span>}
                                                            {orden.status === 'auditada' && <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black rounded uppercase tracking-tighter shadow-sm border border-emerald-200 dark:border-emerald-800">Auditada</span>}
                                                        </p>
                                                        {orden.observaciones && (
                                                            <div className="mt-1 p-2 bg-teal-50 dark:bg-teal-900/20 border-l-2 border-teal-400 dark:border-teal-600 text-xs text-teal-700 dark:text-teal-300 italic rounded">
                                                                <strong>Nota:</strong> {orden.observaciones}
                                                            </div>
                                                        )}

                                                        {/* Status Toggles */}
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">

                                                            {canEditOrdenes && (
                                                                <button
                                                                    onClick={() => handleToggleField(orden, 'autorizada')}
                                                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.autorizada
                                                                        ? 'bg-teal-600 text-white border-teal-700 shadow-sm hover:bg-teal-700'
                                                                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300'
                                                                        } `}
                                                                >
                                                                    <ShieldCheck size={12} strokeWidth={2.5} />
                                                                    {orden.autorizada ? 'Autorizada' : 'Autorizar'}
                                                                </button>
                                                            )}

                                                            {orden.incluyeMaterial && canEditOrdenes && (
                                                                <button
                                                                    onClick={() => handleToggleField(orden, 'materialSolicitado')}
                                                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.materialSolicitado
                                                                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm hover:bg-purple-700'
                                                                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300'
                                                                        } `}
                                                                >
                                                                    <Truck size={12} strokeWidth={2.5} />
                                                                    {orden.materialSolicitado ? 'Mat. Solicitado' : 'Solicitar Material'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {canEditOrdenes && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleToggleStatus(orden)}
                                                                    className={`p-2 rounded-lg transition-colors ${orden.enviada
                                                                        ? 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300'
                                                                        : 'text-slate-400 dark:text-slate-500 hover:bg-green-50 dark:hover:bg-green-950/30 hover:text-green-600 dark:hover:text-green-400'
                                                                        } `}
                                                                    title={orden.enviada ? "Marcar como pendiente" : "Marcar como enviada"}
                                                                >
                                                                    {orden.enviada ? <ArchiveRestore size={18} /> : <CheckCircle2 size={18} />}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleToggleField(orden, 'suspendida')}
                                                                    className={`p-2 rounded-lg transition-colors ${orden.suspendida
                                                                        ? 'text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700'
                                                                        : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300'
                                                                        } `}
                                                                    title={orden.suspendida ? "Re-activar cirugía" : "Suspender cirugía"}
                                                                >
                                                                    <Ban size={18} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {(canEditOrdenes || (permissions?.can_edit_own && orden.createdBy === currentUser?.email)) && (
                                                            <button
                                                                onClick={() => handleEdit(orden)}
                                                                className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
                                                                title="Editar"
                                                            >
                                                                <Edit3 size={18} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handlePreview(orden, 'internacion')}
                                                            className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
                                                            title="Ver Documento"
                                                        >
                                                            <Printer size={18} />
                                                        </button>
                                                        {orden.incluyeMaterial &&
                                                            orden.descripcionMaterial && (
                                                                <button
                                                                    onClick={() => handlePreview(orden, 'material')}
                                                                    className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                                                                    title="Ver Material"
                                                                >
                                                                    <Package size={18} />
                                                                </button>
                                                            )}
                                                        <button
                                                            onClick={() => handlePreview(orden, 'caratula')}
                                                            className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                                                            title="Ver Carátula"
                                                        >
                                                            <Folder size={18} />
                                                        </button>
                                                        {orden.telefono && (
                                                            <button
                                                                onClick={() => setWhatsappModal(orden)}
                                                                className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                                                title="Enviar WhatsApp"
                                                            >
                                                                <MessageCircle size={18} />
                                                            </button>
                                                        )}
                                                        {(isSuperAdmin || permissions?.can_delete_data || (permissions?.can_delete_own && orden.createdBy === currentUser?.email)) && (
                                                            <button
                                                                onClick={() => handleDelete(orden.id)}
                                                                className="p-2 text-red-400 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                                                title="Eliminar"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // GRID VIEW (Mosaic)
                                    return (
                                        <div
                                            key={orden.id}
                                            className={`bg-white dark:bg-slate-800 rounded-2xl border p-5 flex flex-col justify-between transition-all hover:shadow-md ${orden.suspendida ? 'opacity-60 grayscale-[0.6] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-inner' :
                                                orden.enviada ? 'opacity-75 grayscale-[0.3] border-slate-200 dark:border-slate-700' :
                                                    isUrgent ? 'border-red-200 dark:border-red-900/50 shadow-sm shadow-red-50 dark:shadow-red-900/20 ring-1 ring-red-100 dark:ring-red-900/30' : 'border-slate-100 dark:border-slate-700'
                                                } `}
                                        >
                                            <div>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                                                        activeTab === 'pedidos' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400' : (orden.incluyeMaterial ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400')
                                                        } `}>
                                                        {isUrgent ? <AlertCircle size={24} /> : (orden.enviada ? <CheckCircle2 size={24} /> : (orden.incluyeMaterial ? <FileStack size={24} /> : <FileText size={24} />))}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {isUrgent && orden.status !== 'aprobada' && !orden.autorizada ? (
                                                            <span className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold uppercase rounded-lg animate-pulse">
                                                                Urgente
                                                            </span>
                                                        ) : orden.status === 'aprobada' ? (
                                                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded-lg">
                                                                Aprobada
                                                            </span>
                                                        ) : orden.status === 'rechazada' ? (
                                                            <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded-lg">
                                                                Rechazada
                                                            </span>
                                                        ) : orden.enviada ? (
                                                            <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded-lg">
                                                                Enviada
                                                            </span>
                                                        ) : orden.suspendida ? (
                                                            <span className="px-2 py-1 bg-slate-600 text-white text-[10px] font-bold uppercase rounded-lg">
                                                                Suspendida
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold uppercase rounded-lg">
                                                                Pendiente
                                                            </span>
                                                        )}
                                                        {orden.status === 'auditada' && <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black rounded uppercase shadow-sm border border-emerald-200 dark:border-emerald-800">Auditada</span>}
                                                        {isTestEnv && !orden.isTest && (
                                                            <span className="px-2 py-1 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-lg flex items-center gap-1 mt-1 justify-center">
                                                                <LockIcon size={10} /> Producción (Solo Lectura)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <h4 className={`text-lg font-bold truncate ${orden.enviada ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                                                    {orden.afiliado}
                                                </h4>

                                                <div className="mt-3 space-y-2">
                                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                                        <User size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                                        <span className="truncate">{orden.profesional}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                                        <Building2 size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                                        <span className="truncate">{orden.obraSocial}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                                            <Hash size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                                            <span className="font-bold">{orden.dni || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                                            <Calendar size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                                            <span>{formatDate(orden.fechaCirugia || orden.fechaDocumento)}</span>
                                                        </div>
                                                    </div>
                                                    {orden.habitacion && (
                                                        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg font-medium">
                                                            <Home size={14} className="shrink-0" />
                                                            <span>Habitación: {orden.habitacion}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {orden.observaciones && (
                                                    <div className="mt-3 p-3 bg-teal-50 dark:bg-teal-900/20 border-l-2 border-teal-400 dark:border-teal-600 text-xs text-teal-700 dark:text-teal-300 italic rounded">
                                                        <strong>Nota:</strong> {orden.observaciones}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap gap-2 mt-4">

                                                    <button
                                                        onClick={() => handleToggleField(orden, 'autorizada')}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.autorizada
                                                            ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                                                            : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                            } `}
                                                    >
                                                        <ShieldCheck size={14} />
                                                        {orden.autorizada ? 'Autoriz.' : 'Autoriz.'}
                                                    </button>

                                                    {orden.incluyeMaterial && activeTab !== 'pedidos' && (
                                                        <button
                                                            onClick={() => handleToggleField(orden, 'materialSolicitado')}
                                                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.materialSolicitado
                                                                ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                                                                : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                                                } `}
                                                        >
                                                            <Truck size={14} />
                                                            {orden.materialSolicitado ? 'Ped.' : 'Ped.'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                                <div className="flex gap-1">
                                                    {canEditOrdenes && (
                                                        <>
                                                            <button
                                                                onClick={() => handleToggleStatus(orden)}
                                                                className="p-2.5 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"
                                                                title="Estado"
                                                            >
                                                                {orden.enviada ? <ArchiveRestore size={20} /> : <CheckCircle2 size={20} />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleToggleField(orden, 'suspendida')}
                                                                className={`p-2.5 rounded-xl transition-colors ${orden.suspendida
                                                                    ? 'text-slate-600 bg-slate-200'
                                                                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                                                                    } `}
                                                                title={orden.suspendida ? "Re-activar" : "Suspender"}
                                                            >
                                                                <Ban size={20} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {(canEditOrdenes || (permissions?.can_edit_own && orden.createdBy === currentUser?.email)) && (
                                                        <button
                                                            onClick={() => handleEdit(orden)}
                                                            className="p-2.5 text-teal-600 hover:bg-teal-50 rounded-xl transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit3 size={20} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handlePreview(orden, activeTab === 'pedidos' ? 'pedido' : 'internacion')}
                                                        className="p-2.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded-xl transition-colors"
                                                        title="Imprimir"
                                                    >
                                                        <Printer size={20} />
                                                    </button>
                                                    <button
                                                        onClick={() => handlePreview(orden, 'caratula')}
                                                        className="p-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-xl transition-colors"
                                                        title="Carátula"
                                                    >
                                                        <Folder size={20} />
                                                    </button>
                                                    {orden.telefono && (
                                                        <button
                                                            onClick={() => setWhatsappModal(orden)}
                                                            className="p-2.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-xl transition-colors"
                                                            title="WhatsApp"
                                                        >
                                                            <MessageCircle size={20} />
                                                        </button>
                                                    )}
                                                    {(isSuperAdmin || permissions?.can_delete_data || (permissions?.can_delete_own && orden.createdBy === currentUser?.email)) && (
                                                        <button
                                                            onClick={() => handleDelete(orden.id)}
                                                            className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={20} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {sortedOrdenes.length > visibleCount && (
                                <div className="p-6 text-center border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 50)}
                                        className="px-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-teal-600 dark:text-teal-400 rounded-xl font-bold hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:border-teal-300 dark:hover:border-teal-700 transition-all shadow-sm flex items-center gap-2 mx-auto"
                                    >
                                        <Plus size={20} /> Ver más cirugías
                                    </button>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 font-medium">Mostrando {visibleCount} de {sortedOrdenes.length} órdenes</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            {/* PRINT PREVIEW MODAL */}
            {showPreview && previewData && createPortal(
                <div className="fixed inset-0 bg-slate-900 z-[100] overflow-auto print-orden">
                    <style>{`
                        @media print {
                            @page {
                                size: A4;
                                margin: 0;
                            }
                            body {
                                margin: 0 !important;
                                padding: 0 !important;
                                overflow: hidden !important;
                                -webkit-print-color-adjust: exact;
                            }
                            #root, header, .sidebar, .no-print {
                                display: none !important;
                            }
                            .print-orden {
                                position: absolute !important;
                                top: 0 !important;
                                left: 0 !important;
                                width: 210mm !important;
                                height: 297mm !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background: white !important;
                                overflow: hidden !important;
                                display: block !important;
                                visibility: visible !important;
                                z-index: 9999 !important;
                            }
                            * {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                        }
                    `}</style>
                    <div className="p-8 print:p-0">
                        {/* Header Controls */}
                        <div className="flex justify-between items-center mb-8 no-print border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-100">Vista Previa</h2>
                                {previewType !== 'reporte_semanal' && (() => {
                                    const hasSurgeryCodes = previewData.codigosCirugia?.some(c => (c.codigo && String(c.codigo).trim() !== '') || (c.nombre && String(c.nombre).trim() !== ''));
                                    const hasPractices = previewData.practicas?.some(p => p && String(p).trim() !== '');

                                    // A doc is a Pedido if it has practices AND NO surgery codes.
                                    // Otherwise it defaults to Internacion.
                                    const isPedidoDoc = hasPractices && !hasSurgeryCodes;
                                    const isInternacionDoc = !isPedidoDoc;
                                    const isMaterialDoc = previewData.incluyeMaterial && previewData.descripcionMaterial;

                                    return (
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                            {/* Primary Doc View (Internacion vs Pedido) */}
                                            <button
                                                onClick={() => setPreviewType(isPedidoDoc ? 'pedido' : 'internacion')}
                                                className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${(previewType === 'internacion' || previewType === 'pedido') ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                            >
                                                {isInternacionDoc ? 'Internación' : 'Pedido Médico'}
                                            </button>

                                            {/* Material views - Only for Internacion */}
                                            {isInternacionDoc && isMaterialDoc && (
                                                <>
                                                    <button
                                                        onClick={() => setPreviewType('material')}
                                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'material' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                                    >
                                                        Material
                                                    </button>
                                                    <button
                                                        onClick={() => setPreviewType('ambas')}
                                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'ambas' ? 'bg-gradient-to-r from-teal-600 to-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                                    >
                                                        📄 Ambas (2 pág.)
                                                    </button>
                                                </>
                                            )}

                                            {/* Extra Documents - Only for Internacion */}
                                            {isInternacionDoc && (
                                                <>
                                                    <button
                                                        onClick={() => setPreviewType('caratula')}
                                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'caratula' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                                    >
                                                        📂 Carátula
                                                    </button>

                                                    <button
                                                        onClick={() => window.open(`/consentimientos/${encodeURIComponent(CONSENTIMIENTO_GENERICO)}`, '_blank')}
                                                        className="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all ml-2"
                                                    >
                                                        📋 Genérico
                                                    </button>

                                                    {getApplicableConsents(previewData).length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-2 ml-4 pl-4 border-l border-slate-300">
                                                            <span className="text-xs font-bold text-slate-500 uppercase">Consentimientos:</span>
                                                            {getApplicableConsents(previewData).map((consent, idx) => (
                                                                <div key={idx} className="flex items-center gap-1">
                                                                    <span className="text-xs text-slate-600">{consent.nombre}:</span>
                                                                    {consent.adulto && (
                                                                        <button
                                                                            onClick={() => window.open(`/consentimientos/${encodeURIComponent(consent.adulto)}`, '_blank')}
                                                                            className="px-2 py-1 rounded-md font-bold text-xs bg-teal-100 text-teal-700 hover:bg-teal-200 transition-all"
                                                                        >
                                                                            Adulto
                                                                        </button>
                                                                    )}
                                                                    {consent.menor && (
                                                                        <button
                                                                            onClick={() => window.open(`/consentimientos/${encodeURIComponent(consent.menor)}`, '_blank')}
                                                                            className="px-2 py-1 rounded-md font-bold text-xs bg-pink-100 text-pink-700 hover:bg-pink-200 transition-all"
                                                                        >
                                                                            Menor
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            <button
                                                onClick={handleDownloadPDF}
                                                className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 shadow-lg shadow-teal-900/20 transition-all ml-auto ml-2"
                                            >
                                                <Download size={20} />
                                                <span className="hidden sm:inline">Descargar PDF</span>
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => window.print()}
                                    className={`flex items-center gap-2 px-6 py-2 text-white rounded-xl font-bold ${previewType === 'ambas' ? 'bg-gradient-to-r from-teal-600 to-purple-600' : previewType === 'material' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-teal-600 hover:bg-teal-700'}`}
                                >
                                    <Printer size={20} /> Imprimir / PDF
                                </button>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700"
                                >
                                    <X size={20} /> Cerrar
                                </button>
                            </div>
                        </div>

                        <div id="preview-content">
                            {previewType === 'ambas' ? (
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

            {/* WHATSAPP MODAL */}
            {whatsappModal && (
                <ModalPortal onClose={() => setWhatsappModal(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-100 dark:border-slate-800">
                        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                                <MessageCircle size={24} className="text-green-600 dark:text-green-400" />
                                Enviar WhatsApp
                            </h3>
                            <button onClick={() => setWhatsappModal(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="text-center">
                                <p className="text-slate-600 dark:text-slate-300">
                                    Enviar mensaje a <span className="font-bold text-slate-900 dark:text-white">{whatsappModal.afiliado}</span>
                                </p>
                                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                                    📱 {whatsappModal.telefono}
                                </p>
                            </div>

                            <div className="space-y-4">
                                <button
                                    onClick={async () => {
                                        const fecha = whatsappModal.fechaCirugia ?
                                            new Date(whatsappModal.fechaCirugia + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                            : 'sin fecha';
                                        const mensaje = `Buen día, le escribe Emmanuel del área de internaciones COAT.\n\n * ${whatsappModal.afiliado}* tiene agendada una cirugía el día * ${fecha}* con * ${whatsappModal.profesional}*.En el caso de su obra social, la autorización la gestiona el paciente.\n\nA continuación envío orden de internación para que pueda gestionar la autorización con su obra social.`;
                                        await navigator.clipboard.writeText(mensaje);
                                        setWhatsappModal(null);
                                        setCopiedToast(true);
                                        setTimeout(() => setCopiedToast(false), 3000);
                                    }}
                                    className="w-full p-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-bold hover:from-green-600 hover:to-emerald-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-900/20"
                                >
                                    <User size={20} />
                                    <span>Autoriza el Paciente</span>
                                </button>

                                <button
                                    onClick={async () => {
                                        const fecha = whatsappModal.fechaCirugia ?
                                            new Date(whatsappModal.fechaCirugia + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                            : 'sin fecha';
                                        const mensaje = `Buen día, le escribe Emmanuel del área de internaciones COAT.\n\n * ${whatsappModal.afiliado}* tiene agendada una cirugía el día * ${fecha}* con * ${whatsappModal.profesional}*.En el caso de su obra social, la autorización la gestionamos nosotros.\n\nPara poder comenzar la gestión con su obra social le voy a solicitar que envíe estudios realizados de nariz, garganta y oído.`;
                                        await navigator.clipboard.writeText(mensaje);
                                        setWhatsappModal(null);
                                        setCopiedToast(true);
                                        setTimeout(() => setCopiedToast(false), 3000);
                                    }}
                                    className="w-full p-5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-2xl font-bold hover:from-blue-600 hover:to-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-900/20"
                                >
                                    <Building2 size={20} />
                                    <span>Autoriza la Institución</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setWhatsappModal(null)}
                                className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                            >
                                Cancelar
                            </button>
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
    );
};

export default OrdenesView;
