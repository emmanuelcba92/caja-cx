import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, PlusCircle, Trash2, Edit2, Save, X, RotateCcw, 
  Sparkles, Tag
} from 'lucide-react';
import { 
  DEFAULT_WA_TEMPLATES, 
  WA_TEMPLATE_VARIABLES, 
  loadStoredTemplates, 
  saveStoredTemplates,
  interpolateTemplate 
} from '../data/whatsappTemplates';
import toast from 'react-hot-toast';

export default function WhatsAppTemplatesAdmin() {
  const [templates, setTemplates] = useState(() => loadStoredTemplates());
  const [editingId, setEditingId] = useState(null);
  const [formTitulo, setFormTitulo] = useState('');
  const [formCategoria, setFormCategoria] = useState('General');
  const [formMensaje, setFormMensaje] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    saveStoredTemplates(templates);
  }, [templates]);

  const sampleSurgery = {
    paciente: 'García Carlos Alberto',
    dni: '28456123',
    nombreProfesional: 'Dr. Rossi Mariano',
    fecha: '2026-10-15',
    horaInicio: '09:30',
    obraSocial: 'OSDE 210',
    codigos: 'FACO + LIO MONOFOCAL'
  };

  const handleStartEdit = (tpl) => {
    setEditingId(tpl.id);
    setFormTitulo(tpl.titulo);
    setFormCategoria(tpl.categoria || 'General');
    setFormMensaje(tpl.mensaje);
    setShowNewForm(false);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormTitulo('');
    setFormCategoria('General');
    setFormMensaje('');
    setShowNewForm(false);
  };

  const handleSaveEdit = (e) => {
    e?.preventDefault();
    if (!formTitulo.trim() || !formMensaje.trim()) {
      toast.error('El título y el mensaje son obligatorios');
      return;
    }

    if (editingId) {
      setTemplates(prev => prev.map(t => t.id === editingId ? {
        ...t,
        titulo: formTitulo.trim(),
        categoria: formCategoria.trim() || 'General',
        mensaje: formMensaje.trim()
      } : t));
      toast.success('Plantilla actualizada');
    } else {
      const newTpl = {
        id: 'tpl_' + Date.now(),
        titulo: formTitulo.trim(),
        categoria: formCategoria.trim() || 'General',
        mensaje: formMensaje.trim()
      };
      setTemplates(prev => [...prev, newTpl]);
      toast.success('Nueva plantilla agregada');
    }

    handleCancelEdit();
  };

  const handleDelete = (id, titulo) => {
    if (confirm(`¿Eliminar la plantilla "${titulo}"?`)) {
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Plantilla eliminada');
      if (editingId === id) handleCancelEdit();
    }
  };

  const handleResetDefaults = () => {
    if (confirm('¿Restablecer todas las plantillas a las predeterminadas del sistema? Se perderán las modificaciones personalizadas.')) {
      setTemplates(DEFAULT_WA_TEMPLATES);
      handleCancelEdit();
      toast.success('Plantillas restablecidas');
    }
  };

  const insertVariable = (tag) => {
    setFormMensaje(prev => prev + ' ' + tag);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">Plantillas de Mensajes WhatsApp</h3>
              <p className="text-xs text-slate-500 font-medium">Personalizá los mensajes automáticos y recordatorios para pacientes</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            title="Restaurar predeterminados"
          >
            <RotateCcw size={14} />
            <span>Restaurar</span>
          </button>
          {!showNewForm && !editingId && (
            <button
              onClick={() => {
                setShowNewForm(true);
                setEditingId(null);
                setFormTitulo('');
                setFormCategoria('General');
                setFormMensaje('');
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-sm transition-all"
            >
              <PlusCircle size={15} />
              <span>Nueva Plantilla</span>
            </button>
          )}
        </div>
      </div>

      {/* Form Editor (Create or Edit) */}
      {(showNewForm || editingId) && (
        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-500/40 shadow-md space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-600" />
              {editingId ? 'Editar Plantilla' : 'Crear Nueva Plantilla'}
            </h4>
            <button 
              onClick={handleCancelEdit}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Título de la Plantilla</label>
                <input
                  type="text"
                  value={formTitulo}
                  onChange={e => setFormTitulo(e.target.value)}
                  placeholder="Ej: Confirmación de Cirugía con Ayuno"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Categoría</label>
                <input
                  type="text"
                  value={formCategoria}
                  onChange={e => setFormCategoria(e.target.value)}
                  placeholder="Ej: Turnos, Trámites, Ayuno"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Variable Pills */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag size={13} className="text-emerald-600" />
                  Variables dinámicas disponibles (hacé clic para insertar en el texto):
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WA_TEMPLATE_VARIABLES.map(v => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariable(v.tag)}
                    title={v.desc}
                    className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-mono font-bold shadow-2xs transition-all active:scale-95 flex items-center gap-1"
                  >
                    <span>{v.tag}</span>
                    <span className="text-[10px] text-slate-400 font-sans font-normal">({v.desc})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Contenido del Mensaje</label>
              <textarea
                rows={5}
                value={formMensaje}
                onChange={e => setFormMensaje(e.target.value)}
                placeholder="Escribí el texto del mensaje. Podés usar las etiquetas dinámicas como {paciente}, {fecha}, {profesional}, etc."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                required
              />
            </div>

            {/* Live Preview */}
            {formMensaje && (
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-1.5">
                <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={12} />
                  Vista previa con datos de ejemplo:
                </span>
                <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs">
                  {interpolateTemplate(formMensaje, sampleSurgery)}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-sm transition-all"
              >
                <Save size={15} />
                <span>{editingId ? 'Guardar Cambios' : 'Crear Plantilla'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Templates List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(tpl => (
          <div 
            key={tpl.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-md mb-1">
                    {tpl.categoria || 'General'}
                  </span>
                  <h4 className="text-sm font-black text-slate-800 leading-snug">{tpl.titulo}</h4>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(tpl)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Editar plantilla"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id, tpl.titulo)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Eliminar plantilla"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto font-normal">
                {tpl.mensaje}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Variables: {(tpl.mensaje.match(/\{[a-zA-Z0-9_]+\}/g) || []).join(' ') || 'Ninguna'}</span>
              <button
                onClick={() => handleStartEdit(tpl)}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                Modificar &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
