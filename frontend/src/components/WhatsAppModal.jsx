import React, { useState, useMemo } from 'react';
import { 
  MessageSquare, Phone, Copy, ExternalLink, Check, X, 
  Send, User, Building, ChevronDown, ChevronUp, Tag, Edit3, Sparkles
} from 'lucide-react';
import { 
  loadStoredTemplates, 
  interpolateTemplate, 
  formatWhatsAppNumber, 
  getWhatsAppLink,
  WA_TEMPLATE_VARIABLES
} from '../data/whatsappTemplates';
import toast from 'react-hot-toast';

export default function WhatsAppModal({ 
  surgery, 
  currentUser,
  onClose, 
  onUpdatePhone 
}) {
  if (!surgery) return null;

  const [templates, setTemplates] = useState(() => loadStoredTemplates());
  const [phone, setPhone] = useState(() => surgery.contactoFamiliar || surgery.telefono || '');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('mensaje_paciente');
  const [copiedType, setCopiedType] = useState(null); // 'paciente' | 'institucional' | 'custom'

  const cleanPhone = useMemo(() => formatWhatsAppNumber(phone), [phone]);

  // Specific template texts
  const tplPaciente = useMemo(() => {
    const t = templates.find(item => item.id === 'mensaje_paciente') || templates[0];
    return t ? interpolateTemplate(t.mensaje, { ...surgery, contactoFamiliar: phone }, currentUser) : '';
  }, [templates, surgery, phone, currentUser]);

  const tplInstitucional = useMemo(() => {
    const t = templates.find(item => item.id === 'mensaje_institucional') || templates[1] || templates[0];
    return t ? interpolateTemplate(t.mensaje, { ...surgery, contactoFamiliar: phone }, currentUser) : '';
  }, [templates, surgery, phone, currentUser]);

  // Active custom message for editing / preview
  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || templates[0] || null;
  }, [templates, selectedTemplateId]);

  const [customMessage, setCustomMessage] = useState(() => {
    const t = templates.find(item => item.id === 'mensaje_paciente') || templates[0];
    return t ? interpolateTemplate(t.mensaje, { ...surgery, contactoFamiliar: phone }, currentUser) : '';
  });

  const handleSelectTemplate = (tplId) => {
    setSelectedTemplateId(tplId);
    const t = templates.find(item => item.id === tplId);
    if (t) {
      setCustomMessage(interpolateTemplate(t.mensaje, { ...surgery, contactoFamiliar: phone }, currentUser));
    }
  };

  const handleCopyText = async (text, typeLabel) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(typeLabel);
      toast.success('¡Mensaje copiado al portapapeles!');
      setTimeout(() => setCopiedType(null), 2500);
    } catch (err) {
      console.error('Error al copiar:', err);
      toast.error('No se pudo copiar automáticamente');
    }
  };

  const handleOpenWhatsAppWithText = (text) => {
    if (!cleanPhone) {
      toast.error('Por favor ingrese un número de teléfono válido');
      return;
    }
    const link = getWhatsAppLink(phone, text);
    window.open(link, '_blank', 'noopener,noreferrer');
    toast.success('Abriendo WhatsApp...');
  };

  const handleSavePhone = () => {
    if (onUpdatePhone) {
      onUpdatePhone(surgery.id, phone);
      toast.success('Teléfono actualizado en la orden');
    }
    setIsEditingPhone(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fadeIn" onClick={onClose}>
      <div 
        className="relative w-full max-w-sm sm:max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Modal Header - Sticky and Compact */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-white border-b border-slate-100 flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <MessageSquare size={18} className="text-white fill-white/20" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-800 tracking-tight uppercase leading-none">Enviar WhatsApp</h3>
              <p className="text-[9px] text-emerald-600 font-black uppercase tracking-wider mt-0.5">Gestión de Autorización</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-3.5 sm:p-5 space-y-3 sm:space-y-4 bg-white overflow-y-auto flex-1">
          
          {/* Patient Header Section */}
          <div className="text-center space-y-0.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paciente</p>
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight uppercase">
              {surgery.paciente || surgery.nombre || 'PACIENTE'}
            </h2>
            
            {/* Phone Edit / Display */}
            <div className="flex items-center justify-center gap-1 pt-0.5">
              <span className="text-xs">📲</span>
              <input
                type="text"
                value={phone}
                onChange={e => { setPhone(e.target.value); setIsEditingPhone(true); }}
                placeholder="Ingresar número (ej: 3512774985)"
                className="text-xs font-bold text-emerald-600 bg-transparent text-center border-b border-dashed border-emerald-300 focus:border-emerald-600 outline-none px-1.5 py-0.5 w-40 hover:bg-emerald-50/50 transition-colors"
                title="Hacé clic para editar el número"
              />
              {isEditingPhone && (
                <button
                  onClick={handleSavePhone}
                  className="px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-black uppercase rounded shadow-xs hover:bg-emerald-700 cursor-pointer"
                >
                  Guardar
                </button>
              )}
            </div>
          </div>

          {/* Quick Copy Buttons (Matching Image) */}
          <div className="space-y-2 pt-1">
            
            {/* Botón 1: Mensaje Paciente */}
            <button
              type="button"
              onClick={() => handleCopyText(tplPaciente, 'paciente')}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              {copiedType === 'paciente' ? (
                <Check size={16} className="text-white shrink-0" />
              ) : (
                <User size={16} className="text-white shrink-0" />
              )}
              <span className="truncate">{copiedType === 'paciente' ? '¡Mensaje Copiado!' : 'Copiar Mensaje Paciente'}</span>
            </button>

            {/* Botón 2: Mensaje Institucional */}
            <button
              type="button"
              onClick={() => handleCopyText(tplInstitucional, 'institucional')}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {copiedType === 'institucional' ? (
                <Check size={16} className="text-white shrink-0" />
              ) : (
                <Building size={16} className="text-white shrink-0" />
              )}
              <span className="truncate">{copiedType === 'institucional' ? '¡Mensaje Copiado!' : 'Copiar Mensaje Institucional'}</span>
            </button>

            {/* Direct Open WhatsApp Button */}
            {cleanPhone && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleOpenWhatsAppWithText(tplPaciente)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition-all cursor-pointer"
                  title="Abrir WhatsApp con Mensaje Paciente"
                >
                  <Send size={12} className="text-indigo-600" />
                  <span>WA Paciente</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenWhatsAppWithText(tplInstitucional)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition-all cursor-pointer"
                  title="Abrir WhatsApp con Mensaje Institucional"
                >
                  <Send size={12} className="text-emerald-600" />
                  <span>WA Institucional</span>
                </button>
              </div>
            )}

            <p className="text-center text-[9px] font-black text-slate-400 uppercase tracking-widest pt-0.5">
              El mensaje se copiará al portapapeles
            </p>
          </div>

          {/* Expandable Section for Other Templates / Custom Editor */}
          <div className="pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              className="w-full flex items-center justify-between text-[11px] font-bold text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
            >
              <span>Ver otras plantillas y personalizar texto</span>
              {showAllTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAllTemplates && (
              <div className="mt-2 space-y-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 animate-fadeIn">
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-0.5">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl.id)}
                      className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                        selectedTemplateId === tpl.id
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tpl.titulo}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <textarea
                    rows={3}
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(customMessage, 'custom')}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>Copiar texto</span>
                  </button>
                  {cleanPhone && (
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsAppWithText(customMessage)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                    >
                      <Send size={12} />
                      <span>Abrir WA</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
