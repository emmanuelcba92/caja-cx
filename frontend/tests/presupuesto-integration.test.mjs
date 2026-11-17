import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  detectQuoteTypeFromSurgery,
  extractPracticesFromSurgery,
  buildQuoteInitialDataFromSurgery,
  switchQuoteModelPreservingFields,
  getPresupuestoPermissions,
} from '../src/utils/presupuestoSurgeryMapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');

test('detectQuoteTypeFromSurgery detects particular vs obra-social', () => {
  assert.equal(detectQuoteTypeFromSurgery({ obraSocial: 'PARTICULAR' }), 'particular');
  assert.equal(detectQuoteTypeFromSurgery({ obraSocial: 'particulares' }), 'particular');
  assert.equal(detectQuoteTypeFromSurgery({ obraSocial: '' }), 'particular');
  assert.equal(detectQuoteTypeFromSurgery({ obraSocial: 'OSDE' }), 'obra-social');
  assert.equal(detectQuoteTypeFromSurgery({ obraSocial: 'SANCOR SALUD' }), 'obra-social');
});

test('buildQuoteInitialDataFromSurgery auto-fills Particular with 3 fixed items', () => {
  const surgery = {
    id: 'surg-1',
    paciente: 'Juan Pérez',
    dni: '30111222',
    obraSocial: 'Particular',
    numeroAfiliado: '',
    codigos: '030101',
    nombreProfesional: 'Dr. Gómez',
  };

  const result = buildQuoteInitialDataFromSurgery(surgery);
  assert.equal(result.tipo, 'particular');
  assert.equal(result.initialData.paciente, 'Juan Pérez');
  assert.equal(result.initialData.dni, '30111222');
  assert.equal(result.initialData.profesional, 'Dr. Gómez');
  assert.equal(result.initialData.items.length, 3);
  assert.equal(result.initialData.items[2].iva, 'no-indicar');
  assert.equal(result.initialData.items[2].ivaEditable, false);
  assert.match(result.initialData.items[2].descripcion, /Derechos sanatoriales/i);
});

test('buildQuoteInitialDataFromSurgery auto-fills Obra Social (SANCOR, SWISS, IOSFA)', () => {
  const sancorSurgery = {
    id: 'surg-sancor',
    paciente: 'Ana López',
    dni: '28999888',
    obraSocial: 'SANCOR SALUD',
    numeroAfiliado: '998877-01',
    codigosAuditados: '030473',
    nombreProfesional: 'Dra. Díaz',
  };

  const sancorRes = buildQuoteInitialDataFromSurgery(sancorSurgery);
  assert.equal(sancorRes.tipo, 'obra-social');
  assert.equal(sancorRes.initialData.obraSocial, 'SANCOR SALUD');
  assert.equal(sancorRes.initialData.numeroAfiliado, '998877-01');
  assert.ok(sancorRes.initialData.items.length >= 1);
  assert.equal(sancorRes.initialData.items[0].codigo, '030473');
  assert.ok(sancorRes.initialData.items[0].descripcion.length > 0);

  const swissPractices = extractPracticesFromSurgery({
    obraSocial: 'SWISS MEDICAL',
    codigos: '030101',
  });
  assert.ok(swissPractices.length >= 1);

  const iosfaPractices = extractPracticesFromSurgery({
    obraSocial: 'IOSFA',
    codigos: '030101',
  });
  assert.ok(iosfaPractices.length >= 1);
});

test('switchQuoteModelPreservingFields preserves patient and surgery fields', () => {
  const draft = {
    fecha: '2026-11-14',
    paciente: 'Carlos Ruiz',
    dni: '25444333',
    obraSocial: 'OSDE',
    numeroAfiliado: '123456',
    cirugia: 'Amigdalectomía',
    profesional: 'Dr. Sosa',
    tipo: 'obra-social',
    items: [{ codigo: '030101', descripcion: 'Amigdalectomía', monto: 50000, aConvenir: false }],
    condiciones: ['Condición OS'],
  };

  const switched = switchQuoteModelPreservingFields(draft, 'particular');
  assert.equal(switched.tipo, 'particular');
  assert.equal(switched.paciente, 'Carlos Ruiz');
  assert.equal(switched.dni, '25444333');
  assert.equal(switched.obraSocial, 'OSDE');
  assert.equal(switched.numeroAfiliado, '123456');
  assert.equal(switched.cirugia, 'Amigdalectomía');
  assert.equal(switched.items.length, 3);
});

