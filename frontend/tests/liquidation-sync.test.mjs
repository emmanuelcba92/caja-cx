import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFirestoreLiquidations, updateCajaTransferStatus } from '../src/utils/liquidationSync.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function createBrowserStorage(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    snapshot: () => Object.fromEntries(Array.from(map.entries()).map(([k, v]) => [k, JSON.parse(v)])),
  };
}

test('Dos navegadores independientes: eliminar en uno no recrea registros desde el otro y conserva localStorage antiguo', async () => {
  const cloud = {
    deducciones: new Map([
      ['fs_ded_1', { id: 'fs_ded_1', profesional: 'Dr. Ficticio', amount: 5000, desc: 'Insumo A' }],
    ]),
    liquidaciones_manuales: new Map([
      ['fs_man_1', { id: 'fs_man_1', prof_1: 'Dr. Ficticio', liq_prof_1: 12000, paciente: 'TEST (Liq. Manual)' }],
    ]),
  };

  // Navegador A tiene datos locales antiguos distintos (ID numérico, sin _synced, sin legacyId)
  const localOldA = {
    deducciones_liquidacion: [
      { id: 1700000000111, profesional: 'Dr. Ficticio', amount: 5000, desc: 'Insumo A' },
    ],
    liquidaciones_manuales: [
      { id: 1700000000222, prof_1: 'Dr. Ficticio', liq_prof_1: 12000, paciente: 'TEST (Liq. Manual)' },
    ],
  };
  const storageA = createBrowserStorage(localOldA);
  const storageB = createBrowserStorage({
    deducciones_liquidacion: [{ id: 'fs_ded_999', profesional: 'Otro', amount: 100 }],
    liquidaciones_manuales: [],
  });

  // Navegador B elimina ambos documentos en Firestore
  cloud.deducciones.delete('fs_ded_1');
  cloud.liquidaciones_manuales.delete('fs_man_1');

  let writeCalls = 0;
  const mockGetCollection = async (col) => Array.from(cloud[col].values());

  // Navegador A abre Liquidaciones: lee exclusivamente Firestore y NO migra ni recrea
  const loadedA = await loadFirestoreLiquidations({ getCollectionFn: mockGetCollection });
  assert.equal(writeCalls, 0);
  assert.equal(loadedA.deductions.length, 0);
  assert.equal(loadedA.manualLiqs.length, 0);
  assert.equal(cloud.deducciones.size, 0);
  assert.equal(cloud.liquidaciones_manuales.size, 0);

  // Los datos antiguos locales de ambos navegadores permanecen intactos (no eliminados)
  assert.deepEqual(storageA.snapshot(), localOldA);
  assert.equal(storageB.snapshot().deducciones_liquidacion.length, 1);
});

test('Creación y eliminación normal de deducciones y liquidaciones manuales opera contra Firestore', async () => {
  const cloud = {
    deducciones: new Map(),
    liquidaciones_manuales: new Map(),
  };

  // Simula creación de deducción y liquidación manual en Firestore
  cloud.deducciones.set('fs_ded_new', { id: 'fs_ded_new', profesional: 'Dra. Prueba', amount: 3500, currency: 'ARS' });
  cloud.liquidaciones_manuales.set('fs_man_new', { id: 'fs_man_new', prof_1: 'Dra. Prueba', liq_prof_1: 18000, paciente: 'PACIENTE TEST' });

  const afterCreate = await loadFirestoreLiquidations({
    getCollectionFn: async (col) => Array.from(cloud[col].values()),
  });
  assert.equal(afterCreate.deductions.length, 1);
  assert.equal(afterCreate.deductions[0].id, 'fs_ded_new');
  assert.equal(afterCreate.manualLiqs.length, 1);
  assert.equal(afterCreate.manualLiqs[0].id, 'fs_man_new');

  // Simula eliminación en Firestore
  cloud.deducciones.delete('fs_ded_new');
  cloud.liquidaciones_manuales.delete('fs_man_new');

  const afterDelete = await loadFirestoreLiquidations({
    getCollectionFn: async (col) => Array.from(cloud[col].values()),
  });
  assert.equal(afterDelete.deductions.length, 0);
  assert.equal(afterDelete.manualLiqs.length, 0);
});

