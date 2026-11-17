import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_COLLECTIONS,
  EXCLUDED_PRIVATE_COLLECTIONS,
  serializeFirestoreValue,
  serializeDocRecord,
  exportOperationalBackup,
} from '../src/utils/backupExport.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('BACKUP_COLLECTIONS cubre las 19 colecciones operativas y excluye las 3 privadas por usuario', () => {
  const names = BACKUP_COLLECTIONS.map((c) => c.name);
  assert.equal(names.length, 19);
  for (const required of [
    'ordenes_internacion',
    'pacientes',
    'profesionales',
    'caja',
    'caja_comentarios',
    'deducciones',
    'liquidaciones_manuales',
    'recibos_libres',
    'presupuestos',
    'presupuestos_series',
    'presupuesto_codigos_config',
    'authorized_emails',
    'roles',
    'consentimientos',
    'consent_mappings',
    'audit_logs',
  ]) {
    assert.ok(names.includes(required), `Falta colección operativa: ${required}`);
  }

  const excludedNames = EXCLUDED_PRIVATE_COLLECTIONS.map((c) => c.name);
  assert.deepEqual(excludedNames, ['notes', 'user_settings', 'access_grants']);
  for (const priv of excludedNames) {
    assert.equal(names.includes(priv), false, `No debe exportar colección privada globalmente: ${priv}`);
  }
});

test('exportOperationalBackup rechaza usuarios no administradores', async () => {
  await assert.rejects(
    () =>
      exportOperationalBackup({
        db: {},
        getDocsFn: async () => ({ docs: [] }),
        collectionFn: (_db, name) => name,
        isAdmin: false,
        environment: 'coatcx',
      }),
    /Acceso denegado: solo un administrador autorizado/
  );
});

test('serializeFirestoreValue y serializeDocRecord preservan IDs, Timestamps, fechas, tipos y relaciones', () => {
  const fakeTimestamp = {
    seconds: 1763164800,
    nanoseconds: 500000000,
    toDate: () => new Date('2025-11-15T00:00:00.500Z'),
  };
  const jsDate = new Date('2025-11-16T10:30:00.000Z');

  const docSnap = {
    id: 'orden_ficticia_100',
    data: () => ({
      id: 999999,
      paciente: 'PACIENTE FICTICIO TEST',
      dni: '99000111',
      createdAt: fakeTimestamp,
      fechaTurno: jsDate,
      createdBy: 'medico.ficticio@pruebas.coat.local',
      emailProfesional: 'medico.ficticio@pruebas.coat.local',
      items: [{ codigo: '031301', monto: 150000, cubierto: true }],
    }),
  };

  const record = serializeDocRecord(docSnap);
  assert.equal(record.id, 'orden_ficticia_100');
  assert.equal(record._docId, 'orden_ficticia_100');
  assert.equal(record._fieldId, 999999);
  assert.equal(record.createdBy, 'medico.ficticio@pruebas.coat.local');
  assert.equal(record.emailProfesional, 'medico.ficticio@pruebas.coat.local');
  assert.deepEqual(record.createdAt, {
    __type: 'firestore_timestamp',
    seconds: 1763164800,
    nanoseconds: 500000000,
    iso: '2025-11-15T00:00:00.500Z',
  });
  assert.deepEqual(record.fechaTurno, {
    __type: 'date',
    iso: '2025-11-16T10:30:00.000Z',
  });
  assert.deepEqual(record.items, [{ codigo: '031301', monto: 150000, cubierto: true }]);

  assert.equal(serializeFirestoreValue(null), null);
  assert.equal(serializeFirestoreValue(false), false);
});

test('exportOperationalBackup genera respaldo completo con metadatos, relaciones de presupuestos y sin secretos', async () => {
  const store = {
    ordenes_internacion: [
      {
        id: 'surg_test_1',
        data: () => ({ paciente: 'PACIENTE FICTICIO', dni: '99000222', createdBy: 'test@pruebas.coat.local' }),
      },
    ],
    presupuestos: [
      {
        id: 'surg_test_1__v1',
        data: () => ({
          surgeryId: 'surg_test_1',
          groupId: 'surg_test_1',
          version: 1,
          status: 'emitido',
          previousVersionId: null,
          replacedByVersionId: null,
          emittedAt: '2026-01-10T12:00:00.000Z',
        }),
      },
    ],
    consentimientos: [
      {
        id: 'cons_test_1',
        data: () => ({
          label: 'Consentimiento Ficticio',
          pdfUrl: 'https://example.invalid/consentimientos/ficticio.pdf',
          fileName: 'ficticio.pdf',
        }),
      },
    ],
  };

  const result = await exportOperationalBackup({
    db: { name: 'mock-db' },
    collectionFn: (_db, name) => name,
    getDocsFn: async (colName) => ({ docs: store[colName] || [] }),
    isAdmin: true,
    environment: 'coatcx',
    exportedByEmail: 'admin.ficticio@pruebas.coat.local',
  });

  assert.equal(result.complete, true);
  assert.equal(result.failedCollections.length, 0);
  assert.equal(result.includedCollections.length, 19);

  const { metadata, data } = result.backup;
  assert.equal(metadata.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(metadata.environment, 'coatcx');
  assert.equal(metadata.exportedBy, 'admin.ficticio@pruebas.coat.local');
  assert.equal(metadata.complete, true);
  assert.ok(!Number.isNaN(Date.parse(metadata.generatedAt)));
  assert.equal(metadata.counts.ordenes_internacion, 1);
  assert.equal(metadata.counts.presupuestos, 1);
  assert.equal(data.presupuestos[0].surgeryId, 'surg_test_1');
  assert.equal(data.consentimientos[0].fileName, 'ficticio.pdf');

  const rawJson = JSON.stringify(result.backup);
  assert.equal(/apiKey|password|accessToken|refreshToken|adminPin/i.test(rawJson), false);
});

test('exportOperationalBackup marca respaldo como INCOMPLETO si falla alguna colección por permisos o red', async () => {
  const result = await exportOperationalBackup({
    db: { name: 'mock-db' },
    collectionFn: (_db, name) => name,
    getDocsFn: async (colName) => {
      if (colName === 'audit_logs') {
        const err = new Error('Missing or insufficient permissions.');
        err.code = 'permission-denied';
        throw err;
      }
      if (colName === 'presupuestos') {
        const err = new Error('Missing or insufficient permissions.');
        err.code = 'permission-denied';
        throw err;
      }
      return { docs: [] };
    },
    isAdmin: true,
    environment: 'coatcx',
  });

  assert.equal(result.complete, false);
  assert.equal(result.backup.metadata.complete, false);
  assert.equal(result.includedCollections.length, 17);
  assert.deepEqual(
    result.failedCollections.map((f) => f.collection),
    ['presupuestos', 'audit_logs']
  );
  assert.equal(result.failedCollections[0].code, 'permission-denied');
});

test('AdminView.jsx utiliza exportOperationalBackup, restringe a isAdmin y distingue respaldo parcial', () => {
  const adminSrc = readFileSync(resolve(ROOT, 'src/components/AdminView.jsx'), 'utf8');
  assert.match(adminSrc, /exportOperationalBackup/);
  assert.match(adminSrc, /if \(!isAdmin\)/);
  assert.match(adminSrc, /const suffix = result\.complete \? '' : '_PARCIAL';/);
  assert.match(adminSrc, /Respaldo PARCIAL/);
});
