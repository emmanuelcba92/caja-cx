import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getInitialCajaHistoryState, subscribeCajaHistory } from '../src/utils/cajaHistorySync.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function createStorageMock(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      writes.push([k, v]);
      map.set(k, String(v));
    },
  };
}

test('Modo conectado (USE_LOCAL_DB=false) ignora caja_proto y SEED_CAJA e inicia en estado loading', () => {
  const storage = createStorageMock({
    caja_proto: JSON.stringify([{ id: 'legacy_1', paciente: 'FICTICIO VIEJO', pesos: 999 }]),
  });

  const state = getInitialCajaHistoryState({
    useLocalDb: false,
    storageKey: 'caja_proto',
    seedCaja: [{ id: 'seed_1', paciente: 'SEED', pesos: 500 }],
    storage,
  });

  assert.deepEqual(state.history, []);
  assert.equal(state.status, 'loading');
  assert.equal(state.error, '');
  assert.equal(storage.writes.length, 0);
});

test('Modo local (USE_LOCAL_DB=true) conserva inicialización local para desarrollo', () => {
  const storage = createStorageMock();
  const seed = [{ id: 'seed_1', paciente: 'SEED', pesos: 500 }];

  const state = getInitialCajaHistoryState({
    useLocalDb: true,
    storageKey: 'caja_proto',
    seedCaja: seed,
    storage,
  });

  assert.deepEqual(state.history, seed);
  assert.equal(state.status, 'ready');
  assert.equal(storage.writes.length, 1);
});

test('Carga inicial lenta de Firestore pasa de loading a ready con datos y soporta colección vacía []', async () => {
  let snapshotCallback;
  let unsubscribed = false;

  const events = [];
  const cleanup = subscribeCajaHistory({
    onCollectionSnapshotFn: (_col, cb) => {
      snapshotCallback = cb;
      return () => { unsubscribed = true; };
    },
    getCollectionFn: async () => [],
    onData: (rows) => events.push({ type: 'data', rows }),
    onError: (err) => events.push({ type: 'error', message: err.message }),
  });

  // Antes de la respuesta de Firestore no hay datos ni error
  assert.equal(events.length, 0);

  // Respuesta vacía []
  snapshotCallback([]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'data');
  assert.deepEqual(events[0].rows, []);

  // Respuesta con documentos reales/sintéticos
  snapshotCallback([{ id: 'caja_doc_1', paciente: 'TEST PACIENTE', pesos: 10000 }]);
  assert.equal(events.length, 2);
  assert.equal(events[1].rows[0].id, 'caja_doc_1');

  cleanup();
  assert.equal(unsubscribed, true);
});

test('Error de conexión o permisos en onSnapshot o getCollection dispara onError sin datos sustitutos', async () => {
  // 1) Error asíncrono en onSnapshot (permission-denied)
  let errCallback;
  const asyncErrors = [];
  subscribeCajaHistory({
    onCollectionSnapshotFn: (_col, _cb, _filters, onErr) => {
      errCallback = onErr;
      return () => {};
    },
    getCollectionFn: async () => [],
    onData: () => { throw new Error('No debía emitir onData'); },
    onError: (err) => asyncErrors.push(err.message),
  });

  const permErr = new Error('Missing or insufficient permissions.');
  permErr.code = 'permission-denied';
  errCallback(permErr);
  assert.deepEqual(asyncErrors, ['Missing or insufficient permissions.']);

  // 2) Excepción síncrona en onSnapshot + fallo de red en getCollection
  const fallbackErrors = [];
  subscribeCajaHistory({
    onCollectionSnapshotFn: () => { throw new Error('Listener setup failed'); },
    getCollectionFn: async () => { throw new Error('unavailable: network down'); },
    onData: () => { throw new Error('No debía emitir onData'); },
    onError: (err) => fallbackErrors.push(err.message),
  });

  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(fallbackErrors, ['unavailable: network down']);
});

test('CajaView.jsx bloquea Historial, Liquidaciones y Resumen Mensual durante carga/error y preserva borradores de Caja Diaria', () => {
  const cajaSrc = readFileSync(resolve(ROOT, 'src/CajaView.jsx'), 'utf8');

  assert.match(cajaSrc, /USE_LOCAL_DB/);
  assert.match(cajaSrc, /historyStatus === 'loading'/);
  assert.match(cajaSrc, /historyStatus === 'error'/);
  assert.match(cajaSrc, /historyStatus === 'ready' && subTab === 'historial' && <HistorialCajaView/);
  assert.match(cajaSrc, /historyStatus === 'ready' && subTab === 'liquidaciones' && <LiquidacionView/);
  assert.match(cajaSrc, /historyStatus === 'ready' && subTab === 'resumen_mensual' && <StaffLiquidacionesView/);

  // Borradores de Caja Diaria intactos
  assert.match(cajaSrc, /localStorage\.setItem\('cajaDiariaEntries'/);
  assert.match(cajaSrc, /localStorage\.setItem\(REMINDERS_KEY/);
});
