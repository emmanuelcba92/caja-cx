import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRulesSimulator } from '../scripts/run-coatcx-role-tests.mjs';
import { FICTITIOUS_USERS } from '../scripts/fictitious-test-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadCodigosServiceModule() {
  const raw = readFileSync(resolve(ROOT, 'src/services/presupuestoCodigosService.js'), 'utf8');
  const body = raw
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+default\s+presupuestoCodigosService;\s*$/gm, '')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    + `\nglobalThis.__exported = {
      PRESUPUESTO_CODIGOS_COLLECTION,
      PRESUPUESTO_CODIGOS_DOC_ID,
      PRESUPUESTO_CODIGOS_LOCAL_KEY,
      buildCodeRuleKey,
      parseCodeRuleKey,
      normalizeRulesMap,
      readLocalCodeRules,
      analyzeLocalImport,
      createPresupuestoCodigosService,
    };\n`;

  const noop = () => ({});
  const context = vm.createContext({
    doc: noop,
    getDoc: async () => ({ exists: () => false }),
    onSnapshot: noop,
    runTransaction: async () => {},
    db: {},
    apiService: { isReadOnlyMode: () => false },
    logAction: async () => {},
    AUDIT_ACTIONS: {
      UPDATE_PRESUPUESTO_CODIGOS: 'ACTUALIZAR_CODIGOS_PRESUPUESTO',
      IMPORT_PRESUPUESTO_CODIGOS: 'IMPORTAR_CODIGOS_PRESUPUESTO',
    },
  });

  vm.runInContext(body, context);
  return context.__exported;
}

const {
  PRESUPUESTO_CODIGOS_LOCAL_KEY,
  buildCodeRuleKey,
  normalizeRulesMap,
  readLocalCodeRules,
  analyzeLocalImport,
  createPresupuestoCodigosService,
} = loadCodigosServiceModule();

function createMemoryCodigosAdapter(initialDoc = null) {
  let stored = initialDoc ? JSON.parse(JSON.stringify(initialDoc)) : null;
  let writeCount = 0;

  return {
    getWriteCount: () => writeCount,
    getRaw: () => (stored ? JSON.parse(JSON.stringify(stored)) : null),
    async getShared() {
      if (!stored) {
        return { version: 0, rules: {}, updatedAt: null, updatedBy: null, exists: false };
      }
      return { ...JSON.parse(JSON.stringify(stored)), exists: true };
    },
    subscribeShared(onNext) {
      onNext(
        stored
          ? { ...JSON.parse(JSON.stringify(stored)), exists: true }
          : { version: 0, rules: {}, updatedAt: null, updatedBy: null, exists: false }
      );
      return () => {};
    },
    async runTx(callback) {
      const txAdapter = {
        async getShared() {
          if (!stored) {
            return { version: 0, rules: {}, updatedAt: null, updatedBy: null, exists: false };
          }
          return { ...JSON.parse(JSON.stringify(stored)), exists: true };
        },
        setShared(payload) {
          stored = JSON.parse(JSON.stringify(payload));
          writeCount += 1;
        },
      };
      return callback(txAdapter);
    },
  };
}

