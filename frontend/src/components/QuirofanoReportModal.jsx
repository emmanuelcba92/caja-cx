import React from 'react';
import { Printer, Calendar, Clock, User, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function QuirofanoReportModal({ date, surgeries, onClose }) {
  // Filtrar cirugías para la fecha seleccionada que no estén canceladas
  const daySurgeries = surgeries
    .filter(s => s.fecha === date && s.estado !== 'CANCELADA')
    .sort((a, b) => (a.horaInicio || '08:00').localeCompare(b.horaInicio || '08:00'));

  const formatDateLabel = (dStr) => {
    if (!dStr) return '';
    const [y, m, d] = dStr.split('-');
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Cabecera modal (No imprimible) */}
        <div className="print:hidden px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Grilla Quirúrgica para Quirófano</h3>
              <p className="text-xs text-slate-500 capitalize">{formatDateLabel(date)} • {daySurgeries.length} cirugía(s) programada(s)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
            >
              <Printer size={16} />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Contenido Imprimible y Previsualización */}
        <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Header Impreso */}
            <div className="border-b-2 border-slate-800 pb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA (COAT)
                </h1>
                <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mt-0.5">
                  Parte Diario de Quirófano — Grilla Quirúrgica
                </h2>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-700 capitalize">{formatDateLabel(date)}</p>
                <p className="text-[11px] text-slate-500">Fecha: {date}</p>
                <p className="text-[10px] font-mono text-slate-400">Generado: {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs</p>
              </div>
            </div>

            {daySurgeries.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic">
                No hay cirugías programadas para esta fecha.
              </div>
            ) : (
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b border-slate-300 text-[10px] tracking-wider">
                      <th className="p-2.5 border-r border-slate-300 w-16 text-center">Hora</th>
                      <th className="p-2.5 border-r border-slate-300 w-20 text-center">Sala</th>
                      <th className="p-2.5 border-r border-slate-300">Paciente & DNI</th>
                      <th className="p-2.5 border-r border-slate-300">Cirujano / Profesional</th>
                      <th className="p-2.5 border-r border-slate-300">Práctica / Diagnóstico</th>
                      <th className="p-2.5 border-r border-slate-300 w-24">Anestesia</th>
                      <th className="p-2.5 w-36">Materiales / Caja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {daySurgeries.map((s, idx) => (
                      <tr key={s.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="p-2.5 border-r border-slate-200 text-center font-bold text-slate-800">
                          {s.horaInicio || '08:00'} hs
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-center font-black uppercase text-indigo-900 text-[11px]">
                          {s.habitacion ? s.habitacion.toUpperCase() : 'SALA 1'}
                        </td>
                        <td className="p-2.5 border-r border-slate-200">
                          <p className="font-bold text-slate-900">{s.paciente}</p>
                          <p className="text-[10px] text-slate-500">DNI: {s.dni || 'S/D'} • {s.edad ? `${s.edad} años` : ''}</p>
                          <p className="text-[10px] font-semibold text-slate-600 uppercase">{s.obraSocial || 'PARTICULAR'}</p>
                        </td>
                        <td className="p-2.5 border-r border-slate-200 font-medium text-slate-800">
                          <p>{s.nombreProfesional || 'Sin asignar'}</p>
                          {s.residente && (
                            <p className="text-[10px] text-teal-700 font-bold mt-0.5">Res: {s.residente}</p>
                          )}
                        </td>
                        <td className="p-2.5 border-r border-slate-200">
                          <p className="font-semibold text-slate-800">{s.justificacion || 'Cirugía Programada'}</p>
                          {s.codigos && (
                            <p className="text-[10px] font-mono text-indigo-600 mt-0.5">{s.codigos.replace(/\n/g, ' • ')}</p>
                          )}
                        </td>
                        <td className="p-2.5 border-r border-slate-200 text-slate-700">
                          {s.anestesia || 'General'}
                        </td>
                        <td className="p-2.5 text-slate-700">
                          {s.requiereMaterial === 'SI' ? (
                            <span className="font-medium text-slate-800 text-[11px] leading-tight block">
                              {s.materiales || 'Material Solicitado'}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">No requiere</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pie de firma / Recepción */}
            <div className="pt-8 border-t border-slate-300 grid grid-cols-3 gap-8 text-center text-xs text-slate-500">
              <div>
                <div className="border-b border-slate-400 mb-2 h-12"></div>
                <p className="font-bold text-slate-700">Firma Instrumentador/a</p>
              </div>
              <div>
                <div className="border-b border-slate-400 mb-2 h-12"></div>
                <p className="font-bold text-slate-700">Firma Anestesiología</p>
              </div>
              <div>
                <div className="border-b border-slate-400 mb-2 h-12"></div>
                <p className="font-bold text-slate-700">Recepción Quirófano</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
