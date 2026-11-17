import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRulesSimulator } from '../scripts/run-coatcx-role-tests.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadDefaultRolesInSandbox() {
  const raw = readFileSync(resolve(ROOT, 'src/services/roleService.js'), 'utf8');
  const match = raw.match(/export const DEFAULT_ROLES = (\{[\s\S]*?\n\});/);
  assert.ok(match, 'DEFAULT_ROLES debe existir en roleService.js');
  const context = vm.createContext({});
  vm.runInContext(`const DEFAULT_ROLES = ${match[1]}; globalThis.DEFAULT_ROLES = DEFAULT_ROLES;`, context);
  return context.DEFAULT_ROLES;
}

function loadApiServiceInSandbox() {
  const raw = readFileSync(resolve(ROOT, 'src/services/apiService.js'), 'utf8');
  const body = raw
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+[\s\S]*?;\s*$/gm, '')
    .replace(/import\.meta\.env/g, '({ VITE_BLOCK_DELETES: "false" })')
    + '\nglobalThis.apiService = apiService;\n';
  const noop = () => ({});
  const context = vm.createContext({
    db: {},
    storage: {},
    isTestEnv: false,
    LOCAL_API_URL: '',
    collection: noop,
    getDocs: async () => ({ docs: [] }),
    addDoc: async () => ({ id: 'mock' }),
    updateDoc: async () => {},
    doc: noop,
    deleteDoc: async () => {},
    query: noop,
    where: noop,
    orderBy: noop,
    getDoc: async () => ({ exists: () => false }),
    setDoc: async () => {},
    writeBatch: () => ({ delete: noop, commit: async () => {} }),
    onSnapshot: noop,
    limit: noop,
    ref: noop,
    uploadBytes: async () => ({}),
    getDownloadURL: async () => 'https://example.invalid',
    console
  });
  vm.runInContext(body, context);
  return context.apiService;
}

test('DEFAULT_ROLES define el rol consulta con permisos de solo lectura', () => {
  const DEFAULT_ROLES = loadDefaultRolesInSandbox();
  assert.ok(DEFAULT_ROLES.consulta?.permissions, 'Debe existir el rol consulta en DEFAULT_ROLES');
  const perms = DEFAULT_ROLES.consulta.permissions;
  assert.equal(perms.is_consulta, true);
  assert.equal(perms.readonly_caja, true);
  assert.equal(perms.can_view_ordenes, true);
  assert.equal(perms.can_view_shared_catalog, true);
  assert.equal(perms.can_view_stats, true);
  assert.equal(perms.can_edit_data, false);
  assert.equal(perms.can_delete_data, false);
  assert.equal(perms.can_edit_own, false);
  assert.equal(perms.can_delete_own, false);
  assert.equal(perms.can_share_ordenes, false);
  assert.equal(perms.can_view_admin, false);
  assert.equal(perms.can_manage_users, false);
});

test('apiService bloquea todas las escrituras y subidas cuando el modo solo lectura está activo', async () => {
  const apiService = loadApiServiceInSandbox();
  apiService.setReadOnlyMode(true);
  try {
    assert.equal(apiService.isReadOnlyMode(), true);
    await assert.rejects(() => apiService.addDocument('caja', { paciente: 'Test' }), /\[CONSULTA\]/);
    await assert.rejects(() => apiService.updateDocument('caja', '1', { paciente: 'Test' }), /\[CONSULTA\]/);
    await assert.rejects(() => apiService.deleteDocument('caja', '1'), /\[CONSULTA\]/);
    await assert.rejects(() => apiService.setDocument('caja_comentarios', '2026-01-01', { comentario: 'x' }), /\[CONSULTA\]/);
    await assert.rejects(() => apiService.clearCollection('caja'), /\[CONSULTA\]/);
    await assert.rejects(() => apiService.uploadFile(new Blob(['x']), 'test/a.pdf'), /\[CONSULTA\]/);
  } finally {
    apiService.setReadOnlyMode(false);
    assert.equal(apiService.isReadOnlyMode(), false);
  }
});

test('LiquidacionView omite la migración automática a Firestore cuando isReadOnly es true', () => {
  const src = readFileSync(resolve(ROOT, 'src/LiquidacionView.jsx'), 'utf8');
  assert.match(src, /isReadOnly\s*=\s*false/);
  assert.equal(/migrateLocalItems|syncLiquidationCollection/.test(src), false, 'No debe existir migración automática al montar LiquidacionView');
  assert.match(src, /loadFirestoreLiquidations/);
});

