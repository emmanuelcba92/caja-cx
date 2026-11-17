import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadSuperAdminChecker() {
  const src = readFileSync(resolve(ROOT, 'src/context/AuthContext.jsx'), 'utf8');
  const emailsMatch = src.match(/const SUPER_ADMIN_EMAILS\s*=\s*(\[[^\]]+\]);/);
  const fnMatch = src.match(/const isSuperAdminEmail\s*=\s*\(email\)\s*=>\s*([^;]+);/);
  assert.ok(emailsMatch, 'SUPER_ADMIN_EMAILS debe existir en AuthContext.jsx');
  assert.ok(fnMatch, 'isSuperAdminEmail debe existir en AuthContext.jsx');

  const context = vm.createContext({});
  vm.runInContext(
    `const SUPER_ADMIN_EMAILS = ${emailsMatch[1]};
     const isSuperAdminEmail = (email) => ${fnMatch[1]};
     globalThis.SUPER_ADMIN_EMAILS = SUPER_ADMIN_EMAILS;
     globalThis.isSuperAdminEmail = isSuperAdminEmail;`,
    context
  );
  return {
    SUPER_ADMIN_EMAILS: context.SUPER_ADMIN_EMAILS,
    isSuperAdminEmail: context.isSuperAdminEmail,
  };
}

test('AuthContext restringe SUPER_ADMIN_EMAILS exclusivamente a egomez@coat.com.ar y emmanuel.ag92@gmail.com', () => {
  const { SUPER_ADMIN_EMAILS, isSuperAdminEmail } = loadSuperAdminChecker();
  assert.deepEqual(
    [...SUPER_ADMIN_EMAILS].sort(),
    ['egomez@coat.com.ar', 'emmanuel.ag92@gmail.com']
  );

  // Usuarios autorizados (incluyendo normalización de mayúsculas/espacios)
  assert.equal(isSuperAdminEmail('egomez@coat.com.ar'), true);
  assert.equal(isSuperAdminEmail('emmanuel.ag92@gmail.com'), true);
  assert.equal(isSuperAdminEmail(' Egomez@coat.com.ar '), true);
  assert.equal(isSuperAdminEmail('EMMANUEL.AG92@GMAIL.COM'), true);

  // Usuarios no autorizados
  assert.equal(isSuperAdminEmail('otro@coat.com.ar'), false);
  assert.equal(isSuperAdminEmail('directora@coat.com.ar'), false);
  assert.equal(isSuperAdminEmail('consulta@coat.com.ar'), false);
  assert.equal(isSuperAdminEmail('preview@coat.local'), false);
  assert.equal(isSuperAdminEmail(''), false);
  assert.equal(isSuperAdminEmail(null), false);
  assert.equal(isSuperAdminEmail(undefined), false);
});

test('SurgeryApp oculta Métricas del menú, bloquea el renderizado y redirige si !canAccessMetricas', () => {
  const src = readFileSync(resolve(ROOT, 'src/SurgeryApp.jsx'), 'utf8');

  assert.match(
    src,
    /const canAccessMetricas = Boolean\(isSuperAdmin\);/,
    'canAccessMetricas debe depender exclusivamente de isSuperAdmin'
  );

  assert.doesNotMatch(
    src,
    /canAccessMetricas\s*=\s*userRole\s*===/,
    'canAccessMetricas no debe habilitarse por rol'
  );

  assert.match(
    src,
    /\.\.\.\(canAccessMetricas\s*\?\s*\[\{\s*id:\s*'Métricas'/,
    'La opción Métricas del menú lateral debe estar condicionada a canAccessMetricas'
  );

  assert.match(
    src,
    /if\s*\(currentTab === 'Métricas' && !canAccessMetricas\)\s*\{[\s\S]*?setCurrentTab\(fallbackTab\)/,
    'Debe existir redirección automática si un usuario no autorizado intenta acceder a Métricas'
  );

  assert.match(
    src,
    /\{currentTab === 'Métricas' && canAccessMetricas && 'Métricas y Estadísticas'\}/,
    'El título de Métricas debe estar protegido por canAccessMetricas'
  );

  assert.match(
    src,
    /\{currentTab === 'Métricas' && canAccessMetricas && \(\s*<MetricsPanel surgeries=\{surgeries\} \/>\s*\)\}/,
    'El componente MetricsPanel debe estar protegido por canAccessMetricas'
  );
});
