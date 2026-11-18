import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Filter,
  Info,
  MapPin,
  Package,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import { expandCodes, getCodeName } from '../data/clinicalCodes';
import { formatDateDisplay } from '../utils/navigation';

const toIsoDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseIsoDate = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDaysIso = (iso, days) => {
  const dt = parseIsoDate(iso);
  dt.setDate(dt.getDate() + days);
  return toIsoDate(dt);
};

export const getDashboardDateRange = (period, anchorIso, customFrom = '', customTo = '', todayIso = '', extraWeeks = 0) => {
  const safeAnchor = anchorIso || toIsoDate(new Date());
  const safeToday = todayIso || toIsoDate(new Date());
  const extraDays = Math.max(0, Number(extraWeeks) || 0) * 14;

  if (period === 'day') {
    return { from: safeAnchor, to: safeAnchor };
  }
  if (period === 'week') {
    const dt = parseIsoDate(safeAnchor);
    const dayOfWeek = dt.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { from: toIsoDate(monday), to: toIsoDate(sunday) };
  }
  if (period === 'fortnight') {
    return { from: safeAnchor, to: addDaysIso(safeAnchor, 14) };
  }
  if (period === 'month') {
    const dt = parseIsoDate(safeAnchor);
    const first = new Date(dt.getFullYear(), dt.getMonth(), 1);
    const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
    return { from: toIsoDate(first), to: toIsoDate(last) };
  }
  if (period === 'custom') {
    return { from: customFrom || '', to: customTo || '' };
  }
  if (period === 'upcoming') {
    return {
      from: safeToday,
      to: addDaysIso(safeToday, 13 + extraDays),
    };
  }
  if (period === 'history') {
    return {
      from: addDaysIso(safeToday, -(14 + extraDays)),
      to: addDaysIso(safeToday, -1),
    };
  }
  return getDashboardDateRange('week', safeAnchor);
};

export const shiftDashboardAnchor = (period, anchorIso, direction) => {
  const safeAnchor = anchorIso || toIsoDate(new Date());
  if (period === 'day') return addDaysIso(safeAnchor, direction);
  if (period === 'week') return addDaysIso(safeAnchor, direction * 7);
  if (period === 'fortnight') return addDaysIso(safeAnchor, direction * 15);
  if (period === 'month') {
    const dt = parseIsoDate(safeAnchor);
    return toIsoDate(new Date(dt.getFullYear(), dt.getMonth() + direction, 1));
  }
  return safeAnchor;
};

export const getSurgeryAttentionReasons = (surgery, todayIso) => {
  if (!surgery) return [];
  const fecha = surgery.fecha || '';
  if (!fecha || fecha < todayIso) return [];
  if (surgery.estado === 'CANCELADA' || surgery.estado === 'RECHAZADA') return [];

  const reasons = [];
  if (surgery.estado === 'SOLICITADA') {
    reasons.push('Pendiente de auditoría');
  } else if (surgery.estado === 'CODIFICADA' || surgery.estado === 'ENVIADA') {
    reasons.push('Sin autorización');
  }
  if (surgery.requiereMaterial === 'SI' && (surgery.aprobacionMaterial || 'PENDIENTE') === 'PENDIENTE') {
    reasons.push('Material pendiente');
  }
  return reasons;
};

const formatDateGroupHeader = (iso, todayIso) => {
  if (!iso) return 'Sin fecha asignada';
  const tomorrowIso = addDaysIso(todayIso, 1);
  const dt = parseIsoDate(iso);
  const weekday = dt.toLocaleDateString('es-AR', { weekday: 'long' });
  const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const formatted = formatDateDisplay(iso);
  if (iso === todayIso) return `Hoy · ${capWeekday} ${formatted}`;
  if (iso === tomorrowIso) return `Mañana · ${capWeekday} ${formatted}`;
  return `${capWeekday} ${formatted}`;
};

const extractShortCodes = (codigosStr) =>
  String(codigosStr || '')
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(Boolean);

