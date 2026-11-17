#!/usr/bin/env node
/**
 * Script de carga de usuarios y datos 100 % ficticios en `coatcx` (Etapa 1).
 *
 * POR DEFECTO CORRE EN MODO `--dry-run` (NO realiza llamadas ni escrituras en Firebase).
 * Para ejecutarlo contra `coatcx` (solo cuando el usuario lo autorice explícitamente):
 *   node scripts/seed-coatcx-fictitious.mjs --execute
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { assertIsolatedConfig, COATCX_EXPECTED } from '../src/firebase/envGuard.js';
import {
  TARGET_TEST_PROJECT,
  FICTITIOUS_USERS,
  FICTITIOUS_AUTHORIZED_EMAILS,
  FICTITIOUS_ROLES,
  FICTITIOUS_PROFESIONALES,
  FICTITIOUS_PACIENTES,
  FICTITIOUS_ORDENES,
  FICTITIOUS_CAJA,
  FICTITIOUS_CAJA_COMENTARIOS
} from './fictitious-test-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function buildSeedSummary() {
  return {
    targetProject: TARGET_TEST_PROJECT,
    authUsers: Object.values(FICTITIOUS_USERS).map((u) => ({ email: u.email, role: u.role })),
    collections: {
      roles: FICTITIOUS_ROLES.map((r) => r.id),
      authorized_emails: FICTITIOUS_AUTHORIZED_EMAILS.map((a) => `${a.id} (${a.role})`),
      profesionales: FICTITIOUS_PROFESIONALES.map((p) => p.id),
      pacientes: FICTITIOUS_PACIENTES.map((p) => p.id),
      ordenes_internacion: FICTITIOUS_ORDENES.map((o) => `${o.id} [${o.tipoProcedimiento}/${o.estado}]`),
      caja: FICTITIOUS_CAJA.map((c) => c.id),
      caja_comentarios: FICTITIOUS_CAJA_COMENTARIOS.map((c) => c.id)
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  const env = loadEnv('development', ROOT, 'VITE_');
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };

  assertIsolatedConfig(cfg, { emulator: false });
  if (cfg.projectId !== COATCX_EXPECTED.projectId) {
    throw new Error(`[seed-coatcx] Bloqueado: este script solo puede apuntar a "${COATCX_EXPECTED.projectId}".`);
  }

  const summary = buildSeedSummary();
  if (!execute) {
    console.log('[seed-coatcx] DRY-RUN (sin conexión ni escrituras en Firebase).');
    console.log(JSON.stringify(summary, null, 2));
    console.log('[seed-coatcx] Para ejecutar cuando esté autorizado: node scripts/seed-coatcx-fictitious.mjs --execute');
    return;
  }

  const { initializeApp, deleteApp } = await import('firebase/app');
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import('firebase/auth');
  const { getFirestore, doc, getDoc, setDoc } = await import('firebase/firestore');

  const app = initializeApp(cfg, 'seed-coatcx');
  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1) Crear o verificar las 8 cuentas ficticias en Firebase Authentication de coatcx (sin sobrescribir existentes)
  const uidByKey = {};
  for (const [key, u] of Object.entries(FICTITIOUS_USERS)) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, u.email, u.password);
      uidByKey[key] = cred.user.uid;
      console.log(`[seed-coatcx] Auth creado: ${u.email} (uid=${cred.user.uid})`);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, u.email, u.password);
        uidByKey[key] = cred.user.uid;
        console.log(`[seed-coatcx] Auth ya existente (se conserva): ${u.email} (uid=${cred.user.uid})`);
      } else {
        throw e;
      }
    }
    await signOut(auth);
  }

  // 2) Bootstrap inicial de `authorized_emails/admin.test@pruebas.coat.local` vía API administrativa de Firebase CLI
  //    (solo si no existe todavía), para que las nuevas reglas reconozcan a `admin.test@pruebas.coat.local` como admin.
  const { createRequire } = await import('node:module');
  const requireCjs = createRequire(import.meta.url);
  const apiv2 = requireCjs('C:/Users/Emmanuel/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2.js');
  const cliAuth = requireCjs('C:/Users/Emmanuel/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
  const acc = cliAuth.getGlobalDefaultAccount();
  cliAuth.setRefreshToken(acc.tokens.refresh_token);
  const fsClient = new apiv2.Client({ urlPrefix: 'https://firestore.googleapis.com/v1', auth: true });
  const adminDocPath = `/projects/coatcx/databases/(default)/documents/authorized_emails/${encodeURIComponent(FICTITIOUS_USERS.admin.docId)}`;
  try {
    await fsClient.get(adminDocPath);
    console.log(`[seed-coatcx] Bootstrap admin ya existe en authorized_emails (se conserva).`);
  } catch (err) {
    if (err.status === 404) {
      await fsClient.patch(adminDocPath, {
        fields: {
          email: { stringValue: FICTITIOUS_USERS.admin.email },
          username: { stringValue: FICTITIOUS_USERS.admin.username },
          role: { stringValue: 'admin' },
          profesionalName: { stringValue: FICTITIOUS_USERS.admin.profesionalName },
          professionalId: { nullValue: null },
          isFictitiousTest: { booleanValue: true },
          createdBy: { stringValue: 'seed-coatcx-fictitious' }
        }
      });
      console.log(`[seed-coatcx] Bootstrap inicial creado: authorized_emails/${FICTITIOUS_USERS.admin.docId}`);
    } else {
      throw err;
    }
  }

  // 3) Iniciar sesión como admin.test y sembrar únicamente documentos que NO existan (sin sobrescribir nada)
  await signInWithEmailAndPassword(auth, FICTITIOUS_USERS.admin.email, FICTITIOUS_USERS.admin.password);

  const seedColWithoutOverwrite = async (colName, items) => {
    let createdCount = 0;
    let skippedCount = 0;
    for (const item of items) {
      const { id, ...data } = item;
      const ref = doc(db, colName, id);
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        skippedCount++;
        console.log(`[seed-coatcx] Preserva existente sin sobrescribir: ${colName}/${id}`);
        continue;
      }
      await setDoc(ref, { ...data, updatedAt: new Date().toISOString() });
      createdCount++;
    }
    console.log(`[seed-coatcx] Firestore ${colName}: ${createdCount} creado(s), ${skippedCount} preservado(s) sin tocar.`);
  };

  await seedColWithoutOverwrite('roles', FICTITIOUS_ROLES);
  await seedColWithoutOverwrite('authorized_emails', FICTITIOUS_AUTHORIZED_EMAILS);
  await seedColWithoutOverwrite('profesionales', FICTITIOUS_PROFESIONALES);
  await seedColWithoutOverwrite('pacientes', FICTITIOUS_PACIENTES);
  await seedColWithoutOverwrite('ordenes_internacion', FICTITIOUS_ORDENES);
  await seedColWithoutOverwrite('caja', FICTITIOUS_CAJA);
  await seedColWithoutOverwrite('caja_comentarios', FICTITIOUS_CAJA_COMENTARIOS);
  await seedColWithoutOverwrite('audit_logs', [
    {
      id: 'test_audit_1',
      userId: uidByKey.admin,
      userEmail: FICTITIOUS_USERS.admin.email,
      action: 'SEED_INIT',
      details: 'Evento ficticio de prueba en coatcx',
      isFictitiousTest: true
    }
  ]);
  await seedColWithoutOverwrite('reminders', [
    {
      id: 'rem_1',
      text: 'Recordatorio ficticio de prueba en coatcx',
      completed: false,
      isFictitiousTest: true
    }
  ]);
  await signOut(auth);

  // Sembrar nota propia de Médico 1 y Médico 2 para pruebas cruzadas T16
  await signInWithEmailAndPassword(auth, FICTITIOUS_USERS.medico1.email, FICTITIOUS_USERS.medico1.password);
  await seedColWithoutOverwrite('notes', [
    {
      id: 'note_med1',
      userId: uidByKey.medico1,
      title: 'Nota propia Médico 1 (Ficticia)',
      content: 'Contenido ficticio Médico 1',
      isFictitiousTest: true
    }
  ]);
  await signOut(auth);

  await signInWithEmailAndPassword(auth, FICTITIOUS_USERS.medico2.email, FICTITIOUS_USERS.medico2.password);
  await seedColWithoutOverwrite('notes', [
    {
      id: 'note_med2',
      userId: uidByKey.medico2,
      title: 'Nota propia Médico 2 (Ficticia)',
      content: 'Contenido ficticio Médico 2',
      isFictitiousTest: true
    }
  ]);
  await signOut(auth);

  await deleteApp(app);
  console.log('[seed-coatcx] Carga ficticia completada en coatcx.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[seed-coatcx] ERROR:', err.message);
    process.exit(1);
  });
}
