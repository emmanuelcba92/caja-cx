export const QUOTE_TYPES = {
  particular: {
    id: 'particular',
    label: 'Particular',
    shortLabel: 'Particular',
    description: 'Paciente particular',
  },
  'obra-social': {
    id: 'obra-social',
    label: 'Obra social',
    shortLabel: 'Obra social',
    description: 'Presupuesto para obra social',
  },
};

export const IVA_OPTIONS = [
  { value: 'no-indicar', label: 'No indicar IVA' },
  { value: 'sin-iva', label: 'Sin IVA' },
  { value: 'iva-21', label: 'IVA 21%' },
  { value: 'iva-10-5', label: 'IVA 10,5%' },
];

export const VALID_IVA_VALUES = new Set(IVA_OPTIONS.map((opt) => opt.value));

export const VALIDITY_DAYS = {
  particular: 15,
  'obra-social': 30,
};

export const ENTIDAD = {
  nombre: 'CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA',
  cuit: '30-68228543-1',
  razonSocial: 'De Clínica Privada COAT SRL',
  razonSocialOss: 'De Clínica Privada Coat SRL',
  direccion: 'Urquiza 401 - 5.000 - Córdoba - Argentina.',
  telefono: 'TEL: 54-351-4-230530',
};

export const CONDICIONES_PARTICULAR = {
  incluye:
    'Internación breve de día, derechos de quirófano, medicamentos en internación, descartables en internación, honorario equipo quirúrgico y anestesista equipos de protección EPP3.',
  excluye:
    'Cualquier tipo de análisis de laboratorio. Sangre, transfusiones, derivados etc.. Cualquier tipo de estudios. Anatomía patológica. Derivaciones e internaciones en cualquier tipo de Institución Sanatorial polivalente o de mayor complejidad.',
  nota:
    'Validez el presupuesto 15 días, pasada esa fecha deberá solicitar un presupuesto actualizado.',
  facturacion:
    'Al momento de facturar cada profesional interviniente emitirá el recibo o factura correspondiente por lo que el pago debe hacerse de manera individual. La Clínica emitirá la factura por los derechos sanatoriales.',
  transferencia:
    'Si el paciente decide abonar el presupuesto por transferencia la misma debe ser realizada **48 horas hábiles antes de la Cirugía** y validado el depósito previamente con Secretaría mediante comprobantes. **Deberá solicitar los CBU de los profesionales intervinientes y de la Clínica para transferir de elegir esta opción.**',
};

export const CONDICIONES_OBRA_SOCIAL = {
  inclusiones:
    'Derechos de quirófano, medicamentos en internación, drogas anestésicas, descartables en internación, honorario equipo quirúrgico, equipos de protección EPP3.',
  anestesista:
    'por separado del módulo, de acuerdo al convenio de la obra social con ADAARC. No incluído en presupuesto.',
  exclusiones:
    'Cualquier tipo de análisis de laboratorio. Sangre, transfusiones, derivados etc.. Cualquier tipo de estudios. Anatomía patológica. Derivaciones e internaciones en cualquier tipo de Institución Sanatorial polivalente o de mayor complejidad.',
  nota:
    'A facturar según normas de cirugías múltiples. Vigencia del presente presupuesto 30 días.',
};

export const PARTICULAR_CONCEPT_DEFAULTS = [
  {
    roleKey: 'equipo_quirurgico',
    descripcion: 'Honorarios equipo quirúrgico',
    defaultIva: 'sin-iva',
    ivaEditable: true,
  },
  {
    roleKey: 'anestesista',
    descripcion: 'Honorarios anestesista',
    defaultIva: 'sin-iva',
    ivaEditable: true,
  },
  {
    roleKey: 'derechos_sanatoriales',
    descripcion: 'Derechos sanatoriales COAT (Internación, medicamentos etc)',
    defaultIva: 'no-indicar',
    ivaEditable: false,
  },
];

