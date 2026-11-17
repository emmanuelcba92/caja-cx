import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbidden } from '../src/firebase/envGuard.js';
import {
  FICTITIOUS_USERS,
  FICTITIOUS_AUTHORIZED_EMAILS,
  FICTITIOUS_PROFESIONALES,
  FICTITIOUS_PACIENTES,
  FICTITIOUS_ORDENES,
  FICTITIOUS_CAJA,
  emailToAuthDocId
} from '../scripts/fictitious-test-data.mjs';
import { buildSeedSummary } from '../scripts/seed-coatcx-fictitious.mjs';
import { runSimulatedTestMatrix } from '../scripts/run-coatcx-role-tests.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rulesSource = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');

test('firestore.rules: no utiliza métodos JS incompatibles ni referencias a colecciones inexistentes', () => {
  // No debe contener métodos de JavaScript inexistentes en CEL o el comodín abierto
  assert.doesNotMatch(rulesSource, /\.toLowerCase\s*\(/);
  assert.doesNotMatch(rulesSource, /\.toUpperCase\s*\(/);
  assert.doesNotMatch(rulesSource, /\.includes\s*\(/);
  assert.doesNotMatch(rulesSource, /\.startsWith\s*\(/);
  // Tampoco debe usar .lower() ni .replace() (pedido explícitamente evitar métodos incompatibles/frágiles)
  assert.doesNotMatch(rulesSource, /\.lower\s*\(/);
  assert.doesNotMatch(rulesSource, /\.replace\s*\(/);
  // No debe referenciar la colección inexistente `profiles` ni correos reales hardcodeados
  assert.doesNotMatch(rulesSource, /\/profiles\//);
  assert.doesNotMatch(rulesSource, /emmanuel\.ag92|egomez@coat/);
  // La regla comodín final debe bloquear por defecto
  assert.match(rulesSource, /match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
});

test('firestore.rules: incluye guardas anti-elusión (createdBy, emailProfesional, tipoProcedimiento, userId)', () => {
  assert.match(rulesSource, /function hasValidOrderCreator/);
  assert.match(rulesSource, /function preservesOrderOwnershipAndType/);
  assert.match(rulesSource, /function medicoResidenteSafeOrderUpdate/);
  assert.match(rulesSource, /request\.resource\.data\.createdBy == resource\.data\.createdBy/);
  assert.match(rulesSource, /request\.resource\.data\.userId == resource\.data\.userId/);
});

test('datos ficticios: cubren los 6 roles, son 100 % sintéticos y respetan el formato de docId', () => {
  const allJson = JSON.stringify({
    FICTITIOUS_USERS,
    FICTITIOUS_AUTHORIZED_EMAILS,
    FICTITIOUS_PROFESIONALES,
    FICTITIOUS_PACIENTES,
    FICTITIOUS_ORDENES,
    FICTITIOUS_CAJA
  });
  assert.deepEqual(findForbidden(allJson), []);

  const rolesCovered = new Set(FICTITIOUS_AUTHORIZED_EMAILS.map((u) => u.role));
  for (const r of ['admin', 'direccion_medica', 'secre', 'medico', 'residente', 'secre_estudios']) {
    assert.ok(rolesCovered.has(r), `Falta el rol ${r} en FICTITIOUS_AUTHORIZED_EMAILS`);
  }

  for (const u of Object.values(FICTITIOUS_USERS)) {
    assert.equal(u.docId, emailToAuthDocId(u.email));
    assert.match(u.email, /@pruebas\.coat\.local$/);
  }

  const summary = buildSeedSummary();
  assert.equal(summary.targetProject, 'coatcx');
  assert.equal(summary.authUsers.length, 8);
});

test('matriz T01–T17: todos los accesos permitidos y denegados (incluidos casos anti-elusión) se cumplen', () => {
  const results = runSimulatedTestMatrix();
  assert.equal(results.length, 17);
  assert.ok(results.every((r) => r.status === 'PASS'));
});

test('SurgeryApp.jsx: plantillas personales incluyen userId y órdenes nuevas aseguran createdBy=email conservando nombre visible', () => {
  const surgeryAppSource = readFileSync(join(ROOT, 'src', 'SurgeryApp.jsx'), 'utf8');

  // 1) handleSaveCustomTemplate debe incluir userId junto a userEmail
  assert.match(surgeryAppSource, /const newTemplate = \{\s*name: newTemplateName\.trim\(\),\s*userId: userUid,\s*userEmail: userKey,/);

  // 2) Creación de órdenes debe enviar createdBy: creatorEmail (email autenticado) y conservar creador + profesional + nombreProfesional visibles
  assert.match(surgeryAppSource, /const creatorEmail = \(authUser\?\.email \|\| currentUser\?\.email \|\| ''\)\.toLowerCase\(\)\.trim\(\);/);
  assert.match(surgeryAppSource, /createdBy: creatorEmail,\s*creador: creatorDisplayName,/);
  assert.match(surgeryAppSource, /profesional: effectiveNombreProf,\s*nombreProfesional: effectiveNombreProf,\s*emailProfesional: effectiveEmailProf,/);
  // Al leer de Firestore debe priorizar orden.creador para el nombre visible sin perder createdBy
  assert.match(surgeryAppSource, /createdBy: \(orden\.createdBy \|\| ''\)\.toLowerCase\(\)\.trim\(\),\s*creador: orden\.creador \|\| orden\.createdBy \|\| 'Sistema',/);
});

test('SurgeryApp.jsx: filtrado robusto por identidad del profesional evita exposición de solicitudes ajenas y preserva Auditoría', () => {
  const surgeryAppSource = readFileSync(join(ROOT, 'src', 'SurgeryApp.jsx'), 'utf8');

  // isSurgeryCreatedOrAssignedToUser debe usar validación canónica de palabras clave y descartar emails ajenos
  assert.match(surgeryAppSource, /isSurgeryCreatedOrAssignedToUser\s*=\s*\(s,\s*user\)\s*=>/);
  assert.match(surgeryAppSource, /emailProf && emailProf !== userEmail/);
  assert.match(surgeryAppSource, /userProfId && s\.professionalId/);

  // getFilteredSurgeries debe filtrar Solicitudes por usuario propio y permitir Auditoría completa para Directora/Admin
  assert.match(surgeryAppSource, /filtered = surgeries\.filter\(s => isSurgeryCreatedOrAssignedToUser\(s, currentUser\)\);/);
});
