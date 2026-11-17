import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createQuote,
  getQuoteDerivedStatus,
  prepareEmissionSnapshot,
  prepareNewVersionDraft,
} from '../src/data/presupuestoRules.js';
import { getQuoteIssues } from '../src/utils/presupuestoFormat.js';
import { createRulesSimulator } from '../scripts/run-coatcx-role-tests.mjs';
import { FICTITIOUS_USERS } from '../scripts/fictitious-test-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadPresupuestoServiceModule() {
  const raw = readFileSync(resolve(ROOT, 'src/services/presupuestoService.js'), 'utf8');
  const body = raw
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+default\s+presupuestoService;\s*$/gm, '')
    .replace(/^export\s+function\s+/gm, 'function ')
    + '\nglobalThis.__exported = { buildPresupuestoDocId, createPresupuestoService };\n';

  const noop = () => ({});
  const context = vm.createContext({
    collection: noop,
    doc: noop,
    getDoc: async () => ({ exists: () => false }),
    getDocs: async () => ({ docs: [] }),
    query: noop,
    runTransaction: async () => {},
    where: noop,
    deleteDoc: async () => {},
    db: {},
    apiService: { isReadOnlyMode: () => false },
    logAction: async () => {},
    AUDIT_ACTIONS: {
      CREATE_PRESUPUESTO_DRAFT: 'CREATE_PRESUPUESTO_DRAFT',
      EMIT_PRESUPUESTO: 'EMIT_PRESUPUESTO',
      DELETE_PRESUPUESTO_DRAFT: 'DELETE_PRESUPUESTO_DRAFT',
    },
    createQuote,
    getQuoteDerivedStatus,
    prepareEmissionSnapshot,
    prepareNewVersionDraft,
    getQuoteIssues,
  });

  vm.runInContext(body, context);
  return context.__exported;
}

const { buildPresupuestoDocId, createPresupuestoService } = loadPresupuestoServiceModule();

function clone(obj) {
  return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
}

function createTransactionalMemoryAdapter({ auth = null, simulator = null } = {}) {
  const presupuestos = simulator ? simulator.db.presupuestos : new Map();
  const series = simulator ? simulator.db.presupuestos_series : new Map();

  function assertRule(op, collectionName, docId, requestData = null) {
    if (!simulator || !auth) return;
    const ok = simulator.evaluate({
      auth,
      op,
      collection: collectionName,
      docId,
      requestData,
    });
    if (!ok) {
      throw new Error(`Missing or insufficient permissions (${op} ${collectionName}/${docId})`);
    }
  }

  let commitSeq = 0;

  return {
    stores: { presupuestos, series },
    async listBySurgery(surgeryId, { onlyEmitted = false } = {}) {
      const results = [];
      for (const [docId, docData] of presupuestos.entries()) {
        if (docData.surgeryId !== surgeryId) continue;
        if (onlyEmitted && !['emitido', 'reemplazado'].includes(docData.status)) continue;
        assertRule('list', 'presupuestos', docId);
        results.push({ ...clone(docData), id: docId });
      }
      return results;
    },
    async getById(id) {
      assertRule('get', 'presupuestos', id);
      const found = presupuestos.get(id);
      return found ? { ...clone(found), id } : null;
    },
    async deleteById(id) {
      assertRule('delete', 'presupuestos', id);
      presupuestos.delete(id);
    },
    async runTx(callback) {
      const startSeq = commitSeq;
      const stagedBudgets = new Map();
      const deletedBudgets = new Set();
      const stagedSeries = new Map();

      const txAdapter = {
        async getBudget(id) {
          await Promise.resolve();
          assertRule('get', 'presupuestos', id);
          if (deletedBudgets.has(id)) return null;
          if (stagedBudgets.has(id)) return { ...clone(stagedBudgets.get(id)), id };
          const found = presupuestos.get(id);
          return found ? { ...clone(found), id } : null;
        },
        async getSeries(surgeryId) {
          await Promise.resolve();
          assertRule('get', 'presupuestos_series', surgeryId);
          if (stagedSeries.has(surgeryId)) return { ...clone(stagedSeries.get(surgeryId)), id: surgeryId };
          const found = series.get(surgeryId);
          return found ? { ...clone(found), id: surgeryId } : null;
        },
        setBudget(id, data) {
          const op = presupuestos.has(id) ? 'update' : 'create';
          assertRule(op, 'presupuestos', id, data);
          deletedBudgets.delete(id);
          stagedBudgets.set(id, clone(data));
        },
        updateBudget(id, patch) {
          const base = stagedBudgets.get(id) ?? presupuestos.get(id);
          assertRule('update', 'presupuestos', id, { ...(base || {}), ...patch });
          stagedBudgets.set(id, clone({ ...(base || {}), ...patch }));
        },
        deleteBudget(id) {
          assertRule('delete', 'presupuestos', id);
          stagedBudgets.delete(id);
          deletedBudgets.add(id);
        },
        setSeries(surgeryId, data) {
          const op = series.has(surgeryId) ? 'update' : 'create';
          assertRule(op, 'presupuestos_series', surgeryId, data);
          stagedSeries.set(surgeryId, clone(data));
        },
      };

      const result = await callback(txAdapter);

      // Detección optimista de colisión concurrente estilo Firestore runTransaction
      if (commitSeq !== startSeq) {
        throw new Error('Transaction aborted due to concurrent modification');
      }
      commitSeq += 1;

      for (const id of deletedBudgets) {
        presupuestos.delete(id);
      }
      for (const [id, data] of stagedBudgets.entries()) {
        presupuestos.set(id, clone(data));
      }
      for (const [id, data] of stagedSeries.entries()) {
        series.set(id, clone(data));
      }

      return result;
    },
  };
}

