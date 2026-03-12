import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Save as SaveIcon, FileText, Printer, Download, Plus, X, Calendar, User, Building2, Hash,
    Stethoscope, Pill, ClipboardList, Edit3, Trash2, Package, FileStack, Search,
    CheckCircle2, ArchiveRestore, ShieldCheck, Truck, Folder, Phone, MessageCircle,
    FileHeart, AlertCircle, Clock, Home, StickyNote, LayoutGrid, List, Ban,
    TableProperties, Sparkles, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, USE_LOCAL_DB } from '../firebase/config';
import { collection, addDoc, updateDoc, doc, getDocs, deleteDoc, query, where, getDoc, writeBatch } from 'firebase/firestore';
import apiService from '../services/apiService';
import { parseEmailToOrder } from '../services/aiService';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { CODIGOS_CIRUGIA, MODULOS_SM, CODIGOS_IOSFA, PRACTICAS_MEDICAS } from '../data/codigos';
import { CONSENTIMIENTOS_MAP, CONSENTIMIENTOS_COMBO, CONSENTIMIENTO_GENERICO } from '../data/consentimientos';
import html2pdf from 'html2pdf.js';

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
    const { viewingUid, catalogOwnerUid, isSuperAdmin, permissions, linkedProfesionalName } = useAuth();
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
    const [activeTab, setActiveTab] = useState(initialTab); // 'internacion' | 'pedidos'
    const [pedidos, setPedidos] = useState([]); // List of medical orders (pedidos)
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

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
    };

    const [formData, setFormData] = useState(emptyForm);

    const printStyle = `
@media print {
    @page { size: A4; margin: 0; }
    .no-print { display: none !important; }
    #root { display: none !important; }
    .print-orden {
        display: block !important;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: auto !important;
        background: white;
        color: black;
        overflow: visible !important;
        z-index: 9999;
    }
    body { background: white !important; overflow: visible !important; }
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
                const profsAll = await apiService.getCollection("profesionales", { userId: ownerToUse });
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
            const filters = { userId: ownerToUse };
            if (linkedProfesionalName && !isSuperAdmin && !permissions?.can_view_shared_catalog) {
                filters.profesional = linkedProfesionalName;
            }

            const items = await apiService.getCollection("ordenes_internacion", filters);

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

    const fetchPedidos = async () => {
        const ownerToUse = catalogOwnerUid || viewingUid;
        if (!ownerToUse) return;
        try {
            const filters = { userId: ownerToUse };
            if (linkedProfesionalName && !isSuperAdmin && !permissions?.can_view_shared_catalog) {
                filters.profesional = linkedProfesionalName;
            }

            const items = await apiService.getCollection("pedidos_medicos", filters);

            items.sort((a, b) => {
                const dateA = a.fechaDocumento || a.createdAt;
                const dateB = b.fechaDocumento || b.createdAt;
                // Sort descending by date (newest first)
                return new Date(dateB) - new Date(dateA);
            });
            setPedidos(items);
        } catch (error) {
            console.error("Error fetching medical orders:", error);
        }
    };

    useEffect(() => {
        fetchOrdenes();
        fetchPedidos();
    }, [viewingUid, catalogOwnerUid]);

    useEffect(() => {
        if (draftData) {
            const currentKey = `${draftData.id || 'new'} -${activeTab} `;
            if (lastInitializedKey.current === currentKey) return;

            // Processing draftData for robust form loading
            const processedData = { ...draftData };

            // Age compatibility
            if (!processedData.edad && draftData.edad) processedData.edad = draftData.edad;

            // Practice codes compatibility and padding
            if (activeTab === 'pedidos') {
                let practicas = processedData.practicas || [];
                while (practicas.length < 5) practicas.push('');
                processedData.practicas = practicas;
            } else {
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
            }

            setFormData(prev => ({
                ...prev,
                ...processedData
            }));

            if (draftData.id) {
                setEditingId(draftData.id);
            }
            setShowForm(true);

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
            const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
            const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday

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
            const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
            const end = endOfWeek(now, { weekStartsOn: 1 }); // Sunday

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

    const handleDownloadPDF = () => {
        const element = document.getElementById('preview-content');
        if (!element) return;

        const opt = {
            margin: 0,
            filename: `${previewData.afiliado || 'documento'}_${previewData.fechaDocumento}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, windowHeight: element.scrollHeight },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        html2pdf().from(element).set(opt).save();
    };



    const addCodigo = () => {
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
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
                    {/* Header with Title + AI Button */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-50">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 bg-${accentColor}-50 rounded-xl text-${accentColor}-600`}>
                                {editingId ? <Edit3 size={20} /> : <Plus size={20} />}
                            </div>
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                                {editingId ? 'Editar Documento' : `Nueva ${isPedido ? 'Pedido' : 'Orden'}`}
                            </h3>
                        </div>
                        {!editingId && !isPedido && (
                            <button
                                type="button"
                                onClick={() => { setShowAIInput(!showAIInput); setAiError(''); }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showAIInput
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-200'
                                    : 'bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 border border-violet-200 hover:shadow-md hover:shadow-violet-100'
                                    }`}
                            >
                                <Sparkles size={16} />
                                Auto-completar con IA
                            </button>
                        )}
                    </div>

                    {/* AI Paste Area */}
                    {showAIInput && !isPedido && (
                        <div className="bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 p-6 rounded-2xl border border-violet-200 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
                                <Sparkles size={16} className="text-violet-500" />
                                Pegá el contenido del email y la IA completará el formulario
                            </div>
                            <textarea
                                value={aiInputText}
                                onChange={(e) => setAiInputText(e.target.value)}
                                placeholder={'Pegá acá el texto del email...\n\nEjemplo:\nNombre y Apellido del Profesional: Dr. Pérez\nFecha de la Cirugia: Abr 10, 2026\nNombre y Apellido del Paciente: GONZALEZ JUAN\nObra Social: OSDE\nDNI: 12345678\n...'}
                                className="w-full px-5 py-4 bg-white border border-violet-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-violet-100 focus:border-violet-400 transition-all min-h-[160px] text-sm font-mono text-slate-700 placeholder:text-slate-400 resize-y"
                                disabled={aiLoading}
                            />
                            {aiError && (
                                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">
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
                                                if (result.profesional) merged.profesional = result.profesional;
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
                                    className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Professional Selection */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            <User size={12} className={`text-${accentColor}-500`} /> Profesional
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
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} ${linkedProfesionalName ? 'bg-slate-50 cursor-not-allowed font-bold' : ''}`}
                                placeholder="Escribe para buscar..."
                                required
                            />
                            {!linkedProfesionalName && showProfSuggestions && (
                                <div className="absolute z-50 top-full mt-2 left-0 w-full bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                    {profesionales
                                        .filter(p => p.nombre.toLowerCase().includes(formData.profesional.toLowerCase()))
                                        .map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    handleInputChange('profesional', p.nombre);
                                                    setShowProfSuggestions(false);
                                                }}
                                                className={`px-5 py-3.5 cursor-pointer hover:bg-${accentColor}-50 transition-colors border-b border-slate-50 last:border-0`}
                                            >
                                                <p className="text-sm font-bold text-slate-700">{p.nombre}</p>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tutor (if active) */}
                    {isResidente && (
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <Stethoscope size={12} className={`text-${accentColor}-500`} /> Tutor a Cargo
                            </label>
                            <select
                                value={formData.tutor}
                                onChange={(e) => handleInputChange('tutor', e.target.value)}
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass}`}
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
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <User size={12} className={`text-${accentColor}-500`} /> Afiliado
                            </label>
                            <input
                                type="text"
                                value={formData.afiliado}
                                onChange={(e) => handleInputChange('afiliado', e.target.value.toUpperCase())}
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold uppercase ${ringClass}`}
                                placeholder="APELLIDO NOMBRE"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <Building2 size={12} className={`text-${accentColor}-500`} /> Obra Social
                            </label>
                            <input
                                type="text"
                                value={formData.obraSocial}
                                onChange={(e) => handleInputChange('obraSocial', e.target.value)}
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass}`}
                                placeholder="Galeno, OSDE, etc."
                            />
                        </div>
                    </div>

                    {/* Patient Data Row 2: N Afiliado | DNI | Habitacion */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <Hash size={12} className={`text-${accentColor}-500`} /> N° Afiliado
                            </label>
                            <input
                                type="text"
                                value={formData.numeroAfiliado}
                                onChange={(e) => handleInputChange('numeroAfiliado', e.target.value)}
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass}`}
                                placeholder="14843"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <Hash size={12} className={`text-${accentColor}-500`} /> DNI
                            </label>
                            <input
                                type="text"
                                value={formData.dni}
                                onChange={(e) => handleInputChange('dni', e.target.value)}
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass}`}
                                placeholder="45836670"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <Home size={12} className={`text-${accentColor}-500`} /> Habitación
                            </label>
                            <input
                                type="text"
                                value={formData.habitacion}
                                onChange={(e) => handleInputChange('habitacion', e.target.value.toUpperCase())}
                                className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all uppercase ${ringClass}`}
                                placeholder="B, 101, etc."
                            />
                        </div>
                    </div>

                    {/* WhatsApp */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            <Phone size={12} className={`text-${accentColor}-500`} /> Teléfono (WhatsApp)
                        </label>
                        <input
                            type="tel"
                            value={formData.telefono}
                            onChange={(e) => handleInputChange('telefono', e.target.value)}
                            className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass}`}
                            placeholder="3512345678 (sin 0 ni 15)"
                        />
                    </div>

                    {/* Codes Section */}
                    <div className="space-y-4 pt-6 border-t border-slate-50">
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <Hash size={12} className={`text-${accentColor}-500`} /> {isPedido ? 'Prácticas (Rp/)' : 'Códigos de Cirugía'}
                            </label>
                            <button
                                type="button"
                                onClick={isPedido ? () => setFormData(prev => ({ ...prev, practicas: [...prev.practicas, ''] })) : addCodigo}
                                className={`flex items-center gap-1.5 px-4 py-1.5 bg-${accentColor}-50 text-${accentColor}-700 rounded-xl text-xs font-bold hover:bg-${accentColor}-100 transition-all border border-${accentColor}-100`}
                            >
                                <Plus size={14} /> Agregar
                            </button>
                        </div>

                        <div className="space-y-3">
                            {isPedido ? (
                                formData.practicas && formData.practicas.map((practica, index) => (
                                    <div key={index} className="flex gap-3 items-center group">
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={practica}
                                                onChange={(e) => {
                                                    const newVal = e.target.value;
                                                    setFormData(prev => {
                                                        const newPracticas = [...prev.practicas];
                                                        newPracticas[index] = newVal;
                                                        return { ...prev, practicas: newPracticas };
                                                    });
                                                    setActiveRow({ index, field: 'practica' });
                                                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                                                    searchTimeoutRef.current = setTimeout(() => {
                                                        handleSearch(newVal, 'nombre', formData.obraSocial);
                                                    }, 300);
                                                }}
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                className={`w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-sm font-bold uppercase`}
                                                placeholder="Ingrese práctica..."
                                            />
                                            {activeRow?.index === index && activeRow?.field === 'practica' && suggestions.length > 0 && (
                                                <div className="absolute z-50 top-full mt-2 left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {suggestions.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectPedidoSuggestion(s, index)}
                                                            className={`px-5 py-3.5 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-pink-50 transition-colors`}
                                                        >
                                                            <p className="text-sm font-bold text-slate-800">{s.nombre}</p>
                                                            {s.codigo && <p className="text-xs text-slate-400">Código: {s.codigo}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, practicas: prev.practicas.filter((_, i) => i !== index) }))}
                                            className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                formData.codigosCirugia.map((cod, index) => (
                                    <div key={index} className="flex gap-3 items-center group">
                                        <div className="w-32">
                                            <input
                                                type="text"
                                                value={cod.codigo}
                                                onChange={(e) => handleCodigoChangeAndSearch(index, 'codigo', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-sm font-mono font-bold text-teal-700`}
                                                placeholder="031301"
                                            />
                                        </div>
                                        <div className="flex-1 relative">
                                            <input
                                                type="text"
                                                value={cod.nombre}
                                                onChange={(e) => handleCodigoChangeAndSearch(index, 'nombre', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index)}
                                                className={`w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none ring-offset-0 transition-all ${ringClass} text-sm font-medium`}
                                                placeholder="Nombre de la cirugía"
                                            />
                                            {activeRow?.index === index && suggestions.length > 0 && (
                                                <div className="absolute z-50 top-full mt-2 left-0 w-full bg-white border border-slate-100 rounded-2xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {suggestions.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectSuggestion(s, index)}
                                                            className={`px-5 py-3.5 cursor-pointer border-b border-slate-100 last:border-0 hover:bg-teal-50 transition-colors`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-teal-100 text-teal-700">
                                                                    {s.codigo}
                                                                </span>
                                                                <span className="text-sm font-bold text-slate-700">{s.nombre}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeCodigo(index)}
                                            className="p-2.5 text-red-400 hover:bg-red-50 rounded-xl transition-colors"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Surgery Details: Anesthesia | Date | Time */}
                    {!isPedido && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-50">
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                    <Stethoscope size={12} className={`text-${accentColor}-500`} /> Tipo de Anestesia
                                </label>
                                <select
                                    value={formData.tipoAnestesia}
                                    onChange={(e) => handleInputChange('tipoAnestesia', e.target.value)}
                                    className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold text-slate-700 ${ringClass}`}
                                >
                                    <option value="general">General</option>
                                    <option value="local">Local</option>
                                    <option value="regional">Regional</option>
                                    <option value="sedación">Sedación</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                    <Calendar size={12} className={`text-${accentColor}-500`} /> Fecha
                                </label>
                                <input
                                    type="date"
                                    value={formData.fechaCirugia}
                                    onChange={(e) => handleInputChange('fechaCirugia', e.target.value)}
                                    className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all font-bold ${ringClass}`}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                    <Clock size={12} className={`text-${accentColor}-500`} /> Hora
                                </label>
                                <input
                                    type="time"
                                    value={formData.horaCirugia}
                                    onChange={(e) => handleInputChange('horaCirugia', e.target.value)}
                                    className={`w-full px-5 py-3.5 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all font-black ${ringClass}`}
                                />
                            </div>
                        </div>
                    )}

                    {/* Material Section */}
                    {!isPedido && (
                        <div className={`p-6 rounded-[2rem] border-2 transition-all ${formData.incluyeMaterial ? 'border-purple-200 bg-purple-50/50' : 'border-slate-100 bg-slate-50/30'}`}>
                            <label className="flex items-center gap-4 cursor-pointer group">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${formData.incluyeMaterial ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white border border-slate-200 text-slate-300'}`}>
                                    <Package size={18} />
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.incluyeMaterial}
                                    onChange={(e) => handleInputChange('incluyeMaterial', e.target.checked)}
                                    className="hidden"
                                />
                                <span className={`font-black text-sm uppercase tracking-tight transition-colors ${formData.incluyeMaterial ? 'text-purple-700' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                    Incluir Material
                                </span>
                            </label>

                            {formData.incluyeMaterial && (
                                <div className="mt-6 animate-in slide-in-from-top-2 fade-in duration-300">
                                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 ml-1">
                                        Descripción del Material
                                    </label>
                                    <textarea
                                        value={formData.descripcionMaterial}
                                        onChange={(e) => handleInputChange('descripcionMaterial', e.target.value)}
                                        className="w-full px-5 py-4 bg-white border border-purple-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-100 focus:border-purple-300 transition-all min-h-[120px] shadow-sm text-slate-700 font-medium"
                                        placeholder="Especifique materiales necesarios..."
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom Row: Diagnosis | Observations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-50">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <ClipboardList size={12} className={`text-${accentColor}-500`} /> Diagnóstico
                            </label>
                            <textarea
                                value={formData.diagnostico}
                                onChange={(e) => handleInputChange('diagnostico', e.target.value)}
                                className={`w-full px-5 py-4 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all min-h-[100px] ${ringClass} text-sm font-medium`}
                                placeholder="SAHOS, IVN, etc."
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                <StickyNote size={12} className={`text-${accentColor}-500`} /> {isPedido ? 'Observaciones' : 'Anotaciones'}
                            </label>
                            <textarea
                                value={isPedido ? formData.observaciones : formData.anotacionCalendario}
                                onChange={(e) => handleInputChange(isPedido ? 'observaciones' : 'anotacionCalendario', e.target.value)}
                                className={`w-full px-5 py-4 ${bgInput} rounded-2xl focus:outline-none ring-offset-0 transition-all min-h-[100px] ${ringClass} text-sm font-medium`}
                                placeholder="Notas internas..."
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-4 pt-4">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-[2] py-4 bg-${accentColor}-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-${accentColor}-700 transition-all shadow-xl shadow-${accentColor}-200 flex items-center justify-center gap-2 disabled:opacity-50`}
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

            // IF WE ARE IN "PEDIDOS" TAB: Search ONLY in PRACTICAS_MEDICAS
            if (activeTab === 'pedidos') {
                const practiceMatches = (PRACTICAS_MEDICAS || []).filter(p =>
                    p.nombre && p.nombre.toLowerCase().includes(term)
                );
                setSuggestions(practiceMatches.slice(0, 15));
                setHighlightedIndex(0);
                return;
            }

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
        // CASE 1: Reference to a Module with children (drill-down)
        if (suggestion.isModule && suggestion.incluye && suggestion.incluye.length > 0) {
            const childSurgeries = suggestion.incluye.map(code => {
                const found = CODIGOS_CIRUGIA.find(c => c.codigo === code);
                return found || { codigo: code, nombre: 'Consultar Nomenclador' };
            });

            // Update suggestions to show children and keep dropdown open
            // We tag them with the parent module so we know how to format the final string
            setSuggestions(childSurgeries.map(s => ({ ...s, parentModule: suggestion })));
            return;
        }

        // CASE 2: Child surgery selected (drill-down complete)
        if (suggestion.parentModule) {
            setFormData(prev => {
                const newCodigos = [...prev.codigosCirugia];
                newCodigos[index] = {
                    codigo: suggestion.parentModule.codigo,
                    nombre: `${suggestion.parentModule.nombre} - ${suggestion.codigo} ${suggestion.nombre}`
                };
                return { ...prev, codigosCirugia: newCodigos };
            });
        }
        else if (suggestion.isIOSFA) {
            setFormData(prev => {
                const newCodigos = [...prev.codigosCirugia];
                // Save format: IOSFA_CODE in code field, GENERAL_CODE + NAME in name field
                newCodigos[index] = {
                    codigo: suggestion.codigo,
                    nombre: `${suggestion.codigoGeneral} ${suggestion.nombre}`
                };
                return { ...prev, codigosCirugia: newCodigos };
            });
        }
        // CASE 3: Standard selection
        else {
            setFormData(prev => {
                const newCodigos = [...prev.codigosCirugia];
                newCodigos[index] = { codigo: suggestion.codigo, nombre: suggestion.nombre };
                return { ...prev, codigosCirugia: newCodigos };
            });
        }

        setSuggestions([]);
        setActiveRow(null);
    };

    const selectPedidoSuggestion = (suggestion, index) => {
        setFormData(prev => {
            const newPracticas = [...prev.practicas];
            newPracticas[index] = suggestion.nombre;
            return { ...prev, practicas: newPracticas };
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
            if (activeTab === 'pedidos') {
                selectPedidoSuggestion(suggestions[highlightedIndex], index);
            } else {
                selectSuggestion(suggestions[highlightedIndex], index);
            }
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

            const collectionName = activeTab === 'pedidos' ? "pedidos_medicos" : "ordenes_internacion";

            if (editingId) {
                await apiService.updateDocument(collectionName, editingId, orderData);
            } else {
                orderData.createdAt = new Date().toISOString();
                await apiService.addDocument(collectionName, orderData);
            }

            if (activeTab === 'pedidos') {
                await fetchPedidos();
                setPreviewType('pedido');
            } else {
                await fetchOrdenes();
                setPreviewType(orderData.incluyeMaterial && orderData.descripcionMaterial ? 'ambas' : 'internacion');

                // Send Email Notification (ONLY IN CLOUD MODE)
                if (!editingId && !USE_LOCAL_DB) {
                    try {
                        const emailDoc = await getDoc(doc(db, "settings", "notifications"));
                        if (emailDoc.exists()) {
                            const { emails, scriptUrl } = emailDoc.data();
                            if (scriptUrl && emails) {
                                // ... (Email trigger logic stays same but wrapped in !USE_LOCAL_DB)
                                const emailBody = `NUEVA INTERNACIÓN REGISTRADA\nPaciente: ${orderData.afiliado}\nProfesional: ${orderData.profesional}`;
                                fetch(scriptUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ to: emails, subject: `Nueva Internación: ${orderData.afiliado}`, body: emailBody }) })
                                    .catch(err => console.error("Cloud Email trigger error:", err));
                            }
                        }
                    } catch (e) {
                        console.error("Failed to trigger cloud email:", e);
                    }
                }

                // Internal App Notification (ONLY IN CLOUD MODE)
                if (isAuditoria && !USE_LOCAL_DB) {
                    try {
                        const emailDoc = await getDoc(doc(db, "settings", "notifications"));
                        if (emailDoc.exists()) {
                            const { appNotificationUids } = emailDoc.data();
                            if (appNotificationUids && appNotificationUids.length > 0) {
                                const batch = writeBatch(db);
                                appNotificationUids.forEach(uid => {
                                    const notifRef = doc(collection(db, "notifications"));
                                    batch.set(notifRef, { userId: uid, title: "Cirugía Auditada", message: `La cirugía de ${orderData.afiliado} ha sido auditada.`, type: 'auditoria', read: false, createdAt: new Date().toISOString() });
                                });
                                await batch.commit();
                            }
                        }
                    } catch (e) {
                        console.error("Failed to trigger app notification:", e);
                    }
                }
            }

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
        if (activeTab === 'pedidos') {
            // Ensure at least 5 rows for practices
            let practicas = orden.practicas || [];
            while (practicas.length < 5) practicas.push('');

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
                practicas,
                codigosCirugia: emptyForm.codigosCirugia,
                diagnostico: orden.diagnostico || '',
                observaciones: orden.observaciones || '',
                anotacionCalendario: orden.anotacionCalendario || '',
                suspendida: orden.suspendida || false,
                fechaDocumento: orden.fechaDocumento || new Date().toISOString().split('T')[0]
            });
        } else {
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
        }
        setEditingId(orden.id);
        setShowForm(true);
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
        const newStatus = !orden.enviada;
        const collectionName = activeTab === 'pedidos' ? "pedidos_medicos" : "ordenes_internacion";

        // Optimistic update
        if (activeTab === 'pedidos') {
            setPedidos(prev => prev.map(o => o.id === orden.id ? { ...o, enviada: newStatus } : o));
        } else {
            setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, enviada: newStatus } : o));
        }

        try {
            await apiService.updateDocument(collectionName, orden.id, { enviada: newStatus });
        } catch (error) {
            console.error("Error updating status:", error);
            // Revert on error
            if (activeTab === 'pedidos') {
                setPedidos(prev => prev.map(o => o.id === orden.id ? { ...o, enviada: !newStatus } : o));
            } else {
                setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, enviada: !newStatus } : o));
            }
            alert("No se pudo actualizar el estado.");
        }
    };

    const handleToggleField = async (orden, field) => {
        const newValue = !orden[field];
        const collectionName = activeTab === 'pedidos' ? "pedidos_medicos" : "ordenes_internacion";

        // Optimistic update
        if (activeTab === 'pedidos') {
            setPedidos(prev => prev.map(o => o.id === orden.id ? { ...o, [field]: newValue } : o));
        } else {
            setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, [field]: newValue } : o));
        }

        try {
            await apiService.updateDocument(collectionName, orden.id, { [field]: newValue });
        } catch (error) {
            console.error(`Error updating ${field}: `, error);
            // Revert on error
            if (activeTab === 'pedidos') {
                setPedidos(prev => prev.map(o => o.id === orden.id ? { ...o, [field]: !newValue } : o));
            } else {
                setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, [field]: !newValue } : o));
            }
            alert("No se pudo actualizar. Verifica tus permisos.");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Confirmar eliminación definitiva de este documento? No se podrá deshacer.")) return;

        setLoading(true);
        const collectionName = activeTab === 'pedidos' ? "pedidos_medicos" : "ordenes_internacion";

        try {
            await apiService.deleteDocument(collectionName, id);

            // Success: update local state
            if (activeTab === 'pedidos') {
                setPedidos(prev => prev.filter(o => o.id !== id));
            } else {
                setOrdenes(prev => prev.filter(o => o.id !== id));
            }
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
        return `${d} /${m}/${y} `;
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
            // Check if we have a match in map for "dr_surname" or "dra_surname"
            const shorthand = `${parts[0]}_${parts[1]}`;
            // Search in filenames we know
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
                                        <td className="border border-slate-300 p-2">{shortProfName(o.tutor || o.profesional)}</td>
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
                <div className="max-w-[210mm] mx-auto bg-white print:max-w-none flex flex-col items-center text-center" style={{ minHeight: '297mm', fontFamily: 'Arial, sans-serif', paddingTop: '4cm', lineHeight: '1.0', position: 'relative' }}>
                    {previewData.habitacion && (
                        <div style={{ position: 'absolute', top: '1cm', right: '2cm', fontSize: '18pt' }}>
                            {previewData.habitacion}
                        </div>
                    )}
                    <span style={{ fontSize: '24pt' }}>{(previewData.afiliado || '').toUpperCase()}</span><br />
                    <span style={{ fontSize: '24pt' }}>DNI {previewData.dni || '-'}</span><br />
                    <span style={{ fontSize: '24pt' }}>{(previewData.obraSocial || '').toUpperCase()}</span><br />
                    <span style={{ fontSize: '24pt' }}>{(shortProfName(previewData.tutor || previewData.profesional) || '').toUpperCase()}</span><br />
                    <span style={{ fontSize: '24pt' }}>{formatDate(previewData.fechaCirugia || previewData.fechaDocumento)}</span><br />
                    <span style={{ fontSize: '24pt' }}>ALERGIA (-)</span>
                </div>
            );
        }

        // Handle Pedido Médico
        if (type === 'pedido') {
            return (
                <div className="max-w-[210mm] mx-auto bg-white px-16 py-12 print:max-w-none relative" style={{ minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>

                    {/* Header: Logo and Date */}
                    <div className="mb-12 text-center relative">
                        <img
                            src="/coat_logo.png"
                            alt="COAT"
                            className="h-20 object-contain mx-auto mb-4"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <p className="text-sm text-right absolute right-0 top-20" style={{ color: '#000' }}>
                            Córdoba, {new Date(previewData.fechaDocumento).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>

                    {/* Patient Info */}
                    <div className="space-y-1 text-base mb-12" style={{ color: '#000', lineHeight: '1.6' }}>
                        <p><span className="font-bold">Paciente:</span> {previewData.afiliado}</p>
                        <p><span className="font-bold">Obra social:</span> {previewData.obraSocial}</p>
                        <p><span className="font-bold">Nº de af:</span> {previewData.numeroAfiliado}</p>
                        <p><span className="font-bold">Diagnóstico:</span> {previewData.diagnostico}</p>
                    </div>

                    {/* Body: Practices */}
                    <div className="mb-12">
                        <h3 className="font-bold underline mb-4 text-lg">Rp/</h3>
                        <div className="pl-8 space-y-2 uppercase text-lg">
                            {previewData.practicas && previewData.practicas.map((p, idx) => (
                                p && <p key={idx}>{p}</p>
                            ))}
                        </div>
                    </div>

                    {/* Footer: Diagnosis and Signature */}
                    <div className="absolute bottom-32 left-16 right-16">
                        <div className="flex justify-end items-end">
                            <div className="text-center min-w-[200px]">
                                <div className="h-24 flex items-end justify-center mb-2">
                                    <img
                                        src={getSignatureUrl(previewData.tutor || previewData.profesional)}
                                        alt={`Firma ${previewData.tutor || previewData.profesional} `}
                                        className="h-24 object-contain mx-auto"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                </div>
                                <div className="border-t border-black pt-1">
                                    <p className="font-bold text-xs uppercase">{(previewData.tutor || previewData.profesional)}</p>
                                    {(() => {
                                        const pData = getProfesionalData(previewData.tutor || previewData.profesional);
                                        return pData.mp ? (
                                            <p className="text-[10px]">M.P. {pData.mp} {pData.me ? `- M.E. ${pData.me}` : ''}</p>
                                        ) : null;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Handle Default (Internacion / Material)
        const isInternacion = type === 'internacion';
        const title = isInternacion ? 'ORDEN DE INTERNACIÓN' : 'ORDEN DE PEDIDO DE MATERIAL';

        return (
            <div className="max-w-[210mm] mx-auto bg-white px-16 py-12 print:max-w-none" style={{ minHeight: '297mm', fontFamily: 'Times New Roman, serif' }}>
                <div className="mb-8">
                    <img
                        src="/coat_logo.png"
                        alt="COAT"
                        className="h-16 object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <p className="text-sm text-right -mt-4" style={{ color: '#333' }}>
                        Córdoba, {formatDate(previewData.fechaDocumento)}
                    </p>
                </div>

                <h1 className="text-center text-base font-normal mb-10 tracking-wide" style={{ color: '#000' }}>
                    {title}
                </h1>

                <div className="space-y-2 text-sm leading-relaxed" style={{ color: '#333' }}>
                    <p><span className="font-semibold">Afiliado:</span> {previewData.afiliado}</p>
                    <p><span className="font-semibold">Obra social:</span> {previewData.obraSocial}</p>
                    <p><span className="font-semibold">Número de afiliado:</span> {previewData.numeroAfiliado}</p>
                    {previewData.dni && <p><span className="font-semibold">DNI:</span> {previewData.dni}</p>}

                    {isInternacion ? (
                        <div className="pt-4">
                            <span className="font-semibold">Códigos de cirugía:</span>
                            {previewData.codigosCirugia && previewData.codigosCirugia.length > 0 ? (
                                <div className="ml-32 -mt-5">
                                    {previewData.codigosCirugia.map((cod, idx) => (
                                        <p key={idx}>{cod.codigo}{cod.nombre ? ` ${cod.nombre} ` : ''}</p>
                                    ))}
                                </div>
                            ) : <span className="ml-2">-</span>}
                        </div>
                    ) : (
                        <p className="pt-4 whitespace-pre-wrap">{previewData.descripcionMaterial}</p>
                    )}

                    <p className="pt-4"><span className="font-semibold">Tipo de anestesia:</span> {previewData.tipoAnestesia}</p>
                    <p className="pt-4"><span className="font-semibold">Fecha de cirugía:</span> {formatDate(previewData.fechaCirugia)}</p>
                    <p className="pt-4"><span className="font-semibold">Material:</span> {previewData.incluyeMaterial ? 'sí' : 'no'}</p>
                    <p className="pt-4"><span className="font-semibold">Diagnóstico:</span> {previewData.diagnostico}</p>
                </div>

                <div className="mt-16 flex justify-end">
                    <div className="text-center min-w-[200px]">
                        <div className="h-24 flex items-end justify-center mb-2">
                            <img
                                src={getSignatureUrl(previewData.tutor || previewData.profesional)}
                                alt={`Firma ${previewData.tutor || previewData.profesional} `}
                                className="h-24 object-contain mx-auto"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        </div>
                        <div className="border-t border-black pt-1">
                            <p className="font-bold text-xs uppercase">{(previewData.tutor || previewData.profesional)}</p>
                            {(() => {
                                const pData = getProfesionalData(previewData.tutor || previewData.profesional);
                                return pData.mp ? (
                                    <p className="text-[10px]">M.P. {pData.mp} {pData.me ? `- M.E. ${pData.me}` : ''}</p>
                                ) : null;
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Allow access to Super Admin or users with can_view_ordenes permission (COAT)
    const canViewOrdenes = isSuperAdmin || permissions?.can_view_ordenes;
    // Allow creating orders only for Super Admin or users with can_share_ordenes permission
    const canShareOrdenes = isSuperAdmin || permissions?.can_share_ordenes;

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
    const listToFilter = activeTab === 'pedidos' ? pedidos : ordenes;

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
            if (urgentA && !urgentB) return -1;
            if (!urgentA && urgentB) return 1;
            const dateA = a.fechaCirugia || a.createdAt;
            const dateB = b.fechaCirugia || b.createdAt;
            return new Date(dateB) - new Date(dateA);
        });
    }, [activeTab, pedidos, ordenes, filterProfesional, filterObraSocial, filterDate, filterStatus, filterAudit, searchPaciente, filterPeriodo]);

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
            <div className="bg-gradient-to-br from-teal-600 to-teal-700 text-white p-6 rounded-2xl shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            {activeTab === 'pedidos' ? <FileHeart size={28} /> : <FileText size={28} />}
                            {activeTab === 'pedidos' ? 'Pedidos' : 'Órdenes de Internación'}
                        </h2>
                        <p className="text-teal-100 text-sm mt-1">
                            {canShareOrdenes
                                ? (activeTab === 'pedidos' ? 'Genera pedidos y recetas.' : 'Crea órdenes de internación y pedidos de material.')
                                : 'Visualiza el historial de documentos.'}
                        </p>
                    </div>
                    <div className="flex bg-teal-800/30 p-1 rounded-xl">
                        <button
                            onClick={() => { if (activeTab !== 'internacion') resetForm(); setActiveTab('internacion'); }}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'internacion' ? 'bg-white text-teal-700 shadow-md' : 'text-teal-100 hover:bg-white/10'}`}
                        >
                            Internación
                        </button>
                        <button
                            onClick={() => { if (activeTab !== 'pedidos') resetForm(); setActiveTab('pedidos'); }}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'pedidos' ? 'bg-white text-teal-700 shadow-md' : 'text-teal-100 hover:bg-white/10'}`}
                        >
                            Pedidos
                        </button>
                    </div>

                    {!modalMode && canViewOrdenes && (
                        <div className="flex items-center gap-3">
                            {activeTab === 'internacion' && canShareOrdenes && (
                                <>
                                    <button
                                        onClick={handleExportWeeklyExcel}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-teal-800 text-teal-100 rounded-xl font-bold hover:bg-teal-900 transition-all shadow-lg shadow-teal-950/20 border border-teal-600"
                                        title="Descargar Excel Semanal"
                                    >
                                        <TableProperties size={20} />
                                        <span className="hidden sm:inline">Excel</span>
                                    </button>
                                    <button
                                        onClick={handlePrintWeeklyReport}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg shadow-slate-950/20 border border-slate-700"
                                        title="Imprimir Control Semanal"
                                    >
                                        <Printer size={20} />
                                        <span className="hidden sm:inline">Imprimir Control</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => { resetForm(); setShowForm(true); }}
                                className="flex items-center gap-2 px-6 py-3 bg-white text-teal-700 rounded-xl font-bold hover:bg-teal-50 transition-all shadow-lg ml-2"
                            >
                                <Plus size={20} />
                                {activeTab === 'pedidos' ? 'Nuevo Pedido' : 'Nueva Orden'}
                            </button>
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
                        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden relative">
                            <button
                                onClick={resetForm}
                                className="absolute top-6 right-6 p-2 h-10 w-10 flex items-center justify-center hover:bg-slate-100 rounded-full text-slate-400 transition-colors z-10"
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
                    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-4 border-teal-500 animate-in zoom-in-95 duration-300 flex flex-col flex-1 min-h-0">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white z-10 font-sans shrink-0">
                            <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                {editingId ? <Edit3 size={28} className="text-teal-600" /> : <Plus size={28} className="text-teal-600" />}
                                {editingId ? 'Editar Documento' : (activeTab === 'pedidos' ? 'Nuevo Pedido' : 'Nueva Orden')}
                            </h3>
                            <button type="button" onClick={onClose} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
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
                <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <h3 className="font-bold text-slate-700">Historial de Órdenes</h3>
                                <div className="flex bg-slate-200/50 p-1 rounded-lg">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="Vista de Lista"
                                    >
                                        <List size={18} />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        title="Vista de Mosaico"
                                    >
                                        <LayoutGrid size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Filter by Period */}
                                <select
                                    value={filterPeriodo}
                                    onChange={(e) => setFilterPeriodo(e.target.value)}
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-teal-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                                    onChange={(e) => setFilterDate(e.target.value)}
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                                {/* Filter by Professional */}
                                <select
                                    value={filterProfesional}
                                    onChange={(e) => setFilterProfesional(e.target.value)}
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                >
                                    <option value="">Todas las Obras Sociales</option>
                                    {[...new Set(listToFilter.map(o => o.obraSocial?.trim().toUpperCase()).filter(Boolean))].sort().map(os => (
                                        <option key={os} value={os}>{os}</option>
                                    ))}
                                </select>
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                >
                                    <option value="">Todos los estados</option>
                                    <option value="pendientes">Pendientes</option>
                                    <option value="enviadas">Enviadas</option>
                                </select>
                                {/* Filter by Audit Status */}
                                <select
                                    value={filterAudit}
                                    onChange={(e) => setFilterAudit(e.target.value)}
                                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                                        className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-48"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    {sortedOrdenes.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <ClipboardList size={48} className="mx-auto mb-4 opacity-50" />
                            <p>{listToFilter.length === 0 ? 'No hay documentos creados aún.' : 'No se encontraron documentos con los filtros aplicados.'}</p>
                        </div>
                    ) : (
                        <>
                            <div className={viewMode === 'list' ? "divide-y divide-slate-100" : "grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-100/30"}>
                                {sortedOrdenes.slice(0, visibleCount).map(orden => {
                                    const isUrgent = checkUrgency(orden);
                                    if (viewMode === 'list') {
                                        return (
                                            <div
                                                key={orden.id}
                                                className={`p-4 flex items-center justify-between transition-colors ${orden.suspendida ? 'bg-slate-100 opacity-60 grayscale-[0.8]' :
                                                    orden.enviada ? 'bg-slate-50 opacity-75 grayscale-[0.5]' :
                                                        isUrgent ? 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500' : 'hover:bg-slate-50'
                                                    } `}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isUrgent ? 'bg-red-100 text-red-600 animate-pulse' :
                                                        activeTab === 'pedidos' ? 'bg-pink-100 text-pink-600' : (orden.incluyeMaterial ? 'bg-purple-100 text-purple-600' : 'bg-teal-100 text-teal-600')
                                                        } `}>
                                                        {isUrgent ? <AlertCircle size={20} /> : (orden.enviada ? <CheckCircle2 size={20} /> : (activeTab === 'pedidos' ? <FileHeart size={20} /> : (orden.incluyeMaterial ? <FileStack size={20} /> : <FileText size={20} />)))}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className={`font-bold ${orden.enviada ? 'text-slate-500' : isUrgent ? 'text-red-700' : 'text-slate-800'}`}>
                                                                {orden.afiliado}
                                                            </p>
                                                            {isUrgent && orden.status !== 'aprobada' && !orden.autorizada ? (
                                                                <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full flex items-center gap-1 animate-pulse">
                                                                    <AlertCircle size={10} /> Urgente
                                                                </span>
                                                            ) : orden.status === 'aprobada' ? (
                                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Aprobada
                                                                </span>
                                                            ) : orden.status === 'rechazada' ? (
                                                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Rechazada
                                                                </span>
                                                            ) : orden.enviada ? (
                                                                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Enviada
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold uppercase tracking-wide rounded-full">
                                                                    Pendiente
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-slate-500">
                                                            {orden.profesional} • {orden.obraSocial} • {orden.dni && <span className="font-bold text-slate-700">DNI: {orden.dni} • </span>}Fecha: {formatDate(orden.fechaCirugia || orden.fechaDocumento)}
                                                            {activeTab === 'pedidos' && <span className="ml-2 font-medium text-pink-600">• Pedido Médico</span>}
                                                            {orden.habitacion && <span className="ml-2 font-medium text-amber-600">• Hab: {orden.habitacion}</span>}
                                                            {orden.incluyeMaterial && <span className="ml-2 text-purple-600 font-medium">+ Material</span>}
                                                            {orden.status === 'auditada' && <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase tracking-tighter shadow-sm border border-emerald-200">Auditada</span>}
                                                        </p>
                                                        {orden.observaciones && (
                                                            <div className="mt-1 p-2 bg-teal-50 border-l-2 border-teal-400 text-xs text-teal-700 italic rounded">
                                                                <strong>Nota:</strong> {orden.observaciones}
                                                            </div>
                                                        )}

                                                        {/* Status Toggles */}
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">

                                                            <button
                                                                onClick={() => handleToggleField(orden, 'autorizada')}
                                                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.autorizada
                                                                    ? 'bg-teal-600 text-white border-teal-700 shadow-sm hover:bg-teal-700'
                                                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                                                                    } `}
                                                            >
                                                                <ShieldCheck size={12} strokeWidth={2.5} />
                                                                {orden.autorizada ? 'Autorizada' : 'Autorizar'}
                                                            </button>

                                                            {orden.incluyeMaterial && activeTab !== 'pedidos' && (
                                                                <button
                                                                    onClick={() => handleToggleField(orden, 'materialSolicitado')}
                                                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.materialSolicitado
                                                                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm hover:bg-purple-700'
                                                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                                                                        } `}
                                                                >
                                                                    <Truck size={12} strokeWidth={2.5} />
                                                                    {orden.materialSolicitado ? 'Mat. Solicitado' : 'Solicitar Material'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleToggleStatus(orden)}
                                                            className={`p-2 rounded-lg transition-colors ${orden.enviada
                                                                ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                                                                : 'text-slate-400 hover:bg-green-50 hover:text-green-600'
                                                                } `}
                                                            title={orden.enviada ? "Marcar como pendiente" : "Marcar como enviada"}
                                                        >
                                                            {orden.enviada ? <ArchiveRestore size={18} /> : <CheckCircle2 size={18} />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleField(orden, 'suspendida')}
                                                            className={`p-2 rounded-lg transition-colors ${orden.suspendida
                                                                ? 'text-slate-600 bg-slate-200'
                                                                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                                                                } `}
                                                            title={orden.suspendida ? "Re-activar cirugía" : "Suspender cirugía"}
                                                        >
                                                            <Ban size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(orden)}
                                                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit3 size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handlePreview(orden, activeTab === 'pedidos' ? 'pedido' : 'internacion')}
                                                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                                            title="Ver Documento"
                                                        >
                                                            <Printer size={18} />
                                                        </button>
                                                        {orden.incluyeMaterial &&
                                                            orden.descripcionMaterial &&
                                                            activeTab !== 'pedidos' && (
                                                                <button
                                                                    onClick={() => handlePreview(orden, 'material')}
                                                                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                                    title="Ver Material"
                                                                >
                                                                    <Package size={18} />
                                                                </button>
                                                            )}
                                                        <button
                                                            onClick={() => handlePreview(orden, 'caratula')}
                                                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                            title="Ver Carátula"
                                                        >
                                                            <Folder size={18} />
                                                        </button>
                                                        {orden.telefono && (
                                                            <button
                                                                onClick={() => setWhatsappModal(orden)}
                                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                                title="Enviar WhatsApp"
                                                            >
                                                                <MessageCircle size={18} />
                                                            </button>
                                                        )}
                                                        {isSuperAdmin && (
                                                            <button
                                                                onClick={() => handleDelete(orden.id)}
                                                                className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
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
                                            className={`bg-white rounded-2xl border p-5 flex flex-col justify-between transition-all hover:shadow-md ${orden.suspendida ? 'opacity-60 grayscale-[0.6] bg-slate-50 border-slate-200 shadow-inner' :
                                                orden.enviada ? 'opacity-75 grayscale-[0.3] border-slate-200' :
                                                    isUrgent ? 'border-red-200 shadow-sm shadow-red-50 ring-1 ring-red-100' : 'border-slate-100'
                                                } `}
                                        >
                                            <div>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isUrgent ? 'bg-red-100 text-red-600' :
                                                        activeTab === 'pedidos' ? 'bg-pink-100 text-pink-600' : (orden.incluyeMaterial ? 'bg-purple-100 text-purple-600' : 'bg-teal-100 text-teal-600')
                                                        } `}>
                                                        {isUrgent ? <AlertCircle size={24} /> : (orden.enviada ? <CheckCircle2 size={24} /> : (activeTab === 'pedidos' ? <FileHeart size={24} /> : (orden.incluyeMaterial ? <FileStack size={24} /> : <FileText size={24} />)))}
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
                                                        {orden.status === 'auditada' && <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase shadow-sm border border-emerald-200">Auditada</span>}
                                                    </div>
                                                </div>

                                                <h4 className={`text-lg font-bold truncate ${orden.enviada ? 'text-slate-500' : 'text-slate-800'}`}>
                                                    {orden.afiliado}
                                                </h4>

                                                <div className="mt-3 space-y-2">
                                                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                                        <User size={14} className="text-slate-400 shrink-0" />
                                                        <span className="truncate">{orden.profesional}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                                        <Building2 size={14} className="text-slate-400 shrink-0" />
                                                        <span className="truncate">{orden.obraSocial}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                                            <Hash size={14} className="text-slate-400 shrink-0" />
                                                            <span className="font-bold">{orden.dni || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                                            <Calendar size={14} className="text-slate-400 shrink-0" />
                                                            <span>{formatDate(orden.fechaCirugia || orden.fechaDocumento)}</span>
                                                        </div>
                                                    </div>
                                                    {orden.habitacion && (
                                                        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded-lg font-medium">
                                                            <Home size={14} className="shrink-0" />
                                                            <span>Habitación: {orden.habitacion}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {orden.observaciones && (
                                                    <div className="mt-3 p-3 bg-teal-50 border-l-2 border-teal-400 text-xs text-teal-700 italic rounded">
                                                        <strong>Nota:</strong> {orden.observaciones}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap gap-2 mt-4">

                                                    <button
                                                        onClick={() => handleToggleField(orden, 'autorizada')}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide border transition-all ${orden.autorizada
                                                            ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                                                            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
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
                                                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                                                } `}
                                                        >
                                                            <Truck size={14} />
                                                            {orden.materialSolicitado ? 'Ped.' : 'Ped.'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                                                <div className="flex gap-1">
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
                                                    <button
                                                        onClick={() => handleEdit(orden)}
                                                        className="p-2.5 text-teal-600 hover:bg-teal-50 rounded-xl transition-colors"
                                                        title="Editar"
                                                    >
                                                        <Edit3 size={20} />
                                                    </button>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handlePreview(orden, activeTab === 'pedidos' ? 'pedido' : 'internacion')}
                                                        className="p-2.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-xl transition-colors"
                                                        title="Imprimir"
                                                    >
                                                        <Printer size={20} />
                                                    </button>
                                                    <button
                                                        onClick={() => handlePreview(orden, 'caratula')}
                                                        className="p-2.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl transition-colors"
                                                        title="Carátula"
                                                    >
                                                        <Folder size={20} />
                                                    </button>
                                                    {orden.telefono && (
                                                        <button
                                                            onClick={() => setWhatsappModal(orden)}
                                                            className="p-2.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl transition-colors"
                                                            title="WhatsApp"
                                                        >
                                                            <MessageCircle size={20} />
                                                        </button>
                                                    )}
                                                    {isSuperAdmin && (
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
                                <div className="p-6 text-center border-t border-slate-100 bg-slate-50">
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 50)}
                                        className="px-8 py-3 bg-white border border-slate-200 text-teal-600 rounded-xl font-bold hover:bg-teal-50 hover:border-teal-300 transition-all shadow-sm flex items-center gap-2 mx-auto"
                                    >
                                        <Plus size={20} /> Ver más cirugías
                                    </button>
                                    <p className="text-xs text-slate-400 mt-2 font-medium">Mostrando {visibleCount} de {sortedOrdenes.length} órdenes</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            {/* PRINT PREVIEW MODAL */}
            {showPreview && previewData && createPortal(
                <div className="fixed inset-0 bg-white z-[100] overflow-auto print-orden">
                    <style>{printStyle}</style>
                    <div className="p-8 print:p-0">
                        {/* Header Controls */}
                        <div className="flex justify-between items-center mb-8 no-print border-b pb-4">
                            <div>
                                <h2 className="text-2xl font-bold">Vista Previa</h2>
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
                                                className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${(previewType === 'internacion' || previewType === 'pedido') ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                            >
                                                {isInternacionDoc ? 'Internación' : 'Pedido Médico'}
                                            </button>

                                            {/* Material views - Only for Internacion */}
                                            {isInternacionDoc && isMaterialDoc && (
                                                <>
                                                    <button
                                                        onClick={() => setPreviewType('material')}
                                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'material' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                    >
                                                        Material
                                                    </button>
                                                    <button
                                                        onClick={() => setPreviewType('ambas')}
                                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'ambas' ? 'bg-gradient-to-r from-teal-600 to-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
                                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'caratula' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                    >
                                                        📂 Carátula
                                                    </button>

                                                    <button
                                                        onClick={() => window.open(`/consentimientos/${encodeURIComponent(CONSENTIMIENTO_GENERICO)}`, '_blank')}
                                                        className="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all ml-2"
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
                                    className="flex items-center gap-2 px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
                                >
                                    <X size={20} /> Cerrar
                                </button>
                            </div>
                        </div>

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
                </div>,
                document.body
            )}

            {/* WHATSAPP MODAL */}
            {whatsappModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <MessageCircle size={20} className="text-green-600" />
                                Enviar WhatsApp
                            </h3>
                            <button onClick={() => setWhatsappModal(null)} className="p-2 hover:bg-slate-100 rounded-full">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600 text-center">
                                Enviar mensaje a <strong>{whatsappModal.afiliado}</strong>
                            </p>
                            <p className="text-xs text-slate-400 text-center">
                                📱 {whatsappModal.telefono}
                            </p>

                            <div className="space-y-3">
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
                                    className="w-full p-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-bold hover:from-green-600 hover:to-green-700 transition-all flex items-center justify-center gap-3 shadow-lg"
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
                                    className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold hover:from-blue-600 hover:to-blue-700 transition-all flex items-center justify-center gap-3 shadow-lg"
                                >
                                    <Building2 size={20} />
                                    <span>Autoriza la Institución</span>
                                </button>
                            </div>

                            <button
                                onClick={() => setWhatsappModal(null)}
                                className="w-full py-2 text-slate-500 text-sm hover:text-slate-700"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
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