function createFakeLocalStorage(initialObj) {
  const store = new Map();
  if (initialObj !== undefined) {
    store.set(PRESUPUESTO_CODIGOS_LOCAL_KEY, JSON.stringify(initialObj));
  }
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

test('Etapa 3: clave obraSocial + código sin duplicados ni alteración de nomenclatura', () => {
  assert.equal(buildCodeRuleKey('SANCOR', '030473'), 'SANCOR||030473');
  assert.equal(buildCodeRuleKey('OSDE ', ' 030101'), 'OSDE||030101');
  assert.throws(() => buildCodeRuleKey('', '030101'), /obligatorios/);
  assert.throws(() => buildCodeRuleKey('OSDE||X', '030101'), /no pueden contener/);

  const normalized = normalizeRulesMap({
    'OSDE||030101': true,
    'OSDE||030101 ': true,
    'SANCOR||030473': false,
    invalidKey: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), { 'OSDE||030101': true });
});

test('Etapa 3: lectura y suscripción no realizan escrituras automáticas', async () => {
  const adapter = createMemoryCodigosAdapter(null);
  const service = createPresupuestoCodigosService({
    adapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  const config = await service.getSharedConfig();
  assert.equal(config.exists, false);
  assert.equal(config.version, 0);
  assert.deepEqual(config.rules, {});

  let received = null;
  const unsub = service.subscribeSharedConfig((c) => { received = c; });
  unsub();
  assert.equal(received.exists, false);
  assert.equal(adapter.getWriteCount(), 0);
});

test('Etapa 3: importación explícita detecta conflictos, exige confirmación, conserva localStorage e intacta remota si falla', async () => {
  const fakeStorage = createFakeLocalStorage({
    'OSDE||030101': true,
    'SANCOR||030473': true,
  });
  const localRules = JSON.parse(JSON.stringify(readLocalCodeRules(fakeStorage)));
  assert.deepEqual(localRules, { 'OSDE||030101': true, 'SANCOR||030473': true });

  const adapter = createMemoryCodigosAdapter({
    version: 1,
    rules: { 'OSDE||030101': true, 'SWISS MEDICAL||030201': true },
    updatedAt: '2026-11-13T00:00:00.000Z',
    updatedBy: 'admin@coat.com',
  });
  const service = createPresupuestoCodigosService({
    adapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  const remoteBefore = await service.getSharedConfig();
  const analysis = JSON.parse(JSON.stringify(analyzeLocalImport(localRules, remoteBefore.rules)));
  assert.equal(analysis.localCount, 2);
  assert.equal(analysis.remoteCount, 2);
  assert.deepEqual(analysis.newKeys, ['SANCOR||030473']);
  assert.deepEqual(analysis.overlappingKeys, ['OSDE||030101']);
  assert.deepEqual(analysis.remoteOnlyKeys, ['SWISS MEDICAL||030201']);
  assert.equal(analysis.hasConflicts, true);

  // Sin confirmación explícita, rechaza y deja remota intacta
  await assert.rejects(
    () => service.importLocalRules({
      localRules,
      expectedVersion: 1,
      mode: 'merge',
      confirmOverwrite: false,
      user: { email: 'admin@coat.com' },
    }),
    /Confirmá explícitamente/
  );
  assert.deepEqual(adapter.getRaw().rules, { 'OSDE||030101': true, 'SWISS MEDICAL||030201': true });

  // Con confirmación explícita en modo merge, conserva remotas y agrega nuevas
  const merged = JSON.parse(JSON.stringify(await service.importLocalRules({
    localRules,
    expectedVersion: 1,
    mode: 'merge',
    confirmOverwrite: true,
    user: { email: 'admin@coat.com' },
  })));
  assert.equal(merged.version, 2);
  assert.deepEqual(merged.rules, {
    'OSDE||030101': true,
    'SWISS MEDICAL||030201': true,
    'SANCOR||030473': true,
  });

  // Los datos locales se conservan después de importar
  assert.deepEqual(JSON.parse(JSON.stringify(readLocalCodeRules(fakeStorage))), { 'OSDE||030101': true, 'SANCOR||030473': true });

  // Si la importación falla por error remoto/concurrencia, la configuración remota queda intacta
  await assert.rejects(
    () => service.importLocalRules({
      localRules,
      expectedVersion: 1, // desactualizada
      mode: 'replace',
      confirmOverwrite: true,
      user: { email: 'admin@coat.com' },
    }),
    /Conflicto de concurrencia/
  );
  assert.equal(adapter.getRaw().version, 2);
  assert.equal(adapter.getRaw().rules['SWISS MEDICAL||030201'], true);
});

test('Etapa 3: dos administradores no pueden sobrescribirse cambios simultáneos (concurrencia optimista)', async () => {
  const adapter = createMemoryCodigosAdapter({
    version: 1,
    rules: { 'OSDE||030101': true },
    updatedAt: '2026-11-13T00:00:00.000Z',
    updatedBy: 'admin1@coat.com',
  });
  const service = createPresupuestoCodigosService({
    adapter,
    isReadOnly: () => false,
    auditLog: async () => {},
  });

  const admin1Save = await service.toggleCodeRule({
    obraSocial: 'SANCOR',
    code: '030473',
    expectedVersion: 1,
    user: { email: 'admin1@coat.com' },
  });
  assert.equal(admin1Save.version, 2);

  await assert.rejects(
    () => service.toggleCodeRule({
      obraSocial: 'OSDE',
      code: '030202',
      expectedVersion: 1,
      user: { email: 'admin2@coat.com' },
    }),
    /Conflicto de concurrencia/
  );
  assert.equal(adapter.getRaw().version, 2);
  assert.equal(adapter.getRaw().rules['OSDE||030202'], undefined);
});

test('Etapa 3: permisos por rol en simulador firestore.rules (solo ADMIN escribe, autorizados leen)', () => {
  const simulator = createRulesSimulator();
  const consultaEmail = 'consulta.test@pruebas.coat.local';
  simulator.db.authorized_emails.set(consultaEmail, {
    id: consultaEmail,
    email: consultaEmail,
    role: 'consulta',
  });

  const adminAuth = { uid: 'uid_admin', email: FICTITIOUS_USERS.admin.email };
  assert.equal(simulator.evaluate({ auth: adminAuth, op: 'get', collection: 'presupuesto_codigos_config', docId: 'shared' }), true);
  assert.equal(
    simulator.evaluate({
      auth: adminAuth,
      op: 'update',
      collection: 'presupuesto_codigos_config',
      docId: 'shared',
      requestData: { version: 2, rules: { 'OSDE||030101': true, 'SANCOR||030473': true } },
    }),
    true
  );
  // No se puede saltar versión ni borrar
  assert.equal(
    simulator.evaluate({
      auth: adminAuth,
      op: 'update',
      collection: 'presupuesto_codigos_config',
      docId: 'shared',
      requestData: { version: 5, rules: {} },
    }),
    false
  );
  assert.equal(simulator.evaluate({ auth: adminAuth, op: 'delete', collection: 'presupuesto_codigos_config', docId: 'shared' }), false);

  // Demás roles autorizados: lectura permitida, escritura denegada
  for (const [label, email] of [
    ['secre', FICTITIOUS_USERS.secre.email],
    ['direccion_medica', FICTITIOUS_USERS.direccion_medica.email],
    ['medico1', FICTITIOUS_USERS.medico1.email],
    ['residente', FICTITIOUS_USERS.residente.email],
    ['secre_estudios', FICTITIOUS_USERS.secre_estudios.email],
    ['consulta', consultaEmail],
  ]) {
    const auth = { uid: `uid_${label}`, email };
    assert.equal(simulator.evaluate({ auth, op: 'get', collection: 'presupuesto_codigos_config', docId: 'shared' }), true, `${label} debe poder leer`);
    assert.equal(
      simulator.evaluate({
        auth,
        op: 'update',
        collection: 'presupuesto_codigos_config',
        docId: 'shared',
        requestData: { version: 2, rules: {} },
      }),
      false,
      `${label} NO debe poder escribir`
    );
  }

  // No autorizado: sin lectura ni escritura
  const unauth = { uid: 'uid_intruder', email: FICTITIOUS_USERS.unauthorized.email };
  assert.equal(simulator.evaluate({ auth: unauth, op: 'get', collection: 'presupuesto_codigos_config', docId: 'shared' }), false);
});