function buildValidParticularData(overrides = {}) {
  return {
    fecha: '2026-11-13',
    paciente: 'Juan Pérez',
    dni: '30123456',
    obraSocial: 'PARTICULAR',
    cirugia: 'Septoplastia + Turbinoplastia',
    items: [
      { id: 'i1', roleKey: 'equipo_quirurgico', descripcion: 'Honorarios Equipo Quirúrgico', monto: 1200000, iva: 'sin-iva', ivaEditable: true },
      { id: 'i2', roleKey: 'anestesista', descripcion: 'Honorarios Anestesista', monto: 450000, iva: 'sin-iva', ivaEditable: true },
      { id: 'i3', roleKey: 'derechos_sanatoriales', descripcion: 'Derechos Sanatoriales COAT', monto: 800000, iva: 'no-indicar', ivaEditable: false },
    ],
    ...overrides,
  };
}

test('Etapa 2: crear, modificar y eliminar borrador v1 manteniendo versión determinística', async () => {
  const auditEvents = [];
  const adapter = createTransactionalMemoryAdapter();
  const service = createPresupuestoService({
    adapter,
    isReadOnly: () => false,
    auditLog: async (...args) => auditEvents.push(args),
  });

  const draft = await service.createDraft({
    surgeryId: 'ord_100',
    tipo: 'particular',
    initialData: buildValidParticularData(),
    user: { uid: 'uid_secre1', email: 'secre@coat.com' },
  });

  assert.equal(draft.id, buildPresupuestoDocId('ord_100', 1));
  assert.equal(draft.surgeryId, 'ord_100');
  assert.equal(draft.groupId, 'ord_100');
  assert.equal(draft.version, 1);
  assert.equal(draft.status, 'borrador');
  assert.equal(auditEvents[0][0], 'CREATE_PRESUPUESTO_DRAFT');

  await assert.rejects(
    () => service.updateDraft(draft.id, { surgeryId: 'ord_hack' }, { uid: 'uid_secre1', email: 'secre@coat.com' }),
    /No está permitido cambiar la cirugía asociada a un presupuesto/
  );

  await assert.rejects(
    () => service.updateDraft(draft.id, { groupId: 'hack' }, { uid: 'uid_secre1', email: 'secre@coat.com' }),
    /No está permitido cambiar el groupId/
  );
  await assert.rejects(
    () => service.updateDraft(draft.id, { version: 99 }, { uid: 'uid_secre1', email: 'secre@coat.com' }),
    /No está permitido alterar el número de versión/
  );

  const updated = await service.updateDraft(
    draft.id,
    { paciente: 'Juan Carlos Pérez' },
    { uid: 'uid_secre1', email: 'secre@coat.com' }
  );
  assert.equal(updated.paciente, 'Juan Carlos Pérez');
  assert.equal(updated.surgeryId, 'ord_100');
  assert.equal(updated.groupId, 'ord_100');
  assert.equal(updated.version, 1);

  const deleted = await service.deleteDraft(draft.id);
  assert.equal(deleted, true);
  assert.equal(adapter.stores.presupuestos.has(draft.id), false);
  assert.equal(adapter.stores.series.get('ord_100').latestVersion, 0);

  // Al volver a crear luego de eliminar el único borrador, retoma v1 limpiamente
  const recreated = await service.createDraft({
    surgeryId: 'ord_100',
    tipo: 'particular',
    initialData: buildValidParticularData(),
    user: { uid: 'uid_secre1', email: 'secre@coat.com' },
  });
  assert.equal(recreated.version, 1);
});

