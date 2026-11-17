import { expandCodes } from '../data/clinicalCodes.js';
import {
  createItem,
  createParticularItems,
  defaultConditions,
  defaultConditionsEnabled,
  todayISO,
} from '../data/presupuestoRules.js';

export function detectQuoteTypeFromSurgery(surgery) {
  const os = String(surgery?.obraSocial || '').trim().toLowerCase();
  if (!os || os === 'particular' || os === 'particulares') {
    return 'particular';
  }
  return 'obra-social';
}

function parseExpandedPracticeLine(line) {
  const text = String(line || '').trim();
  if (!text) return { codigo: '', descripcion: '' };
  const match = /^([A-Za-z0-9._-]+)\s*(?:-|—|:)?\s+(.+)$/.exec(text);
  if (match) {
    return { codigo: match[1].trim(), descripcion: match[2].trim() };
  }
  return { codigo: '', descripcion: text };
}

export function extractPracticesFromSurgery(surgery) {
  if (!surgery) return [];
  const rawCodes = surgery.codigosAuditados || surgery.codigos || '';
  const os = String(surgery.obraSocial || '').toUpperCase();
  const isSM = os.includes('SWISS');
  const isIOSFA = os.includes('IOSFA');
  const isSancor = os.includes('SANCOR');

  const expanded = expandCodes(rawCodes, isSM, isIOSFA, isSancor);
  if (Array.isArray(expanded) && expanded.length > 0) {
    return expanded.map(parseExpandedPracticeLine).filter((p) => p.codigo || p.descripcion);
  }
  return [];
}

export function buildQuoteInitialDataFromSurgery(surgery, overrideTipo = null) {
  const tipo = overrideTipo || detectQuoteTypeFromSurgery(surgery);
  const practices = extractPracticesFromSurgery(surgery);

  const surgeryDescription =
    practices.map((p) => (p.codigo ? `${p.codigo} ${p.descripcion}` : p.descripcion)).join(' + ') ||
    String(surgery?.cirugia || surgery?.observaciones || '').trim();

  const base = {
    fecha: todayISO(),
    paciente: String(surgery?.paciente || '').trim(),
    dni: String(surgery?.dni || '').trim(),
    obraSocial: String(surgery?.obraSocial || '').trim(),
    numeroAfiliado: String(surgery?.numeroAfiliado || surgery?.afiliado || '').trim(),
    cirugia: surgeryDescription,
    profesional: String(surgery?.nombreProfesional || '').trim(),
    condiciones: defaultConditions(tipo),
    condicionesActivas: defaultConditionsEnabled(tipo),
  };

  if (tipo === 'obra-social') {
    const items =
      practices.length > 0
        ? practices.map((p) =>
            createItem('obra-social', {
              codigo: p.codigo,
              descripcion: p.descripcion,
              monto: null,
              aConvenir: false,
              iva: 'no-indicar',
            })
          )
        : [createItem('obra-social', { descripcion: surgeryDescription })];

    return {
      tipo: 'obra-social',
      initialData: {
        ...base,
        items,
      },
    };
  }

  return {
    tipo: 'particular',
    initialData: {
      ...base,
      items: createParticularItems(),
    },
  };
}

export function switchQuoteModelPreservingFields(currentDraft, nextTipo) {
  const normalizedTipo = nextTipo === 'obra-social' ? 'obra-social' : 'particular';
  const items =
    normalizedTipo === 'obra-social'
      ? [
          createItem('obra-social', {
            descripcion: currentDraft?.cirugia || '',
            monto: null,
            aConvenir: false,
          }),
        ]
      : createParticularItems();

  return {
    ...currentDraft,
    tipo: normalizedTipo,
    items,
    condiciones: defaultConditions(normalizedTipo),
    condicionesActivas: defaultConditionsEnabled(normalizedTipo),
  };
}

export function getPresupuestoPermissions(userRole) {
  const normalized = String(userRole || '').toLowerCase().trim();
  const isAdmin = normalized === 'admin' || normalized === 'administrador';
  const isSecre = normalized === 'secre' || normalized === 'secretaria' || normalized === 'secretaría';
  const isDirectora = normalized === 'direccion_medica' || normalized === 'directora' || normalized === 'dirección médica';
  const isConsulta = normalized === 'consulta';

  return {
    canView: isAdmin || isSecre || isDirectora || isConsulta,
    canWrite: isAdmin || isSecre,
    onlyEmitted: isConsulta,
  };
}
