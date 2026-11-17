import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IVA_OPTIONS,
  ENTIDAD,
  CONDICIONES_PARTICULAR,
  CONDICIONES_OBRA_SOCIAL,
  defaultConditionsEnabled,
  resolveConditionsEnabled,
  isConditionEnabled,
  createQuote,
  createItem,
  ivaSuffix,
  getValidityDays,
  calculateValidUntil,
  getQuoteDerivedStatus,
  prepareNewVersionDraft,
  prepareEmissionSnapshot,
} from '../src/data/presupuestoRules.js';
import {
  formatMoney,
  formatDate,
  formatDocumentDate,
  getItemAmountText,
  formatItemAmountWithIva,
  getQuoteIssues,
  buildPdfFilename,
  parseRichText,
} from '../src/utils/presupuestoFormat.js';

test('Presupuesto particular: inicializa 3 conceptos separados con IVA inicial Sin IVA para honorarios y fijo para derechos COAT', () => {
  const q = createQuote('particular', { fecha: '2026-11-13' });
  assert.equal(q.tipo, 'particular');
  assert.equal(q.status, 'borrador');
  assert.equal(q.version, 1);
  assert.equal(q.validDays, 15);
  assert.equal(q.items.length, 3);

  const [equipo, anestesista, derechos] = q.items;
  assert.equal(equipo.roleKey, 'equipo_quirurgico');
  assert.equal(equipo.iva, 'sin-iva');
  assert.equal(equipo.ivaEditable, true);

  assert.equal(anestesista.roleKey, 'anestesista');
  assert.equal(anestesista.iva, 'sin-iva');
  assert.equal(anestesista.ivaEditable, true);

  assert.equal(derechos.roleKey, 'derechos_sanatoriales');
  assert.equal(derechos.iva, 'no-indicar');
  assert.equal(derechos.ivaEditable, false);

  // Intentar forzar otro tratamiento de IVA sobre derechos sanatoriales no debe cambiarlo
  const forcedDerechos = createItem('particular', {
    roleKey: 'derechos_sanatoriales',
    iva: 'sin-iva',
    monto: 700000,
  });
  assert.equal(forcedDerechos.iva, 'no-indicar');
  assert.equal(forcedDerechos.ivaEditable, false);
});

test('IVA: conserva las opciones de Presupuestos COAT y no recalcula importes', () => {
  assert.deepEqual(
    IVA_OPTIONS.map((o) => o.value),
    ['no-indicar', 'sin-iva', 'iva-21', 'iva-10-5']
  );
  assert.equal(ivaSuffix('no-indicar'), '');
  assert.equal(ivaSuffix('sin-iva'), 'Sin IVA.');
  assert.equal(ivaSuffix('iva-21'), '+ IVA 21%.');
  assert.equal(ivaSuffix('iva-10-5'), '+ IVA 10,5%.');

  assert.equal(
    formatItemAmountWithIva({ monto: 1000000, iva: 'sin-iva' }),
    '$ 1.000.000,00.- Sin IVA.'
  );
  assert.equal(
    formatItemAmountWithIva({ monto: 400000, iva: 'iva-21' }),
    '$ 400.000,00.- + IVA 21%.'
  );
  assert.equal(
    formatItemAmountWithIva({ monto: 700000, iva: 'no-indicar' }),
    '$ 700.000,00.-'
  );
});

test('Presupuesto obra social: soporta múltiples prácticas, importes individuales y A valor convenido', () => {
  const q = createQuote('obra-social', {
    fecha: '2026-11-13',
    paciente: 'Pérez Ana',
    obraSocial: 'OSDE',
    items: [
      { codigo: '030101', descripcion: 'Práctica 1', aConvenir: true },
      { codigo: '030473', descripcion: 'Práctica 2', monto: 500000, aConvenir: false },
    ],
  });

  assert.equal(q.tipo, 'obra-social');
  assert.equal(q.validDays, 30);
  assert.equal(q.items.length, 2);
  assert.equal(getItemAmountText(q.items[0]), 'A valor convenido.');
  assert.equal(getItemAmountText(q.items[1]), '$ 500.000,00.-');
  assert.deepEqual(getQuoteIssues(q), []);
});