test('getPresupuestoPermissions enforces role access matrix', () => {
  assert.deepEqual(getPresupuestoPermissions('admin'), {
    canView: true,
    canWrite: true,
    onlyEmitted: false,
  });
  assert.deepEqual(getPresupuestoPermissions('Administrador'), {
    canView: true,
    canWrite: true,
    onlyEmitted: false,
  });
  assert.deepEqual(getPresupuestoPermissions('secre'), {
    canView: true,
    canWrite: true,
    onlyEmitted: false,
  });
  assert.deepEqual(getPresupuestoPermissions('Secretaría'), {
    canView: true,
    canWrite: true,
    onlyEmitted: false,
  });
  assert.deepEqual(getPresupuestoPermissions('direccion_medica'), {
    canView: true,
    canWrite: false,
    onlyEmitted: false,
  });
  assert.deepEqual(getPresupuestoPermissions('Dirección Médica'), {
    canView: true,
    canWrite: false,
    onlyEmitted: false,
  });
  assert.deepEqual(getPresupuestoPermissions('consulta'), {
    canView: true,
    canWrite: false,
    onlyEmitted: true,
  });
  assert.deepEqual(getPresupuestoPermissions('Consulta'), {
    canView: true,
    canWrite: false,
    onlyEmitted: true,
  });

  for (const deniedRole of ['medico', 'Médico', 'residente', 'Residente', 'secre_estudios', '']) {
    assert.deepEqual(getPresupuestoPermissions(deniedRole), {
      canView: false,
      canWrite: false,
      onlyEmitted: false,
    });
  }
});

test('PresupuestoModal and SurgeryApp integration contracts', () => {
  const modalSource = fs.readFileSync(
    path.join(frontendDir, 'src/components/PresupuestoModal.jsx'),
    'utf8'
  );
  const appSource = fs.readFileSync(
    path.join(frontendDir, 'src/SurgeryApp.jsx'),
    'utf8'
  );

  // Reuses PresupuestoPreview (which encapsulates presupuestoPdf) without duplicating PDF generation
  assert.match(modalSource, /import PresupuestoPreview from '\.\/PresupuestoPreview\.jsx';/);
  assert.match(modalSource, /<PresupuestoPreview[\s\S]*?quote=\{/);

  // Displays clear lifecycle statuses
  for (const label of ['Borrador', 'Vigente', 'Vencido', 'Reemplazado']) {
    assert.ok(modalSource.includes(label), `Missing status label: ${label}`);
  }

  // Supports optional motivoActualizacion
  assert.match(modalSource, /motivoActualizacion/);

  // Zero automatic writes on mount/open (useEffect only calls listQuotesBySurgery)
  const useEffectMatches = modalSource.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[[^\]]*\]\);/g) || [];
  assert.ok(useEffectMatches.length >= 1);
  for (const effectBlock of useEffectMatches) {
    assert.doesNotMatch(effectBlock, /createDraft|updateDraft|emitQuote|prepareRenewal|deleteDraft/);
  }

  // Does not mutate surgery documents
  assert.doesNotMatch(modalSource, /updateSurgery|saveSurgery|doc\(db,\s*['"]surgeries['"]/);

  // SurgeryApp wires PresupuestoModal with role gate and does not pass surgery mutation callbacks
  assert.match(appSource, /import PresupuestoModal from '\.\/components\/PresupuestoModal';/);
  assert.match(appSource, /getPresupuestoPermissions/);
  assert.match(appSource, /<PresupuestoModal[\s\S]*?surgery=\{presupuestoModalSurgery\}[\s\S]*?\/>/);
});