test('ReciboLibreView bloquea guardado e impresión y CajaView oculta Recibo Libre en modo solo lectura', () => {
  const src = readFileSync(resolve(ROOT, 'src/components/ReciboLibreView.jsx'), 'utf8');
  assert.match(src, /const ReciboLibreView = \(\{\s*isReadOnly = false\s*\}\)/);
  assert.match(src, /const handleSave = async \(\) => \{\s*if \(isReadOnly\) return;/);
  assert.match(src, /const handlePrint = \(\) => \{\s*if \(isReadOnly\) return;/);
  assert.match(src, /\{!isReadOnly && \([\s\S]*Guardar Recibo/);

  const cajaSrc = readFileSync(resolve(ROOT, 'src/CajaView.jsx'), 'utf8');
  assert.match(cajaSrc, /\{!isReadOnly && \(\s*<button onClick=\{\(\) => setSubTab\('recibo_libre'\)\}/);
  assert.match(cajaSrc, /\{!isReadOnly && subTab === 'recibo_libre' && <ReciboLibreView isReadOnly=\{isReadOnly\} \/>\}/);
});

test('SurgeryApp restringe Cirugías de CONSULTA exclusivamente a Gestión y habilita impresión de órdenes', () => {
  const appSrc = readFileSync(resolve(ROOT, 'src/SurgeryApp.jsx'), 'utf8');
  assert.match(appSrc, /if \(userRole === ROLES\.SECRE \|\| userRole === ROLES\.CONSULTA\) \{\s*return \[\s*\{ id: 'Gestión', label: 'Gestión', icon: ClipboardList \},?\s*\];/);
  assert.match(appSrc, /const handleSelectCirugiasSubTab = \(subId\) => \{\s*if \(!allowedCirugiasSubTabs\.some\(t => t\.id === subId\)\) return;/);
  const printMatches = appSrc.match(/\{\(canEditSurgery\(s\) \|\| isAdmin \|\| canManageStatus \|\| isConsulta\) && \(/g) || [];
  assert.equal(printMatches.length, 2, 'Ambos botones de impresión de orden (tabla y tarjeta) deben incluir isConsulta');
});

test('firestore.rules permite lecturas a consulta y prohíbe todas las escrituras de consulta', () => {
  const rules = readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8');
  assert.match(rules, /function isConsulta\(\)\s*\{\s*return userRole\(\) == 'consulta';\s*\}/);
  assert.match(rules, /'consulta'/);
  assert.match(rules, /allow read: if isAdmin\(\) \|\| isSecre\(\) \|\| isConsulta\(\);/);

  const sim = createRulesSimulator();
  sim.db.authorized_emails.set('uid_consulta', {
    id: 'uid_consulta',
    email: 'consulta@coat.test',
    role: 'consulta'
  });

  const authConsulta = { uid: 'uid_consulta', email: 'consulta@coat.test' };

  // Lecturas permitidas
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'ordenes_internacion' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'pacientes' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'profesionales' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'caja' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'caja_comentarios' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'deducciones' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'liquidaciones_manuales' }), true);
  assert.equal(sim.evaluate({ auth: authConsulta, op: 'list', collection: 'recibos_libres' }), true);

  // Todas las escrituras denegadas
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'create',
      collection: 'ordenes_internacion',
      docId: 'ord_c1',
      requestData: { createdBy: 'consulta@coat.test', paciente: 'Test' }
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'update',
      collection: 'ordenes_internacion',
      docId: Array.from(sim.db.ordenes_internacion.keys())[0],
      requestData: { estado: 'AUTORIZADA', autorizada: true }
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'delete',
      collection: 'ordenes_internacion',
      docId: Array.from(sim.db.ordenes_internacion.keys())[0]
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'create',
      collection: 'pacientes',
      docId: '99999999',
      requestData: { dni: '99999999', nombre: 'Test' }
    }),
    false
  );
  for (const col of ['caja', 'caja_comentarios', 'deducciones', 'liquidaciones_manuales', 'recibos_libres']) {
    assert.equal(
      sim.evaluate({ auth: authConsulta, op: 'create', collection: col, docId: 'doc_1', requestData: { x: 1 } }),
      false,
      `create debe ser false en ${col}`
    );
    assert.equal(
      sim.evaluate({ auth: authConsulta, op: 'update', collection: col, docId: 'doc_1', requestData: { x: 2 } }),
      false,
      `update debe ser false en ${col}`
    );
    assert.equal(
      sim.evaluate({ auth: authConsulta, op: 'delete', collection: col, docId: 'doc_1' }),
      false,
      `delete debe ser false en ${col}`
    );
  }
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'create',
      collection: 'audit_logs',
      docId: 'log_c1',
      requestData: { userId: 'uid_consulta', userEmail: 'consulta@coat.test', action: 'TEST' }
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'create',
      collection: 'notes',
      docId: 'note_c1',
      requestData: { userId: 'uid_consulta', title: 'Test' }
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'create',
      collection: 'reminders',
      docId: 'rem_c1',
      requestData: { text: 'Test' }
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'update',
      collection: 'user_settings',
      docId: 'uid_consulta',
      requestData: { adminPin: '1234' }
    }),
    false
  );
  assert.equal(
    sim.evaluate({
      auth: authConsulta,
      op: 'create',
      collection: 'authorized_emails',
      docId: 'uid_consulta',
      requestData: { email: 'consulta@coat.test', role: 'admin' }
    }),
    false
  );
});
