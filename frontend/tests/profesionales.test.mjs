import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = readFileSync(new URL('../src/ProfesionalesView.jsx', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('  const handleSubmit ='), source.indexOf('  const filteredProfessionals'));
function fixture(database = new Map(), overrides = {}) {
  const state = { rows: [...database.values()].map(p => ({ ...p, nombrePila: p.nombreOnly })), error: '', closed: false };
  const api = {
    async setDocument(col, id, data) { assert.equal(col, 'profesionales'); database.set(id, { ...data, id }); },
    async updateDocument(col, id, data) { assert.equal(col, 'profesionales'); if (!database.has(id)) return false; database.set(id, { ...database.get(id), ...data }); return true; },
    async deleteDocument(col, id) { assert.equal(col, 'profesionales'); database.delete(id); },
    ...overrides
  };
  const context = vm.createContext({
    formData: { id: 'test-prof', prefijo: 'Dra', nombrePila: 'Prueba', apellido: 'Ficticia', mp: 'TEST-123', especialidad: 'Otro' },
    isEditing: false, isLoading: false, firmaFile: null, busy: { current: false }, professionals: state.rows,
    formatFullName: (p, n, a) => `${p}. ${a} ${n}`, apiService: api,
    setError: v => state.error = v, setIsSaving() {}, setNotice() {},
    setProfessionals: fn => state.rows = fn(state.rows), handleCloseModal: () => state.closed = true,
    window: { confirm: () => true }
  });
  vm.runInContext(handlers + '\nglobalThis.submit = handleSubmit; globalThis.remove = handleDelete;', context);
  return { context, state, database, submit: () => context.submit({ preventDefault() {} }), remove: id => context.remove(id) };
}
test('CRUD, reload, search, unchanged existing record and stable retry ID', async () => {
  const existing = { id: 'existing', nombre: 'Dr. Existente', mp: 'OLD', email: 'existing@example.invalid' };
  const database = new Map([['existing', existing]]);
  let f = fixture(database);
  await f.submit();
  assert.equal(database.size, 2);
  assert.equal(database.get('test-prof').nombreOnly, 'Prueba');
  // A new fixture has no previous UI state: read only persisted documents.
  f = fixture(database);
  assert.ok(f.state.rows.some(p => p.nombre.includes('Prueba')));
  assert.ok(f.state.rows.some(p => (p.apellido || '').includes('Ficticia')));
  f.context.isEditing = true;
  f.context.formData.email = 'edited@example.invalid';
  await f.submit();
  f = fixture(database);
  assert.equal(f.state.rows.find(p => p.id === 'test-prof').email, 'edited@example.invalid');
  await f.remove('test-prof');
  assert.equal(fixture(database).state.rows.length, 1);
  assert.deepEqual(database.get('existing'), existing);
});
test('rejected create, update and delete retain UI and show error', async () => {
  for (const method of ['setDocument', 'updateDocument', 'deleteDocument']) {
    const database = new Map([['existing', { id: 'existing', mp: 'OLD' }]]);
    const f = fixture(database, { [method]: async () => { throw { code: 'permission-denied' }; } });
    if (method === 'updateDocument') f.context.isEditing = true;
    if (method === 'deleteDocument') await f.remove('existing'); else await f.submit();
    assert.equal(f.state.rows.length, 1);
    assert.equal(f.state.closed, false);
    assert.match(f.state.error, /permisos/);
  }
});
test('no optimistic update, double submission or duplicate on retry after uncertain result', async () => {
  let release, calls = 0;
  const pending = new Promise(resolve => release = resolve);
  const database = new Map();
  const f = fixture(database, { async setDocument(col, id, data) {
    calls++; database.set(id, { ...data, id }); await pending;
    if (calls === 1) throw new Error('Lost response');
  } });
  const first = f.submit();
  await f.submit();
  assert.equal(calls, 1);
  assert.equal(f.state.rows.length, 0);
  release(); await first;
  await f.submit();
  assert.equal(database.size, 1);
  assert.equal(f.state.rows.length, 1);
});
test('duplicate MP and missing required field do not write', async () => {
  const f = fixture(new Map([['existing', { id: 'existing', mp: 'TEST-123' }]]));
  await f.submit(); assert.match(f.state.error, /Ya existe/); assert.equal(f.database.size, 1);
  f.context.formData.mp = ''; await f.submit(); assert.match(f.state.error, /obligatorios/);
});

