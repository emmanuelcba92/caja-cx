import { useState, useEffect } from 'react';
import { PlusCircle, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import { CONSENTIMIENTOS_MAP, CONSENTIMIENTOS_COMBO, CONSENTIMIENTO_GENERICO } from '../data/consentimientos';

const STORAGE_KEY = 'cirugiascoat_consentimientos_map';

const loadCustomConsents = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveCustomConsents = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export default function ConsentimientosAdmin() {
  const [customMap, setCustomMap] = useState(() => loadCustomConsents());
  const [newCode, setNewCode] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newAdulto, setNewAdulto] = useState('');
  const [newMenor, setNewMenor] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [editAdulto, setEditAdulto] = useState('');
  const [editMenor, setEditMenor] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    saveCustomConsents(customMap);
  }, [customMap]);

  const allConsents = { ...CONSENTIMIENTOS_MAP };
  Object.entries(customMap).forEach(([code, data]) => {
    allConsents[code] = data;
  });

  const handleAdd = () => {
    if (!newCode.trim() || !newNombre.trim()) {
      setError('Código y nombre son obligatorios');
      return;
    }
    if (allConsents[newCode.trim()]) {
      setError('Ya existe un consentimiento para este código');
      return;
    }
    setCustomMap(prev => ({
      ...prev,
      [newCode.trim()]: {
        nombre: newNombre.trim(),
        adulto: newAdulto.trim() || null,
        menor: newMenor.trim() || null
      }
    }));
    setNewCode('');
    setNewNombre('');
    setNewAdulto('');
    setNewMenor('');
    setError('');
    setSuccess('Consentimiento agregado correctamente');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = (code) => {
    if (window.confirm(`¿Eliminar el consentimiento para el código ${code}?`)) {
      setCustomMap(prev => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setSuccess('Consentimiento eliminado');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleStartEdit = (code) => {
    const c = allConsents[code];
    setEditingCode(code);
    setEditAdulto(c.adulto || '');
    setEditMenor(c.menor || '');
  };

  const handleSaveEdit = (code) => {
    if (customMap[code]) {
      setCustomMap(prev => ({
        ...prev,
        [code]: { ...prev[code], adulto: editAdulto.trim() || null, menor: editMenor.trim() || null }
      }));
    }
    setEditingCode(null);
    setSuccess('Consentimiento actualizado');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest mb-3">Consentimientos COMBO (requieren múltiples códigos)</h4>
        <div className="space-y-2">
          {CONSENTIMIENTOS_COMBO.map((combo, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-700">{combo.nombre}</p>
                <p className="text-[10px] text-slate-400 font-mono">{combo.codigos.join(' + ')}</p>
              </div>
              <div className="flex gap-2 text-[10px] font-bold">
                {combo.adulto && <span className="px-2 py-1 rounded bg-blue-50 text-blue-600">{combo.adulto}</span>}
                {combo.menor && <span className="px-2 py-1 rounded bg-pink-50 text-pink-600">{combo.menor}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest mb-3">Agregar nuevo consentimiento</h4>
        {error && <div className="p-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium border border-rose-200 mb-3">{error}</div>}
        {success && <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 mb-3 flex items-center gap-2"><CheckCircle2 size={14} /> {success}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Código de cirugía</label>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 outline-none text-sm"
              placeholder="Ej: 031301" value={newCode} onChange={e => setNewCode(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 outline-none text-sm"
              placeholder="Ej: Amigdalectomía" value={newNombre} onChange={e => setNewNombre(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">PDF Adulto (nombre del archivo)</label>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 outline-none text-sm"
              placeholder="Ej: Amigdalectomia adulto.pdf" value={newAdulto} onChange={e => setNewAdulto(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">PDF Menor (nombre del archivo)</label>
            <input className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 outline-none text-sm"
              placeholder="Ej: Amigdalectomia menor.pdf" value={newMenor} onChange={e => setNewMenor(e.target.value)} />
          </div>
        </div>
        <button onClick={handleAdd}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-all">
          <PlusCircle size={14} /> Agregar consentimiento
        </button>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest mb-3">Consentimientos individuales por código</h4>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {Object.entries(allConsents).sort(([a], [b]) => a.localeCompare(b)).map(([code, c]) => (
            <div key={code} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors">
              {editingCode === code ? (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-400 w-16">{code}</span>
                  <span className="text-xs font-bold text-slate-600 w-32 truncate">{c.nombre}</span>
                  <input className="flex-1 px-2 py-1 rounded border border-slate-300 text-xs outline-none focus:ring-1 focus:ring-rose-500"
                    placeholder="Adulto PDF" value={editAdulto} onChange={e => setEditAdulto(e.target.value)} />
                  <input className="flex-1 px-2 py-1 rounded border border-slate-300 text-xs outline-none focus:ring-1 focus:ring-rose-500"
                    placeholder="Menor PDF" value={editMenor} onChange={e => setEditMenor(e.target.value)} />
                  <button onClick={() => handleSaveEdit(code)} className="p-1.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                    <CheckCircle2 size={14} />
                  </button>
                  <button onClick={() => setEditingCode(null)} className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 text-xs">Cancelar</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs font-mono font-bold text-slate-400 w-16 shrink-0">{code}</span>
                    <span className="text-xs font-bold text-slate-600 truncate">{c.nombre}</span>
                    <div className="flex gap-1.5 shrink-0">
                      {c.adulto && <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100">{c.adulto}</span>}
                      {c.menor && <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-pink-50 text-pink-600 border border-pink-100">{c.menor}</span>}
                      {!c.adulto && !c.menor && <span className="text-[9px] text-slate-400 italic">Sin PDFs</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleStartEdit(code)}
                      className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors" title="Editar">
                      <FileText size={14} />
                    </button>
                    {customMap[code] && (
                      <button onClick={() => handleDelete(code)}
                        className="p-1.5 rounded bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Consentimiento Genérico</h4>
        <p className="text-xs text-slate-500">Archivo: <span className="font-mono font-bold">{CONSENTIMIENTO_GENERICO}</span></p>
        <p className="text-[10px] text-slate-400 mt-1">Coloque este archivo en la carpeta <code className="bg-slate-100 px-1 rounded">public/consentimientos/</code> del proyecto.</p>
      </div>
    </div>
  );
}
