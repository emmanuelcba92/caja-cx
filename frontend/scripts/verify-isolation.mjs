#!/usr/bin/env node
/**
 * Verificación de aislamiento y de compilación explícita de producción.
 *
 * Se ejecuta ANTES de `dev`, `build`, `build:production` y `test` (y con `--dist` sobre `dist`).
 * 100 % local: no realiza ninguna conexión de red ni usa credenciales privadas.
 *
 * Modos:
 *  - Modo desarrollo / pruebas (por defecto, `--mode development`):
 *    1. La configuración efectiva de Firebase es `coatcx` o emuladores `demo-*`.
 *    2. No hay claves de servicios externos (Supabase, Gemini) activas en desarrollo.
 *    3. No hay identificadores de producción en el código ni (con --dist) en el bundle de desarrollo.
 *    4. `.firebaserc` mantiene `default = "coatcx"`, `firebase.json` mantiene emuladores loopback y `firebase.production.json` apunta a `firestore.production.rules`.
 *    5. Los scripts de mantenimiento con referencias a producción están bloqueados.
 *    6. Ningún archivo, salvo `config.js`, inicializa Firebase directamente.
 *  - Modo compilación explícita de producción (`--mode production --allow-production` + `VITE_ALLOW_PRODUCTION_FIREBASE=true`):
 *    1. Valida que Firebase apunte exactamente a `caja-de-cirugia` sin emuladores.
 *    2. Valida que Supabase apunte al proyecto esperado (`qmjycvqcwerzbfsbbnla`) con clave pública `anon` (nunca `service_role`).
 *    3. Valida que `firebase.production.json` utilice `firestore.production.rules` y los sitios `coat-test` y `cajacx`.
 *    4. Con `--dist`, comprueba que el bundle compilado apunte al Firebase y Supabase de producción, sin referencias a `coatcx` ni credenciales privadas.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import {
  assertIsolatedConfig,
  findForbidden,
  ALLOWED_HOSTED_PROJECTS,
  COATCX_EXPECTED,
  PRODUCTION_EXPECTED,
  EMULATOR_PORTS,
  LOOPBACK_HOSTS,
  REQUIRED_FIREBASE_FIELDS
} from '../src/firebase/envGuard.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.firebase', 'emulator-data', 'coverage']);
// Archivos que pueden NOMBRAR identificadores de producción por diseño (la lista de bloqueo, configuración de hosting y sus tests/docs)
const ALLOWED_MENTIONS = new Set([
  'src/firebase/envGuard.js',
  'scripts/verify-isolation.mjs',
  'scripts/verify-hosted-site.mjs',
  'tests/isolation.test.mjs',
  'package-lock.json',
  'firebase.json',
  'firebase.production.json',
  // Solo lectura de PDFs públicos de consentimientos (URL GET); no escribe ni envía datos.
  'src/data/consentimientos.js',
  // Configuración de CORS del bucket de producción: archivo inerte, renombrado para que no se use por error.
  'cors.PRODUCCION-NO-USAR.json'
]);
const SCANNED_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|json|html|css|bat|ps1|yml|yaml|txt|rules)$/i;
const BLOCK_MARKER = '// ISOLATION-BLOCKED';
const EXTERNAL_SECRET_KEYS = ['VITE_GEMINI_API_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const ALLOWED_HOSTING_SITES = new Set(['coatcx', 'coat-test', 'cajacx']);
const PRIVATE_SECRET_PATTERNS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/i, /"private_key"\s*:/i, /firebase-adminsdk/i, /"role"\s*:\s*"service_role"/i];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(root, file) {
  return relative(root, file).split(sep).join('/');
}

function isBlockedScript(text) {
  const head = text.split(/\r?\n/).slice(0, 8).join('\n');
  return head.startsWith(BLOCK_MARKER) && /\bthrow new Error\(/.test(head);
}

function hasPrivateCredentials(text) {
  const str = String(text ?? '');
  if (PRIVATE_SECRET_PATTERNS.some((re) => re.test(str))) return true;
  // Detectar JWT de Supabase con rol service_role
  const jwtMatches = str.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  for (const jwt of jwtMatches) {
    try {
      const payload = Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8');
      if (/"role"\s*:\s*"service_role"/.test(payload)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Ejecuta todas las comprobaciones. Devuelve { errors, warnings, info }.
 * @param {{root?:string, mode?:string, dist?:boolean, allowProduction?:boolean, env?:Record<string,string>}} opts
 */