test('Etapa 2: emisión atómica, inmutabilidad y bloqueo de edición/eliminación de emitidos', async () => {
  const adapter = createTransactionalMemoryAdapter();
  const service = createPresupuestoService({
    adapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  const draft = await service.createDraft({
    surgeryId: 'ord_200',
    tipo: 'particular',
    initialData: buildValidParticularData(),
    user: { uid: 'uid_secre1', email: 'secre@coat.com' },
  });

  const emitted = await service.emitPresupuesto(draft.id, { uid: 'uid_secre1', email: 'secre@coat.com' });
  assert.equal(emitted.status, 'emitido');
  assert.equal(emitted.validUntil, '2026-11-28');
  assert.ok(emitted.emittedAt);
  assert.equal(emitted.emittedBy, 'secre@coat.com');

  await assert.rejects(
    () => service.updateDraft(draft.id, { paciente: 'Alterado' }),
    /No se puede modificar un presupuesto ya emitido o reemplazado/
  );
  await assert.rejects(
    () => service.deleteDraft(draft.id),
    /No se puede eliminar un presupuesto emitido o reemplazado/
  );
  await assert.rejects(
    () => service.emitPresupuesto(draft.id, { uid: 'uid_secre1', email: 'secre@coat.com' }),
    /Este presupuesto ya fue emitido o reemplazado/
  );
});

test('Etapa 2: renovación v2 borrador conserva v1 vigente/vencido y solo reemplaza v1 al emitir v2', async () => {
  const adapter = createTransactionalMemoryAdapter();
  const service = createPresupuestoService({
    adapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  const v1Draft = await service.createDraft({
    surgeryId: 'ord_300',
    tipo: 'obra-social',
    initialData: {
      fecha: '2026-11-01',
      paciente: 'María Gómez',
      dni: '28111222',
      obraSocial: 'OSDE',
      numeroAfiliado: '998877',
      cirugia: 'Amigdalectomía',
      items: [{ id: 'p1', codigo: '030101', descripcion: 'Amigdalectomía', monto: 900000, aConvenir: false }],
    },
    user: { uid: 'uid_secre1', email: 'secre@coat.com' },
  });
  const v1 = await service.emitPresupuesto(v1Draft.id, { uid: 'uid_secre1', email: 'secre@coat.com' });

  // Estado derivado vencido sin escrituras en Firestore (obra social: 30 días desde 2026-11-01 => 2026-12-01)
  const historyVencido = await service.getVersionsBySurgery('ord_300', { referenceDateISO: '2026-12-05' });
  assert.equal(historyVencido[0].derivedStatus, 'vencido');

  // Preparar borrador v2 manteniendo v1 intacto como emitido
  const v2Draft = await service.prepareRenewalDraft(v1.id, {
    fecha: '2026-12-05',
    motivoActualizacion: 'Actualización de aranceles',
    user: { uid: 'uid_admin1', email: 'admin@coat.com' },
  });
  assert.equal(v2Draft.version, 2);
  assert.equal(v2Draft.status, 'borrador');
  assert.equal(v2Draft.previousVersionId, v1.id);
  assert.equal(v2Draft.motivoActualizacion, 'Actualización de aranceles');

  const v1BeforeV2Emit = await adapter.getById(v1.id);
  assert.equal(v1BeforeV2Emit.status, 'emitido');
  assert.equal(v1BeforeV2Emit.replacedByVersionId, null);

  await service.updateDraft(
    v2Draft.id,
    {
      items: [{ id: 'p1', codigo: '030101', descripcion: 'Amigdalectomía', monto: 1050000, aConvenir: false }],
    },
    { uid: 'uid_admin1', email: 'admin@coat.com' }
  );

  const v2Emitted = await service.emitPresupuesto(v2Draft.id, { uid: 'uid_admin1', email: 'admin@coat.com' });
  assert.equal(v2Emitted.status, 'emitido');
  assert.equal(v2Emitted.emittedBy, 'admin@coat.com');

  const v1AfterV2Emit = await adapter.getById(v1.id);
  assert.equal(v1AfterV2Emit.status, 'reemplazado');
  assert.equal(v1AfterV2Emit.replacedByVersionId, v2Emitted.id);
  // Snapshot histórico de v1 permanece inalterable
  assert.equal(v1AfterV2Emit.items[0].monto, 900000);
  assert.equal(v1AfterV2Emit.fecha, '2026-11-01');
  assert.equal(v1AfterV2Emit.validUntil, '2026-12-01');

  const active = await service.getActiveVersion('ord_300', { referenceDateISO: '2026-12-10' });
  assert.equal(active.id, v2Emitted.id);
  assert.equal(active.derivedStatus, 'vigente');
});

test('Etapa 2: concurrencia evita duplicación de versiones y doble emisión simultánea', async () => {
  const adapter = createTransactionalMemoryAdapter();
  const service = createPresupuestoService({
    adapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  // Dos createDraft simultáneos sobre la misma cirugía: uno gana v1, el otro falla por colisión
  const createResults = await Promise.allSettled([
    service.createDraft({
      surgeryId: 'ord_race',
      tipo: 'particular',
      initialData: buildValidParticularData(),
      user: { uid: 'u1', email: 'u1@coat.com' },
    }),
    service.createDraft({
      surgeryId: 'ord_race',
      tipo: 'particular',
      initialData: buildValidParticularData(),
      user: { uid: 'u2', email: 'u2@coat.com' },
    }),
  ]);

  const createdFulfilled = createResults.filter((r) => r.status === 'fulfilled');
  const createdRejected = createResults.filter((r) => r.status === 'rejected');
  assert.equal(createdFulfilled.length, 1);
  assert.equal(createdRejected.length, 1);
  assert.equal(adapter.stores.presupuestos.size, 1);

  const draftId = createdFulfilled[0].value.id;

  // Dos emisiones simultáneas del mismo borrador: una gana, la otra falla
  const emitResults = await Promise.allSettled([
    service.emitPresupuesto(draftId, { uid: 'u1', email: 'u1@coat.com' }),
    service.emitPresupuesto(draftId, { uid: 'u2', email: 'u2@coat.com' }),
  ]);

  assert.equal(emitResults.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(emitResults.filter((r) => r.status === 'rejected').length, 1);
});

test('Etapa 2: aislamiento por cirugía y permisos por rol (service + firestore.rules simulator)', async () => {
  const simulator = createRulesSimulator();
  simulator.db.presupuestos.clear();
  simulator.db.presupuestos_series.clear();
  const consultaEmail = 'consulta.test@pruebas.coat.local';
  simulator.db.authorized_emails.set(consultaEmail, {
    id: consultaEmail,
    email: consultaEmail,
    role: 'consulta',
  });

  const adminAuth = { uid: 'uid_admin', email: FICTITIOUS_USERS.admin.email };
  const adminAdapter = createTransactionalMemoryAdapter({ auth: adminAuth, simulator });
  const adminService = createPresupuestoService({
    adapter: adminAdapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  const a1 = await adminService.createDraft({
    surgeryId: 'ord_A',
    tipo: 'particular',
    initialData: buildValidParticularData({ paciente: 'Paciente A' }),
    user: adminAuth,
  });
  await adminService.emitPresupuesto(a1.id, adminAuth);

  const a2Draft = await adminService.prepareRenewalDraft(a1.id, {
    fecha: '2026-11-14',
    motivoActualizacion: 'Borrador v2 oculto para consulta',
    user: adminAuth,
  });

  const b1Draft = await adminService.createDraft({
    surgeryId: 'ord_B',
    tipo: 'particular',
    initialData: buildValidParticularData({ paciente: 'Paciente B' }),
    user: adminAuth,
  });

  // Aislamiento entre cirugías
  const versionsA = await adminService.getVersionsBySurgery('ord_A');
  const versionsB = await adminService.getVersionsBySurgery('ord_B');
  assert.equal(versionsA.length, 2);
  assert.equal(versionsB.length, 1);
  assert.equal(versionsB[0].paciente, 'Paciente B');

  // CONSULTA: solo ve emitidos/reemplazados (nunca borradores), y no puede escribir
  const consultaAuth = { uid: 'uid_consulta', email: consultaEmail };
  const consultaAdapter = createTransactionalMemoryAdapter({ auth: consultaAuth, simulator });
  const consultaService = createPresupuestoService({
    adapter: consultaAdapter,
    isReadOnly: () => true,
    auditLog: async () => {},
  });

  const consultaEmittedA = await consultaService.getEmittedVersions('ord_A');
  assert.equal(consultaEmittedA.length, 1);
  assert.equal(consultaEmittedA[0].id, a1.id);

  assert.equal(
    simulator.evaluate({ auth: consultaAuth, op: 'get', collection: 'presupuestos', docId: a2Draft.id }),
    false
  );
  assert.equal(
    simulator.evaluate({ auth: consultaAuth, op: 'get', collection: 'presupuestos', docId: a1.id }),
    true
  );
  await assert.rejects(
    () => consultaService.createDraft({ surgeryId: 'ord_A', tipo: 'particular' }),
    /\[CONSULTA\].*bloqueada/
  );
  await assert.rejects(() => consultaService.deleteDraft(a2Draft.id), /\[CONSULTA\].*bloqueada/);

  // DIRECCION MEDICA: lectura de todas las versiones, sin escritura
  const dirAuth = { uid: 'uid_dir', email: FICTITIOUS_USERS.direccion_medica.email };
  assert.equal(simulator.evaluate({ auth: dirAuth, op: 'get', collection: 'presupuestos', docId: a2Draft.id }), true);
  assert.equal(
    simulator.evaluate({
      auth: dirAuth,
      op: 'create',
      collection: 'presupuestos',
      docId: 'ord_C__v1',
      requestData: { surgeryId: 'ord_C', groupId: 'ord_C', version: 1, status: 'borrador', tipo: 'particular', previousVersionId: null, replacedByVersionId: null },
    }),
    false
  );

  // MEDICO / RESIDENTE / SECRE_ESTUDIOS: sin acceso a presupuestos
  for (const userKey of ['medico1', 'residente', 'secre_estudios']) {
    const auth = { uid: `uid_${userKey}`, email: FICTITIOUS_USERS[userKey].email };
    assert.equal(simulator.evaluate({ auth, op: 'get', collection: 'presupuestos', docId: a1.id }), false);
    assert.equal(simulator.evaluate({ auth, op: 'list', collection: 'presupuestos', docId: a1.id }), false);
    assert.equal(simulator.evaluate({ auth, op: 'get', collection: 'presupuestos_series', docId: 'ord_A' }), false);
  }

  // SECRE: puede crear, editar borrador y emitir
  const secreAuth = { uid: 'uid_secre', email: FICTITIOUS_USERS.secre.email };
  const secreAdapter = createTransactionalMemoryAdapter({ auth: secreAuth, simulator });
  const secreService = createPresupuestoService({
    adapter: secreAdapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });
  const secreUpdatedB = await secreService.updateDraft(b1Draft.id, { paciente: 'Paciente B Editado' }, secreAuth);
  assert.equal(secreUpdatedB.paciente, 'Paciente B Editado');
  const secreEmittedB = await secreService.emitPresupuesto(b1Draft.id, secreAuth);
  assert.equal(secreEmittedB.status, 'emitido');
});
