import React, { useState, useEffect, useRef } from 'react';
import { FileText, Printer, Download, Plus, X, Calendar, User, Building2, Hash, Stethoscope, Pill, ClipboardList, Edit3, Trash2, Package, FileStack, Search, CheckCircle2, ArchiveRestore, ShieldCheck, Truck, Folder, Phone, MessageCircle, FileHeart, AlertCircle, Clock, Home, StickyNote } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, getDocs, addDoc, updateDoc, query, where, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { CODIGOS_CIRUGIA, MODULOS_SM, CODIGOS_IOSFA, PRACTICAS_MEDICAS } from '../data/codigos';
import { CONSENTIMIENTOS_MAP, CONSENTIMIENTOS_COMBO, CONSENTIMIENTO_GENERICO } from '../data/consentimientos';

// Map professional names to their signature image files
const FIRMAS_MAP = {
    // 'Dra. Valenzuela': 'valenzuela.png',
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

const OrdenesView = ({ initialTab = 'internacion', draftData = null, onDraftConsumed = () => { } }) => {
    const { viewingUid, catalogOwnerUid, isSuperAdmin, permissions } = useAuth();
    const [profesionales, setProfesionales] = useState([]);
    const [ordenes, setOrdenes] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [previewType, setPreviewType] = useState('internacion'); // 'internacion' | 'material'
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [whatsappModal, setWhatsappModal] = useState(null); // { orden: ordenData } when open
    const [copiedToast, setCopiedToast] = useState(false); // Show toast when message is copied
    const [activeTab, setActiveTab] = useState(initialTab); // 'internacion' | 'pedidos'
    const [pedidos, setPedidos] = useState([]); // List of medical orders (pedidos)

    // Filter State
    const [filterProfesional, setFilterProfesional] = useState('');
    const [filterObraSocial, setFilterObraSocial] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterPeriodo, setFilterPeriodo] = useState('proximas'); // 'proximas' | 'realizadas' | 'todas'
    const [filterStatus, setFilterStatus] = useState('');
    const [searchPaciente, setSearchPaciente] = useState('');

    // Autocomplete State
    const [suggestions, setSuggestions] = useState([]);
    const [showProfSuggestions, setShowProfSuggestions] = useState(false);
    const [activeRow, setActiveRow] = useState(null); // { index: 0, field: 'codigo' | 'nombre' }
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const searchTimeoutRef = useRef(null);

    // Form State
    const emptyForm = {
        profesional: '',
        afiliado: '',
        obraSocial: '',
        numeroAfiliado: '',
        dni: '',
        telefono: '', // Patient phone number for WhatsApp
        codigosCirugia: [
            { codigo: '', nombre: '' },
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
        status: 'pendiente',
        // Additional fields for Pedidos Medicos
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
                const q = query(collection(db, "profesionales"), where("userId", "==", ownerToUse));
                const snapshot = await getDocs(q);
                const profs = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(p => p.categoria === 'ORL' || p.categoria === 'Estetica')
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
            const q = query(
                collection(db, "ordenes_internacion"),
                where("userId", "==", ownerToUse)
            );
            const snapshot = await getDocs(q);
            const items = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
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
            const q = query(
                collection(db, "pedidos_medicos"),
                where("userId", "==", ownerToUse)
            );
            const snapshot = await getDocs(q);
            const items = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
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
            setFormData(prev => ({
                ...prev,
                ...draftData
            }));
            if (draftData.id) {
                setEditingId(draftData.id);
            }
            setShowForm(true);
            onDraftConsumed();
        }
    }, [draftData, onDraftConsumed]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
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
        setFormData(emptyForm);
        setEditingId(null);
        setShowForm(false);
        setSuggestions([]);
        setActiveRow(null);
    };

    const handleCodigoChangeAndSearch = (index, field, value) => {
        // Update form state directly
        setFormData(prev => {
            const newCodigos = [...prev.codigosCirugia];
            newCodigos[index] = { ...newCodigos[index], [field]: value };
            return { ...prev, [field === 'obraSocial' ? 'obraSocial' : '_ignore']: field === 'obraSocial' ? value : prev.obraSocial, codigosCirugia: newCodigos };
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
                status: formData.status || 'pendiente',
                updatedAt: new Date().toISOString()
            };

            if (editingId) {
                if (activeTab === 'pedidos') {
                    await updateDoc(doc(db, "pedidos_medicos", editingId), orderData);
                } else {
                    await updateDoc(doc(db, "ordenes_internacion", editingId), orderData);
                }
            } else {
                orderData.createdAt = new Date().toISOString();
                if (activeTab === 'pedidos') {
                    await addDoc(collection(db, "pedidos_medicos"), orderData);
                } else {
                    await addDoc(collection(db, "ordenes_internacion"), orderData);
                }
            }

            if (activeTab === 'pedidos') {
                await fetchPedidos();
                setPreviewType('pedido');
            } else {
                await fetchOrdenes();
                setPreviewType(orderData.incluyeMaterial && orderData.descripcionMaterial ? 'ambas' : 'internacion');
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
                habitacion: orden.habitacion || '',
                practicas, // Only for Pedidos
                codigosCirugia: emptyForm.codigosCirugia, // Reset surgery codes
                diagnostico: orden.diagnostico || '',
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
                habitacion: orden.habitacion || '',
                codigosCirugia,
                practicas: emptyForm.practicas, // Reset practices
                tipoAnestesia: orden.tipoAnestesia || 'general',
                fechaCirugia: orden.fechaCirugia || '',
                incluyeMaterial: orden.incluyeMaterial || false,
                descripcionMaterial: orden.descripcionMaterial || '',
                diagnostico: orden.diagnostico || '',
                observaciones: orden.observaciones || '',
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
            const ordenRef = doc(db, collectionName, orden.id);
            await updateDoc(ordenRef, { enviada: newStatus });
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
            const ordenRef = doc(db, collectionName, orden.id);
            await updateDoc(ordenRef, { [field]: newValue });
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
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
            await deleteDoc(doc(db, collectionName, id));

            // Success: update local state
            if (activeTab === 'pedidos') {
                setPedidos(prev => prev.filter(o => o.id !== id));
            } else {
                setOrdenes(prev => prev.filter(o => o.id !== id));
            }
        } catch (error) {
            console.error("Error deleting order:", error);
            alert(`Error al eliminar: ${error.message || 'Permiso denegado.'}`);
        } finally {
            setLoading(false);
        }
    };



    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const getSignatureUrl = (profesionalName) => {
        if (FIRMAS_MAP[profesionalName]) {
            return `/firmas/${FIRMAS_MAP[profesionalName]}`;
        }
        const filename = profesionalName
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
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
                    <span style={{ fontSize: '24pt' }}>{(shortProfName(previewData.profesional) || '').toUpperCase()}</span><br />
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

                            <div className="text-center">
                                <img
                                    src={getSignatureUrl(previewData.profesional)}
                                    alt={`Firma ${previewData.profesional}`}
                                    className="h-32 object-contain mx-auto"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
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
                                        <p key={idx}>{cod.codigo}{cod.nombre ? ` ${cod.nombre}` : ''}</p>
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

                <div className="mt-24 flex justify-end">
                    <div className="text-center">
                        <img
                            src={getSignatureUrl(previewData.profesional)}
                            alt={`Firma ${previewData.profesional}`}
                            className="h-32 object-contain mx-auto"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
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
                            onClick={() => setActiveTab('internacion')}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'internacion' ? 'bg-white text-teal-700 shadow-md' : 'text-teal-100 hover:bg-white/10'}`}
                        >
                            Internación
                        </button>
                        <button
                            onClick={() => setActiveTab('pedidos')}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'pedidos' ? 'bg-white text-teal-700 shadow-md' : 'text-teal-100 hover:bg-white/10'}`}
                        >
                            Pedidos
                        </button>
                    </div>

                    {canShareOrdenes && (
                        <button
                            onClick={() => { resetForm(); setShowForm(true); }}
                            className="flex items-center gap-2 px-6 py-3 bg-white text-teal-700 rounded-xl font-bold hover:bg-teal-50 transition-all shadow-lg"
                        >
                            <Plus size={20} />
                            {activeTab === 'pedidos' ? 'Nuevo Pedido' : 'Nueva Orden'}
                        </button>
                    )}
                </div>
            </div>

            {/* Orders History */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <h3 className="font-bold text-slate-700">Historial de Órdenes</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Filter by Period */}
                            <select
                                value={filterPeriodo}
                                onChange={(e) => setFilterPeriodo(e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-teal-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                                <option value="proximas">Próximas Cirugías</option>
                                <option value="realizadas">Cirugías Realizadas (Historial)</option>
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
                                {[...new Set(ordenes.map(o => o.obraSocial?.trim()).filter(Boolean))].sort().map(os => (
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
                {(() => {
                    // Decide which list to filter
                    const listToFilter = activeTab === 'pedidos' ? pedidos : ordenes;

                    // Determine today for comparisons
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // A stable timezone-independent way to get today's string
                    const offset = today.getTimezoneOffset()
                    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000))
                    const todayStr = todayLocal.toISOString().split('T')[0]

                    // Apply filters
                    const filteredOrdenes = listToFilter.filter(orden => {
                        const matchProfesional = !filterProfesional || orden.profesional === filterProfesional;
                        const matchObraSocial = !filterObraSocial || orden.obraSocial === filterObraSocial;
                        const matchDate = !filterDate || orden.fechaCirugia === filterDate;
                        const matchStatus = !filterStatus || (filterStatus === 'enviadas' ? orden.enviada : !orden.enviada);
                        const matchPaciente = !searchPaciente || orden.afiliado?.toLowerCase().includes(searchPaciente.toLowerCase());

                        // Period Match Logic
                        const targetDateStr = orden.fechaCirugia || orden.fechaDocumento;
                        let matchPeriodo = true;
                        if (targetDateStr && filterPeriodo !== 'todas') {
                            if (filterPeriodo === 'proximas') {
                                matchPeriodo = targetDateStr >= todayStr;
                            } else if (filterPeriodo === 'realizadas') {
                                matchPeriodo = targetDateStr < todayStr;
                            }
                        }

                        return matchProfesional && matchObraSocial && matchDate && matchStatus && matchPaciente && matchPeriodo;
                    });

                    // Urgency logic: less than 14 days and not authorized
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

                    // Sort: Urgent first, then by date (already sorted by fetch but we re-sort here)
                    const sortedOrdenes = [...filteredOrdenes].sort((a, b) => {
                        const urgentA = checkUrgency(a);
                        const urgentB = checkUrgency(b);

                        if (urgentA && !urgentB) return -1;
                        if (!urgentA && urgentB) return 1;

                        // Fallback to original date sort (newest first)
                        const dateA = a.fechaCirugia || a.createdAt;
                        const dateB = b.fechaCirugia || b.createdAt;
                        return new Date(dateB) - new Date(dateA);
                    });

                    if (sortedOrdenes.length === 0) {
                        return (
                            <div className="p-12 text-center text-slate-400">
                                <ClipboardList size={48} className="mx-auto mb-4 opacity-50" />
                                <p>{listToFilter.length === 0 ? 'No hay documentos creados aún.' : 'No se encontraron documentos con los filtros aplicados.'}</p>
                            </div>
                        );
                    }

                    return (
                        <div className="divide-y divide-slate-100">
                            {sortedOrdenes.map(orden => {
                                const isUrgent = checkUrgency(orden);
                                return (
                                    <div
                                        key={orden.id}
                                        className={`p-4 flex items-center justify-between transition-colors ${orden.enviada ? 'bg-slate-50 opacity-75 grayscale-[0.5]' :
                                            isUrgent ? 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500' : 'hover:bg-slate-50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isUrgent ? 'bg-red-100 text-red-600 animate-pulse' :
                                                activeTab === 'pedidos' ? 'bg-pink-100 text-pink-600' : (orden.incluyeMaterial ? 'bg-purple-100 text-purple-600' : 'bg-teal-100 text-teal-600')
                                                }`}>
                                                {isUrgent ? <AlertCircle size={20} /> : (orden.enviada ? <CheckCircle2 size={20} /> : (activeTab === 'pedidos' ? <FileHeart size={20} /> : (orden.incluyeMaterial ? <FileStack size={20} /> : <FileText size={20} />)))}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className={`font-bold ${orden.enviada ? 'text-slate-500' : isUrgent ? 'text-red-700' : 'text-slate-800'}`}>
                                                        {orden.afiliado}
                                                    </p>
                                                    {isUrgent ? (
                                                        <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full flex items-center gap-1 animate-pulse">
                                                            <AlertCircle size={10} /> Urgente - Sin Autorizar
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
                                                    {orden.profesional} • {orden.obraSocial} • Fecha: {formatDate(orden.fechaCirugia || orden.fechaDocumento)}
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
                                                            }`}
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
                                                                }`}
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
                                                        }`}
                                                    title={orden.enviada ? "Marcar como pendiente" : "Marcar como enviada"}
                                                >
                                                    {orden.enviada ? <ArchiveRestore size={18} /> : <CheckCircle2 size={18} />}
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
                                                <button
                                                    onClick={() => handleDelete(orden.id)}
                                                    className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>

            {/* NEW/EDIT ORDER MODAL */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                {editingId ? <Edit3 size={24} className="text-teal-600" /> : <Plus size={24} className="text-teal-600" />}
                                {editingId ? 'Editar Documento' : (activeTab === 'pedidos' ? 'Nuevo Pedido' : 'Nueva Orden')}
                            </h3>
                            <button onClick={resetForm} className="p-2 hover:bg-slate-100 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* Professional */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    <User size={14} className="inline mr-1" /> Profesional
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={formData.profesional}
                                        onChange={(e) => {
                                            handleInputChange('profesional', e.target.value);
                                            setShowProfSuggestions(true);
                                        }}
                                        onFocus={() => setShowProfSuggestions(true)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const filtered = profesionales.filter(p => p.nombre.toLowerCase().includes(formData.profesional.toLowerCase()));
                                                if (filtered.length > 0) {
                                                    handleInputChange('profesional', filtered[0].nombre);
                                                    setShowProfSuggestions(false);
                                                }
                                            }
                                        }}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder="Escribe para buscar..."
                                        required
                                    />
                                    {showProfSuggestions && (
                                        <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto suggestions-container">
                                            {profesionales
                                                .filter(p => p.nombre.toLowerCase().includes(formData.profesional.toLowerCase()))
                                                .map(p => (
                                                    <div
                                                        key={p.id}
                                                        onClick={() => {
                                                            handleInputChange('profesional', p.nombre);
                                                            setShowProfSuggestions(false);
                                                        }}
                                                        className="px-4 py-3 cursor-pointer hover:bg-teal-50 border-b border-slate-50 last:border-0"
                                                    >
                                                        <p className="text-sm font-medium text-slate-700">{p.nombre}</p>
                                                    </div>
                                                ))}
                                            {profesionales.filter(p => p.nombre.toLowerCase().includes(formData.profesional.toLowerCase())).length === 0 && (
                                                <div className="px-4 py-3 text-sm text-slate-400 italic">
                                                    No se encontraron coincidencias
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Patient Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        <User size={14} className="inline mr-1" /> Afiliado
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.afiliado}
                                        onChange={(e) => handleInputChange('afiliado', e.target.value.toUpperCase())}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 uppercase"
                                        placeholder="APELLIDO Nombre"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        <Building2 size={14} className="inline mr-1" /> Obra Social
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.obraSocial}
                                        onChange={(e) => handleInputChange('obraSocial', e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder="Galeno, OSDE, etc."
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        <Hash size={14} className="inline mr-1" /> N° Afiliado
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.numeroAfiliado}
                                        onChange={(e) => handleInputChange('numeroAfiliado', e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder="14843"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        <Hash size={14} className="inline mr-1" /> DNI
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.dni}
                                        onChange={(e) => handleInputChange('dni', e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder="45836670"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        <Building2 size={14} className="inline mr-1" /> Habitación
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.habitacion}
                                        onChange={(e) => handleInputChange('habitacion', e.target.value.toUpperCase())}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 uppercase"
                                        placeholder="B, 101, etc."
                                    />
                                </div>
                            </div>

                            {/* Phone Number */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    <Phone size={14} className="inline mr-1" /> Teléfono (WhatsApp)
                                </label>
                                <input
                                    type="tel"
                                    value={formData.telefono}
                                    onChange={(e) => handleInputChange('telefono', e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="3512345678 (sin 0 ni 15)"
                                />
                                <p className="text-xs text-slate-400 mt-1">Formato: código de área + número (ej: 3512345678)</p>
                            </div>

                            {/* CONDITIONAL CONTENT BASED ON TAB */}
                            {activeTab === 'pedidos' ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            <FileHeart size={14} className="inline mr-1" /> Prácticas (Rp/)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, practicas: [...prev.practicas, ''] }))}
                                            className="text-xs px-3 py-1 bg-pink-100 text-pink-700 rounded-lg font-bold hover:bg-pink-200 transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={14} /> Agregar
                                        </button>
                                    </div>

                                    {formData.practicas && formData.practicas.map((practica, index) => (
                                        <div key={index} className="flex gap-2 items-start relative">
                                            <div className="flex-1">
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
                                                    autoComplete="off"
                                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm uppercase font-medium"
                                                    placeholder="Ingrese práctica..."
                                                />
                                            </div>

                                            {/* Suggestions Dropdown for Practices */}
                                            {activeRow?.index === index && activeRow?.field === 'practica' && suggestions.length > 0 && (
                                                <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto suggestions-container transform translate-y-1">
                                                    {suggestions.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectPedidoSuggestion(s, index)}
                                                            onMouseEnter={() => setHighlightedIndex(i)}
                                                            className={`px-4 py-3 cursor-pointer border-b border-slate-100 last:border-0 transition-colors ${highlightedIndex === i ? 'bg-pink-50' : 'bg-white'
                                                                }`}
                                                        >
                                                            <p className="text-sm font-bold text-slate-800">{s.nombre}</p>
                                                            {s.codigo && <p className="text-xs text-slate-400">Código: {s.codigo}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    practicas: prev.practicas.filter((_, i) => i !== index)
                                                }))}
                                                className="p-2 text-red-400 hover:bg-red-50 rounded-lg"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* Surgery Codes - Only for Internacion */
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                                            <Hash size={14} className="inline mr-1" /> Códigos de Cirugía
                                        </label>
                                        <button
                                            type="button"
                                            onClick={addCodigo}
                                            className="text-xs px-3 py-1 bg-teal-100 text-teal-700 rounded-lg font-bold hover:bg-teal-200 transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={14} /> Agregar
                                        </button>
                                    </div>

                                    {formData.codigosCirugia.map((cod, index) => (
                                        <div key={index} className="flex gap-2 items-start relative">
                                            <div className="w-28">
                                                <input
                                                    type="text"
                                                    value={cod.codigo}
                                                    onChange={(e) => handleCodigoChangeAndSearch(index, 'codigo', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                                    autoComplete="off"
                                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
                                                    placeholder="031301"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={cod.nombre}
                                                    onChange={(e) => handleCodigoChangeAndSearch(index, 'nombre', e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                                    autoComplete="off"
                                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                                                    placeholder="Amigdalectomía"
                                                />
                                            </div>

                                            {/* Suggestions Dropdown */}
                                            {activeRow?.index === index && suggestions.length > 0 && (
                                                <div className="absolute z-50 top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto suggestions-container transform translate-y-1">
                                                    {suggestions.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectSuggestion(s, index)}
                                                            onMouseEnter={() => setHighlightedIndex(i)}
                                                            className={`px-4 py-3 cursor-pointer border-b border-slate-100 last:border-0 transition-colors ${s.isModule ? 'bg-teal-50 hover:bg-teal-100' : 'hover:bg-teal-50 bg-white'} ${highlightedIndex === i ? (s.isModule ? 'bg-teal-100' : 'bg-teal-50') : ''}`}
                                                        >
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${s.isModule ? 'text-teal-600 bg-teal-100 border-teal-200' : 'text-teal-600 bg-teal-50 border-teal-100'}`}>
                                                                        {s.codigo}
                                                                    </span>
                                                                    <span className={`text-sm font-medium ${s.isModule ? 'text-teal-900' : 'text-slate-700'}`}>
                                                                        {s.nombre}
                                                                    </span>
                                                                    {s.isModule && <span className="text-[10px] bg-teal-200 text-teal-800 px-1 rounded-sm uppercase font-bold">Módulo</span>}
                                                                    {s.isIOSFA && <span className="text-[10px] bg-sky-200 text-sky-800 px-1 rounded-sm uppercase font-bold">IOSFA</span>}
                                                                </div>
                                                                {s.parentModule && (
                                                                    <div className="text-xs text-slate-400 italic mt-0.5">
                                                                        ↳ Incluido en {s.parentModule.nombre}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {formData.codigosCirugia.length > 1 && (
                                                <button type="button" onClick={() => removeCodigo(index)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                                                    <X size={18} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                            )}

                            {/* CONDITIONAL RENDER CONTINUES */}
                            {activeTab !== 'pedidos' && (
                                /* Surgery Details - Only for Internacion */
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                            <Stethoscope size={14} className="inline mr-1" /> Tipo de Anestesia
                                        </label>
                                        <select
                                            value={formData.tipoAnestesia}
                                            onChange={(e) => handleInputChange('tipoAnestesia', e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        >
                                            <option value="general">General</option>
                                            <option value="local">Local</option>
                                            <option value="regional">Regional</option>
                                            <option value="sedación">Sedación</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                <Calendar size={14} className="inline mr-1" /> Fecha de Cirugía
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.fechaCirugia}
                                                onChange={(e) => handleInputChange('fechaCirugia', e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                <Clock size={14} className="inline mr-1" /> Hora
                                            </label>
                                            <input
                                                type="time"
                                                value={formData.horaCirugia}
                                                onChange={(e) => handleInputChange('horaCirugia', e.target.value)}
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                            <StickyNote size={14} className="inline mr-1" /> Anotación para Calendario
                                        </label>
                                        <textarea
                                            value={formData.anotacionCalendario || ''}
                                            onChange={(e) => handleInputChange('anotacionCalendario', e.target.value)}
                                            placeholder="Ej: Ayunas, Material especial, contactado, etc..."
                                            rows={2}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab !== 'pedidos' && (
                                /* MATERIAL SECTION - Only for Internacion */
                                <div className={`p-4 rounded-xl border-2 transition-all ${formData.incluyeMaterial ? 'border-purple-300 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.incluyeMaterial}
                                            onChange={(e) => handleInputChange('incluyeMaterial', e.target.checked)}
                                            className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="font-bold text-slate-700 flex items-center gap-2">
                                            <Package size={18} className="text-purple-600" />
                                            Incluir Orden de Material
                                        </span>
                                    </label>

                                    {formData.incluyeMaterial && (
                                        <div className="mt-4">
                                            <label className="block text-xs font-bold text-purple-600 uppercase tracking-wider mb-2">
                                                Descripción del Material
                                            </label>
                                            <textarea
                                                value={formData.descripcionMaterial}
                                                onChange={(e) => handleInputChange('descripcionMaterial', e.target.value)}
                                                className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                                                placeholder="1 (un) tubo de ventilación en T&#10;2 (dos) prótesis de titanio..."
                                            />
                                            <p className="text-xs text-purple-500 mt-2">
                                                💡 Se generará una Orden de Pedido de Material adicional con esta descripción.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Diagnosis */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    <ClipboardList size={14} className="inline mr-1" /> Diagnóstico
                                </label>
                                <textarea
                                    value={formData.diagnostico}
                                    onChange={(e) => handleInputChange('diagnostico', e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[80px]"
                                    placeholder="SAHOS, IVN, etc."
                                />
                            </div>

                            {/* Observations */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    <Edit3 size={14} className="inline mr-1" /> Observaciones (Privado - No se imprime)
                                </label>
                                <textarea
                                    value={formData.observaciones}
                                    onChange={(e) => handleInputChange('observaciones', e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[80px] text-slate-700"
                                    placeholder="Notas internas, indicaciones del profesional, etc."
                                />
                            </div>

                            {/* Document Date */}
                            <div className="w-48">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    <Calendar size={14} className="inline mr-1" /> Fecha Documento
                                </label>
                                <input
                                    type="date"
                                    value={formData.fechaDocumento}
                                    onChange={(e) => handleInputChange('fechaDocumento', e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>

                            {/* Submit */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`flex-1 py-3 text-white font-bold rounded-xl transition-colors shadow-lg disabled:opacity-50 ${formData.incluyeMaterial ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-200' : editingId ? 'bg-teal-600 hover:bg-teal-700 shadow-blue-200' : 'bg-teal-600 hover:bg-teal-700 shadow-teal-200'}`}
                                >
                                    {loading ? 'Guardando...' : formData.incluyeMaterial ? 'Crear 2 Órdenes' : editingId ? 'Guardar Cambios' : 'Crear Orden'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            )
            }

            {/* PRINT PREVIEW MODAL */}
            {
                showPreview && previewData && createPortal(
                    <div className="fixed inset-0 bg-white z-[100] overflow-auto print-orden">
                        <style>{printStyle}</style>
                        <div className="p-8 print:p-0">
                            {/* Header Controls */}
                            <div className="flex justify-between items-center mb-8 no-print border-b pb-4">
                                <div>
                                    <h2 className="text-2xl font-bold">Vista Previa</h2>
                                    {previewData.incluyeMaterial && previewData.descripcionMaterial && (
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => setPreviewType('internacion')}
                                                className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'internacion' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                            >
                                                Internación
                                            </button>
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
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setPreviewType('caratula')}
                                        className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-all ${previewType === 'caratula' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        📂 Carátula
                                    </button>

                                    {/* Consent Printing Section - one button per surgery */}
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

                                    {/* Generic consent button - always visible */}
                                    <button
                                        onClick={() => window.open(`/consentimientos/${encodeURIComponent(CONSENTIMIENTO_GENERICO)}`, '_blank')}
                                        className="px-3 py-1.5 rounded-lg font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all ml-2"
                                    >
                                        📋 Genérico
                                    </button>
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
                            {/* Render content based on type */}
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
                )
            }

            {/* WHATSAPP MODAL */}
            {
                whatsappModal && (
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
                                            const mensaje = `Buen día, le escribe Emmanuel del área de internaciones COAT.

*${whatsappModal.afiliado}* tiene agendada una cirugía el día *${fecha}* con *${whatsappModal.profesional}*. En el caso de su obra social, la autorización la gestiona el paciente.

A continuación envío orden de internación para que pueda gestionar la autorización con su obra social.`;
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
                                            const mensaje = `Buen día, le escribe Emmanuel del área de internaciones COAT.

*${whatsappModal.afiliado}* tiene agendada una cirugía el día *${fecha}* con *${whatsappModal.profesional}*. En el caso de su obra social, la autorización la gestionamos nosotros.

Para poder comenzar la gestión con su obra social le voy a solicitar que envíe estudios realizados de nariz, garganta y oído.`;
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
                )
            }

            {/* COPIED TO CLIPBOARD TOAST */}
            {
                copiedToast && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-medium">
                            <CheckCircle2 size={20} />
                            <span>✅ Mensaje copiado. Pegalo en WhatsApp (Ctrl+V)</span>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default OrdenesView;
