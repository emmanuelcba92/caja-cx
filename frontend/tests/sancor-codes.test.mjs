import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLINICAL_NOMENCLADOR,
  MODULOS_SM,
  CODIGOS_IOSFA,
  CODIGOS_SANCOR,
  searchCodes,
  expandCodes,
  getCodeName
} from '../src/data/clinicalCodes.js';

test('CODIGOS_SANCOR contiene el código 030473 sin duplicados ni contaminación del nomenclador general', () => {
  const matches = CODIGOS_SANCOR.filter(c => c.code === '030473');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'TURBINOPLASTIA / TURBINECTOMIA POR RADIOFRECUENCIA');

  assert.equal(CLINICAL_NOMENCLADOR.some(c => c.code === '030473'), false);
  assert.equal(MODULOS_SM.some(c => c.code === '030473'), false);
  assert.equal(CODIGOS_IOSFA.some(c => c.code === '030473'), false);
});

test('searchCodes devuelve 030473 exclusivamente cuando la obra social es SANCOR', () => {
  const sancorByCode = searchCodes('030473', false, 'CIRUGIA', 'SANCOR SALUD');
  assert.equal(sancorByCode.some(r => r.code === '030473' && r.name === 'TURBINOPLASTIA / TURBINECTOMIA POR RADIOFRECUENCIA'), true);

  const sancorByName = searchCodes('TURBINECTOMIA', false, 'CIRUGIA', 'SANCOR');
  assert.equal(sancorByName.some(r => r.code === '030473'), true);

  for (const otherOS of ['', 'OSDE', 'SWISS MEDICAL', 'APROSS', 'IOSFA', 'GALENO']) {
    const resCode = searchCodes('030473', otherOS.includes('SWISS'), 'CIRUGIA', otherOS);
    assert.equal(resCode.some(r => r.code === '030473'), false, `030473 no debe aparecer para "${otherOS}"`);
    const resName = searchCodes('TURBINECTOMIA', otherOS.includes('SWISS'), 'CIRUGIA', otherOS);
    assert.equal(resName.some(r => r.code === '030473'), false, `TURBINECTOMIA no debe aparecer para "${otherOS}"`);
  }
});

test('expandCodes y getCodeName resuelven 030473 solo para SANCOR', () => {
  assert.deepEqual(
    expandCodes('030473', false, false, true),
    ['030473 TURBINOPLASTIA / TURBINECTOMIA POR RADIOFRECUENCIA']
  );
  assert.deepEqual(expandCodes('030473', false, false, false), ['030473']);

  assert.equal(getCodeName('030473', 'SANCOR SALUD'), 'TURBINOPLASTIA / TURBINECTOMIA POR RADIOFRECUENCIA');
  assert.equal(getCodeName('030473', 'OSDE'), '');
  assert.equal(getCodeName('030473'), '');
});
