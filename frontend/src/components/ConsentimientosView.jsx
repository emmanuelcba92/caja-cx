import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config';
import { supabase, STORAGE_BUCKET } from '../supabase/config';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc
} from 'firebase/firestore';
import {
  FileText, Upload, Trash2, Link2, Search, Plus, ChevronDown,
  CheckCircle2, AlertCircle, RefreshCw, Eye, X, Baby, User, Hash, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CLINICAL_NOMENCLADOR, MODULOS_SM } from '../data/clinicalCodes';

const CONSENT_TYPES = [
  { id: 'generico', label: 'Genérico (aplica a todos)', color: 'blue' },
  { id: 'adulto', label: 'Específico – Adulto', color: 'indigo' },
  { id: 'menor', label: 'Específico – Menor', color: 'purple' },
];

const ConsentimientosView = () => {
  const [consentimientos, setConsentimientos] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mappingModal, setMappingModal] = useState(null);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [newCodeName, setNewCodeName] = useState('');
  const [selectedAdulto, setSelectedAdulto] = useState('');
  const [selectedMenor, setSelectedMenor] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const fileInputRef = useRef(null);

  const handleSearch = (value) => {
    setNewCodeInput(value);
    if (value.length < 1) {
      setSuggestions([]);
      return;
    }

    const term = value.toLowerCase();

    // Search in Modules
    const smMatches = MODULOS_SM.filter(c =>
      c.codigo.toLowerCase().startsWith(term) ||
      c.nombre.toLowerCase().includes(term)
    ).map(m => ({ ...m, isModule: true }));

    // Search in General Codes
    const generalMatches = CLINICAL_NOMENCLADOR.filter(c =>
      c.codigo.toLowerCase().startsWith(term) ||
      c.nombre.toLowerCase().includes(term)
    );

    const combined = [...smMatches, ...generalMatches].slice(0, 10);
    setSuggestions(combined);
    setHighlightedIndex(0);
  };

  const selectSuggestion = (s) => {
    setNewCodeInput(s.codigo);
    setNewCodeName(s.nombre);
    setSuggestions([]);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      try {
        const [cSnap, mSnap] = await Promise.all([
          getDocs(collection(db, 'consentimientos')),
          getDocs(collection(db, 'consent_mappings'))
        ]);

        const consentList = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setConsentimientos(consentList);

        const mappingData = {};
        mSnap.docs.forEach(d => {
          mappingData[d.id] = d.data();
        });
        setMappings(mappingData);
      } catch (firestoreErr) {
        // Fallback a localStorage si estamos probando localmente
        const localConsents = JSON.parse(localStorage.getItem('coat_consentimientos') || '[]');
        const localMappingsList = JSON.parse(localStorage.getItem('coat_consent_mappings') || '[]');
        if (localConsents.length > 0 || localMappingsList.length > 0) {
          setConsentimientos(localConsents);
          const mapObj = {};
          localMappingsList.forEach(m => {
            if (m.id) mapObj[m.id] = m;
          });
          setMappings(mapObj);
        } else {
          throw firestoreErr;
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Upload PDF to Supabase
  const handleUpload = async (e, consentId) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const filePath = `consentimientos/${consentId}_${file.name}`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      await updateDoc(doc(db, 'consentimientos', consentId), {
        pdfUrl: urlData.publicUrl,
        fileName: file.name,
        updatedAt: new Date().toISOString()
      });

      toast.success("PDF subido correctamente");
      fetchData();
    } catch (error) {
      console.error("Error uploading:", error);
      toast.error("Error al subir PDF");
    } finally {
      setUploading(false);
    }
  };

  // Create new consent
  const handleCreateConsent = async (type) => {
    try {
      await addDoc(collection(db, 'consentimientos'), {
        type,
        label: `Nuevo consentimiento ${type}`,
        pdfUrl: '',
        fileName: '',
        createdAt: new Date().toISOString()
      });
      toast.success("Consentimiento creado");
      fetchData();
    } catch (error) {
      toast.error("Error al crear");
    }
  };

  // Delete consent
  const handleDeleteConsent = async (id) => {
    if (!confirm("¿Eliminar este consentimiento?")) return;
    try {
      await deleteDoc(doc(db, 'consentimientos', id));
      toast.success("Eliminado");
      fetchData();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  // Save mapping
  const handleSaveMapping = async () => {
    if (!mappingModal) return;
    const code = mappingModal.code;

    try {
      await setDoc(doc(db, 'consent_mappings', code), {
        code,
        name: mappingModal.name,
        adultoId: selectedAdulto || null,
        menorId: selectedMenor || null,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      toast.success("Mapeo guardado");
      setMappingModal(null);
      setSelectedAdulto('');
      setSelectedMenor('');
      fetchData();
    } catch (error) {
      toast.error("Error al guardar mapeo");
    }
  };

  // Delete mapping
  const handleDeleteMapping = async (code) => {
    if (!confirm(`¿Eliminar mapeo para código ${code}?`)) return;
    try {
      await deleteDoc(doc(db, 'consent_mappings', code));
      toast.success("Mapeo eliminado");
      fetchData();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  // Get consent by ID
  const getConsentById = (id) => consentimientos.find(c => c.id === id);

  const filteredMappings = Object.entries(mappings).filter(([code, data]) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return code.toLowerCase().includes(term) || (data.name || '').toLowerCase().includes(term);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Consentimientos</h2>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Mapeá códigos de cirugía con archivos PDF de consentimiento
          </p>
        </div>
      </div>

      {/* Consentimientos Library */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Biblioteca de PDFs</h3>
          <div className="flex gap-2">
            {CONSENT_TYPES.map(type => (
              <button
                key={type.id}
                onClick={() => handleCreateConsent(type.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  type.color === 'blue' ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' :
                  type.color === 'indigo' ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' :
                  'bg-purple-50 text-purple-600 hover:bg-purple-100'
                }`}
              >
                <Plus size={12} /> {type.label.split('–')[0].trim()}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {consentimientos.map(c => (
            <div key={c.id} className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    c.type === 'generico' ? 'bg-blue-100 text-blue-600' :
                    c.type === 'adulto' ? 'bg-indigo-100 text-indigo-600' :
                    'bg-purple-100 text-purple-600'
                  }`}>
                    <FileText size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700 truncate">{c.label || c.fileName || 'Sin nombre'}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{c.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteConsent(c.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {c.pdfUrl ? (
                <div className="flex items-center gap-2">
                  <a
                    href={c.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-colors"
                  >
                    <Eye size={12} /> Ver PDF
                  </a>
                  <label className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-colors cursor-pointer">
                    <Upload size={12} /> Reemplazar
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => handleUpload(e, c.id)}
                      disabled={uploading}
                    />
                  </label>
                </div>
              ) : (
                <label className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-colors cursor-pointer">
                  <Upload size={12} /> Subir PDF
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleUpload(e, c.id)}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mappings */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
            Mapeo de Códigos ({filteredMappings.length})
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar código o nombre..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Código</th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Nombre</th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Adulto</th>
                <th className="text-left px-4 py-2 font-bold text-slate-500">Menor</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.map(([code, data]) => {
                const adultoConsent = getConsentById(data.adultoId);
                const menorConsent = getConsentById(data.menorId);

                return (
                  <tr key={code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{code}</td>
                    <td className="px-4 py-3 text-slate-600">{data.name || '—'}</td>
                    <td className="px-4 py-3">
                      {adultoConsent ? (
                        <span className="flex items-center gap-1 text-indigo-600">
                          <CheckCircle2 size={12} /> {adultoConsent.label || adultoConsent.fileName}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {menorConsent ? (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Baby size={12} /> {menorConsent.label || menorConsent.fileName}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setMappingModal({ code, name: data.name });
                            setSelectedAdulto(data.adultoId || '');
                            setSelectedMenor(data.menorId || '');
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Link2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteMapping(code)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mapping Modal */}
      {mappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="fixed inset-0" onClick={() => setMappingModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Mapear Consentimiento</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">{mappingModal.code} - {mappingModal.name}</p>
              </div>
              <button onClick={() => setMappingModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Consentimiento Adulto</label>
                <select
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedAdulto}
                  onChange={e => setSelectedAdulto(e.target.value)}
                >
                  <option value="">Ninguno</option>
                  {consentimientos.filter(c => c.type !== 'menor').map(c => (
                    <option key={c.id} value={c.id}>{c.label || c.fileName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Consentimiento Menor</label>
                <select
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedMenor}
                  onChange={e => setSelectedMenor(e.target.value)}
                >
                  <option value="">Ninguno</option>
                  {consentimientos.filter(c => c.type !== 'adulto').map(c => (
                    <option key={c.id} value={c.id}>{c.label || c.fileName}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setMappingModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveMapping}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
                >
                  Guardar Mapeo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsentimientosView;
