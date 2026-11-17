import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  Send,
  RefreshCw,
  FileText,
  Eye,
  Pencil,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  IVA_OPTIONS,
  calculateValidUntil,
  createItem,
  defaultConditions,
  resolveConditionsEnabled,
} from '../data/presupuestoRules.js';
import { formatDate, getQuoteIssues } from '../utils/presupuestoFormat.js';
import {
  buildQuoteInitialDataFromSurgery,
  getPresupuestoPermissions,
  switchQuoteModelPreservingFields,
} from '../utils/presupuestoSurgeryMapper.js';
import presupuestoService from '../services/presupuestoService.js';
import PresupuestoPreview from './PresupuestoPreview.jsx';

const STATUS_BADGES = {
  borrador: {
    label: 'Borrador',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  vigente: {
    label: 'Vigente',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  vencido: {
    label: 'Vencido',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  reemplazado: {
    label: 'Reemplazado',
    className: 'bg-slate-200 text-slate-700 border-slate-300',
  },
};

function getBadgeForVersion(versionDoc) {
  if (!versionDoc) return STATUS_BADGES.borrador;
  const key = versionDoc.derivedStatus || versionDoc.status || 'borrador';
  return STATUS_BADGES[key] || STATUS_BADGES.borrador;
}

export default function PresupuestoModal({
  surgery,
  userRole,
  currentUser,
  onClose,
  service = presupuestoService,
}) {
  const perms = useMemo(() => getPresupuestoPermissions(userRole), [userRole]);

  const [versions, setVersions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draftForm, setDraftForm] = useState(null);
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview'
  const [renewalReason, setRenewalReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const actor = useMemo(
    () => ({
      uid: currentUser?.uid || null,
      email: currentUser?.email || currentUser || 'usuario',
    }),
    [currentUser]
  );

  const loadHistory = async (preferredId = null) => {
    if (!surgery?.id) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const list = await service.getVersionsBySurgery(surgery.id, {
        onlyEmitted: perms.onlyEmitted,
      });
      setVersions(list);
      const target =
        (preferredId && list.find((v) => v.id === preferredId)) ||
        list.find((v) => v.status === 'borrador') ||
        list.find((v) => v.status === 'emitido') ||
        list[0] ||
        null;
      setSelectedId(target ? target.id : null);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo cargar el historial de presupuestos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [surgery?.id, perms.onlyEmitted]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedId) || null,
    [versions, selectedId]
  );

  const hasActiveDraft = useMemo(
    () => versions.some((v) => v.status === 'borrador'),
    [versions]
  );

  const isSelectedEditableDraft =
    perms.canWrite && selectedVersion?.status === 'borrador';

  useEffect(() => {
    if (!selectedVersion) {
      setDraftForm(null);
      return;
    }
    if (selectedVersion.status === 'borrador' && perms.canWrite) {
      setDraftForm(JSON.parse(JSON.stringify(selectedVersion)));
      setViewMode('edit');
    } else {
      setDraftForm(null);
      setViewMode('preview');
    }
    setErrorMsg('');
  }, [selectedVersion?.id, selectedVersion?.status, perms.canWrite]);

  if (!surgery || !perms.canView) return null;

  const handleCreateInitialDraft = async () => {
    if (!perms.canWrite || isBusy) return;
    setIsBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { tipo, initialData } = buildQuoteInitialDataFromSurgery(surgery);
      const created = await service.createDraft({
        surgeryId: surgery.id,
        tipo,
        initialData,
        user: actor,
      });
      setSuccessMsg(`Borrador v${created.version} creado con datos autocompletados.`);
      await loadHistory(created.id);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo crear el borrador.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!isSelectedEditableDraft || !draftForm || isBusy) return;
    setIsBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const {
        id,
        surgeryId,
        groupId,
        version,
        previousVersionId,
        replacedByVersionId,
        status,
        emittedAt,
        emittedBy,
        derivedStatus,
        ...editablePatch
      } = draftForm;
      const updated = await service.updateDraft(selectedVersion.id, editablePatch, actor);
      setSuccessMsg(`Borrador v${updated.version} guardado.`);
      await loadHistory(updated.id);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo guardar el borrador.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleEmitDraft = async () => {
    if (!isSelectedEditableDraft || !draftForm || isBusy) return;
    const issues = getQuoteIssues(draftForm);
    if (issues.length > 0) {
      setErrorMsg(`Completá los campos obligatorios antes de emitir: ${issues.join(', ')}.`);
      return;
    }
    setIsBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const {
        id,
        surgeryId,
        groupId,
        version,
        previousVersionId,
        replacedByVersionId,
        status,
        emittedAt,
        emittedBy,
        derivedStatus,
        ...editablePatch
      } = draftForm;
      await service.updateDraft(selectedVersion.id, editablePatch, actor);
      const emitted = await service.emitPresupuesto(selectedVersion.id, actor);
      setSuccessMsg(`Presupuesto v${emitted.version} emitido correctamente.`);
      await loadHistory(emitted.id);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo emitir el presupuesto.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!isSelectedEditableDraft || isBusy) return;
    setIsBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await service.deleteDraft(selectedVersion.id);
      setSuccessMsg(`Borrador v${selectedVersion.version} eliminado.`);
      await loadHistory();
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo eliminar el borrador.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrepareRenewal = async () => {
    if (!perms.canWrite || selectedVersion?.status !== 'emitido' || isBusy) return;
    setIsBusy(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const newDraft = await service.prepareRenewalDraft(selectedVersion.id, {
        motivoActualizacion: renewalReason.trim(),
        user: actor,
      });
      setRenewalReason('');
      setSuccessMsg(
        `Borrador v${newDraft.version} creado. La versión v${selectedVersion.version} seguirá vigente/conservada hasta emitir la nueva.`
      );
      await loadHistory(newDraft.id);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo crear la nueva versión.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateItemAt = (idx, patch) => {
    setDraftForm((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      return { ...prev, items: nextItems };
    });
  };

  const addObraSocialItem = () => {
    setDraftForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [...(prev.items || []), createItem('obra-social')],
      };
    });
  };

  const removeObraSocialItem = (idx) => {
    setDraftForm((prev) => {
      if (!prev || (prev.items || []).length <= 1) return prev;
      return {
        ...prev,
        items: prev.items.filter((_, i) => i !== idx),
      };
    });
  };

  const activeQuoteForPreview = isSelectedEditableDraft && draftForm ? draftForm : selectedVersion;
  const effectiveValidUntil =
    activeQuoteForPreview?.validUntil ||
    calculateValidUntil(activeQuoteForPreview?.fecha, activeQuoteForPreview?.tipo);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-indigo-600" />
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Presupuestos Quirúrgicos — {surgery.paciente || 'Sin paciente'}
              </h3>
              {!perms.canWrite && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                  <Lock size={11} />
                  Solo lectura
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              DNI {surgery.dni || '—'} • {surgery.obraSocial || 'Particular'}
              {surgery.nombreProfesional ? ` • Prof.: ${surgery.nombreProfesional}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Sidebar historial de versiones */}
          <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-700 p-4 overflow-y-auto bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                Historial de versiones
              </span>
              {perms.canWrite && !hasActiveDraft && (
                <button
                  type="button"
                  disabled={isBusy || isLoading}
                  onClick={handleCreateInitialDraft}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold disabled:opacity-50"
                >
                  <Plus size={13} />
                  Nuevo borrador
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                <Loader2 size={15} className="animate-spin" />
                Cargando historial...
              </div>
            ) : versions.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">
                No hay presupuestos registrados para esta cirugía.
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => {
                  const badge = getBadgeForVersion(v);
                  const isSelected = v.id === selectedId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-white dark:bg-slate-800 border-indigo-500 shadow-sm ring-1 ring-indigo-500/30'
                          : 'bg-white/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                          Versión v{v.version}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {v.tipo === 'obra-social' ? `Obra Social (${v.obraSocial || '—'})` : 'Particular'} • {formatDate(v.fecha)}
                      </div>
                      {v.validUntil && (
                        <div className="text-[10px] text-slate-400">
                          Vigencia: {formatDate(v.validUntil)}
                        </div>
                      )}
                      {v.motivoActualizacion && (
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 truncate" title={v.motivoActualizacion}>
                          Motivo: {v.motivoActualizacion}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Main Workspace */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {!isLoading && !selectedVersion && (
              <div className="text-center py-12 space-y-3">
                <p className="text-sm text-slate-500">
                  Esta cirugía aún no tiene presupuestos {perms.onlyEmitted ? 'emitidos' : 'creados'}.
                </p>
                {perms.canWrite && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleCreateInitialDraft}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                  >
                    <Plus size={15} />
                    Crear borrador inicial (autocompletado)
                  </button>
                )}
              </div>
            )}

            {selectedVersion && (
              <>
                {/* Mode switcher for editable drafts */}
                {isSelectedEditableDraft && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewMode('edit')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'edit'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Pencil size={13} />
                        Editar borrador
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('preview')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          viewMode === 'preview'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Eye size={13} />
                        Vista previa y PDF
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleDeleteDraft}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                        Eliminar borrador
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleSaveDraft}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold disabled:opacity-50"
                      >
                        <Save size={13} />
                        Guardar borrador
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleEmitDraft}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
                      >
                        <Send size={13} />
                        Emitir presupuesto
                      </button>
                    </div>
                  </div>
                )}

                {/* Immutable banner & renewal controls for emitted/replaced versions */}
                {selectedVersion.status !== 'borrador' && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getBadgeForVersion(selectedVersion).className}`}>
                          {getBadgeForVersion(selectedVersion).label}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          Emitido el {formatDate(selectedVersion.emittedAt)} por {selectedVersion.emittedBy || '—'}
                          {effectiveValidUntil ? ` • Vigencia hasta ${formatDate(effectiveValidUntil)}` : ''}
                        </span>
                      </div>
                      {selectedVersion.replacedByVersionId && (
                        <span className="text-[11px] font-bold text-slate-500">
                          Reemplazado por {selectedVersion.replacedByVersionId}
                        </span>
                      )}
                    </div>

                    {perms.canWrite && selectedVersion.status === 'emitido' && !hasActiveDraft && (
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <input
                          type="text"
                          value={renewalReason}
                          onChange={(e) => setRenewalReason(e.target.value)}
                          placeholder="Motivo opcional de actualización o renovación..."
                          className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={handlePrepareRenewal}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                        >
                          <RefreshCw size={13} />
                          {selectedVersion.derivedStatus === 'vencido'
                            ? 'Renovar presupuesto vencido'
                            : 'Generar nueva versión'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Draft Editor */}
                {isSelectedEditableDraft && viewMode === 'edit' && draftForm && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Modelo
                        </label>
                        <select
                          value={draftForm.tipo}
                          onChange={(e) =>
                            setDraftForm((prev) => switchQuoteModelPreservingFields(prev, e.target.value))
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white text-slate-800"
                        >
                          <option value="particular">Particular (15 días)</option>
                          <option value="obra-social">Obra Social (30 días)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Fecha
                        </label>
                        <input
                          type="date"
                          value={draftForm.fecha || ''}
                          onChange={(e) => setDraftForm((prev) => ({ ...prev, fecha: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Vigencia calculada
                        </label>
                        <div className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                          {effectiveValidUntil ? formatDate(effectiveValidUntil) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Paciente
                        </label>
                        <input
                          type="text"
                          value={draftForm.paciente || ''}
                          onChange={(e) => setDraftForm((prev) => ({ ...prev, paciente: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          D.N.I.
                        </label>
                        <input
                          type="text"
                          value={draftForm.dni || ''}
                          onChange={(e) => setDraftForm((prev) => ({ ...prev, dni: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                        />
                      </div>
                    </div>

                    {draftForm.tipo === 'obra-social' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                            Obra Social
                          </label>
                          <input
                            type="text"
                            value={draftForm.obraSocial || ''}
                            onChange={(e) => setDraftForm((prev) => ({ ...prev, obraSocial: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                            N.º de Afiliado
                          </label>
                          <input
                            type="text"
                            value={draftForm.numeroAfiliado || ''}
                            onChange={(e) => setDraftForm((prev) => ({ ...prev, numeroAfiliado: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                          Cirugía
                        </label>
                        <input
                          type="text"
                          value={draftForm.cirugia || ''}
                          onChange={(e) => setDraftForm((prev) => ({ ...prev, cirugia: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                        Motivo opcional de actualización / versión
                      </label>
                      <input
                        type="text"
                        value={draftForm.motivoActualizacion || ''}
                        onChange={(e) => setDraftForm((prev) => ({ ...prev, motivoActualizacion: e.target.value }))}
                        placeholder="Ej.: Ajuste de honorarios, renovación por vencimiento..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                      />
                    </div>

                    {/* Ítems */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          {draftForm.tipo === 'obra-social' ? 'Prácticas y valores' : 'Conceptos e importes (sin cálculo automático de IVA)'}
                        </span>
                        {draftForm.tipo === 'obra-social' && (
                          <button
                            type="button"
                            onClick={addObraSocialItem}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                          >
                            <Plus size={13} />
                            Agregar práctica
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {(draftForm.items || []).map((item, idx) => (
                          <div key={item.id || idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                            {draftForm.tipo === 'obra-social' && (
                              <div className="md:col-span-2">
                                <input
                                  type="text"
                                  value={item.codigo || ''}
                                  onChange={(e) => updateItemAt(idx, { codigo: e.target.value })}
                                  placeholder="Código"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                                />
                              </div>
                            )}
                            <div className={draftForm.tipo === 'obra-social' ? 'md:col-span-5' : 'md:col-span-6'}>
                              <input
                                type="text"
                                value={item.descripcion || ''}
                                onChange={(e) => updateItemAt(idx, { descripcion: e.target.value })}
                                placeholder="Descripción"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                              />
                            </div>
                            <div className="md:col-span-3">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={draftForm.tipo === 'obra-social' && Boolean(item.aConvenir)}
                                value={item.monto === null || item.monto === undefined ? '' : item.monto}
                                onChange={(e) =>
                                  updateItemAt(idx, {
                                    monto: e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                                placeholder={item.aConvenir ? 'A valor convenido' : 'Importe ($)'}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 disabled:bg-slate-200"
                              />
                            </div>
                            {draftForm.tipo === 'particular' ? (
                              <div className="md:col-span-3">
                                {item.ivaEditable === false || item.roleKey === 'derechos_sanatoriales' ? (
                                  <div className="px-2.5 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-[11px] font-bold text-center">
                                    IVA incluido (fijo)
                                  </div>
                                ) : (
                                  <select
                                    value={item.iva || 'sin-iva'}
                                    onChange={(e) => updateItemAt(idx, { iva: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800"
                                  >
                                    {IVA_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <div className="md:col-span-2 flex items-center justify-between gap-2">
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(item.aConvenir)}
                                    onChange={(e) =>
                                      updateItemAt(idx, {
                                        aConvenir: e.target.checked,
                                        monto: e.target.checked ? null : item.monto,
                                      })
                                    }
                                  />
                                  A convenir
                                </label>
                                {(draftForm.items || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeObraSocialItem(idx)}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                    title="Quitar práctica"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Condiciones */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Condiciones del modelo
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftForm((prev) => ({
                              ...prev,
                              condiciones: defaultConditions(prev.tipo),
                            }))
                          }
                          className="text-[11px] font-bold text-indigo-600 hover:underline"
                        >
                          Restaurar textos originales
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.keys(defaultConditions(draftForm.tipo)).map((fieldKey) => {
                          const currentConditions = {
                            ...defaultConditions(draftForm.tipo),
                            ...(draftForm.condiciones || {}),
                          };
                          const fieldValue = currentConditions[fieldKey];
                          const activeMap = resolveConditionsEnabled(
                            draftForm.tipo,
                            draftForm.condicionesActivas
                          );
                          const isFieldActive = activeMap[fieldKey] !== false;
                          return (
                            <div key={fieldKey} className="space-y-1">
                              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isFieldActive}
                                  onChange={(e) =>
                                    setDraftForm((prev) => ({
                                      ...prev,
                                      condicionesActivas: {
                                        ...resolveConditionsEnabled(prev.tipo, prev.condicionesActivas),
                                        [fieldKey]: e.target.checked,
                                      },
                                    }))
                                  }
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span
                                  className={`text-[10px] font-bold uppercase ${
                                    isFieldActive ? 'text-slate-600' : 'text-slate-400 line-through'
                                  }`}
                                >
                                  {fieldKey}
                                </span>
                              </label>
                              <textarea
                                rows={2}
                                value={fieldValue ?? ''}
                                onChange={(e) =>
                                  setDraftForm((prev) => ({
                                    ...prev,
                                    condiciones: {
                                      ...defaultConditions(prev.tipo),
                                      ...(prev.condiciones || {}),
                                      [fieldKey]: e.target.value,
                                    },
                                  }))
                                }
                                className={`w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 transition-opacity ${
                                  isFieldActive ? '' : 'opacity-60 bg-slate-50'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview (when viewing emitted/replaced/read-only OR preview tab of draft) */}
                {(!isSelectedEditableDraft || viewMode === 'preview') && activeQuoteForPreview && (
                  <div className="overflow-x-auto pb-4">
                    <PresupuestoPreview quote={activeQuoteForPreview} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
