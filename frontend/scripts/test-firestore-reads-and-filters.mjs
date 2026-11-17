#!/usr/bin/env node
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { loadEnv } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = loadEnv('development', ROOT, 'VITE_');

const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(cfg, 'test-read-access');
const auth = getAuth(app);
const db = getFirestore(app);

// Importar la lógica exacta de filtrado del frontend
function extractDoctorKeyWords(str) {
  if (!str || typeof str !== 'string') return [];
  const normalized = str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const words = normalized
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2);
  const stopWords = new Set([
    'dr', 'dra', 'lic', 'med', 'prof', 'doctor', 'doctora',
    'ficticio', 'ficticia', 'demo', 'prueba', 'pruebas', 'test',
    'residente', 'admin', 'coat', 'com', 'ar', 'local'
  ]);
  return words.filter(w => !stopWords.has(w));
}

function matchesName(userWords, targetStr) {
  if (userWords.length === 0 || !targetStr) return false;
  const targetWords = extractDoctorKeyWords(targetStr);
  if (targetWords.length === 0) return false;

  const intersection = targetWords.filter(w => userWords.includes(w));
  if (intersection.length === 0) return false;

  if (targetWords.length >= 2 && userWords.length >= 2 && intersection.length === 1) {
    return false;
  }
  return true;
}

function isSurgeryCreatedOrAssignedToUser(s, user, professionals = []) {
  if (!s || !user) return false;
  const userEmail = (user.email || '').toLowerCase().trim();
  const userRole = user.rol;

  // 1. Identificador directo de profesional (ID canónico)
  const userProfId = user.professionalId || (professionals || []).find(p => p.email && p.email.toLowerCase().trim() === userEmail)?.id;
  if (userProfId && s.professionalId) {
    if (s.professionalId === userProfId) return true;
    if (userRole === 'Medico' || userRole === 'Directora') {
      const emailProf = (s.emailProfesional || '').toLowerCase().trim();
      if (emailProf && emailProf !== userEmail) return false;
    }
  }

  // 2. Coincidencia exacta por email
  if (userEmail) {
    const emailProf = (s.emailProfesional || '').toLowerCase().trim();
    if (emailProf && emailProf === userEmail) return true;

    const cb = (s.createdBy || '').toLowerCase().trim();
    if (cb && cb === userEmail) return true;

    if (emailProf && emailProf !== userEmail && (userRole === 'Medico' || userRole === 'Directora')) {
      return false;
    }
  }

  // 3. Username exacto en createdBy o creador
  const username = (user.username || (userEmail ? userEmail.split('@')[0] : '')).toLowerCase().trim();
  const genericUsernames = new Set(['admin', 'secre', 'sistema', 'usuario', 'user', 'test', 'coat']);
  if (username && !genericUsernames.has(username)) {
    const cb = (s.createdBy || '').toLowerCase().trim();
    if (cb && cb === username) return true;
    const creador = (s.creador || '').toLowerCase().trim();
    if (creador && creador === username) return true;
  }

  // 4. Coincidencia canónica por nombre
  const userWords = extractDoctorKeyWords(user.nombre);
  if (userWords.length > 0) {
    if (s.nombreProfesional && matchesName(userWords, s.nombreProfesional)) return true;
    if (s.profesional && matchesName(userWords, s.profesional)) return true;
    if (userRole === 'Residente' && s.residente && matchesName(userWords, s.residente)) return true;
    if (s.creador && matchesName(userWords, s.creador)) return true;
  }

  return false;
}

function filterSurgeriesForView(surgeries, user, tab, professionals = []) {
  if (!surgeries || !user) return [];
  if (user.rol === 'Admin') {
    return surgeries;
  }
  if (user.rol === 'Directora') {
    if (tab === 'Solicitud') {
      return surgeries.filter(s => isSurgeryCreatedOrAssignedToUser(s, user, professionals));
    }
    if (tab === 'Auditoría') {
      return surgeries; // Ve todas para auditar
    }
    return surgeries;
  }
  if (user.rol === 'Medico' || user.rol === 'Residente') {
    return surgeries.filter(s => isSurgeryCreatedOrAssignedToUser(s, user, professionals));
  }
  return surgeries;
}

