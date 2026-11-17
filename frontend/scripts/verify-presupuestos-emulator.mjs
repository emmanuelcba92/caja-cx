import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { FICTITIOUS_USERS } from './fictitious-test-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ID = 'demo-coat-rediseno';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_URL = 'http://127.0.0.1:9099';

const tmpServicePath = join(tmpdir(), `presupuestoService.emu.${process.pid}.mjs`);
const tmpCodigosServicePath = join(tmpdir(), `presupuestoCodigosService.emu.${process.pid}.mjs`);

async function loadPresupuestoServiceFactory() {
  const firestoreUrl = import.meta.resolve('firebase/firestore');
  const rulesUrl = pathToFileURL(resolve(ROOT, 'src/data/presupuestoRules.js')).href;
  const formatUrl = pathToFileURL(resolve(ROOT, 'src/utils/presupuestoFormat.js')).href;

  const raw = readFileSync(resolve(ROOT, 'src/services/presupuestoService.js'), 'utf8');
  const transformed = raw
    .replace("'firebase/firestore'", `'${firestoreUrl}'`)
    .replace(
      "import { db } from '../firebase/config';",
      'let db = null;\nexport function __setDb(nextDb) { db = nextDb; }'
    )
    .replace(
      "import apiService from './apiService';",
      'const apiService = { isReadOnlyMode: () => false };'
    )
    .replace(
      "import { logAction, AUDIT_ACTIONS } from './auditService';",
      "const logAction = async () => {};\nconst AUDIT_ACTIONS = { CREATE_PRESUPUESTO_DRAFT: 'CREATE_PRESUPUESTO_DRAFT', EMIT_PRESUPUESTO: 'EMIT_PRESUPUESTO', DELETE_PRESUPUESTO_DRAFT: 'DELETE_PRESUPUESTO_DRAFT' };"
    )
    .replace("'../data/presupuestoRules'", `'${rulesUrl}'`)
    .replace("'../utils/presupuestoFormat'", `'${formatUrl}'`);

  writeFileSync(tmpServicePath, transformed, 'utf8');
  return import(pathToFileURL(tmpServicePath).href);
}

async function loadCodigosServiceFactory() {
  const firestoreUrl = import.meta.resolve('firebase/firestore');
  const raw = readFileSync(resolve(ROOT, 'src/services/presupuestoCodigosService.js'), 'utf8');
  const transformed = raw
    .replace("'firebase/firestore'", `'${firestoreUrl}'`)
    .replace(
      "import { db } from '../firebase/config';",
      'let db = null;\nexport function __setDb(nextDb) { db = nextDb; }'
    )
    .replace(
      "import apiService from './apiService';",
      'const apiService = { isReadOnlyMode: () => false };'
    )
    .replace(
      "import { logAction, AUDIT_ACTIONS } from './auditService';",
      "const logAction = async () => {};\nconst AUDIT_ACTIONS = { UPDATE_PRESUPUESTO_CODIGOS: 'ACTUALIZAR_CODIGOS_PRESUPUESTO', IMPORT_PRESUPUESTO_CODIGOS: 'IMPORTAR_CODIGOS_PRESUPUESTO' };"
    );

  writeFileSync(tmpCodigosServicePath, transformed, 'utf8');
  return import(pathToFileURL(tmpCodigosServicePath).href);
}

async function clearEmulators() {
  const fsRes = await fetch(
    `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!fsRes.ok) {
    throw new Error(`No se pudo limpiar el emulador de Firestore (${fsRes.status})`);
  }
  const authRes = await fetch(
    `${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  if (!authRes.ok) {
    throw new Error(`No se pudo limpiar el emulador de Auth (${authRes.status})`);
  }
}

async function seedAuthorizedEmailAdmin(email, role) {
  const url = `http://${FIRESTORE_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/authorized_emails?documentId=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        role: { stringValue: role },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error sembrando authorized_emails/${email}: ${res.status} ${text}`);
  }
}