export const filterAndGroupDashboardSurgeries = (surgeries, filters, todayIso) => {
  const {
    from = '',
    to = '',
    search = '',
    obraSocial = '',
    profesional = '',
    estado = '',
    tipo = 'TODOS',
    onlyAttention = false,
    sortOrder = 'asc',
  } = filters || {};

  const term = String(search || '').trim().toLowerCase();

  const filtered = (surgeries || []).filter((s) => {
    const fecha = s.fecha || '';
    if (from && (!fecha || fecha < from)) return false;
    if (to && (!fecha || fecha > to)) return false;
    if (estado && s.estado !== estado) return false;
    if (obraSocial && s.obraSocial !== obraSocial) return false;
    if (profesional) {
      const pf = profesional.toLowerCase();
      const matchProf =
        (s.nombreProfesional || '').toLowerCase().includes(pf) ||
        (s.residente || '').toLowerCase().includes(pf);
      if (!matchProf) return false;
    }
    if (tipo !== 'TODOS') {
      const isEstudio = s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia;
      if (tipo === 'ESTUDIO' && !isEstudio) return false;
      if (tipo === 'CIRUGIA' && isEstudio) return false;
    }
    if (onlyAttention && getSurgeryAttentionReasons(s, todayIso).length === 0) {
      return false;
    }
    if (term) {
      const haystack = [
        s.paciente,
        s.dni,
        s.nroAfiliado,
        s.nombreProfesional,
        s.residente,
        s.obraSocial,
        s.codigos,
        s.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });

  const groupsMap = new Map();
  filtered.forEach((s) => {
    const key = s.fecha || '';
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(s);
  });

  const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b);
  });

  return sortedKeys.map((dateKey) => {
    const items = groupsMap.get(dateKey).sort((a, b) => {
      const timeA = a.horaInicio || '99:99';
      const timeB = b.horaInicio || '99:99';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      const ingA = a.horaIngreso || '99:99';
      const ingB = b.horaIngreso || '99:99';
      if (ingA !== ingB) return ingA.localeCompare(ingB);
      return (a.paciente || '').localeCompare(b.paciente || '');
    });
    return { date: dateKey, items };
  });
};

const PRIMARY_MODES = [
  { id: 'upcoming', label: 'Próximas cirugías' },
  { id: 'history', label: 'Historial anterior' },
];

const PERIOD_OPTIONS = [
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'fortnight', label: '15 días' },
  { id: 'month', label: 'Mes' },
  { id: 'custom', label: 'Rango' },
];