test('Condiciones y textos institucionales se conservan íntegros para ambos modelos', () => {
  const part = createQuote('particular');
  assert.equal(part.condiciones.incluye, CONDICIONES_PARTICULAR.incluye);
  assert.equal(part.condiciones.excluye, CONDICIONES_PARTICULAR.excluye);
  assert.match(part.condiciones.nota, /15 días/);
  assert.equal(part.condiciones.facturacion, CONDICIONES_PARTICULAR.facturacion);
  assert.equal(part.condiciones.transferencia, CONDICIONES_PARTICULAR.transferencia);

  const oss = createQuote('obra-social');
  assert.equal(oss.condiciones.inclusiones, CONDICIONES_OBRA_SOCIAL.inclusiones);
  assert.match(oss.condiciones.anestesista, /ADAARC/);
  assert.equal(oss.condiciones.exclusiones, CONDICIONES_OBRA_SOCIAL.exclusiones);
  assert.match(oss.condiciones.nota, /cirugías múltiples.*30 días/);
  assert.equal(ENTIDAD.cuit, '30-68228543-1');
});

test('Validaciones de campos e ítems detectan datos faltantes correctamente', () => {
  const emptyPart = createQuote('particular');
  assert.deepEqual(getQuoteIssues(emptyPart), [
    'Paciente',
    'Cirugía',
    'Importe del concepto 1',
    'Importe del concepto 2',
    'Importe del concepto 3',
  ]);

  const emptyOss = createQuote('obra-social');
  assert.deepEqual(getQuoteIssues(emptyOss), [
    'Paciente',
    'Obra social',
    'Descripción del concepto 1',
    'Importe del concepto 1',
  ]);
});

test('Formato de fechas, rich text y nombres de archivo PDF', () => {
  assert.equal(formatMoney(1250000.5), '$ 1.250.000,50.-');
  assert.equal(formatDate('2026-11-13'), '13/11/2026');
  assert.equal(formatDocumentDate('2026-11-13'), 'Córdoba, 13/11/2026');
  assert.deepEqual(parseRichText('Texto **negrita** final'), [
    { text: 'Texto ', bold: false },
    { text: 'negrita', bold: true },
    { text: ' final', bold: false },
  ]);
  assert.equal(
    buildPdfFilename({ tipo: 'particular', paciente: 'Gómez María', fecha: '2026-11-13' }),
    'COAT-Particular-gomez-maria-2026-11-13.pdf'
  );
});

test('Vencimientos y estados derivados: borrador, vigente, vencido y reemplazado', () => {
  assert.equal(getValidityDays('particular'), 15);
  assert.equal(getValidityDays('obra-social'), 30);
  assert.equal(calculateValidUntil('2026-11-13', 'particular'), '2026-11-28');
  assert.equal(calculateValidUntil('2026-11-13', 'obra-social'), '2026-12-13');
  assert.equal(calculateValidUntil('invalid', 'particular'), null);

  const borrador = createQuote('particular', { fecha: '2026-11-01' });
  assert.equal(getQuoteDerivedStatus(borrador, '2026-12-31'), 'borrador');

  const emitido = prepareEmissionSnapshot(
    createQuote('particular', {
      id: 'pres_1',
      fecha: '2026-11-01',
      paciente: 'Juan Test',
      cirugia: 'Septumplastia',
    }),
    { email: 'admin@coat.com.ar', nombre: 'Admin', emittedAt: '2026-11-01T10:00:00.000Z' }
  );
  assert.equal(emitido.status, 'emitido');
  assert.equal(emitido.validUntil, '2026-11-16');
  assert.equal(getQuoteDerivedStatus(emitido, '2026-11-16'), 'vigente');
  assert.equal(getQuoteDerivedStatus(emitido, '2026-11-17'), 'vencido');
  assert.equal(
    getQuoteDerivedStatus({ ...emitido, status: 'reemplazado', replacedByVersionId: 'pres_2' }, '2026-11-10'),
    'reemplazado'
  );
});

test('prepareNewVersionDraft crea borrador de nueva versión sin mutar ni reemplazar la versión emitida previa', () => {
  const emittedV1 = prepareEmissionSnapshot(
    createQuote('particular', {
      id: 'pres_v1',
      surgeryId: 'ord_99',
      groupId: 'ord_99',
      fecha: '2026-10-01',
      paciente: 'Paciente Test',
      dni: '30111222',
      cirugia: 'Amigdalectomía',
      items: [
        { roleKey: 'equipo_quirurgico', descripcion: 'Honorarios equipo quirúrgico', monto: 900000, iva: 'sin-iva' },
        { roleKey: 'anestesista', descripcion: 'Honorarios anestesista', monto: 350000, iva: 'sin-iva' },
        { roleKey: 'derechos_sanatoriales', descripcion: 'Derechos sanatoriales COAT (Internación, medicamentos etc)', monto: 600000 },
      ],
    }),
    { email: 'secre@coat.com.ar', nombre: 'Secre' }
  );

  const snapshotBefore = JSON.stringify(emittedV1);

  const draftV2 = prepareNewVersionDraft(emittedV1, {
    fecha: '2026-11-13',
    motivoActualizacion: 'Renovación por vencimiento',
  });

  // El presupuesto emitido anterior permanece intacto y NO pasa a reemplazado al crear el borrador
  assert.equal(JSON.stringify(emittedV1), snapshotBefore);
  assert.equal(emittedV1.status, 'emitido');
  assert.equal(emittedV1.replacedByVersionId, null);

  assert.equal(draftV2.status, 'borrador');
  assert.equal(draftV2.version, 2);
  assert.equal(draftV2.previousVersionId, 'pres_v1');
  assert.equal(draftV2.replacedByVersionId, null);
  assert.equal(draftV2.surgeryId, 'ord_99');
  assert.equal(draftV2.fecha, '2026-11-13');
  assert.equal(draftV2.validUntil, null);
  assert.equal(draftV2.motivoActualizacion, 'Renovación por vencimiento');
  assert.equal(draftV2.items[0].monto, 900000);
  assert.equal(draftV2.items[2].iva, 'no-indicar');
  assert.equal(draftV2.items[2].ivaEditable, false);
});

