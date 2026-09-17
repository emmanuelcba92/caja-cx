import React, { useState, useEffect, useMemo } from 'react';
import apiService from '../services/apiService';
import { Search, User, CreditCard, Phone, Mail, Calendar, Filter, Plus, Trash2, Edit2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const PacientesView = () => {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterObraSocial, setFilterObraSocial] = useState('todas');
  const [showForm, setShowForm] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    dni: '',
    nombre: '',
    obraSocial: '',
    numeroAfiliado: '',
    telefono: '',
    email: ''
  });

  useEffect(() => {
    fetchPacientes();
  }, []);

  const fetchPacientes = async () => {
    setLoading(true);
    try {
      const data = await apiService.getCollection('pacientes');
      setPacientes(data);
    } catch (error) {
      console.error("Error fetching patients:", error);
      toast.error("Error al cargar pacientes");
    } finally {
      setLoading(false);
    }
  };

  const obrasSociales = useMemo(() => {
    const unique = [...new Set(pacientes.map(p => p.obraSocial).filter(Boolean))];
    return ['todas', ...unique.sort()];
  }, [pacientes]);

  const filteredPacientes = useMemo(() => {
    return pacientes.filter(p => {
      const matchesSearch =
        p.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.dni?.includes(searchTerm);
      const matchesFilter = filterObraSocial === 'todas' || p.obraSocial === filterObraSocial;
      return matchesSearch && matchesFilter;
    }).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  }, [pacientes, searchTerm, filterObraSocial]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.dni || !formData.nombre) {
      toast.error("DNI y Nombre son obligatorios");
      return;
    }

    try {
      const patientId = formData.dni;
      const patientData = {
        ...formData,
        id: patientId,
        lastUpdate: new Date().toISOString()
      };

      if (!editingId) {
        patientData.createdAt = new Date().toISOString();
      }

      await apiService.setDocument('pacientes', patientId, patientData);

      toast.success(editingId ? "Paciente actualizado" : "Paciente registrado");
      setShowForm(false);
      setEditingId(null);
      setFormData({ dni: '', nombre: '', obraSocial: '', numeroAfiliado: '', telefono: '', email: '' });
      fetchPacientes();
    } catch (error) {
      console.error("Error saving patient:", error);
      toast.error("Error al guardar paciente");
    }
  };

  const handleEdit = (p) => {
    setFormData({
      dni: p.dni || '',
      nombre: p.nombre || '',
      obraSocial: p.obraSocial || '',
      numeroAfiliado: p.numeroAfiliado || '',
      telefono: p.telefono || '',
      email: p.email || ''
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este paciente?")) return;
    try {
      await apiService.deleteDocument('pacientes', id);
      toast.success("Paciente eliminado");
      fetchPacientes();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pacientes</h2>
          <p className="text-xs text-slate-400 font-medium mt-1">{filteredPacientes.length} pacientes registrados</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({ dni: '', nombre: '', obraSocial: '', numeroAfiliado: '', telefono: '', email: '' }); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={16} /> Nuevo Paciente
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o DNI..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filterObraSocial}
          onChange={e => setFilterObraSocial(e.target.value)}
        >
          {obrasSociales.map(os => (
            <option key={os} value={os}>{os === 'todas' ? 'Todas las Obras Sociales' : os}</option>
          ))}
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="fixed inset-0" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-4">
              {editingId ? 'Editar Paciente' : 'Nuevo Paciente'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">DNI *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.dni}
                    onChange={e => setFormData({ ...formData, dni: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nombre *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.nombre}
                    onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Obra Social</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.obraSocial}
                    onChange={e => setFormData({ ...formData, obraSocial: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">N° Afiliado</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.numeroAfiliado}
                    onChange={e => setFormData({ ...formData, numeroAfiliado: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Teléfono</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.telefono}
                    onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email</label>
                  <input
                    type="email"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
                >
                  {editingId ? 'Guardar' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patients List */}
      {filteredPacientes.length === 0 ? (
        <div className="text-center py-16">
          <User size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No se encontraron pacientes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPacientes.slice(0, visibleCount).map(paciente => (
            <div key={paciente.id} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                    {paciente.nombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{paciente.nombre}</p>
                    <p className="text-[10px] text-slate-400">DNI: {paciente.dni}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(paciente)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(paciente.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {paciente.obraSocial && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <CreditCard size={12} className="text-slate-400" />
                    <span>{paciente.obraSocial} {paciente.numeroAfiliado && `- ${paciente.numeroAfiliado}`}</span>
                  </div>
                )}
                {paciente.telefono && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Phone size={12} className="text-slate-400" />
                    <span>{paciente.telefono}</span>
                  </div>
                )}
                {paciente.email && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Mail size={12} className="text-slate-400" />
                    <span className="truncate">{paciente.email}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {visibleCount < filteredPacientes.length && (
        <div className="text-center">
          <button
            onClick={() => setVisibleCount(v => v + 15)}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold transition-colors"
          >
            Cargar más ({filteredPacientes.length - visibleCount} restantes)
          </button>
        </div>
      )}
    </div>
  );
};

export default PacientesView;