export function runChecks(opts = {}) {
  const root = opts.root ? resolve(opts.root) : ROOT;
  const mode = opts.mode || 'development';
  const errors = [];
  const warnings = [];
  const info = [];

  // ---- 1 y 2. Entorno efectivo ---------------------------------------------------------
  const env = opts.env ?? loadEnv(mode, root, 'VITE_');
  const allowProductionEnv = env.VITE_ALLOW_PRODUCTION_FIREBASE === 'true';
  const isExplicitProduction = mode === 'production' && (opts.allowProduction === true || allowProductionEnv);

  if (mode !== 'production' && (opts.allowProduction === true || allowProductionEnv)) {
    errors.push(
      `Entorno "${mode}": VITE_ALLOW_PRODUCTION_FIREBASE / --allow-production está prohibido fuera de "--mode production".`
    );
  }
  if (mode === 'production' && !allowProductionEnv) {
    errors.push(
      'Entorno "production": compilación bloqueada porque falta VITE_ALLOW_PRODUCTION_FIREBASE=true en .env.production.local.'
    );
  }

  const hasAnyFirebase = REQUIRED_FIREBASE_FIELDS.some((k) => env[`VITE_FIREBASE_${toEnvKey(k)}`]);
  if (!hasAnyFirebase) {
    if (isExplicitProduction) {
      errors.push('Entorno "production": faltan variables VITE_FIREBASE_* en .env.production.local.');
    } else {
      warnings.push(
        `Sin VITE_FIREBASE_* para el modo "${mode}": solo funcionará la Vista Previa (?preview=1). ` +
          'Para emuladores copiá .env.example a .env.development.'
      );
    }
  } else {
    const cfg = {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID
    };
    try {
      const isEmu = env.VITE_USE_FIREBASE_EMULATOR === 'true';
      assertIsolatedConfig(cfg, {
        emulator: isEmu,
        emulatorHost: env.VITE_EMULATOR_HOST || 'localhost',
        allowProduction: isExplicitProduction
      });
      info.push(
        isExplicitProduction
          ? `Entorno "production" explícito autorizado: proyecto principal ${cfg.projectId} (${cfg.authDomain}).`
          : isEmu
            ? `Entorno "${mode}": proyecto ${cfg.projectId} con emuladores en ${env.VITE_EMULATOR_HOST || 'localhost'}.`
            : `Entorno "${mode}": proyecto secundario de pruebas ${cfg.projectId} (${cfg.authDomain}).`
      );
    } catch (e) {
      errors.push(`Entorno "${mode}": ${e.message}`);
    }
  }

  if (isExplicitProduction) {
    const expectedSbUrl = `https://${PRODUCTION_EXPECTED.supabaseProjectRef}.supabase.co`;
    if (String(env.VITE_SUPABASE_URL || '').trim() !== expectedSbUrl) {
      errors.push(`Entorno "production": VITE_SUPABASE_URL debe ser "${expectedSbUrl}".`);
    }
    if (!String(env.VITE_SUPABASE_ANON_KEY || '').trim()) {
      errors.push('Entorno "production": falta VITE_SUPABASE_ANON_KEY.');
    }
    if (hasPrivateCredentials(JSON.stringify(env))) {
      errors.push('Entorno "production": se detectó una credencial privada (service_role o private_key) en las variables VITE_*.');
    } else {
      info.push(`Entorno "production": Supabase configurado (${expectedSbUrl}) sin credenciales privadas.`);
    }
  } else {
    for (const key of EXTERNAL_SECRET_KEYS) {
      if (env[key]) {
        errors.push(
          `Entorno "${mode}": ${key} está definida. Los servicios externos (Supabase/Gemini) deben permanecer deshabilitados en modo pruebas.`
        );
      }
    }
    for (const [k, v] of Object.entries(env)) {
      const hits = findForbidden(v);
      if (hits.length && !errors.some((x) => x.includes(k))) {
        errors.push(`Entorno "${mode}": ${k} contiene un identificador de producción.`);
      }
    }
  }

  // Otros archivos .env* del proyecto (modos no activos)
  if (!opts.env) {
    for (const name of readdirSync(root)) {
      if (!name.startsWith('.env') || name === '.env.example') continue;
      const text = readFileSync(join(root, name), 'utf8');
      if (hasPrivateCredentials(text)) {
        errors.push(`${name}: contiene credenciales privadas prohibidas (service_role o private_key).`);
      }
      if (!isExplicitProduction && findForbidden(text).length) {
        const loaded = isLoadedForMode(name, mode);
        if (loaded) {
          errors.push(`${name} contiene valores de PRODUCCIÓN (no se modificó). ES CARGADO por el modo activo.`);
        } else if (name === '.env.production' || name === '.env.production.local') {
          info.push(`${name}: configuración de producción preparada y aislada (no se carga en modo "${mode}").`);
        } else {
          warnings.push(`${name} contiene valores de PRODUCCIÓN (no se modificó). No se carga en este modo, pero conviene retirarlo del proyecto.`);
        }
      }
    }
  }

  // ---- 3, 5 y 6. Escaneo estático del código y configuración -----------------------------
  const files = walk(root).filter((f) => SCANNED_EXT.test(f));
  for (const file of files) {
    const r = rel(root, file);
    if (r.startsWith('dist/')) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (r !== 'scripts/verify-isolation.mjs' && hasPrivateCredentials(text)) {
      errors.push(`${r}: contiene credenciales privadas prohibidas.`);
    }
    const hits = findForbidden(text);
    if (hits.length) {
      if (ALLOWED_MENTIONS.has(r)) continue;
      if (isBlockedScript(text)) {
        info.push(`Script bloqueado (con referencias a producción): ${r}`);
        continue;
      }
      errors.push(`${r}: contiene ${hits.length} identificador(es) de producción y no está bloqueado ni permitido.`);
    }
    if (/\.(js|jsx|mjs)$/.test(r) && r.startsWith('src/') && r !== 'src/firebase/config.js') {
      if (/\binitializeApp\s*\(/.test(text)) errors.push(`${r}: inicializa Firebase directamente (solo src/firebase/config.js puede hacerlo).`);
      if (/\bgetAuth\s*\(/.test(text)) errors.push(`${r}: obtiene Auth directamente (usar createIsolatedSecondaryAuth o el auth de config.js).`);
    }
  }

  // ---- 4. firebase.json, firebase.production.json y .firebaserc --------------------------
  const fbJson = join(root, 'firebase.json');
  if (existsSync(fbJson)) {
    try {
      const j = JSON.parse(readFileSync(fbJson, 'utf8'));
      if (j.hosting) {
        const sites = Array.isArray(j.hosting) ? j.hosting : [j.hosting];
        if (sites.length === 0) {
          errors.push('firebase.json: hosting vacío.');
        }
        for (const h of sites) {
          if (!h.site || !ALLOWED_HOSTING_SITES.has(h.site)) {
            errors.push(`firebase.json: hosting.site="${h.site || ''}" no permitido.`);
          }
          if (h.public !== 'dist') {
            errors.push(`firebase.json: hosting.public="${h.public || ''}" debe ser "dist".`);
          }
        }
      }
      const em = j.emulators || {};
      for (const svc of Object.keys(EMULATOR_PORTS)) {
        if (!em[svc]) errors.push(`firebase.json: falta el emulador "${svc}".`);
        else {
          if (em[svc].port !== EMULATOR_PORTS[svc]) errors.push(`firebase.json: puerto de "${svc}" debe ser ${EMULATOR_PORTS[svc]}.`);
          if (!LOOPBACK_HOSTS.includes(em[svc].host)) errors.push(`firebase.json: host de "${svc}" debe ser loopback.`);
        }
      }
    } catch (e) {
      errors.push('firebase.json inválido: ' + e.message);
    }
  } else {
    errors.push('Falta firebase.json.');
  }

  const fbProdJson = join(root, 'firebase.production.json');
  if (existsSync(fbProdJson)) {
    try {
      const j = JSON.parse(readFileSync(fbProdJson, 'utf8'));
      const sites = Array.isArray(j.hosting) ? j.hosting : j.hosting ? [j.hosting] : [];
      const siteNames = sites.map((s) => s.site);
      if (!siteNames.includes('coat-test') || !siteNames.includes('cajacx')) {
        errors.push('firebase.production.json: debe configurar los sitios "coat-test" y "cajacx".');
      }
      if (j.firestore?.rules !== 'firestore.production.rules') {
        errors.push('firebase.production.json: firestore.rules debe apuntar a "firestore.production.rules" (nunca a firestore.rules de coatcx).');
      }
    } catch (e) {
      errors.push('firebase.production.json inválido: ' + e.message);
    }
  }

  const rc = join(root, '.firebaserc');
  if (existsSync(rc)) {
    try {
      const j = JSON.parse(readFileSync(rc, 'utf8'));
      const projects = j.projects || {};
      const defaultProj = String(projects.default || '');
      if (!defaultProj.startsWith('demo-') && !ALLOWED_HOSTED_PROJECTS.includes(defaultProj)) {
        errors.push(`.firebaserc: el proyecto por defecto ("default" = "${defaultProj}") debe ser coatcx o demo-*.`);
      }
      for (const [alias, id] of Object.entries(projects)) {
        const sId = String(id);
        const allowedDev = sId.startsWith('demo-') || ALLOWED_HOSTED_PROJECTS.includes(sId);
        const allowedProdAlias = alias === 'production' && sId === PRODUCTION_EXPECTED.projectId;
        if (!allowedDev && !allowedProdAlias) {
          errors.push(`.firebaserc: el proyecto "${alias}" = "${id}" no está permitido.`);
        }
      }
      if (j.targets) {
        for (const [proj, tCfg] of Object.entries(j.targets)) {
          if (proj !== PRODUCTION_EXPECTED.projectId) {
            errors.push(`.firebaserc: targets solo permitidos para "${PRODUCTION_EXPECTED.projectId}", encontrado "${proj}".`);
          } else {
            const hTargets = tCfg?.hosting || {};
            for (const siteList of Object.values(hTargets)) {
              for (const s of Array.isArray(siteList) ? siteList : []) {
                if (s !== 'coat-test' && s !== 'cajacx') {
                  errors.push(`.firebaserc: sitio de target "${s}" no permitido.`);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      errors.push('.firebaserc inválido: ' + e.message);
    }
  }

  // ---- bundle generado ----------------------------------------------------------------------
  if (opts.dist) {
    const dist = join(root, 'dist');
    if (!existsSync(dist)) {
      errors.push('--dist: no existe la carpeta dist.');
    } else {
      let scanned = 0;
      let foundProdProject = false;
      let foundProdSupabase = false;
      for (const file of walkAll(dist)) {
        if (!/\.(js|css|html|json|map|txt)$/i.test(file)) continue;
        scanned += 1;
        const text = readFileSync(file, 'utf8');
        if (hasPrivateCredentials(text)) {
          errors.push(`dist/${rel(dist, file)}: contiene credenciales privadas prohibidas.`);
        }
        if (isExplicitProduction) {
          if (
            text.includes(`VITE_FIREBASE_PROJECT_ID:"${PRODUCTION_EXPECTED.projectId}"`) ||
            text.includes(`VITE_FIREBASE_PROJECT_ID:\`${PRODUCTION_EXPECTED.projectId}\``) ||
            text.includes(PRODUCTION_EXPECTED.authDomain)
          ) {
            foundProdProject = true;
          }
          if (text.includes(`https://${PRODUCTION_EXPECTED.supabaseProjectRef}.supabase.co`)) {
            foundProdSupabase = true;
          }
          if (
            /VITE_FIREBASE_PROJECT_ID\s*:\s*[`"']coatcx[`"']/.test(text) ||
            text.includes('AIzaSyC3OUfV_GEPmXKkV8jznoGatBKNfbMVBKc')
          ) {
            errors.push(`dist/${rel(dist, file)}: el bundle compilado apunta al entorno de desarrollo coatcx en lugar de producción.`);
          }
          if (text.includes('930859241568') || text.toLowerCase().includes('cajacx-test')) {
            errors.push(`dist/${rel(dist, file)}: contiene referencias a otro sistema (cajacx-test).`);
          }
        } else {
          const hits = findForbidden(text).filter((h) => h !== 'qmjycvqcwerzbfsbbnla'); // PDF públicos de consentimientos (solo lectura)
          if (hits.length) errors.push(`dist/${rel(dist, file)}: contiene identificador(es) de producción: ${hits.join(', ')}`);
        }
      }
      if (isExplicitProduction) {
        if (!foundProdProject) {
          errors.push(`dist: el bundle compilado NO contiene el projectId de producción (${PRODUCTION_EXPECTED.projectId}).`);
        }
        if (!foundProdSupabase) {
          errors.push(`dist: el bundle compilado NO contiene la URL de Supabase esperada (${PRODUCTION_EXPECTED.supabaseProjectRef}.supabase.co).`);
        }
      }
      info.push(`dist: ${scanned} archivos escaneados (${isExplicitProduction ? 'modo producción' : 'modo desarrollo aislado'}).`);
    }
  }

  return { errors, warnings, info };
}

function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkAll(full, out);
    else out.push(full);
  }
  return out;
}

function toEnvKey(field) {
  return field.replace(/([A-Z])/g, '_$1').toUpperCase();
}

function isLoadedForMode(name, mode) {
  return [`.env`, `.env.local`, `.env.${mode}`, `.env.${mode}.local`].includes(name);
}

// ---- CLI ------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf('--mode');
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'development';
  const allowProduction = args.includes('--allow-production');
  const { errors, warnings, info } = runChecks({ mode, allowProduction, dist: args.includes('--dist') });
  info.forEach((m) => console.log(`[aislamiento] ok   ${m}`));
  warnings.forEach((m) => console.warn(`[aislamiento] AVISO ${m}`));
  if (errors.length) {
    errors.forEach((m) => console.error(`[aislamiento] ERROR ${m}`));
    console.error(`\n[aislamiento] FALLÓ: ${errors.length} problema(s). Ejecución detenida (no se realizó ninguna conexión).`);
    process.exit(1);
  }
  console.log(
    allowProduction && mode === 'production'
      ? '[aislamiento] OK: configuración y compilación de PRODUCCIÓN verificadas correctamente.'
      : '[aislamiento] OK: el entorno de desarrollo está aislado de producción.'
  );
}
