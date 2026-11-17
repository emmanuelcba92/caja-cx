import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFirestoreLiquidations } from '../src/utils/liquidationSync.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('StaffLiquidacionesView: carga correcta desde Firestore sin tocar localStorage', async () => {
  const result = await loadFirestoreLiquidations({
    getCollectionFn: async (col) => {
      if (col === 'deducciones') {
        return [{ id: 'd1', profesional: 'Dr. Ficticio', amount: 1500, currency: 'ARS', date: '2026-11-10' }];
      }
      if (col === 'liquidaciones_manuales') {
        return [{ id: 'm1', prof_1: 'Dr. Ficticio', liq_prof_1: 25000, liq_prof_1_currency: 'ARS', fecha: '2026-11-10' }];
      }
      return [];
    },
  });

  assert.equal(result.deductions.length, 1);
  assert.equal(result.manualLiqs.length, 1);
});

test('StaffLiquidacionesView: fallo de conexión, error de permisos y respuesta inválida rechazan sin fallback local', async () => {
  // Fallo de conexión
  await assert.rejects(
    () => loadFirestoreLiquidations({
      getCollectionFn: async () => {
        const err = new Error('Network error');
        err.code = 'unavailable';
        throw err;
      },
    }),
    /Network error/
  );

  // Error de permisos
  await assert.rejects(
    () => loadFirestoreLiquidations({
      getCollectionFn: async (col) => {
        if (col === 'liquidaciones_manuales') {
          const err = new Error('Missing or insufficient permissions.');
          err.code = 'permission-denied';
          throw err;
        }
        return [];
      },
    }),
    /Missing or insufficient permissions/
  );

  // Respuesta inválida
  await assert.rejects(
    () => loadFirestoreLiquidations({
      getCollectionFn: async (col) => (col === 'deducciones' ? undefined : []),
    }),
    /Respuesta inválida/
  );
});

test('StaffLiquidacionesView.jsx elimina fallback localStorage, oculta totales y bloquea impresión/Excel ante error', () => {
  const src = readFileSync(resolve(ROOT, 'src/components/StaffLiquidacionesView.jsx'), 'utf8');

  assert.equal(/localStorage/.test(src), false, 'No debe leer ni modificar localStorage');
  assert.equal(/deducciones_liquidacion/.test(src), false, 'No debe usar caché antiguo deducciones_liquidacion');
  assert.match(src, /loadFirestoreLiquidations/);
  assert.match(src, /setLoadError\(/);
  assert.match(src, /\{loadError \? \(/);
  assert.match(src, /const handleExportExcel = async \(\) => \{\s*if \(loadingCloud \|\| loadError\)/);
  assert.match(src, /const handlePrint = \(\) => \{\s*if \(loadingCloud \|\| loadError\)/);

  const disabledMatches = src.match(/disabled=\{loadingCloud \|\| Boolean\(loadError\)\}/g) || [];
  assert.equal(disabledMatches.length, 2, 'Los botones de Imprimir/PDF y Excel deben deshabilitarse ante carga o error');
});
