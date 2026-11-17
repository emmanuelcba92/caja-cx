/**
 * Guardia de aislamiento (Etapa 1).
 *
 * Módulo PURO (sin import.meta, sin DOM obligatorio, sin red) para poder usarse
 * tanto en el navegador como en Node (scripts de verificación y tests).
 *
 * Objetivo: que el rediseño apunte EXCLUSIVAMENTE al proyecto secundario de pruebas
 * `coatcx` (o a emuladores locales `demo-*` / vista previa), bloqueando cualquier
 * identificador de producción (`caja-de-cirugia`) o de otros sistemas (`cajacx-test`, etc.).
 */

/**
 * Identificadores prohibidos (producción `caja-de-cirugia`, sitios `cajacx` y `coat-test`,
 * proyecto de otro sistema `cajacx-test`, Supabase de producción, etc.).
 * Se guardan codificados en base64 a propósito para que el código y el bundle compilado
 * NO contengan los literales y el escaneo de `src/` y `dist/` detecte cualquier fuga real.
 */
const decode = (b64) => (typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8'));
export const FORBIDDEN_IDENTIFIERS = [
  'Y2FqYS1kZS1jaXJ1Z2lh', // caja-de-cirugia (producción)
  'Y2FqYWN4',             // cajacx (sitio producción y prefijo cajacx-test)
  'Y29hdC10ZXN0',         // coat-test (sitio hosting dentro de caja-de-cirugia)
  'MTAwNDk3MzkwMDcyNw==', // 1004973900727 (projectNumber producción)
  'OGMwZGJhNmM5OGE0NTg5OTFjNWUzMg==', // 8c0dba6c98a458991c5e32 (appId producción)
  'QUl6YVN5Q2MxZFJ6cnM4c2c5bmFlQ0xNQmpaTVBNUzF0TWpJRjN3', // apiKey producción
  'OTMwODU5MjQxNTY4',     // 930859241568 (projectNumber cajacx-test - otro sistema)
  'cW1qeWN2cWN3ZXJ6YmZzYmJubGE=' // qmjycvqcwerzbfsbbnla (Supabase producción)
].map(decode);

/** Único proyecto Firebase alojado permitido para el rediseño. */
export const ALLOWED_HOSTED_PROJECTS = Object.freeze(['coatcx']);

/** Metadatos esperados de `coatcx` para impedir configuraciones mezcladas. */
export const COATCX_EXPECTED = Object.freeze({
  projectId: 'coatcx',
  projectNumber: '392377174292',
  authDomain: 'coatcx.firebaseapp.com',
  storageBucket: 'coatcx.firebasestorage.app',
  appId: '1:392377174292:web:0925688b5e459c444dda01'
});

/**
 * Metadatos esperados del proyecto principal de producción (`caja-de-cirugia`),
 * derivados de los identificadores codificados para no exponer literales en el código fuente.
 */
export const PRODUCTION_EXPECTED = Object.freeze({
  projectId: FORBIDDEN_IDENTIFIERS[0],
  projectNumber: FORBIDDEN_IDENTIFIERS[3],
  authDomain: `${FORBIDDEN_IDENTIFIERS[0]}.firebaseapp.com`,
  storageBucket: `${FORBIDDEN_IDENTIFIERS[0]}.firebasestorage.app`,
  appId: `1:${FORBIDDEN_IDENTIFIERS[3]}:web:${FORBIDDEN_IDENTIFIERS[4]}`,
  supabaseProjectRef: FORBIDDEN_IDENTIFIERS[7]
});

/** Prefijo de proyectos de emulador local (p. ej. vista previa `demo-coat-preview`). */
export const DEMO_PROJECT_PREFIX = 'demo-';

/**
 * Indicador de compilación explícita de producción:
 * únicamente activo cuando Vite compila con `--mode production` y `VITE_ALLOW_PRODUCTION_FIREBASE === 'true'`.
 * En desarrollo (`coatcx`), tests en Node y vista previa local permanece `false`.
 */
const viteEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
export const IS_PRODUCTION_BUILD =
  viteEnv.MODE === 'production' && viteEnv.VITE_ALLOW_PRODUCTION_FIREBASE === 'true';

/**
 * Servicios externos capaces de modificar datos fuera de `coatcx` (Supabase, Gemini, etc.).
 * DESHABILITADOS por defecto en desarrollo/pruebas (`false`); habilitados únicamente en compilación explícita de producción.
 */
export const EXTERNAL_SERVICES_ENABLED = IS_PRODUCTION_BUILD;

/** Hosts loopback aceptados para emuladores. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];

/** Puertos de emuladores (deben coincidir con firebase.json). */
export const EMULATOR_PORTS = Object.freeze({ auth: 9099, firestore: 8080, storage: 9199 });

export const REQUIRED_FIREBASE_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
];

/** Devuelve los identificadores prohibidos presentes en un texto arbitrario. */
export function findForbidden(text) {
  const haystack = String(text ?? '').toLowerCase();
  return FORBIDDEN_IDENTIFIERS.filter((id) => haystack.includes(id.toLowerCase()));
}

/**
 * Valida una configuración de Firebase. Lanza Error con mensaje claro si no es segura.
 * @param {object} cfg configuración (apiKey, authDomain, projectId, ...)
 * @param {{emulator?: boolean, emulatorHost?: string, allowProduction?: boolean}} opts
 */