export function todayISO(referenceDate = new Date()) {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultConditions(tipo) {
  return {
    ...(tipo === 'obra-social'
      ? CONDICIONES_OBRA_SOCIAL
      : CONDICIONES_PARTICULAR),
  };
}

export function defaultConditionsEnabled(tipo) {
  const base = defaultConditions(tipo);
  return Object.keys(base).reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

export function resolveConditionsEnabled(tipo, condicionesActivas = null) {
  const defaults = defaultConditionsEnabled(tipo);
  if (!condicionesActivas || typeof condicionesActivas !== 'object') {
    return defaults;
  }
  const resolved = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (condicionesActivas[key] !== undefined) {
      resolved[key] = Boolean(condicionesActivas[key]);
    }
  }
  for (const [key, val] of Object.entries(condicionesActivas)) {
    if (!(key in resolved)) {
      resolved[key] = Boolean(val);
    }
  }
  return resolved;
}

export function isConditionEnabled(quote, key) {
  if (!quote || !key) return true;
  const map = quote.condicionesActivas;
  if (!map || typeof map !== 'object' || map[key] === undefined) {
    return true;
  }
  return Boolean(map[key]);
}

export function getValidityDays(tipo) {
  return tipo === 'obra-social' ? VALIDITY_DAYS['obra-social'] : VALIDITY_DAYS.particular;
}

export function calculateValidUntil(fechaISO, tipo) {
  if (!fechaISO || typeof fechaISO !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaISO.slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() + getValidityDays(tipo));
  return date.toISOString().slice(0, 10);
}

export function createItem(tipo, overrides = {}) {
  const isDerechosSanatoriales = overrides.roleKey === 'derechos_sanatoriales';
  const requestedIva = VALID_IVA_VALUES.has(overrides.iva) ? overrides.iva : 'no-indicar';

  return {
    id: uid(),
    codigo: '',
    descripcion: '',
    monto: null,
    aConvenir: false,
    ...overrides,
    // Derechos sanatoriales COAT siempre incluyen IVA y no admiten cambio de tratamiento
    iva: isDerechosSanatoriales ? 'no-indicar' : requestedIva,
    ivaEditable: isDerechosSanatoriales ? false : (overrides.ivaEditable ?? true),
    aConvenir: tipo === 'obra-social' ? Boolean(overrides.aConvenir) : false,
  };
}

export function createParticularItems(overridesByRole = {}) {
  return PARTICULAR_CONCEPT_DEFAULTS.map((concept) => {
    const custom = overridesByRole[concept.roleKey] || {};
    return createItem('particular', {
      roleKey: concept.roleKey,
      descripcion: concept.descripcion,
      iva: concept.ivaEditable ? (custom.iva ?? concept.defaultIva) : 'no-indicar',
      ivaEditable: concept.ivaEditable,
      ...custom,
      roleKey: concept.roleKey,
      ivaEditable: concept.ivaEditable,
    });
  });
}

export function createQuote(tipo = 'particular', overrides = {}) {
  const normalizedType = tipo === 'obra-social' ? 'obra-social' : 'particular';
  const now = new Date().toISOString();
  const fecha = overrides.fecha || todayISO();
  const validDays = getValidityDays(normalizedType);

  const defaultItems =
    normalizedType === 'particular'
      ? createParticularItems()
      : [createItem('obra-social')];

  const items = Array.isArray(overrides.items)
    ? overrides.items.map((item) => createItem(normalizedType, item))
    : defaultItems;

  return {
    id: uid(),
    surgeryId: null,
    groupId: null,
    version: 1,
    status: 'borrador',
    tipo: normalizedType,
    fecha,
    validDays,
    validUntil: null,
    paciente: '',
    dni: '',
    obraSocial: '',
    numeroAfiliado: '',
    cirugia: '',
    previousVersionId: null,
    replacedByVersionId: null,
    replacedAt: null,
    motivoActualizacion: '',
    emittedAt: null,
    emittedBy: null,
    emittedByName: null,
    createdAt: now,
    updatedAt: now,
    ejemplo: false,
    ...overrides,
    tipo: normalizedType,
    validDays,
    items,
    condiciones: overrides.condiciones
      ? { ...defaultConditions(normalizedType), ...overrides.condiciones }
      : defaultConditions(normalizedType),
    condicionesActivas: resolveConditionsEnabled(normalizedType, overrides.condicionesActivas),
  };
}

export function ivaSuffix(value) {
  if (value === 'sin-iva') return 'Sin IVA.';
  if (value === 'iva-21') return '+ IVA 21%.';
  if (value === 'iva-10-5') return '+ IVA 10,5%.';
  return '';
}

export function getQuoteDerivedStatus(quote, referenceDateISO = todayISO()) {
  if (!quote) return 'borrador';
  if (quote.status === 'reemplazado' || quote.replacedByVersionId) {
    return 'reemplazado';
  }
  if (quote.status !== 'emitido') {
    return 'borrador';
  }
  const validUntil = quote.validUntil || calculateValidUntil(quote.fecha, quote.tipo);
  if (validUntil && referenceDateISO > validUntil) {
    return 'vencido';
  }
  return 'vigente';
}

/**
 * Prepara el borrador de una nueva versión a partir de un presupuesto previo
 * sin mutar el documento anterior (el reemplazo efectivo ocurre recién al emitir).
 */
export function prepareNewVersionDraft(previousQuote, options = {}) {
  if (!previousQuote) {
    throw new Error('Se requiere un presupuesto previo para preparar una nueva versión.');
  }
  const tipo = previousQuote.tipo === 'obra-social' ? 'obra-social' : 'particular';
  const nextVersion = (Number(previousQuote.version) || 1) + 1;
  const now = new Date().toISOString();
  const fecha = options.fecha || todayISO();

  const clonedItems = (previousQuote.items || []).map((item) =>
    createItem(tipo, {
      ...item,
      id: uid(),
    })
  );

  return createQuote(tipo, {
    surgeryId: previousQuote.surgeryId ?? null,
    groupId: previousQuote.groupId ?? previousQuote.surgeryId ?? previousQuote.id ?? null,
    version: nextVersion,
    status: 'borrador',
    fecha,
    validUntil: null,
    paciente: previousQuote.paciente ?? '',
    dni: previousQuote.dni ?? '',
    obraSocial: previousQuote.obraSocial ?? '',
    numeroAfiliado: previousQuote.numeroAfiliado ?? '',
    cirugia: previousQuote.cirugia ?? '',
    items: clonedItems,
    condiciones: {
      ...defaultConditions(tipo),
      ...(previousQuote.condiciones || {}),
    },
    condicionesActivas: resolveConditionsEnabled(tipo, previousQuote.condicionesActivas),
    previousVersionId: previousQuote.id ?? null,
    replacedByVersionId: null,
    replacedAt: null,
    motivoActualizacion: options.motivoActualizacion ?? '',
    createdAt: now,
    updatedAt: now,
    emittedAt: null,
    emittedBy: null,
    emittedByName: null,
  });
}

export function prepareEmissionSnapshot(draftQuote, emitter = {}) {
  if (!draftQuote) {
    throw new Error('Se requiere un presupuesto para emitir.');
  }
  if (draftQuote.status === 'emitido' || draftQuote.status === 'reemplazado') {
    throw new Error('Solo se pueden emitir presupuestos en estado borrador.');
  }
  const tipo = draftQuote.tipo === 'obra-social' ? 'obra-social' : 'particular';
  const fecha = draftQuote.fecha || todayISO();
  const validDays = getValidityDays(tipo);
  const validUntil = calculateValidUntil(fecha, tipo);
  const now = emitter.emittedAt || new Date().toISOString();

  return {
    ...draftQuote,
    tipo,
    fecha,
    validDays,
    validUntil,
    status: 'emitido',
    items: (draftQuote.items || []).map((item) => createItem(tipo, { ...item })),
    condiciones: {
      ...defaultConditions(tipo),
      ...(draftQuote.condiciones || {}),
    },
    condicionesActivas: resolveConditionsEnabled(tipo, draftQuote.condicionesActivas),
    emittedAt: now,
    emittedBy: emitter.email || emitter.emittedBy || null,
    emittedByName: emitter.nombre || emitter.emittedByName || null,
    updatedAt: now,
  };
}