async function runTests() {
  console.log('================================================================');
  console.log('PRUEBAS DE ACCESO DIRECTO A FIRESTORE Y FILTRADO POR VISTA (coatcx)');
  console.log('================================================================\n');

  // Primero obtener la colección completa con Admin
  await signInWithEmailAndPassword(auth, 'admin.test@pruebas.coat.local', 'TestCoat2026!Adm');
  const snapOrders = await getDocs(collection(db, 'ordenes_internacion'));
  const allOrders = [];
  snapOrders.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
  console.log(`[Base coatcx] Total de órdenes en ordenes_internacion: ${allOrders.length}`);
  allOrders.forEach(o => {
    console.log(`  - ${o.id}: Paciente="${o.paciente}", Profesional="${o.profesional}", emailProf="${o.emailProfesional}", createdBy="${o.createdBy}"`);
  });

  const snapProfs = await getDocs(collection(db, 'profesionales'));
  const professionals = [];
  snapProfs.forEach(d => professionals.push({ id: d.id, ...d.data() }));
  await signOut(auth);

  // Casos de prueba por usuario
  const testCases = [
    {
      email: 'medico1.test@pruebas.coat.local',
      pass: 'TestCoat2026!Med1',
      role: 'Medico',
      nombre: 'Dr. Marcos Ibáñez (Ficticio)',
      professionalId: 'test_prof_1',
      expectedSolicitudes: ['PatfBAY9ku5nbiL7B4Bn', 'test_ord_1', 'test_ord_3'],
      forbiddenSolicitudes: ['test_ord_2', 'test_ord_4', 'test_ord_5']
    },
    {
      email: 'medico2.test@pruebas.coat.local',
      pass: 'TestCoat2026!Med2',
      role: 'Medico',
      nombre: 'Dra. Clara Sosa (Ficticia)',
      professionalId: 'test_prof_2',
      expectedSolicitudes: ['test_ord_2', 'test_ord_4'],
      forbiddenSolicitudes: ['test_ord_1', 'test_ord_3', 'test_ord_5', 'PatfBAY9ku5nbiL7B4Bn']
    },
    {
      email: 'direccion.test@pruebas.coat.local',
      pass: 'TestCoat2026!Dir',
      role: 'Directora',
      nombre: 'Dra. Elena Vega (Ficticia)',
      professionalId: 'test_prof_dir',
      expectedSolicitudes: ['test_ord_5'],
      forbiddenSolicitudes: ['test_ord_1', 'test_ord_2', 'test_ord_3', 'test_ord_4', 'PatfBAY9ku5nbiL7B4Bn'],
      expectedAuditoriaCount: allOrders.length
    },
    {
      email: 'admin.test@pruebas.coat.local',
      pass: 'TestCoat2026!Adm',
      role: 'Admin',
      nombre: 'Admin Prueba Ficticio',
      professionalId: null,
      expectedSolicitudes: allOrders.map(o => o.id),
      forbiddenSolicitudes: [],
      expectedAuditoriaCount: allOrders.length
    },
    {
      email: 'intruso.test@pruebas.coat.local',
      pass: 'TestCoat2026!Int',
      role: 'unauthorized',
      nombre: 'Intruso Ficticio',
      professionalId: null,
      directReadAllowed: false
    }
  ];

  let passedAll = true;

  for (const tc of testCases) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`USUARIO: ${tc.email} (${tc.role})`);
    console.log(`----------------------------------------------------------------`);

    try {
      await signInWithEmailAndPassword(auth, tc.email, tc.pass);
    } catch (e) {
      console.error(`Error de login para ${tc.email}:`, e.message);
      passedAll = false;
      continue;
    }

    // 1. Acceso Directo a Firestore
    let directFirestoreAllowed = false;
    let directDocsCount = 0;
    try {
      const snap = await getDocs(collection(db, 'ordenes_internacion'));
      directFirestoreAllowed = true;
      directDocsCount = snap.size;
    } catch (fsErr) {
      directFirestoreAllowed = false;
    }

    if (tc.role === 'unauthorized') {
      if (!directFirestoreAllowed) {
        console.log(`[PASS] Acceso directo Firestore: DENEGADO (Correcto: usuario no autorizado no puede leer colección).`);
      } else {
        console.error(`[FAIL] Acceso directo Firestore: PERMITIDO (Error: usuario no autorizado pudo leer colección).`);
        passedAll = false;
      }
      await signOut(auth);
      continue;
    } else {
      console.log(`[INFO] Acceso directo Firestore: ${directFirestoreAllowed ? 'PERMITIDO (' + directDocsCount + ' docs)' : 'DENEGADO'}`);
    }

    // 2. Filtrado en vista "Solicitudes"
    const userObj = {
      email: tc.email,
      rol: tc.role,
      nombre: tc.nombre,
      professionalId: tc.professionalId
    };

    const solicitudesVisibles = filterSurgeriesForView(allOrders, userObj, 'Solicitud', professionals);
    const visibleIds = solicitudesVisibles.map(o => o.id);
    console.log(`[Vista Solicitudes] Órdenes visibles (${visibleIds.length}):`, visibleIds);

    // Verificar órdenes esperadas
    const missingExpected = tc.expectedSolicitudes.filter(id => !visibleIds.includes(id));
    if (missingExpected.length === 0) {
      console.log(`[PASS] Solicitudes propias presentes: OK (${tc.expectedSolicitudes.join(', ')})`);
    } else {
      console.error(`[FAIL] Faltan solicitudes propias:`, missingExpected);
      passedAll = false;
    }

    // Verificar órdenes prohibidas (ajenas)
    const leakedForbidden = tc.forbiddenSolicitudes.filter(id => visibleIds.includes(id));
    if (leakedForbidden.length === 0) {
      console.log(`[PASS] Cero exposición de solicitudes ajenas: OK`);
    } else {
      console.error(`[FAIL] ALERTA: Solicitudes ajenas expuestas en la vista!:`, leakedForbidden);
      passedAll = false;
    }

    // 3. Si es Dirección Médica o Admin, verificar vista "Auditoría"
    if (tc.role === 'Directora' || tc.role === 'Admin') {
      const auditoriaVisibles = filterSurgeriesForView(allOrders, userObj, 'Auditoría', professionals);
      console.log(`[Vista Auditoría] Órdenes visibles (${auditoriaVisibles.length}/${tc.expectedAuditoriaCount})`);
      if (auditoriaVisibles.length === tc.expectedAuditoriaCount) {
        console.log(`[PASS] Auditoría conserva acceso al 100% de las órdenes para revisión.`);
      } else {
        console.error(`[FAIL] Auditoría no muestra todas las órdenes.`);
        passedAll = false;
      }
    }

    await signOut(auth);
  }

  console.log('\n================================================================');
  if (passedAll) {
    console.log('RESULTADO FINAL: TODAS LAS VERIFICACIONES PASARON EXITOSAMENTE.');
  } else {
    console.error('RESULTADO FINAL: HUBO FALLOS EN LAS VERIFICACIONES.');
  }
  console.log('================================================================');
  process.exit(passedAll ? 0 : 1);
}

runTests().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
