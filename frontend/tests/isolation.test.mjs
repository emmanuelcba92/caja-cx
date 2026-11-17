import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertIsolatedConfig,
  findForbidden,
  FORBIDDEN_IDENTIFIERS,
  COATCX_EXPECTED,
  EXTERNAL_SERVICES_ENABLED
} from '../src/firebase/envGuard.js';
import { runChecks } from '../scripts/verify-isolation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const coatcxCfg = {
  apiKey: 'AIzaSyTestCoatcxKey000000000000000000',
  authDomain: COATCX_EXPECTED.authDomain,
  projectId: COATCX_EXPECTED.projectId,
  storageBucket: COATCX_EXPECTED.storageBucket,
  messagingSenderId: COATCX_EXPECTED.projectNumber,
  appId: COATCX_EXPECTED.appId
};

const demo = {
  apiKey: 'demo-key',
  authDomain: 'demo-coat-rediseno.firebaseapp.com',
  projectId: 'demo-coat-rediseno',
  storageBucket: 'demo-coat-rediseno.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000'
};

test('guardia: acepta configuración del proyecto secundario de pruebas coatcx y demo con emulador', () => {
  assert.equal(assertIsolatedConfig(coatcxCfg, { emulator: false }), true);
  assert.equal(assertIsolatedConfig(coatcxCfg, { emulator: true, emulatorHost: '127.0.0.1' }), true);
  assert.equal(assertIsolatedConfig(demo, { emulator: true, emulatorHost: '127.0.0.1' }), true);
  assert.equal(assertIsolatedConfig(demo, { emulator: true, emulatorHost: 'localhost' }), true);
});

test('guardia: rechaza configuración de producción y de otros sistemas (cajacx-test, coat-test)', () => {
  const prod = { ...demo, projectId: FORBIDDEN_IDENTIFIERS[0], authDomain: `${FORBIDDEN_IDENTIFIERS[0]}.firebaseapp.com`, storageBucket: `${FORBIDDEN_IDENTIFIERS[0]}.firebasestorage.app` };
  assert.throws(() => assertIsolatedConfig(prod, { emulator: false }), /PROHIBIDOS/);
  const otherSys = { ...demo, projectId: 'cajacx-test', messagingSenderId: '930859241568' };
  assert.throws(() => assertIsolatedConfig(otherSys, { emulator: false }), /PROHIBIDOS/);
});

test('guardia: rechaza configuración mezclada (un solo campo de producción o ajeno a coatcx)', () => {
  for (const field of ['appId', 'messagingSenderId', 'apiKey', 'authDomain', 'storageBucket']) {
    const value = field === 'appId' ? '1:1004973900727:web:abc' : field === 'messagingSenderId' ? '1004973900727' : field === 'apiKey' ? FORBIDDEN_IDENTIFIERS[5] : `x.${FORBIDDEN_IDENTIFIERS[0]}.app`;
    assert.throws(() => assertIsolatedConfig({ ...coatcxCfg, [field]: value }, { emulator: false }), /PROHIBIDOS/, field);
  }
  assert.throws(() => assertIsolatedConfig({ ...coatcxCfg, messagingSenderId: '111111111111' }), /messagingSenderId/);
  assert.throws(() => assertIsolatedConfig({ ...coatcxCfg, appId: '1:392377174292:web:otro' }), /appId/);
});

test('guardia: rechaza configuración faltante o vacía (sin fallback a producción)', () => {
  assert.throws(() => assertIsolatedConfig(undefined), /configuraci/i);
  assert.throws(() => assertIsolatedConfig({}, { emulator: false }), /Falta configuraci/);
  assert.throws(() => assertIsolatedConfig({ ...coatcxCfg, projectId: '' }, { emulator: false }), /Falta configuraci/);
});

test('guardia: rechaza proyectos desconocidos, demo sin emulador y hosts no loopback', () => {
  assert.throws(() => assertIsolatedConfig({ ...demo, projectId: 'otro-proyecto', authDomain: 'otro-proyecto.x', storageBucket: 'otro-proyecto.y' }, { emulator: false }), /no permitido/);
  assert.throws(() => assertIsolatedConfig(demo, { emulator: false }), /requiere emuladores/);
  assert.throws(() => assertIsolatedConfig(demo, { emulator: true, emulatorHost: '192.168.1.10' }), /loopback/);
  assert.throws(() => assertIsolatedConfig({ ...demo, authDomain: 'demo-otro.firebaseapp.com' }, { emulator: true }), /mezclada/);
});