export default function SurgicalDashboardView({ surgeries = [], professionals = [], statusMap = {} }) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [period, setPeriod] = useState('upcoming');
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [customFrom, setCustomFrom] = useState(todayIso);
  const [customTo, setCustomTo] = useState(addDaysIso(todayIso, 6));
  const [extraWeeks, setExtraWeeks] = useState(0);

  const [search, setSearch] = useState('');
  const [obraSocial, setObraSocial] = useState('');
  const [profesional, setProfesional] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('TODOS');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const [detailSurgery, setDetailSurgery] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showOsBreakdown, setShowOsBreakdown] = useState(false);

  const selectPeriod = (nextPeriod) => {
    setPeriod(nextPeriod);
    setExtraWeeks(0);
  };

  const { from, to } = useMemo(
    () => getDashboardDateRange(period, anchorDate, customFrom, customTo, todayIso, extraWeeks),
    [period, anchorDate, customFrom, customTo, todayIso, extraWeeks]
  );

  const sortOrder = period === 'history' ? 'desc' : 'asc';

  const obraSocialOptions = useMemo(
    () => [...new Set((surgeries || []).map((s) => s.obraSocial).filter(Boolean))].sort(),
    [surgeries]
  );

  const professionalOptions = useMemo(() => {
    const names = new Set();
    (professionals || []).forEach((p) => {
      if (p?.nombre) names.add(p.nombre);
    });
    (surgeries || []).forEach((s) => {
      if (s?.nombreProfesional) names.add(s.nombreProfesional);
    });
    return Array.from(names).sort();
  }, [professionals, surgeries]);

  // Base list in selected date range (for KPI summary before status/attention toggles)
  const periodBaseGroups = useMemo(
    () => filterAndGroupDashboardSurgeries(surgeries, { from, to }, todayIso),
    [surgeries, from, to, todayIso]
  );

  const kpis = useMemo(() => {
    const allInPeriod = periodBaseGroups.flatMap((g) => g.items);
    let solicitadas = 0;
    let enGestion = 0;
    let autorizadas = 0;
    let attention = 0;
    allInPeriod.forEach((s) => {
      if (s.estado === 'SOLICITADA') solicitadas += 1;
      else if (s.estado === 'CODIFICADA' || s.estado === 'ENVIADA') enGestion += 1;
      else if (s.estado === 'AUTORIZADA') autorizadas += 1;
      if (getSurgeryAttentionReasons(s, todayIso).length > 0) attention += 1;
    });
    return {
      total: allInPeriod.length,
      solicitadas,
      enGestion,
      autorizadas,
      attention,
    };
  }, [periodBaseGroups, todayIso]);

  const groupedSurgeries = useMemo(
    () =>
      filterAndGroupDashboardSurgeries(
        surgeries,
        { from, to, search, obraSocial, profesional, estado, tipo, onlyAttention, sortOrder },
        todayIso
      ),
    [surgeries, from, to, search, obraSocial, profesional, estado, tipo, onlyAttention, sortOrder, todayIso]
  );

  const totalVisible = useMemo(
    () => groupedSurgeries.reduce((acc, g) => acc + g.items.length, 0),
    [groupedSurgeries]
  );

  const obraSocialBreakdown = useMemo(() => {
    const counts = new Map();
    groupedSurgeries.forEach((group) => {
      group.items.forEach((s) => {
        const raw = String(s.obraSocial || '').trim();
        const label = raw || 'Sin obra social';
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name)));
  }, [groupedSurgeries]);

  const hasMoreRecords = useMemo(() => {
    if (period === 'upcoming' && to) {
      const nextDay = addDaysIso(to, 1);
      const futureGroups = filterAndGroupDashboardSurgeries(
        surgeries,
        { from: nextDay, to: '', search, obraSocial, profesional, estado, tipo, onlyAttention },
        todayIso
      );
      return futureGroups.some((g) => g.items.length > 0);
    }
    if (period === 'history' && from) {
      const prevDay = addDaysIso(from, -1);
      const olderGroups = filterAndGroupDashboardSurgeries(
        surgeries,
        { from: '', to: prevDay, search, obraSocial, profesional, estado, tipo, onlyAttention },
        todayIso
      );
      return olderGroups.some((g) => g.items.length > 0);
    }
    return false;
  }, [period, from, to, surgeries, search, obraSocial, profesional, estado, tipo, onlyAttention, todayIso]);

  const hasActiveFilters = Boolean(search || obraSocial || profesional || estado || tipo !== 'TODOS' || onlyAttention);

  const clearFilters = () => {
    setSearch('');
    setObraSocial('');
    setProfesional('');
    setEstado('');
    setTipo('TODOS');
    setOnlyAttention(false);
  };

  const rangeLabel = useMemo(() => {
    if (period === 'day' && from) {
      const weekday = parseIsoDate(from).toLocaleDateString('es-AR', { weekday: 'short' });
      const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      return `Día: ${cap} ${formatDateDisplay(from)}`;
    }
    if (period === 'week' && from && to) {
      return `Semana (Lun–Dom): ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
    }
    if (period === 'fortnight' && from && to) {
      return `15 días: ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
    }
    if (period === 'month' && from && to) {
      const dt = parseIsoDate(from);
      const monthName = dt.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      const cap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      return `Mes (${cap}): ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
    }
    if (period === 'custom') {
      if (from && to) return `Rango: ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
      if (from) return `Rango: desde ${formatDateDisplay(from)}`;
      if (to) return `Rango: hasta ${formatDateDisplay(to)}`;
      return 'Rango personalizado';
    }
    if (period === 'upcoming' && from && to) {
      return `Próximas cirugías: ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
    }
    if (period === 'history' && from && to) {
      return `Historial anterior: ${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
    }
    return 'Todas las fechas';
  }, [period, from, to]);

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600/10 text-blue-600 border border-blue-500/20 text-[10px] font-black uppercase tracking-wider">
              <Eye size={12} />
              Solo Lectura
            </span>
            <span className="text-xs font-bold text-[var(--text-sub)]">{rangeLabel}</span>
          </div>
          <h2 className="text-lg font-black text-[var(--text-main)] tracking-tight">
            Panel Operativo de Cirugías y Estudios
          </h2>
          <p className="text-xs text-[var(--text-sub)]">
            Consulta general de programación, estados de autorización, materiales y observaciones.
          </p>
        </div>

        {/* Period Selector + Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-main)]">
            {PRIMARY_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => selectPeriod(mode.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  period === mode.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-main)]">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectPeriod(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  period === opt.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-sub)] hover:text-[var(--text-main)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {period !== 'custom' && period !== 'upcoming' && period !== 'history' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[var(--bg-secondary)] px-2.5 py-1 rounded-xl border border-[var(--border-main)]">
                <CalendarIcon size={14} className="text-blue-600 shrink-0" />
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => {
                    if (e.target.value) setAnchorDate(e.target.value);
                  }}
                  aria-label="Seleccionar fecha"
                  title="Seleccionar fecha de referencia"
                  className="bg-transparent text-xs font-bold text-[var(--text-main)] outline-none cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-main)]">
                <button
                  type="button"
                  onClick={() => setAnchorDate((prev) => shiftDashboardAnchor(period, prev, -1))}
                  className="p-1.5 rounded-lg text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                  title="Período anterior"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setAnchorDate(todayIso)}
                  className="px-2.5 py-1 rounded-lg text-xs font-black text-blue-600 hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setAnchorDate((prev) => shiftDashboardAnchor(period, prev, 1))}
                  className="p-1.5 rounded-lg text-[var(--text-sub)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                  title="Período siguiente"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => {
            setEstado('');
            setOnlyAttention(false);
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            !estado && !onlyAttention
              ? 'bg-blue-600/5 border-blue-500/40 shadow-sm'
              : 'bg-[var(--bg-card)] border-[var(--border-main)] hover:border-blue-500/30'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-sub)]">Total período</p>
          <p className="text-2xl font-black text-[var(--text-main)] mt-1">{kpis.total}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setOnlyAttention(false);
            setEstado((prev) => (prev === 'SOLICITADA' ? '' : 'SOLICITADA'));
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            estado === 'SOLICITADA'
              ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
              : 'bg-[var(--bg-card)] border-[var(--border-main)] hover:border-amber-500/30'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Solicitadas</p>
          <p className="text-2xl font-black text-[var(--text-main)] mt-1">{kpis.solicitadas}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setOnlyAttention(false);
            setEstado((prev) => (prev === 'ENVIADA' ? '' : 'ENVIADA'));
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            estado === 'CODIFICADA' || estado === 'ENVIADA'
              ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm'
              : 'bg-[var(--bg-card)] border-[var(--border-main)] hover:border-indigo-500/30'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Codif. / Enviadas</p>
          <p className="text-2xl font-black text-[var(--text-main)] mt-1">{kpis.enGestion}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setOnlyAttention(false);
            setEstado((prev) => (prev === 'AUTORIZADA' ? '' : 'AUTORIZADA'));
          }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            estado === 'AUTORIZADA'
              ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
              : 'bg-[var(--bg-card)] border-[var(--border-main)] hover:border-emerald-500/30'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Autorizadas</p>
          <p className="text-2xl font-black text-[var(--text-main)] mt-1">{kpis.autorizadas}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setEstado('');
            setOnlyAttention((prev) => !prev);
          }}
          className={`col-span-2 sm:col-span-1 text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            onlyAttention
              ? 'bg-rose-500/10 border-rose-500/40 shadow-sm'
              : 'bg-[var(--bg-card)] border-[var(--border-main)] hover:border-rose-500/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Requieren atención</p>
            <AlertTriangle size={14} className="text-rose-500" />
          </div>
          <p className="text-2xl font-black text-[var(--text-main)] mt-1">{kpis.attention}</p>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-4 shadow-sm space-y-3">
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-[var(--border-main)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-sub)]">Desde:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-sub)]">Hasta:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-600"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por paciente, DNI, N° afiliado, código, profesional..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] text-xs font-bold text-[var(--text-main)] outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-[var(--bg-card)] transition-all"
            />
          </div>

          <select
            value={obraSocial}
            onChange={(e) => setObraSocial(e.target.value)}
            className="text-xs font-bold text-[var(--text-main)] outline-none px-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] cursor-pointer focus:border-blue-600"
          >
            <option value="">Todas las Obras Sociales</option>
            {obraSocialOptions.map((os) => (
              <option key={os} value={os}>
                {os}
              </option>
            ))}
          </select>

          <select
            value={profesional}
            onChange={(e) => setProfesional(e.target.value)}
            className="text-xs font-bold text-[var(--text-main)] outline-none px-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] cursor-pointer focus:border-blue-600"
          >
            <option value="">Todos los profesionales</option>
            {professionalOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="text-xs font-bold text-[var(--text-main)] outline-none px-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] cursor-pointer focus:border-blue-600"
          >
            <option value="">Todos los estados</option>
            {Object.keys(statusMap).map((k) => (
              <option key={k} value={k}>
                {statusMap[k].label}
              </option>
            ))}
          </select>

          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="text-xs font-bold text-[var(--text-main)] outline-none px-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-secondary)] cursor-pointer focus:border-blue-600"
          >
            <option value="TODOS">Tipo: Todos</option>
            <option value="CIRUGIA">Solo Cirugías</option>
            <option value="ESTUDIO">Solo Estudios</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--text-sub)] font-semibold pt-0.5">
          <div
            className="relative inline-flex items-center"
            onMouseEnter={() => setShowOsBreakdown(true)}
            onMouseLeave={() => setShowOsBreakdown(false)}
          >
            <button
              type="button"
              onClick={() => setShowOsBreakdown((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-left hover:text-[var(--text-main)] transition-colors cursor-pointer"
              aria-expanded={showOsBreakdown}
              title="Ver desglose por obra social"
            >
              <span>
                Mostrando <strong className="text-[var(--text-main)]">{totalVisible}</strong> procedimiento{totalVisible === 1 ? '' : 's'}
              </span>
              <Info size={13} className="text-blue-600 shrink-0" />
            </button>

            {showOsBreakdown && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] shadow-xl p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-[var(--border-main)] pb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-sub)]">
                    Por obra social
                  </span>
                  <span className="text-[10px] font-black text-blue-600">
                    Total: {totalVisible}
                  </span>
                </div>
                {obraSocialBreakdown.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-sub)] italic">Sin procedimientos visibles</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
                    {obraSocialBreakdown.map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[var(--text-main)] font-semibold truncate">{item.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-main)] font-black shrink-0">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {onlyAttention && (
            <span className="text-rose-600 font-bold flex items-center gap-1">
              <Filter size={12} /> Filtrando próximos con alertas pendientes
            </span>
          )}
        </div>
      </div>

      {/* Grouped Surgeries List */}
      {groupedSurgeries.length === 0 ? (
        <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-10 text-center space-y-2">
          <CalendarIcon size={32} className="mx-auto text-slate-400" />
          <p className="text-sm font-black text-[var(--text-main)]">
            No hay cirugías o estudios para los filtros seleccionados
          </p>
          <p className="text-xs text-[var(--text-sub)]">
            Probá cambiando el período temporal o limpiando los filtros activos.
          </p>
          {(period === 'upcoming' || period === 'history') && hasMoreRecords && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setExtraWeeks((prev) => prev + 1)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
              >
                {period === 'upcoming'
                  ? 'Cargar más (+2 semanas siguientes)'
                  : 'Cargar más (+2 semanas anteriores)'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedSurgeries.map((group) => (
            <section
              key={group.date || 'sin-fecha'}
              className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl overflow-hidden shadow-sm"
            >
              <header className="px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-main)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon size={15} className="text-blue-600 shrink-0" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-main)]">
                    {formatDateGroupHeader(group.date, todayIso)}
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-600/10 text-blue-600 text-[10px] font-black">
                  {group.items.length} {group.items.length === 1 ? 'registro' : 'registros'}
                </span>
              </header>

              <div className="divide-y divide-[var(--border-main)]">
                {group.items.map((s) => {
                  const st = statusMap[s.estado] || {
                    label: s.estado || 'Sin estado',
                    color: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
                  };
                  const attentionReasons = getSurgeryAttentionReasons(s, todayIso);
                  const shortCodes = extractShortCodes(s.codigos);
                  const isEstudio = s.tipoProcedimiento === 'ESTUDIO' || !!s.estudioBajoAnestesia;

                  return (
                    <div
                      key={s.id}
                      onClick={() => setDetailSurgery(s)}
                      className="p-4 hover:bg-[var(--bg-secondary)]/60 transition-colors cursor-pointer flex flex-col lg:flex-row lg:items-center gap-3"
                    >
                      {/* Schedule & Room */}
                      <div className="flex lg:flex-col items-center lg:items-start gap-2 lg:gap-1 lg:w-36 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs font-black text-[var(--text-main)]">
                          <Clock size={13} className="text-blue-600 shrink-0" />
                          <span>{s.horaInicio ? `${s.horaInicio} hs` : 'Sin hora'}</span>
                        </div>
                        {s.horaIngreso && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Ing: {s.horaIngreso} {s.ordenIngreso ? `(${s.ordenIngreso})` : ''}
                          </span>
                        )}
                        {s.habitacion && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300">
                            <MapPin size={10} />
                            SALA {s.habitacion.toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Patient, Procedure & Notes */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-[var(--text-main)] truncate">
                            {s.paciente || 'Sin nombre'}
                          </span>
                          {s.dni && (
                            <span className="text-[11px] font-bold text-[var(--text-sub)]">
                              DNI {s.dni}
                            </span>
                          )}
                          {s.nroAfiliado && (
                            <span className="text-[10px] font-bold text-[var(--text-sub)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border-main)]">
                              Af: {s.nroAfiliado}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                              isEstudio
                                ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                            }`}
                          >
                            {isEstudio ? 'Estudio' : 'Cirugía'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap text-xs">
                          <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                            <User size={12} />
                            {s.nombreProfesional || 'Sin profesional'}
                          </span>
                          {s.residente && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                              Res: {s.residente}
                            </span>
                          )}
                          {s.obraSocial && (
                            <span className="text-[11px] font-bold uppercase text-[var(--text-sub)]">
                              • {s.obraSocial}
                            </span>
                          )}
                          {shortCodes.length > 0 && (
                            <span className="text-[11px] font-mono font-bold text-[var(--text-sub)]">
                              • Cód: {shortCodes.slice(0, 4).join(', ')}
                              {shortCodes.length > 4 ? ` (+${shortCodes.length - 4})` : ''}
                            </span>
                          )}
                        </div>

                        {/* Compact Observation Preview */}
                        {(s.notasDoctor || s.notasDirectora || s.observacionesGestion || s.motivoRechazo || s.motivoCancelacion) && (
                          <div className="flex flex-wrap gap-2 pt-0.5 text-[11px]">
                            {s.notasDoctor && (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded max-w-full truncate">
                                <Stethoscope size={11} className="shrink-0" />
                                <span className="truncate">Médico: {s.notasDoctor}</span>
                              </span>
                            )}
                            {s.notasDirectora && (
                              <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded max-w-full truncate">
                                <ShieldCheck size={11} className="shrink-0" />
                                <span className="truncate">Dir. Médica: {s.notasDirectora}</span>
                              </span>
                            )}
                            {s.observacionesGestion && (
                              <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded max-w-full truncate">
                                <FileText size={11} className="shrink-0" />
                                <span className="truncate">Gestión: {s.observacionesGestion}</span>
                              </span>
                            )}
                            {s.motivoRechazo && (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded max-w-full truncate">
                                <ShieldAlert size={11} className="shrink-0" />
                                <span className="truncate">Rechazo: {s.motivoRechazo}</span>
                              </span>
                            )}
                            {s.motivoCancelacion && (
                              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 bg-slate-500/10 px-2 py-0.5 rounded max-w-full truncate">
                                <Info size={11} className="shrink-0" />
                                <span className="truncate">Cancelación: {s.motivoCancelacion}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status Badges & Read-Only Detail Trigger */}
                      <div className="flex items-center gap-2 flex-wrap lg:justify-end shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${st.color}`}>
                          {st.label}
                        </span>

                        {s.reactivada && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-amber-500/30 bg-amber-500/10 text-amber-600">
                            Reactivada
                          </span>
                        )}

                        {s.requiereMaterial === 'SI' && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              (s.aprobacionMaterial || 'PENDIENTE') === 'APROBADO'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                : (s.aprobacionMaterial || 'PENDIENTE') === 'NO REQUIERE'
                                ? 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                                : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            }`}
                          >
                            <Package size={11} />
                            {s.aprobacionMaterial || 'PENDIENTE'}
                          </span>
                        )}

                        {s.requierePresupuesto === 'SI' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-500/20 bg-blue-500/10 text-blue-600">
                            Presupuesto
                          </span>
                        )}

                        {attentionReasons.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-600 border border-rose-500/20"
                            title={attentionReasons.join(' · ')}
                          >
                            <AlertTriangle size={11} />
                            {attentionReasons[0]}
                            {attentionReasons.length > 1 ? ` +${attentionReasons.length - 1}` : ''}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailSurgery(s);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-blue-600 hover:text-white text-[var(--text-main)] border border-[var(--border-main)] text-xs font-black transition-colors cursor-pointer"
                        >
                          <Eye size={13} />
                          Ver detalle
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {(period === 'upcoming' || period === 'history') && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMoreRecords ? (
                <button
                  type="button"
                  onClick={() => setExtraWeeks((prev) => prev + 1)}
                  className="px-5 py-2.5 rounded-xl bg-[var(--bg-card)] hover:bg-blue-600 hover:text-white text-[var(--text-main)] border border-[var(--border-main)] text-xs font-black uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
                >
                  {period === 'upcoming'
                    ? 'Cargar más (+2 semanas siguientes)'
                    : 'Cargar más (+2 semanas anteriores)'}
                </button>
              ) : (
                <p className="text-[11px] font-semibold text-[var(--text-sub)]">
                  {period === 'upcoming'
                    ? 'No hay más cirugías próximas para los filtros seleccionados.'
                    : 'No hay registros anteriores para los filtros seleccionados.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Read-Only Detail Modal */}
      {detailSurgery && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm"
          onClick={() => setDetailSurgery(null)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--border-main)] flex items-center justify-between gap-3 bg-[var(--bg-secondary)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-blue-600/10 text-blue-600 text-[10px] font-black uppercase">
                    Detalle Solo Lectura
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      (statusMap[detailSurgery.estado] || {}).color || 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                    }`}
                  >
                    {(statusMap[detailSurgery.estado] || {}).label || detailSurgery.estado}
                  </span>
                  {detailSurgery.reactivada && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      Reactivada
                    </span>
                  )}
                </div>
                <h3 className="text-base font-black text-[var(--text-main)] mt-1 truncate">
                  {detailSurgery.paciente || 'Sin paciente'}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setDetailSurgery(null)}
                className="p-2 rounded-xl hover:bg-[var(--bg-card)] text-[var(--text-sub)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                aria-label="Cerrar detalle"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Patient & Schedule Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-main)] space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">
                    Paciente y Cobertura
                  </h4>
                  <p className="text-[var(--text-sub)]">DNI: <strong className="text-[var(--text-main)]">{detailSurgery.dni || '—'}</strong></p>
                  <p className="text-[var(--text-sub)]">Edad: <strong className="text-[var(--text-main)]">{detailSurgery.edad || '—'}</strong></p>
                  <p className="text-[var(--text-sub)]">Obra Social: <strong className="text-[var(--text-main)]">{detailSurgery.obraSocial || '—'}</strong></p>
                  <p className="text-[var(--text-sub)]">N° Afiliado: <strong className="text-[var(--text-main)]">{detailSurgery.nroAfiliado || '—'}</strong></p>
                  <p className="text-[var(--text-sub)]">Teléfono: <strong className="text-[var(--text-main)]">{detailSurgery.contactoFamiliar || '—'}</strong></p>
                  <p className="text-[var(--text-sub)]">Paciente Clínica: <strong className="text-[var(--text-main)]">{detailSurgery.esPacienteClinica || '—'}</strong></p>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-main)] space-y-1.5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">
                    Programación y Equipo
                  </h4>
                  <p className="text-[var(--text-sub)]">Fecha Cx: <strong className="text-[var(--text-main)]">{detailSurgery.fecha ? formatDateDisplay(detailSurgery.fecha) : 'Sin asignar'}</strong></p>
                  <p className="text-[var(--text-sub)]">Horario Cx: <strong className="text-[var(--text-main)]">{detailSurgery.horaInicio ? `${detailSurgery.horaInicio} hs (${detailSurgery.duracion || '—'})` : 'Sin horario'}</strong></p>
                  <p className="text-[var(--text-sub)]">Horario Ingreso: <strong className="text-[var(--text-main)]">{detailSurgery.horaIngreso ? `${detailSurgery.horaIngreso} hs` : '—'} {detailSurgery.ordenIngreso ? `(${detailSurgery.ordenIngreso})` : ''}</strong></p>
                  <p className="text-[var(--text-sub)]">Sala: <strong className="text-[var(--text-main)]">{detailSurgery.habitacion ? detailSurgery.habitacion.toUpperCase() : 'Sin asignar'}</strong></p>
                  <p className="text-[var(--text-sub)]">Profesional: <strong className="text-[var(--text-main)]">{detailSurgery.nombreProfesional || '—'}</strong></p>
                  {detailSurgery.residente && (
                    <p className="text-[var(--text-sub)]">Residente: <strong className="text-[var(--text-main)]">{detailSurgery.residente}</strong></p>
                  )}
                  <p className="text-[var(--text-sub)]">Solicitado por: <strong className="text-[var(--text-main)]">{detailSurgery.creador || '—'}</strong></p>
                </div>
              </div>

              {/* Clinical Details & Codes */}
              <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-main)] space-y-2.5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                  Procedimiento, Códigos y Materiales
                </h4>
                <div className="flex flex-wrap gap-3 text-[var(--text-sub)]">
                  <span>Tipo: <strong className="text-[var(--text-main)]">{detailSurgery.tipoProcedimiento === 'ESTUDIO' || detailSurgery.estudioBajoAnestesia ? 'Estudio bajo anestesia' : 'Cirugía'}</strong></span>
                  <span>Anestesia: <strong className="text-[var(--text-main)]">{detailSurgery.anestesia || '—'}</strong></span>
                  <span>Psicoprofilaxis: <strong className="text-[var(--text-main)]">{detailSurgery.psicoprofilaxis || '—'}</strong></span>
                  <span>Presupuesto: <strong className="text-[var(--text-main)]">{detailSurgery.requierePresupuesto || 'NO'}</strong></span>
                </div>

                <div>
                  <span className="font-bold text-[var(--text-sub)]">Diagnóstico / Justificación:</span>
                  <p className="mt-1 p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-main)] text-[var(--text-main)]">
                    {detailSurgery.justificacion || 'Sin descripción'}
                  </p>
                </div>

                <div>
                  <span className="font-bold text-[var(--text-sub)]">
                    Materiales ({detailSurgery.requiereMaterial === 'SI' ? `Aprobación: ${detailSurgery.aprobacionMaterial || 'PENDIENTE'}` : 'No requiere'}):
                  </span>
                  <p className="mt-1 p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-main)] text-[var(--text-main)]">
                    {detailSurgery.materiales || 'No especificados'}
                  </p>
                </div>

                {extractShortCodes(detailSurgery.codigos).length > 0 && (
                  <div>
                    <span className="font-bold text-[var(--text-sub)]">Códigos:</span>
                    <div className="mt-1 space-y-1">
                      {extractShortCodes(detailSurgery.codigos).map((code, idx) => {
                        const isSM = detailSurgery.obraSocial?.toUpperCase().includes('SWISS');
                        const isIOSFA = detailSurgery.obraSocial?.toUpperCase().includes('IOSFA');
                        const isSancor = detailSurgery.obraSocial?.toUpperCase().includes('SANCOR');
                        const expanded = expandCodes(code, isSM, isIOSFA, isSancor);
                        const desc = expanded.length > 0 ? expanded[0] : `${code} — ${getCodeName(code, detailSurgery.obraSocial)}`;
                        return (
                          <div key={`${code}-${idx}`} className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-main)]">
                            <span className="font-mono font-black text-indigo-600">{code}</span>
                            <span className="text-[var(--text-sub)] ml-2">{desc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {Array.isArray(detailSurgery.adjuntos) && detailSurgery.adjuntos.length > 0 && (
                  <div>
                    <span className="font-bold text-[var(--text-sub)]">Adjuntos:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {detailSurgery.adjuntos.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewImage(url)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 font-bold hover:bg-indigo-500/20 cursor-pointer"
                        >
                          <FileText size={12} /> Ver adjunto {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Differentiated Observations (Read-Only) */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-sub)]">
                  Observaciones y Motivos Registrados
                </h4>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-1.5 font-black text-amber-700 dark:text-amber-400">
                    <Stethoscope size={13} />
                    <span>Observaciones médicas (notasDoctor)</span>
                  </div>
                  <p className="mt-1 text-[var(--text-main)]">
                    {detailSurgery.notasDoctor || <span className="italic text-[var(--text-sub)]">Sin observaciones médicas</span>}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <div className="flex items-center gap-1.5 font-black text-indigo-700 dark:text-indigo-400">
                    <ShieldCheck size={13} />
                    <span>Observaciones de Dirección Médica (notasDirectora)</span>
                  </div>
                  <p className="mt-1 text-[var(--text-main)]">
                    {detailSurgery.notasDirectora || <span className="italic text-[var(--text-sub)]">Sin observaciones de Dirección Médica</span>}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20">
                  <div className="flex items-center gap-1.5 font-black text-teal-700 dark:text-teal-400">
                    <FileText size={13} />
                    <span>Observaciones de Gestión Administrativa</span>
                  </div>
                  <p className="mt-1 text-[var(--text-main)]">
                    {detailSurgery.observacionesGestion || <span className="italic text-[var(--text-sub)]">Sin observaciones administrativas registradas</span>}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-black text-[var(--text-main)]">
                    <ShieldAlert size={13} />
                    <span>Motivos administrativos y estado</span>
                  </div>
                  {detailSurgery.motivoRechazo ? (
                    <p className="text-rose-600 dark:text-rose-400">
                      <strong>Motivo de rechazo:</strong> {detailSurgery.motivoRechazo}
                    </p>
                  ) : null}
                  {detailSurgery.motivoCancelacion ? (
                    <p className="text-[var(--text-main)]">
                      <strong>Motivo de cancelación:</strong> {detailSurgery.motivoCancelacion}
                    </p>
                  ) : null}
                  {!detailSurgery.motivoRechazo && !detailSurgery.motivoCancelacion && (
                    <p className="italic text-[var(--text-sub)]">
                      Sin motivos de rechazo o cancelación registrados.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[var(--border-main)] bg-[var(--bg-secondary)] flex justify-end">
              <button
                type="button"
                onClick={() => setDetailSurgery(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Image Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-white text-slate-900 shadow-lg cursor-pointer"
              aria-label="Cerrar imagen"
            >
              <X size={16} />
            </button>
            <img src={previewImage} alt="Adjunto" className="max-h-[85vh] rounded-xl shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
