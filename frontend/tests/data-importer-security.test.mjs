import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadDataImporter(mockAuth = {}) {
  const raw = readFileSync(resolve(ROOT, 'src/components/DataImporter.jsx'), 'utf8');
  const transformed = await transformWithOxc(raw, 'DataImporter.jsx', {
    lang: 'jsx',
    jsx: { runtime: 'classic' },
  });
  const cjsCode = transformed.code
    .replace(/^import\s+React\s*,\s*\{([^}]+)\}\s+from\s+['"]react['"];/m, 'const React = require("react"); const {$1} = React;')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];/gm, 'const {$1} = require("$2");')
    .replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];/gm, 'const $1 = require("$2").default;')
    .replace(/export\s+default\s+function\s+DataImporter/, 'module.exports.default = function DataImporter');

  const lucideProxy = new Proxy({}, {
    get: (_t, prop) => () => React.createElement('span', { 'data-icon': String(prop) }),
  });

  const mod = { exports: {} };
  const fakeRequire = (id) => {
    if (id === 'react') return React;
    if (id === 'lucide-react') return lucideProxy;
    if (id === 'react-hot-toast') return { default: { error: () => {}, success: () => {}, loading: () => {} } };
    if (id.includes('AuthContext')) return { useAuth: () => mockAuth };
    throw new Error(`Unexpected import in DataImporter: ${id}`);
  };

  const fn = new vm.Script(`(function(require, module, exports) {\n${cjsCode}\n})`);
  const compiled = fn.runInThisContext();
  compiled(fakeRequire, mod, mod.exports);
  return mod.exports.default;
}

test('DataImporter.jsx no contiene handleClearAll ni rutas de borrado masivo en Firestore', () => {
  const src = readFileSync(resolve(ROOT, 'src/components/DataImporter.jsx'), 'utf8');

  assert.equal(/\bhandleClearAll\b/.test(src), false, 'handleClearAll debe estar eliminado');
  assert.equal(/\bclearCollection\b/.test(src), false, 'clearCollection no debe referenciarse en DataImporter');
  assert.equal(/Limpiar todos los datos/i.test(src), false, 'No debe existir botón de limpieza masiva');
  assert.equal(/\b(deleteDoc|deleteDocument|writeBatch)\b/.test(src), false, 'No debe existir borrado de Firestore en DataImporter');
});

test('DataImporter bloquea el renderizado para cualquier rol distinto de ADMIN y nunca muestra botón de limpieza', async () => {
  const nonAdminRoles = ['secre', 'secre_estudios', 'direccion_medica', 'medico', 'residente', 'consulta', 'user', '', undefined];

  for (const role of nonAdminRoles) {
    const DataImporter = await loadDataImporter({ userRole: role, isSuperAdmin: false });
    const html = renderToStaticMarkup(React.createElement(DataImporter, { userRole: role }));
    assert.match(html, /Acceso restringido: solo el rol ADMIN/i, `Rol "${role}" debe ser bloqueado`);
    assert.equal(html.includes('Seleccionar archivo JSON'), false, `Rol "${role}" no debe ver el selector de archivo`);
    assert.equal(/Limpiar todos/i.test(html), false, `Rol "${role}" no debe ver control de limpieza`);
  }
});

test('DataImporter permite acceso solo a ADMIN (o superadmin) sin ningún botón ni acción de borrado masivo', async () => {
  const DataImporterAdmin = await loadDataImporter({ userRole: 'admin', isSuperAdmin: false });
  const adminHtml = renderToStaticMarkup(React.createElement(DataImporterAdmin, { userRole: 'admin' }));
  assert.match(adminHtml, /Seleccionar archivo JSON/);
  assert.equal(/Limpiar todos|eliminar.*datos/i.test(adminHtml), false);

  const DataImporterSuper = await loadDataImporter({ userRole: 'secre', isSuperAdmin: true });
  const superHtml = renderToStaticMarkup(React.createElement(DataImporterSuper));
  assert.match(superHtml, /Seleccionar archivo JSON/);
  assert.equal(/Limpiar todos|eliminar.*datos/i.test(superHtml), false);
});

test('SurgeryApp.jsx y AdminView.jsx restringen navegación y renderizado de DataImporter exclusivamente a ADMIN', () => {
  const surgerySrc = readFileSync(resolve(ROOT, 'src/SurgeryApp.jsx'), 'utf8');
  const adminSrc = readFileSync(resolve(ROOT, 'src/components/AdminView.jsx'), 'utf8');

  assert.match(
    surgerySrc,
    /\{isAdmin && \(\s*<button onClick=\{\(\) => setAdminSubTab\('importar'\)\}/,
    'El botón de pestaña Importar en SurgeryApp debe requerir isAdmin'
  );
  assert.match(
    surgerySrc,
    /\{adminSubTab === 'importar' && isAdmin && \(\s*<div>[\s\S]*?<DataImporter\b/,
    'El renderizado de DataImporter en SurgeryApp debe requerir isAdmin'
  );
  assert.equal(
    /adminSubTab === 'importar' && !isMedico/.test(surgerySrc),
    false,
    'No debe quedar acceso a importar bajo !isMedico'
  );

  assert.match(
    adminSrc,
    /\.\.\.\(isAdmin \? \[\{ id: 'datos'/,
    'La pestaña Datos en AdminView debe requerir isAdmin'
  );
  assert.match(
    adminSrc,
    /\{activeSubTab === 'datos' && isAdmin && \(/,
    'El contenido Datos en AdminView debe requerir isAdmin'
  );
});