async function createClientForUser(name, email, password, serviceModule, codigosModule) {
  const app = initializeApp(
    {
      apiKey: 'demo-api-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
    },
    `emu_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_URL, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch {
    await signInWithEmailAndPassword(auth, email, password);
  }

  serviceModule.__setDb(db);
  const service = serviceModule.createPresupuestoService({
    isReadOnly: () => name === 'consulta',
    auditLog: async () => {},
  });
  codigosModule.__setDb(db);
  const codigosService = codigosModule.createPresupuestoCodigosService({
    isReadOnly: () => name === 'consulta',
    auditLog: async () => {},
  });
  return {
    app,
    auth,
    db,
    email,
    uid: auth.currentUser.uid,
    service,
    codigosService,
  };
}

function validParticularPayload(overrides = {}) {
  return {
    fecha: '2026-11-13',
    paciente: 'Paciente Emulador',
    dni: '30111222',
    obraSocial: 'PARTICULAR',
    cirugia: 'Septoplastia',
    items: [
      { id: 'i1', roleKey: 'equipo_quirurgico', descripcion: 'Honorarios Equipo Quirúrgico', monto: 1200000, iva: 'sin-iva', ivaEditable: true },
      { id: 'i2', roleKey: 'anestesista', descripcion: 'Honorarios Anestesista', monto: 450000, iva: 'sin-iva', ivaEditable: true },
      { id: 'i3', roleKey: 'derechos_sanatoriales', descripcion: 'Derechos Sanatoriales COAT', monto: 800000, iva: 'no-indicar', ivaEditable: false },
    ],
    ...overrides,
  };
}

async function expectPermissionDenied(fn, label) {
  let failed = false;
  try {
    await fn();
  } catch (err) {
    failed = true;
    const msg = String(err?.code || err?.message || err);
    assert.match(msg, /permission-denied|PERMISSION_DENIED|insufficient permissions|bloqueada/i, `${label}: error inesperado: ${msg}`);
  }
  assert.equal(failed, true, `${label}: se esperaba rechazo por permisos y la operación tuvo éxito`);
}

const results = [];
async function runCheck(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err?.stack || err?.message || String(err) });
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

const clients = [];

try {
  await clearEmulators();
  const serviceModule = await loadPresupuestoServiceFactory();
  const codigosModule = await loadCodigosServiceFactory();

  const consultaUser = {
    email: 'consulta.test@pruebas.coat.local',
    password: 'TestCoat2026!Con',
    role: 'consulta',
  };

  for (const key of ['admin', 'secre', 'direccion_medica', 'medico1', 'residente', 'secre_estudios']) {
    await seedAuthorizedEmailAdmin(FICTITIOUS_USERS[key].email, FICTITIOUS_USERS[key].role);
  }
  await seedAuthorizedEmailAdmin(consultaUser.email, consultaUser.role);

  const admin = await createClientForUser('admin', FICTITIOUS_USERS.admin.email, FICTITIOUS_USERS.admin.password, serviceModule, codigosModule);
  const secre = await createClientForUser('secre', FICTITIOUS_USERS.secre.email, FICTITIOUS_USERS.secre.password, serviceModule, codigosModule);
  const dir = await createClientForUser('direccion_medica', FICTITIOUS_USERS.direccion_medica.email, FICTITIOUS_USERS.direccion_medica.password, serviceModule, codigosModule);
  const consulta = await createClientForUser('consulta', consultaUser.email, consultaUser.password, serviceModule, codigosModule);
  const medico = await createClientForUser('medico1', FICTITIOUS_USERS.medico1.email, FICTITIOUS_USERS.medico1.password, serviceModule, codigosModule);
  const residente = await createClientForUser('residente', FICTITIOUS_USERS.residente.email, FICTITIOUS_USERS.residente.password, serviceModule, codigosModule);
  const secreEst = await createClientForUser('secre_estudios', FICTITIOUS_USERS.secre_estudios.email, FICTITIOUS_USERS.secre_estudios.password, serviceModule, codigosModule);
  const unauthorized = await createClientForUser('unauthorized', FICTITIOUS_USERS.unauthorized.email, FICTITIOUS_USERS.unauthorized.password, serviceModule, codigosModule);

  clients.push(admin, secre, dir, consulta, medico, residente, secreEst, unauthorized);

  let v1Id;
  let v2Id;
  let v3DraftId;

  await runCheck('EMU-01: Admin y Secretaría crean y modifican borradores en Firestore real', async () => {
    const d1 = await secre.service.createDraft({
      surgeryId: 'ord_emu_1',
      tipo: 'particular',
      initialData: validParticularPayload(),
      user: { uid: secre.uid, email: secre.email },
    });
    assert.equal(d1.id, 'ord_emu_1__v1');
    assert.equal(d1.status, 'borrador');
    v1Id = d1.id;

    const updated = await admin.service.updateDraft(
      d1.id,
      { paciente: 'Paciente Emulador Actualizado' },
      { uid: admin.uid, email: admin.email }
    );
    assert.equal(updated.paciente, 'Paciente Emulador Actualizado');

    // Crear y eliminar un borrador temporal en otra cirugía para probar deleteDraft real
    const temp = await secre.service.createDraft({
      surgeryId: 'ord_emu_del',
      tipo: 'particular',
      initialData: validParticularPayload(),
      user: { uid: secre.uid, email: secre.email },
    });
    const deleted = await secre.service.deleteDraft(temp.id);
    assert.equal(deleted, true);
    const snap = await getDoc(doc(admin.db, 'presupuestos', temp.id));
    assert.equal(snap.exists(), false);
  });

  await runCheck('EMU-02: Emisión atómica y actualización de presupuestos_series', async () => {
    const emitted = await secre.service.emitPresupuesto(v1Id, { uid: secre.uid, email: secre.email });
    assert.equal(emitted.status, 'emitido');
    assert.equal(emitted.validUntil, '2026-11-28');
    assert.equal(emitted.emittedBy, secre.email);

    const seriesSnap = await getDoc(doc(admin.db, 'presupuestos_series', 'ord_emu_1'));
    assert.equal(seriesSnap.exists(), true);
    assert.equal(seriesSnap.data().activeEmittedId, v1Id);
    assert.equal(seriesSnap.data().latestVersion, 1);
  });

  await runCheck('EMU-03: Renovación v2 borrador conserva v1 emitido; emisión v2 reemplaza atómicamente v1', async () => {
    const v2Draft = await admin.service.prepareRenewalDraft(v1Id, {
      fecha: '2026-12-01',
      motivoActualizacion: 'Ajuste de aranceles',
      user: { uid: admin.uid, email: admin.email },
    });
    assert.equal(v2Draft.id, 'ord_emu_1__v2');
    assert.equal(v2Draft.status, 'borrador');
    v2Id = v2Draft.id;

    const v1Before = await getDoc(doc(admin.db, 'presupuestos', v1Id));
    assert.equal(v1Before.data().status, 'emitido');

    await admin.service.updateDraft(
      v2Id,
      {
        items: [
          { id: 'i1', roleKey: 'equipo_quirurgico', descripcion: 'Honorarios Equipo Quirúrgico', monto: 1350000, iva: 'sin-iva', ivaEditable: true },
          { id: 'i2', roleKey: 'anestesista', descripcion: 'Honorarios Anestesista', monto: 500000, iva: 'sin-iva', ivaEditable: true },
          { id: 'i3', roleKey: 'derechos_sanatoriales', descripcion: 'Derechos Sanatoriales COAT', monto: 850000, iva: 'no-indicar', ivaEditable: false },
        ],
      },
      { uid: admin.uid, email: admin.email }
    );

    const v2Emitted = await admin.service.emitPresupuesto(v2Id, { uid: admin.uid, email: admin.email });
    assert.equal(v2Emitted.status, 'emitido');

    const v1After = await getDoc(doc(admin.db, 'presupuestos', v1Id));
    assert.equal(v1After.data().status, 'reemplazado');
    assert.equal(v1After.data().replacedByVersionId, v2Id);
    assert.equal(v1After.data().items[0].monto, 1200000);

    // Crear borrador v3 sin emitir para probar aislamiento de borradores frente a CONSULTA
    const v3Draft = await secre.service.prepareRenewalDraft(v2Id, {
      fecha: '2026-12-10',
      motivoActualizacion: 'Borrador v3',
      user: { uid: secre.uid, email: secre.email },
    });
    v3DraftId = v3Draft.id;
  });

  await runCheck('EMU-04: CONSULTA lee solo emitidos/reemplazados con query real y tiene bloqueados borradores y escrituras', async () => {
    const emittedList = await consulta.service.getEmittedVersions('ord_emu_1');
    assert.equal(emittedList.length, 2);
    assert.deepEqual(emittedList.map((x) => x.id), [v2Id, v1Id]);

    const active = await consulta.service.getActiveVersion('ord_emu_1', { referenceDateISO: '2026-12-02' });
    assert.equal(active.id, v2Id);
    assert.equal(active.derivedStatus, 'vigente');

    // El servicio fuerza onlyEmitted cuando isReadOnly() es true (excluye borradores)
    const viaService = await consulta.service.getVersionsBySurgery('ord_emu_1');
    assert.deepEqual(viaService.map((x) => x.id), [v2Id, v1Id]);

    // Query directa sin filtro de estado emitido/reemplazado debe ser rechazada por Firestore Rules reales
    await expectPermissionDenied(
      () => getDocs(query(collection(consulta.db, 'presupuestos'), where('surgeryId', '==', 'ord_emu_1'))),
      'CONSULTA query directa sin filtro emitido'
    );
    await expectPermissionDenied(
      () => getDoc(doc(consulta.db, 'presupuestos', v3DraftId)),
      'CONSULTA getDoc borrador'
    );
    await expectPermissionDenied(
      () => setDoc(doc(consulta.db, 'presupuestos', 'ord_emu_1__v4'), { surgeryId: 'ord_emu_1', groupId: 'ord_emu_1', version: 4, status: 'borrador', tipo: 'particular', previousVersionId: v3DraftId, replacedByVersionId: null }),
      'CONSULTA setDoc directo'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(consulta.db, 'presupuestos', v2Id), { paciente: 'Hack' }),
      'CONSULTA updateDoc directo'
    );
    await expectPermissionDenied(
      () => deleteDoc(doc(consulta.db, 'presupuestos', v3DraftId)),
      'CONSULTA deleteDoc directo'
    );
  });

  await runCheck('EMU-05: Dirección Médica solo lee; otros roles (médico, residente, secre_estudios, no autorizado) sin acceso', async () => {
    const dirAll = await dir.service.getVersionsBySurgery('ord_emu_1');
    assert.equal(dirAll.length, 3);
    const dirDraftSnap = await getDoc(doc(dir.db, 'presupuestos', v3DraftId));
    assert.equal(dirDraftSnap.exists(), true);

    await expectPermissionDenied(
      () => updateDoc(doc(dir.db, 'presupuestos', v3DraftId), { paciente: 'Dir Edit' }),
      'DIRECCION_MEDICA updateDoc'
    );
    await expectPermissionDenied(
      () => setDoc(doc(dir.db, 'presupuestos_series', 'ord_dir'), { surgeryId: 'ord_dir', latestVersion: 1 }),
      'DIRECCION_MEDICA setDoc series'
    );

    for (const [label, client] of [['medico', medico], ['residente', residente], ['secre_estudios', secreEst], ['unauthorized', unauthorized]]) {
      await expectPermissionDenied(() => getDoc(doc(client.db, 'presupuestos', v2Id)), `${label} getDoc emitido`);
      await expectPermissionDenied(() => getDocs(query(collection(client.db, 'presupuestos'), where('surgeryId', '==', 'ord_emu_1'))), `${label} query`);
      await expectPermissionDenied(() => getDoc(doc(client.db, 'presupuestos_series', 'ord_emu_1')), `${label} getDoc series`);
      await expectPermissionDenied(
        () => setDoc(doc(client.db, 'presupuestos', 'ord_x__v1'), { surgeryId: 'ord_x', groupId: 'ord_x', version: 1, status: 'borrador', tipo: 'particular', previousVersionId: null, replacedByVersionId: null }),
        `${label} setDoc`
      );
    }
  });

  await runCheck('EMU-06: Inmutabilidad de emitidos y bloqueo de escrituras directas maliciosas (incluso como Admin)', async () => {
    // No se pueden alterar importes, condiciones, fechas, paciente ni borrar un emitido directamente
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v2Id), { paciente: 'Alterado Directo' }),
      'Admin updateDoc paciente emitido'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v2Id), { fecha: '2026-12-31', validUntil: '2027-01-15' }),
      'Admin updateDoc fechas emitido'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v2Id), { 'condiciones.nota': 'Alterada' }),
      'Admin updateDoc condiciones emitido'
    );
    await expectPermissionDenied(
      () => deleteDoc(doc(admin.db, 'presupuestos', v2Id)),
      'Admin deleteDoc emitido'
    );

    // No se puede falsificar emitido directo, ID no determinístico, salto de versión o cambio de cirugía
    await expectPermissionDenied(
      () => setDoc(doc(admin.db, 'presupuestos', 'id_arbitrario'), { surgeryId: 'ord_fake', groupId: 'ord_fake', version: 1, status: 'borrador', tipo: 'particular', previousVersionId: null, replacedByVersionId: null }),
      'ID no determinístico'
    );
    await expectPermissionDenied(
      () => setDoc(doc(admin.db, 'presupuestos', 'ord_fake__v1'), { surgeryId: 'ord_fake', groupId: 'ord_fake', version: 1, status: 'emitido', tipo: 'particular', previousVersionId: null, replacedByVersionId: null }),
      'Creación directa como emitido'
    );
    await expectPermissionDenied(
      () => setDoc(doc(admin.db, 'presupuestos', 'ord_fake__v2'), { surgeryId: 'ord_fake', groupId: 'ord_fake', version: 2, status: 'borrador', tipo: 'particular', previousVersionId: 'ord_fake__v1', replacedByVersionId: null }),
      'Creación directa v2 sin existir v1'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v3DraftId), { surgeryId: 'otra_cirugia' }),
      'Alterar surgeryId en borrador'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v3DraftId), { groupId: 'otro_grupo' }),
      'Alterar groupId en borrador'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v3DraftId), { version: 99 }),
      'Alterar version en borrador'
    );
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuestos', v2Id), { status: 'reemplazado', replacedByVersionId: '' }),
      'Reemplazar emitido sin replacedByVersionId válido'
    );
  });

  await runCheck('EMU-07: Concurrencia real en Firestore evita doble emisión y versiones duplicadas', async () => {
    // 1) Dos emisiones simultáneas sobre el mismo borrador v3DraftId
    const emitSettled = await Promise.allSettled([
      admin.service.emitPresupuesto(v3DraftId, { uid: admin.uid, email: admin.email }),
      secre.service.emitPresupuesto(v3DraftId, { uid: secre.uid, email: secre.email }),
    ]);
    const emitOk = emitSettled.filter((r) => r.status === 'fulfilled');
    const emitFail = emitSettled.filter((r) => r.status === 'rejected');
    assert.equal(emitOk.length, 1, 'Solo una de las emisiones simultáneas debe concretarse');
    assert.equal(emitFail.length, 1, 'La segunda emisión simultánea debe fallar limpiamente');

    // 2) Dos createDraft simultáneos sobre una cirugía nueva en Firestore real
    const raceSettled = await Promise.allSettled([
      admin.service.createDraft({
        surgeryId: 'ord_emu_race',
        tipo: 'particular',
        initialData: validParticularPayload(),
        user: { uid: admin.uid, email: admin.email },
      }),
      secre.service.createDraft({
        surgeryId: 'ord_emu_race',
        tipo: 'particular',
        initialData: validParticularPayload(),
        user: { uid: secre.uid, email: secre.email },
      }),
    ]);

    const createdDocs = raceSettled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.ok(createdDocs.length >= 1, 'Al menos un borrador debe crearse');
    const versions = createdDocs.map((d) => d.version);
    assert.equal(new Set(versions).size, versions.length, 'Nunca debe haber versiones duplicadas en concurrencia');

    const storedVersions = await admin.service.getVersionsBySurgery('ord_emu_race');
    assert.equal(storedVersions.length, createdDocs.length);
    const seriesSnap = await getDoc(doc(admin.db, 'presupuestos_series', 'ord_emu_race'));
    assert.equal(seriesSnap.data().latestVersion, createdDocs.length);
  });

  await runCheck('EMU-08: Etapa 3 - Solo ADMIN modifica presupuesto_codigos_config/shared; todos los autorizados leen', async () => {
    // Lectura inicial sin documento no escribe nada
    const initial = await admin.codigosService.getSharedConfig();
    assert.equal(initial.exists, false);
    assert.equal(initial.version, 0);

    // Non-admin no puede crear ni escribir
    for (const [label, client] of [['secre', secre], ['direccion_medica', dir], ['consulta', consulta], ['medico', medico], ['residente', residente], ['secre_estudios', secreEst], ['unauthorized', unauthorized]]) {
      await expectPermissionDenied(
        () => setDoc(doc(client.db, 'presupuesto_codigos_config', 'shared'), { version: 1, rules: { 'OSDE||030101': true } }),
        `${label} create presupuesto_codigos_config`
      );
    }

    // Admin crea v1 mediante toggleCodeRule
    const v1 = await admin.codigosService.toggleCodeRule({
      obraSocial: 'SANCOR',
      code: '030473',
      expectedVersion: 0,
      user: { email: admin.email },
    });
    assert.equal(v1.version, 1);
    assert.deepEqual(v1.rules, { 'SANCOR||030473': true });

    // Todos los roles autorizados pueden leer
    for (const [label, client] of [['admin', admin], ['secre', secre], ['direccion_medica', dir], ['consulta', consulta], ['medico', medico], ['residente', residente], ['secre_estudios', secreEst]]) {
      const cfg = await client.codigosService.getSharedConfig();
      assert.equal(cfg.exists, true, `${label} debe leer shared`);
      assert.deepEqual(cfg.rules, { 'SANCOR||030473': true });
    }

    // No autorizado sigue bloqueado para lectura
    await expectPermissionDenied(
      () => getDoc(doc(unauthorized.db, 'presupuesto_codigos_config', 'shared')),
      'unauthorized getDoc presupuesto_codigos_config'
    );

    // Non-admin no puede actualizar ni borrar; admin tampoco puede borrar ni crear otro ID
    for (const [label, client] of [['secre', secre], ['direccion_medica', dir], ['consulta', consulta], ['medico', medico]]) {
      await expectPermissionDenied(
        () => updateDoc(doc(client.db, 'presupuesto_codigos_config', 'shared'), { version: 2, rules: {} }),
        `${label} updateDoc presupuesto_codigos_config`
      );
    }
    await expectPermissionDenied(
      () => deleteDoc(doc(admin.db, 'presupuesto_codigos_config', 'shared')),
      'admin deleteDoc presupuesto_codigos_config'
    );
    await expectPermissionDenied(
      () => setDoc(doc(admin.db, 'presupuesto_codigos_config', 'otro_doc'), { version: 1, rules: {} }),
      'admin setDoc otro_doc presupuesto_codigos_config'
    );
  });

  await runCheck('EMU-09: Etapa 3 - Importación explícita, conflictos y conservación remota ante fallos', async () => {
    const localRules = { 'OSDE||030101': true, 'SANCOR||030473': true };
    // Sin confirmOverwrite, rechaza porque ya existe SANCOR||030473 en Firestore (v1)
    let rejected = false;
    try {
      await admin.codigosService.importLocalRules({
        localRules,
        expectedVersion: 1,
        mode: 'merge',
        confirmOverwrite: false,
        user: { email: admin.email },
      });
    } catch {
      rejected = true;
    }
    assert.equal(rejected, true);
    const intact = await admin.codigosService.getSharedConfig();
    assert.equal(intact.version, 1);

    // Con confirmOverwrite, combina preservando reglas existentes y subiendo a v2
    const imported = await admin.codigosService.importLocalRules({
      localRules,
      expectedVersion: 1,
      mode: 'merge',
      confirmOverwrite: true,
      user: { email: admin.email },
    });
    assert.equal(imported.version, 2);
    assert.deepEqual(imported.rules, { 'SANCOR||030473': true, 'OSDE||030101': true });

    // Si falla por permisos (secre intenta importar), la configuración remota queda intacta
    await expectPermissionDenied(
      () => secre.codigosService.importLocalRules({
        localRules: { 'SWISS MEDICAL||030201': true },
        expectedVersion: 2,
        mode: 'replace',
        confirmOverwrite: true,
        user: { email: secre.email },
      }),
      'secre importLocalRules'
    );
    const afterFail = await admin.codigosService.getSharedConfig();
    assert.equal(afterFail.version, 2);
    assert.deepEqual(afterFail.rules, { 'SANCOR||030473': true, 'OSDE||030101': true });
  });

  await runCheck('EMU-10: Etapa 3 - Concurrencia entre administradores y regla de versión monotónica +1', async () => {
    // Admin A y Admin B leyeron ambos v2; Admin A guarda primero -> v3; Admin B falla con conflicto de concurrencia
    const adminA = await admin.codigosService.toggleCodeRule({
      obraSocial: 'SWISS MEDICAL',
      code: '030201',
      expectedVersion: 2,
      user: { email: admin.email },
    });
    assert.equal(adminA.version, 3);

    let concurrencyBlocked = false;
    try {
      await admin.codigosService.toggleCodeRule({
        obraSocial: 'IOSFA',
        code: '030101',
        expectedVersion: 2,
        user: { email: 'admin2@coat.com' },
      });
    } catch (err) {
      assert.match(String(err?.message || err), /Conflicto de concurrencia/);
      concurrencyBlocked = true;
    }
    assert.equal(concurrencyBlocked, true);

    // Escritura directa saltando versión (v3 -> v5) rechazada por firestore.rules reales
    await expectPermissionDenied(
      () => updateDoc(doc(admin.db, 'presupuesto_codigos_config', 'shared'), { version: 5, rules: {} }),
      'admin saltar versión en presupuesto_codigos_config'
    );
  });
} finally {
  await Promise.allSettled(clients.map((c) => deleteApp(c.app)));
  try { unlinkSync(tmpServicePath); } catch {}
  try { unlinkSync(tmpCodigosServicePath); } catch {}
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`\nResumen emulador real: ${passed} aprobadas, ${failed} fallidas (total ${results.length}).`);
if (failed > 0) {
  process.exitCode = 1;
}