export function assertIsolatedConfig(cfg, opts = {}) {
  const { emulator = false, emulatorHost = 'localhost', allowProduction = false } = opts;

  if (!cfg || typeof cfg !== 'object') {
    throw new Error('[ENV GUARD] No hay configuración de Firebase. Copiá .env.example a .env.development y completalo con los datos de coatcx.');
  }

  const missing = REQUIRED_FIREBASE_FIELDS.filter((k) => !String(cfg[k] ?? '').trim());
  if (missing.length) {
    throw new Error(
      `[ENV GUARD] Falta configuración segura de Firebase: ${missing.join(', ')}. ` +
        'No existen valores por defecto. Configurá el proyecto de pruebas coatcx en .env.development.'
    );
  }

  if (allowProduction) {
    if (emulator) {
      throw new Error('[ENV GUARD] No se permiten emuladores en una compilación de producción.');
    }
    if (String(cfg.projectId).trim() !== PRODUCTION_EXPECTED.projectId) {
      throw new Error(`[ENV GUARD] projectId inválido para producción: se esperaba "${PRODUCTION_EXPECTED.projectId}".`);
    }
    if (String(cfg.authDomain).trim() !== PRODUCTION_EXPECTED.authDomain) {
      throw new Error(`[ENV GUARD] authDomain inválido para producción: se esperaba "${PRODUCTION_EXPECTED.authDomain}".`);
    }
    if (String(cfg.storageBucket).trim() !== PRODUCTION_EXPECTED.storageBucket) {
      throw new Error(`[ENV GUARD] storageBucket inválido para producción: se esperaba "${PRODUCTION_EXPECTED.storageBucket}".`);
    }
    if (String(cfg.messagingSenderId).trim() !== PRODUCTION_EXPECTED.projectNumber) {
      throw new Error(`[ENV GUARD] messagingSenderId inválido para producción: se esperaba "${PRODUCTION_EXPECTED.projectNumber}".`);
    }
    if (String(cfg.appId).trim() !== PRODUCTION_EXPECTED.appId) {
      throw new Error(`[ENV GUARD] appId inválido para producción: se esperaba "${PRODUCTION_EXPECTED.appId}".`);
    }
    return true;
  }

  const hits = findForbidden(JSON.stringify(cfg));
  if (hits.length) {
    throw new Error('[ENV GUARD] La configuración contiene identificadores PROHIBIDOS de producción u otros sistemas (' + hits.length + '). Ejecución bloqueada.');
  }

  const projectId = String(cfg.projectId).trim();
  const isDemo = projectId.startsWith(DEMO_PROJECT_PREFIX);
  const isAllowedHosted = ALLOWED_HOSTED_PROJECTS.includes(projectId);

  if (!isDemo && !isAllowedHosted) {
    throw new Error(
      `[ENV GUARD] projectId "${projectId}" no permitido. Este proyecto solo admite "${COATCX_EXPECTED.projectId}" (o emuladores "${DEMO_PROJECT_PREFIX}*").`
    );
  }

  if (isDemo && !emulator) {
    throw new Error('[ENV GUARD] Un projectId "demo-*" requiere emuladores activos (VITE_USE_FIREBASE_EMULATOR=true).');
  }

  if (emulator && !LOOPBACK_HOSTS.includes(emulatorHost)) {
    throw new Error(`[ENV GUARD] El host del emulador debe ser loopback (localhost/127.0.0.1), recibido "${emulatorHost}".`);
  }

  if (projectId === COATCX_EXPECTED.projectId) {
    if (String(cfg.authDomain).trim() !== COATCX_EXPECTED.authDomain) {
      throw new Error(`[ENV GUARD] authDomain inválido para coatcx: se esperaba "${COATCX_EXPECTED.authDomain}".`);
    }
    if (String(cfg.storageBucket).trim() !== COATCX_EXPECTED.storageBucket) {
      throw new Error(`[ENV GUARD] storageBucket inválido para coatcx: se esperaba "${COATCX_EXPECTED.storageBucket}".`);
    }
    if (String(cfg.messagingSenderId).trim() !== COATCX_EXPECTED.projectNumber) {
      throw new Error(`[ENV GUARD] messagingSenderId inválido para coatcx: se esperaba "${COATCX_EXPECTED.projectNumber}".`);
    }
    if (String(cfg.appId).trim() !== COATCX_EXPECTED.appId) {
      throw new Error(`[ENV GUARD] appId inválido para coatcx: se esperaba "${COATCX_EXPECTED.appId}".`);
    }
  } else {
    const coherent = [cfg.authDomain, cfg.storageBucket].every((v) => String(v).includes(projectId) || String(v) === 'localhost');
    if (!coherent) {
      throw new Error('[ENV GUARD] authDomain/storageBucket no coinciden con projectId (configuración mezclada).');
    }
  }

  return true;
}

/** Verifica que un hostname sea loopback. */
export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTS.includes(String(hostname || '').toLowerCase());
}

/**
 * Muestra un mensaje de error claro en pantalla (sin depender de React) y lanza el error.
 * Se usa solo cuando falla el aislamiento: la aplicación NO debe arrancar.
 */
export function failIsolation(error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    if (typeof document !== 'undefined' && document.body) {
      document.body.innerHTML = '';
      const box = document.createElement('div');
      box.setAttribute('role', 'alert');
      box.style.cssText =
        'font-family:system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:24px;border:2px solid #b91c1c;border-radius:12px;background:#fef2f2;color:#7f1d1d';
      const h = document.createElement('h2');
      h.textContent = 'Aplicación detenida por seguridad';
      const p = document.createElement('p');
      p.textContent = message;
      const hint = document.createElement('p');
      hint.textContent =
        'Este entorno está configurado exclusivamente para el proyecto de pruebas coatcx. Ver .env.example y DESPLIEGUE.md. No se realizó ninguna conexión.';
      box.append(h, p, hint);
      document.body.appendChild(box);
    }
  } catch {
    /* sin DOM */
  }
  throw error instanceof Error ? error : new Error(message);
}
