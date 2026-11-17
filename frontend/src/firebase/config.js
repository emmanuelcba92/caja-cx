import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { seedPreviewDataIfNeeded } from './previewSeed';
import { assertIsolatedConfig, failIsolation, isLoopbackHostname, EMULATOR_PORTS, IS_PRODUCTION_BUILD } from './envGuard';

// Detectar si estamos en entorno local exclusivamente
export const isLocalEnv =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Modo de Vista Previa Local: DESACTIVADO por defecto.
// Solo se habilita en localhost/127.0.0.1 cuando se solicita explícitamente (?preview=1, botón de vista previa o VITE_PREVIEW_MODE=true).
function resolveLocalPreviewMode() {
  if (!isLocalEnv) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '0') {
      sessionStorage.removeItem('coat_preview_mode');
      return false;
    }
    if (params.get('preview') === '1') {
      sessionStorage.setItem('coat_preview_mode', 'true');
      return true;
    }
    if (sessionStorage.getItem('coat_preview_mode') === 'true') {
      return true;
    }
  } catch {}
  return import.meta.env.VITE_PREVIEW_MODE === 'true';
}

export const isPreviewMode = resolveLocalPreviewMode();

// Bloqueo estricto de red hacia Firebase y servicios externos durante la Vista Previa Local
const BLOCKED_EXTERNAL_HOSTS = [
  'googleapis.com',
  'firebaseio.com',
  'firebasestorage.app',
  'firebaseapp.com',
  'gstatic.com/firebasejs',
  'supabase.co'
];

if (isPreviewMode && typeof window !== 'undefined') {
  seedPreviewDataIfNeeded();

  const shouldBlockUrl = (urlStr) => {
    const str = String(urlStr || '').toLowerCase();
    return BLOCKED_EXTERNAL_HOSTS.some((host) => str.includes(host));
  };

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (shouldBlockUrl(url)) {
        console.info('[Vista Previa Local] Conexión externa bloqueada:', url);
        return new Response(JSON.stringify({ previewBlocked: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, init);
    };
  }

  if (typeof window.XMLHttpRequest !== 'undefined') {
    const origOpen = window.XMLHttpRequest.prototype.open;
    const origSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._previewBlocked = shouldBlockUrl(url);
      if (this._previewBlocked) {
        return origOpen.call(this, method, 'data:application/json,{}', ...rest);
      }
      return origOpen.call(this, method, url, ...rest);
    };
    window.XMLHttpRequest.prototype.send = function (body) {
      if (this._previewBlocked) {
        return;
      }
      return origSend.call(this, body);
    };
  }
}

// =====================================================================
// Configuración de Firebase — AISLAMIENTO ETAPA 1 (entorno coatcx)
//  - SIN valores por defecto: si falta configuración segura, la app se detiene.
//  - Solo se admite el proyecto secundario de pruebas `coatcx` (o emuladores `demo-*` / vista previa).
//  - Todos los identificadores de producción y de otros sistemas están bloqueados.
// =====================================================================
const env = import.meta.env;
const emulatorRequested = env.VITE_USE_FIREBASE_EMULATOR === 'true';
const emulatorHost = env.VITE_EMULATOR_HOST || 'localhost';
const useEmulators = isPreviewMode || emulatorRequested;

// Configuración ficticia aislada para la Vista Previa Local (sin red)
const previewFirebaseConfig = {
  apiKey: 'AIzaSyDummyPreviewLocalOnlyKey000000000',
  authDomain: 'localhost',
  projectId: 'demo-coat-preview',
  storageBucket: 'demo-coat-preview.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000'
};

// Configuración tomada EXCLUSIVAMENTE de variables de entorno (sin fallback)
const envFirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export const firebaseConfig = isPreviewMode ? previewFirebaseConfig : envFirebaseConfig;

// Endpoints de emulador (la vista previa usa puertos loopback inertes)
const emulatorEndpoints = isPreviewMode
  ? { host: '127.0.0.1', auth: 59998, firestore: 59999, storage: 59997 }
  : { host: emulatorHost, ...EMULATOR_PORTS };

// --- Guardia de arranque: se ejecuta ANTES de initializeApp ---
try {
  if (useEmulators && !isLoopbackHostname(emulatorEndpoints.host)) {
    throw new Error(`[ENV GUARD] El host del emulador debe ser loopback, recibido "${emulatorEndpoints.host}".`);
  }
  assertIsolatedConfig(firebaseConfig, {
    emulator: useEmulators,
    emulatorHost: emulatorEndpoints.host,
    allowProduction: IS_PRODUCTION_BUILD
  });
} catch (guardError) {
  failIsolation(guardError);
}

export const USE_LOCAL_DB = false; // true = localStorage local, false = Firestore
export const isTestEnv = isLocalEnv && (USE_LOCAL_DB || isPreviewMode);
export const LOCAL_API_URL = 'http://localhost:5001';

// Initialize Firebase (solo con configuración ya validada)
const app = initializeApp(firebaseConfig);

// Services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

const authEmulatorUrl = `http://${emulatorEndpoints.host}:${emulatorEndpoints.auth}`;

// Conexión a emuladores si corresponde (vista previa o VITE_USE_FIREBASE_EMULATOR=true)
if (useEmulators) {
  try {
    if (!globalThis.__COAT_EMULATORS_CONNECTED__) {
      connectFirestoreEmulator(db, emulatorEndpoints.host, emulatorEndpoints.firestore);
      connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
      connectStorageEmulator(storage, emulatorEndpoints.host, emulatorEndpoints.storage);
      globalThis.__COAT_EMULATORS_CONNECTED__ = true;
      console.info(`[Firebase] Emuladores conectados (${emulatorEndpoints.host}) | proyecto: ${firebaseConfig.projectId}`);
    }
  } catch (connectError) {
    failIsolation(new Error('[ENV GUARD] No se pudo conectar a los emuladores de Firebase: ' + connectError.message));
  }
} else {
  console.info(`[Firebase] Conectado | proyecto: ${firebaseConfig.projectId}`);
}

/**
 * Crea una instancia SECUNDARIA de Auth (p. ej. alta de usuarios sin cerrar la sesión del admin)
 * usando exclusivamente la configuración ya validada de `app.options`.
 */
export function createIsolatedSecondaryAuth(name) {
  assertIsolatedConfig(app.options, {
    emulator: useEmulators,
    emulatorHost: emulatorEndpoints.host,
    allowProduction: IS_PRODUCTION_BUILD
  });
  const secondaryApp = initializeApp(app.options, name);
  const secondaryAuth = getAuth(secondaryApp);
  if (useEmulators) {
    connectAuthEmulator(secondaryAuth, authEmulatorUrl, { disableWarnings: true });
  }
  return { app: secondaryApp, auth: secondaryAuth };
}

export default app;