test('Condiciones opcionales: compatibilidad con presupuestos existentes, inicialización en nuevos y persistencia al editar/emitir/renovar', () => {
  // 1. Presupuestos nuevos inician con todas las condiciones activas
  const newOss = createQuote('obra-social');
  assert.deepEqual(newOss.condicionesActivas, {
    inclusiones: true,
    anestesista: true,
    exclusiones: true,
    nota: true,
  });

  const newPart = createQuote('particular');
  assert.deepEqual(newPart.condicionesActivas, {
    incluye: true,
    excluye: true,
    nota: true,
    facturacion: true,
    transferencia: true,
  });

  // 2. Presupuestos ya guardados sin campo condicionesActivas mantienen todas las condiciones activas
  const legacySavedQuote = {
    id: 'ord_legacy__v1',
    tipo: 'obra-social',
    condiciones: { ...CONDICIONES_OBRA_SOCIAL },
  };
  assert.equal(isConditionEnabled(legacySavedQuote, 'inclusiones'), true);
  assert.equal(isConditionEnabled(legacySavedQuote, 'anestesista'), true);
  assert.equal(isConditionEnabled(legacySavedQuote, 'exclusiones'), true);
  assert.equal(isConditionEnabled(legacySavedQuote, 'nota'), true);
  assert.deepEqual(resolveConditionsEnabled('obra-social', legacySavedQuote.condicionesActivas), {
    inclusiones: true,
    anestesista: true,
    exclusiones: true,
    nota: true,
  });

  // 3. Al desactivar condiciones específicas y editar/emitir/renovar, se conservan las selecciones y los textos
  const editedDraft = createQuote('obra-social', {
    id: 'ord_50__v1',
    surgeryId: 'ord_50',
    groupId: 'ord_50',
    fecha: '2026-11-16',
    paciente: 'Paciente Condiciones',
    obraSocial: 'SWISS MEDICAL',
    items: [{ codigo: '030101', descripcion: 'SEPTOPLASTIA', monto: 500000, aConvenir: false }],
    condiciones: {
      ...CONDICIONES_OBRA_SOCIAL,
      anestesista: 'Texto personalizado de anestesista que se conserva aunque se desactive.',
    },
    condicionesActivas: {
      inclusiones: true,
      anestesista: false,
      exclusiones: true,
      nota: false,
    },
  });

  assert.equal(isConditionEnabled(editedDraft, 'inclusiones'), true);
  assert.equal(isConditionEnabled(editedDraft, 'anestesista'), false);
  assert.equal(isConditionEnabled(editedDraft, 'exclusiones'), true);
  assert.equal(isConditionEnabled(editedDraft, 'nota'), false);
  assert.equal(
    editedDraft.condiciones.anestesista,
    'Texto personalizado de anestesista que se conserva aunque se desactive.'
  );

  const emitted = prepareEmissionSnapshot(editedDraft, { email: 'admin@coat.com.ar' });
  assert.deepEqual(emitted.condicionesActivas, {
    inclusiones: true,
    anestesista: false,
    exclusiones: true,
    nota: false,
  });
  assert.equal(
    emitted.condiciones.anestesista,
    'Texto personalizado de anestesista que se conserva aunque se desactive.'
  );

  const renewed = prepareNewVersionDraft(emitted, { fecha: '2026-12-20' });
  assert.deepEqual(renewed.condicionesActivas, {
    inclusiones: true,
    anestesista: false,
    exclusiones: true,
    nota: false,
  });
  assert.equal(
    renewed.condiciones.anestesista,
    'Texto personalizado de anestesista que se conserva aunque se desactive.'
  );
  assert.deepEqual(defaultConditionsEnabled('obra-social'), {
    inclusiones: true,
    anestesista: true,
    exclusiones: true,
    nota: true,
  });
});