test('servicios externos deshabilitados por defecto', () => {
  assert.equal(EXTERNAL_SERVICES_ENABLED, false);
  assert.match(read('src/supabase/config.js'), /EXTERNAL_SERVICES_ENABLED \? buildClient\(\) : disabledClient/);
  assert.doesNotMatch(read('src/supabase/config.js'), /eyJ|supabase\.co/);
  assert.match(read('src/services/aiService.js'), /deshabilitado en modo pruebas/);
});

test('config.js: sin fallback de producción y con soporte coatcx + emuladores + Auth secundaria', () => {
  const cfg = read('src/firebase/config.js');
  assert.deepEqual(findForbidden(cfg), []);
  assert.doesNotMatch(cfg, /\|\|\s*["'][^"']*firebase/i);
  for (const fn of ['connectFirestoreEmulator(db', 'connectAuthEmulator(auth', 'connectStorageEmulator(storage', 'connectAuthEmulator(secondaryAuth']) {
    assert.ok(cfg.includes(fn), `falta ${fn}`);
  }
  assert.match(cfg, /assertIsolatedConfig\(firebaseConfig/);
  assert.ok(cfg.indexOf('assertIsolatedConfig(firebaseConfig') < cfg.indexOf('initializeApp(firebaseConfig)'), 'la guardia debe ir antes de initializeApp');
});

test('instancia secundaria de Auth usa createIsolatedSecondaryAuth', () => {
  const app = read('src/SurgeryApp.jsx');
  assert.match(app, /createIsolatedSecondaryAuth\(/);
  assert.doesNotMatch(app, /initializeApp\(|getAuth\(/);
});

test('verificación estática del repositorio: apunta a coatcx sin errores ni advertencias de producción', () => {
  const { errors, warnings, info } = runChecks({ mode: 'development' });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.ok(info.some((i) => i.includes('coatcx')));
});

test('verificación: detecta entorno de producción, claves externas y entorno vacío', () => {
  const prodEnv = { VITE_USE_FIREBASE_EMULATOR: 'false', VITE_FIREBASE_PROJECT_ID: FORBIDDEN_IDENTIFIERS[0], VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_AUTH_DOMAIN: 'a', VITE_FIREBASE_STORAGE_BUCKET: 'b', VITE_FIREBASE_MESSAGING_SENDER_ID: '1', VITE_FIREBASE_APP_ID: '1:1:web:1' };
  assert.ok(runChecks({ env: prodEnv }).errors.length > 0);
  const withGemini = {
    VITE_USE_FIREBASE_EMULATOR: 'false',
    VITE_FIREBASE_PROJECT_ID: coatcxCfg.projectId,
    VITE_FIREBASE_API_KEY: coatcxCfg.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: coatcxCfg.authDomain,
    VITE_FIREBASE_STORAGE_BUCKET: coatcxCfg.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: coatcxCfg.messagingSenderId,
    VITE_FIREBASE_APP_ID: coatcxCfg.appId,
    VITE_GEMINI_API_KEY: 'x'
  };
  assert.ok(runChecks({ env: withGemini }).errors.some((e) => /GEMINI/.test(e)));
  assert.equal(runChecks({ env: {} }).errors.length, 0, 'entorno vacío solo avisa (vista previa)');
  const demoNoEmu = { ...prodEnv, VITE_FIREBASE_PROJECT_ID: demo.projectId, VITE_FIREBASE_API_KEY: demo.apiKey, VITE_FIREBASE_AUTH_DOMAIN: demo.authDomain, VITE_FIREBASE_STORAGE_BUCKET: demo.storageBucket, VITE_USE_FIREBASE_EMULATOR: 'false' };
  assert.ok(runChecks({ env: demoNoEmu }).errors.length > 0);
});

test('verificación: detecta identificadores de producción en un proyecto temporal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coat-iso-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'x.js'), `export const p = "${FORBIDDEN_IDENTIFIERS[0]}";`);
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify({ hosting: {} }));
  const { errors } = runChecks({ root: dir, env: {} });
  assert.ok(errors.some((e) => e.startsWith('src/x.js')));
  assert.ok(errors.some((e) => /hosting/.test(e)));
});

test('scripts de mantenimiento con referencias a producción están bloqueados (no se conectan)', () => {
  for (const f of ['recover_files.js', 'update_profesionales.js', 'scratch/sync_local_files.mjs']) {
    const text = read(f);
    assert.ok(text.startsWith('// ISOLATION-BLOCKED'), `${f} sin marcador`);
    const run = spawnSync(process.execPath, [join(ROOT, f)], { encoding: 'utf8', timeout: 15000 });
    assert.notEqual(run.status, 0, `${f} no debería ejecutarse`);
    assert.match(run.stderr, /ISOLATION-BLOCKED/, f);
  }
});