test('Fallo de conexión o respuesta inválida de Firestore lanza error y no se interpreta como colección vacía', async () => {
  await assert.rejects(
    () =>
      loadFirestoreLiquidations({
        getCollectionFn: async (col) => {
          if (col === 'deducciones') throw new Error('unavailable: offline');
          return [];
        },
      }),
    /unavailable: offline/
  );

  await assert.rejects(
    () =>
      loadFirestoreLiquidations({
        getCollectionFn: async () => null,
      }),
    /Respuesta inválida al leer deducciones o liquidaciones manuales/
  );
});

test('LiquidacionView.jsx no ejecuta migración automática ni sobrescribe localStorage antiguo', () => {
  const src = readFileSync(resolve(ROOT, 'src/LiquidacionView.jsx'), 'utf8');
  assert.equal(/migrateLocalItems|syncLiquidationCollection/.test(src), false);
  assert.equal(/localStorage\.setItem|saveJSON|localStorage\.removeItem/.test(src), false);
  assert.match(src, /useState\(\[\]\)/);
  assert.match(src, /loadFirestoreLiquidations/);
  assert.match(src, /cloudLoadError/);
});

test('Marcar y desmarcar Transferencia en Liquidaciones actualiza el campo isTransfer en caja y persiste el resto del documento', async () => {
  const cajaStore = new Map([
    [
      'caja_doc_101',
      {
        id: 'caja_doc_101',
        fecha: '2026-11-16',
        paciente: 'PACIENTE PRUEBA',
        prof_1: 'Dr. Ficticio',
        pesos: 150000,
        liq_prof_1: 120000,
        coat_pesos: 30000,
        isTransfer: false,
      },
    ],
  ]);

  const updateCalls = [];
  const mockUpdateDocument = async (col, docId, patch) => {
    updateCalls.push({ col, docId, patch });
    const current = cajaStore.get(docId);
    assert.ok(current, 'El documento debe existir en caja');
    cajaStore.set(docId, { ...current, ...patch });
    return true;
  };

  // Marcar Transferencia (true)
  const marked = await updateCajaTransferStatus({
    entryId: 'caja_doc_101',
    isTransfer: true,
    updateDocumentFn: mockUpdateDocument,
  });
  assert.equal(marked, true);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0], {
    col: 'caja',
    docId: 'caja_doc_101',
    patch: { isTransfer: true },
  });
  assert.equal(cajaStore.get('caja_doc_101').isTransfer, true);
  assert.equal(cajaStore.get('caja_doc_101').liq_prof_1, 120000);
  assert.equal(cajaStore.get('caja_doc_101').coat_pesos, 30000);

  // Desmarcar Transferencia (false)
  const unmarked = await updateCajaTransferStatus({
    entryId: 'caja_doc_101',
    isTransfer: false,
    updateDocumentFn: mockUpdateDocument,
  });
  assert.equal(unmarked, false);
  assert.equal(updateCalls.length, 2);
  assert.deepEqual(updateCalls[1], {
    col: 'caja',
    docId: 'caja_doc_101',
    patch: { isTransfer: false },
  });
  assert.equal(cajaStore.get('caja_doc_101').isTransfer, false);
  assert.equal(cajaStore.get('caja_doc_101').paciente, 'PACIENTE PRUEBA');
});

test('LiquidacionView permite marcar y desmarcar Transferencia respetando el modo solo lectura', () => {
  const src = readFileSync(resolve(ROOT, 'src/LiquidacionView.jsx'), 'utf8');
  assert.match(src, /const toggleTransfer = async \(entry, nextChecked\) => \{\s*if \(isReadOnly\) return;/);
  assert.match(src, /updateCajaTransferStatus\(\{/);
  assert.match(src, /onChange=\{e => toggleTransfer\(h, e\.target\.checked\)\}/);

  const cajaSrc = readFileSync(resolve(ROOT, 'src/CajaView.jsx'), 'utf8');
  assert.match(cajaSrc, /<LiquidacionView history=\{history\} setHistory=\{setHistory\}/);
});

