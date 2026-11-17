#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cajaSource = fs.readFileSync(resolve(ROOT, 'src/CajaView.jsx'), 'utf8');

// Extraer la función calcLiq de CajaView.jsx
const match = cajaSource.match(/export const calcLiq = \([\s\S]*?\n\};\n/);
if (!match) throw new Error('No se encontró calcLiq en CajaView.jsx');

const context = vm.createContext({});
vm.runInContext(`const calcLiq = ${match[0].replace('export const calcLiq = ', '')}; globalThis.calcLiq = calcLiq;`, context);
const calcLiq = context.calcLiq;

const amounts = [200000, 420000, 600000, 1000000];

console.log('================================================================');
console.log('PRUEBAS DE RETENCIÓN COAT EN CAJA (CajaView.jsx - calcLiq)');
console.log('================================================================\n');

console.log('=== 0. MODALIDAD LIBRE (PREDETERMINADA / INGRESO MANUAL) ===');
for (const a of amounts) {
  const manualRetention = Math.round(a * 0.15); // ejemplo manual al 15%
  const res = calcLiq({ pesos: a, dolares: 0, modalidad_retencion: 'libre', coat_pesos: manualRetention, porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
  const pct = ((res.coat_pesos / a) * 100).toFixed(1);
  console.log(`Cobro: $${a.toLocaleString('es-AR')} -> COAT manual: $${res.coat_pesos.toLocaleString('es-AR')} (${pct}%) | Restante para Profesionales: $${res.liq_prof_1.toLocaleString('es-AR')} (${(100 - pct).toFixed(1)}%)`);
}

console.log('\n=== 1. MODALIDAD 10% (PACIENTE EXTERNO - SIN MÍNIMO) ===');
for (const a of amounts) {
  const res = calcLiq({ pesos: a, dolares: 0, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
  const pct = ((res.coat_pesos / a) * 100).toFixed(1);
  console.log(`Cobro: $${a.toLocaleString('es-AR')} -> COAT: $${res.coat_pesos.toLocaleString('es-AR')} (${pct}%) | Restante para Profesionales: $${res.liq_prof_1.toLocaleString('es-AR')} (${(100 - pct).toFixed(1)}%)`);
}

console.log('\n=== 2. MODALIDAD 20% (PACIENTE DE COAT - MÍNIMO $80.000) ===');
for (const a of amounts) {
  const res = calcLiq({ pesos: a, dolares: 0, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
  const pct = ((res.coat_pesos / a) * 100).toFixed(1);
  console.log(`Cobro: $${a.toLocaleString('es-AR')} -> COAT: $${res.coat_pesos.toLocaleString('es-AR')} (${pct}%) | Restante para Profesionales: $${res.liq_prof_1.toLocaleString('es-AR')} (${(100 - pct).toFixed(1)}%)`);
}

console.log('\n=== 3. DISTRIBUCIÓN MULTI-PROFESIONAL (50% / 30% / 20%) ===');
for (const a of [420000, 1000000]) {
  const res = calcLiq({
    pesos: a,
    dolares: 0,
    modalidad_retencion: '20',
    porcentaje_prof_1: 50,
    porcentaje_prof_2: 30,
    porcentaje_prof_3: 20,
    showProf3: true,
    liq_prof_1_currency: 'ARS',
    liq_prof_2_currency: 'ARS',
    liq_prof_3_currency: 'ARS'
  });
  console.log(`Cobro $${a.toLocaleString('es-AR')} (Mod 20%): COAT=$${res.coat_pesos.toLocaleString('es-AR')} | Prof 1 (50%)=$${res.liq_prof_1.toLocaleString('es-AR')}, Prof 2 (30%)=$${res.liq_prof_2.toLocaleString('es-AR')}, Prof 3 (20%)=$${res.liq_prof_3.toLocaleString('es-AR')}`);
}

console.log('\n=== 4. CASOS BORDE (< $80.000) - CONDUCTA ACTUAL PRESERVADA (CERO SALDOS NEGATIVOS) ===');
const edgeAmounts = [0, 20000, 50000, 79999, 80000];
for (const a of edgeAmounts) {
  const res20 = calcLiq({ pesos: a, dolares: 0, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
  const res10 = calcLiq({ pesos: a, dolares: 0, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
  console.log(`Cobro: $${a.toLocaleString('es-AR')} | Mod 20%: COAT=$${res20.coat_pesos.toLocaleString('es-AR')}, Prof=$${res20.liq_prof_1.toLocaleString('es-AR')} | Mod 10%: COAT=$${res10.coat_pesos.toLocaleString('es-AR')}, Prof=$${res10.liq_prof_1.toLocaleString('es-AR')}`);
}

console.log('\n=== 5. COMPATIBILIDAD CON REGISTROS HISTÓRICOS (DEFAULT LIBRE) ===');
const hist1 = calcLiq({ pesos: 400000, dolares: 200, coat_pesos: 20000, coat_dolares: 200, porcentaje_prof_1: 75, porcentaje_prof_2: 25, liq_prof_1_currency: 'ARS', liq_prof_2_currency: 'ARS' });
console.log(`Registro histórico sin modalidad (default LIBRE): Cobro $400.000 -> COAT=$${hist1.coat_pesos.toLocaleString('es-AR')} (esperado $20.000 manual) | Mod=${hist1.modalidad_retencion}`);
const hist2 = calcLiq({ pesos: 220000, dolares: 0, coat_pesos: 30000, coat_dolares: 0, porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
console.log(`Registro histórico sin modalidad (default LIBRE): Cobro $220.000 -> COAT=$${hist2.coat_pesos.toLocaleString('es-AR')} (esperado $30.000 manual) | Mod=${hist2.modalidad_retencion}`);
