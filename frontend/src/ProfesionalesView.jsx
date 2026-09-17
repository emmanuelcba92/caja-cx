import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  UserPlus, 
  GraduationCap, 
  IdCard, 
  X, 
  Check,
  AlertCircle
} from 'lucide-react';
import apiService from './services/apiService';
import { formatDoctorDisplayName, parseDoctorNameParts } from './utils/doctorName';

const PROFESSIONALS_KEY = 'professionals_proto';

const PREFIJOS = ['Dr', 'Dra', 'Lic', 'Dr(a)'];

const SPECIALTIES = [
  'Otorrinolaringología',
  'Anestesista',
  'Fonoaudióloga',
  'Estética',
  'Otro'
];

function ProfesionalesView({ professionals: professionalsProp, setProfessionals: setProfessionalsProp }) {
  const [professionalsState, setProfessionalsState] = useState(() => {
    try {
      const saved = localStorage.getItem(PROFESSIONALS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const professionals = professionalsProp || professionalsState;
  const setProfessionals = setProfessionalsProp || ((updater) => {
    const newVal = typeof updater === 'function' ? updater(professionalsState) : updater;
    setProfessionalsState(newVal);
    localStorage.setItem(PROFESSIONALS_KEY, JSON.stringify(newVal));
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [firmaFile, setFirmaFile] = useState(null);

  const formatFullName = (prefijo, nombrePila, apellido) => {
    return formatDoctorDisplayName(`${prefijo || 'Dr.'} ${nombrePila || ''} ${apellido || ''}`);
  };

  React.useEffect(() => {
    const fetchRealProfs = async () => {
      try {
        const fromDb = await apiService.getCollection('profesionales');
        if (fromDb && fromDb.length > 0) {
          const mapped = fromDb.map(p => {
            const parsed = parseDoctorNameParts(p.nombre, p.prefijo, p.nombreOnly, p.apellido);
            const canonicalFullName = formatFullName(parsed.prefijo, parsed.nombrePila, parsed.apellido);
            return {
              id: p.id,
              nombre: canonicalFullName, // Nombre completo canónico para SurgeryApp
              prefijo: parsed.prefijo,
              nombrePila: parsed.nombrePila,
              apellido: parsed.apellido,
              email: p.email || '',
              especialidad: (p.categoria || p.especialidad) === 'ORL' ? 'Otorrinolaringología' : (p.categoria || p.especialidad || 'Otorrinolaringología'),
              mp: p.mp || '',
              me: p.me || '',
              firma: p.firmaUrl || p.firma || ''
            };
          });
          setProfessionals(mapped);
        }
      } catch (e) {
        console.error("Error fetching professionals from Firestore:", e);
      }
    };
    fetchRealProfs();
  }, []);

  const [formData, setFormData] = useState({
    id: null,
    prefijo: 'Dr',
    nombrePila: '',
    apellido: '',
    email: '',
    especialidad: 'Otorrinolaringología',
    mp: '',
    me: '',
    firma: ''
  });

  const getFullName = (p) => {
    if (!p) return '';
    return formatDoctorDisplayName(p.nombre || `${p.prefijo || ''} ${p.nombrePila || ''} ${p.apellido || ''}`);
  };

  const handleOpenModal = (prof = null) => {
    if (prof) {
      const parsed = parseDoctorNameParts(prof.nombre, prof.prefijo, prof.nombrePila || prof.nombreOnly, prof.apellido);
      setFormData({
        ...prof,
        prefijo: parsed.prefijo || 'Dr',
        nombrePila: parsed.nombrePila,
        apellido: parsed.apellido,
        especialidad: prof.especialidad === 'ORL' ? 'Otorrinolaringología' : (prof.especialidad || 'Otorrinolaringología')
      });
      setIsEditing(true);
    } else {
      setFormData({ id: null, prefijo: 'Dr', nombrePila: '', apellido: '', email: '', especialidad: 'Otorrinolaringología', mp: '', me: '', firma: '' });
      setIsEditing(false);
    }
    setFirmaFile(null);
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setError('');
    setFirmaFile(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFirmaFile(file);
      setFormData(prev => ({ ...prev, firma: URL.createObjectURL(file) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.apellido.trim() || !formData.mp.trim()) {
      setError('Apellido y Matrícula Profesional (MP) son obligatorios');
      return;
    }

    const canonicalFullName = formatFullName(formData.prefijo, formData.nombrePila, formData.apellido);
    const dataToSave = { 
      ...formData, 
      nombre: canonicalFullName,
      nombrePila: formData.nombrePila.trim(),
      apellido: formData.apellido.trim()
    };

    if (isEditing) {
      setProfessionals(professionals.map(p => p.id === dataToSave.id ? { ...dataToSave } : p));
      if (typeof dataToSave.id === 'string') {
        try {
          await apiService.updateDocument('profesionales', dataToSave.id, {
            nombre: canonicalFullName,
            prefijo: dataToSave.prefijo,
            nombreOnly: dataToSave.nombrePila,
            apellido: dataToSave.apellido,
            email: dataToSave.email,
            categoria: dataToSave.especialidad,
            especialidad: dataToSave.especialidad,
            mp: dataToSave.mp,
            me: dataToSave.me,
            firmaUrl: dataToSave.firma
          });
        } catch (err) {
          console.error("Error updating profesional in Firestore:", err);
        }
      }
    } else {
      const newProf = {
        ...dataToSave,
        id: Date.now()
      };
      setProfessionals([...professionals, newProf]);
    }
    handleCloseModal();
  };

  const handleDelete = (id) => {
    if (window.confirm('¿Estás seguro de eliminar este profesional?')) {
      setProfessionals(professionals.filter(p => p.id !== id));
    }
  };

  const filteredProfessionals = professionals.filter(p => 
    (p.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.apellido || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.especialidad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.mp.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.me || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="text-indigo-600" />
            Profesionales
          </h2>
          <p className="text-sm text-slate-500 mt-1">Gestioná el registro de médicos y especialistas de la clínica.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
        >
          <UserPlus size={18} />
          Nuevo Profesional
        </button>
      </div>

      {/* Search & Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre, especialidad, MP o ME..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="bg-indigo-50 rounded-xl px-4 py-2.5 border border-indigo-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-indigo-700">Total registrados:</span>
          <span className="text-lg font-bold text-indigo-800">{professionals.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Especialidad</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider">Matrículas</th>
                <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProfessionals.length > 0 ? (
                filteredProfessionals.map((prof) => (
                  <tr key={prof.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {prof.firma ? (
                          <img 
                            src={prof.firma} 
                            alt={getFullName(prof)} 
                            className="w-9 h-9 rounded-full object-cover border border-slate-200"
                            onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + getFullName(prof); }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                            {(prof.apellido || prof.nombre || '?').charAt(0)}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{getFullName(prof)}</span>
                          {prof.firma && <span className="text-[10px] text-slate-400 italic">Con firma digital</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                        <GraduationCap size={14} />
                        {prof.especialidad}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs space-y-1">
                        <p className="text-slate-700"><span className="text-slate-400 font-medium">MP:</span> {prof.mp}</p>
                        {prof.me && <p className="text-slate-700"><span className="text-slate-400 font-medium">ME:</span> {prof.me}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(prof)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(prof.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center text-slate-400">
                      <Users size={48} className="mb-3 opacity-20" />
                      <p className="text-sm font-medium">No se encontraron profesionales</p>
                      <button 
                        onClick={() => handleOpenModal()}
                        className="mt-2 text-indigo-600 text-xs font-bold hover:underline"
                      >
                        Agregar el primero
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {isEditing ? <Pencil size={18} className="text-indigo-600" /> : <UserPlus size={18} className="text-indigo-600" />}
                {isEditing ? 'Editar Profesional' : 'Nuevo Profesional'}
              </h3>
              <button onClick={handleCloseModal} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium border border-rose-200 flex items-center gap-2">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Prefijo</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                    value={formData.prefijo}
                    onChange={e => setFormData(prev => ({ ...prev, prefijo: e.target.value }))}
                  >
                    {PREFIJOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Nombre</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Juan"
                    value={formData.nombrePila}
                    onChange={e => setFormData(prev => ({ ...prev, nombrePila: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Apellido *</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Pérez"
                    value={formData.apellido}
                    onChange={e => setFormData(prev => ({ ...prev, apellido: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Email Profesional</label>
                <input
                  type="email"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="ejemplo@clinica.com"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Especialidad</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                    value={formData.especialidad}
                    onChange={e => setFormData(prev => ({ ...prev, especialidad: e.target.value }))}
                  >
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Firma</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Matrícula Prof. (MP)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Ej: 12345"
                    value={formData.mp}
                    onChange={e => setFormData(prev => ({ ...prev, mp: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Matrícula Esp. (ME)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Ej: 54321"
                    value={formData.me}
                    onChange={e => setFormData(prev => ({ ...prev, me: e.target.value }))}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  {isEditing ? 'Guardar Cambios' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfesionalesView;
