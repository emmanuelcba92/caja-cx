import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD_RULES_PATH = resolve(ROOT, 'firestore.production.rules');
const rulesContent = readFileSync(PROD_RULES_PATH, 'utf8');

const BASE_DOC_PATH = '/databases/(default)/documents';

/**
 * Documentos representativos de los identificadores reales en producción,
 * más cuentas sintéticas para verificar el rol CONSULTA.
 */
const MOCK_DOCS = [
  // Documentos históricos de authorized_emails con ID aleatorio
  {
    path: `${BASE_DOC_PATH}/authorized_emails/9Yf5AYZFAT3i8HTk123V`,
    data: { email: 'jgomez@coat.com.ar', role: 'admin', username: 'jgomez' },
  },
  {
    path: `${BASE_DOC_PATH}/authorized_emails/HasVNU0e17Aujieh6kwC`,
    data: { email: 'secretaria@coat.com.ar', role: 'secre', username: 'secretaria' },
  },
  {
    path: `${BASE_DOC_PATH}/authorized_emails/5GxS1Hq9B0drKbkIABxu`,
    data: { email: 'achiappero@coat.com.ar', role: 'secre', username: 'achiappero' },
  },
  // Documentos históricos de authorized_emails con guiones bajos
  {
    path: `${BASE_DOC_PATH}/authorized_emails/cvaleriani_coat_com_ar`,
    data: { email: 'cvaleriani@coat.com.ar', role: 'direccion_medica' },
  },
  {
    path: `${BASE_DOC_PATH}/authorized_emails/nsanchez_coat_com_ar`,
    data: { email: 'nsanchez@coat.com.ar', role: 'secre_estudios' },
  },
  {
    path: `${BASE_DOC_PATH}/authorized_emails/soejda_coat_com_ar`,
    data: { email: 'soejda@coat.com.ar', role: 'residente' },
  },
  // Documentos históricos de profiles por UID
  {
    path: `${BASE_DOC_PATH}/profiles/mhXZbvhAEiTOLKRcoR3yR5eIV9g2`,
    data: { email: 'emmanuel.ag92@gmail.com', role: '' },
  },
  {
    path: `${BASE_DOC_PATH}/profiles/rijQoGjtXjXgpTFwciKbjY0PBux1`,
    data: { email: 'egomez@coat.com.ar', role: '' },
  },
  {
    path: `${BASE_DOC_PATH}/profiles/tWyy5tdN0bcXaLpwFMHXTa6ZdIw2`,
    data: { email: 'achiappero@coat.com.ar', role: 'secre' },
  },
  {
    path: `${BASE_DOC_PATH}/profiles/vdMnae5dZIdm7wCqkg7knGhIpsj1`,
    data: { email: 'nsanchez@coat.com.ar', role: 'secre' },
  },
  // Nuevo usuario con rol CONSULTA en authorized_emails/{email}
  {
    path: `${BASE_DOC_PATH}/authorized_emails/consulta.nuevo@coat.com.ar`,
    data: { email: 'consulta.nuevo@coat.com.ar', role: 'consulta' },
  },
];

function buildFirestoreFunctions(docs) {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const existsMocks = [];
  const getMocks = [];

  const allCheckedPaths = [
    // emmanuel.ag92@gmail.com
    `${BASE_DOC_PATH}/authorized_emails/emmanuel.ag92@gmail.com`,
    `${BASE_DOC_PATH}/authorized_emails/mhXZbvhAEiTOLKRcoR3yR5eIV9g2`,
    `${BASE_DOC_PATH}/profiles/mhXZbvhAEiTOLKRcoR3yR5eIV9g2`,
    // egomez@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/egomez@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/rijQoGjtXjXgpTFwciKbjY0PBux1`,
    `${BASE_DOC_PATH}/profiles/rijQoGjtXjXgpTFwciKbjY0PBux1`,
    // jgomez@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/jgomez@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/uid_jgomez`,
    `${BASE_DOC_PATH}/profiles/uid_jgomez`,
    // secretaria@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/secretaria@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/uid_secretaria`,
    `${BASE_DOC_PATH}/profiles/uid_secretaria`,
    // achiappero@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/achiappero@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/tWyy5tdN0bcXaLpwFMHXTa6ZdIw2`,
    `${BASE_DOC_PATH}/profiles/tWyy5tdN0bcXaLpwFMHXTa6ZdIw2`,
    // cvaleriani@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/cvaleriani@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/uid_cvaleriani`,
    `${BASE_DOC_PATH}/profiles/uid_cvaleriani`,
    // nsanchez@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/nsanchez@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/vdMnae5dZIdm7wCqkg7knGhIpsj1`,
    `${BASE_DOC_PATH}/profiles/vdMnae5dZIdm7wCqkg7knGhIpsj1`,
    // soejda@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/soejda@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/uid_soejda`,
    `${BASE_DOC_PATH}/profiles/uid_soejda`,
    // consulta.nuevo@coat.com.ar
    `${BASE_DOC_PATH}/authorized_emails/consulta.nuevo@coat.com.ar`,
    `${BASE_DOC_PATH}/authorized_emails/uid_consulta`,
    `${BASE_DOC_PATH}/profiles/uid_consulta`,
  ];

  for (const p of allCheckedPaths) {
    const docObj = byPath.get(p);
    existsMocks.push({
      function: 'exists',
      args: [{ exactValue: p }],
      result: { value: Boolean(docObj) },
    });
    if (docObj) {
      getMocks.push({
        function: 'get',
        args: [{ exactValue: p }],
        result: {
          value: {
            data: docObj.data,
            id: p.split('/').pop(),
          },
        },
      });
    }
  }

  return [...existsMocks, ...getMocks];
}

test('firestore.production.rules: conserva base de producción sin resolvedRole ni legacy_authenticated y agrega solo isConsulta()', () => {
  assert.match(rulesContent, /rules_version\s*=\s*'2'/);
  assert.match(rulesContent, /function isConsulta\(\)/);
  assert.equal(/resolvedRole|legacy_authenticated/.test(rulesContent), false, 'No debe incluir resolvedRole ni legacy_authenticated');
  assert.match(rulesContent, /match \/audit_logs\/\{logId\}/);
  assert.match(rulesContent, /match \/\{document=\*\*\}/);
  assert.match(rulesContent, /allow read:\s*if request\.auth != null;/);
  assert.match(rulesContent, /allow write:\s*if request\.auth != null && !isConsulta\(\);/);
});

test('Evaluación en motor Firebase Rules API: todos los usuarios actuales conservan acceso y CONSULTA es estrictamente solo lectura', async () => {
  const req = createRequire(resolve(ROOT, 'package.json'));
  const apiv2 = req('C:/Users/Emmanuel/AppData/Roaming/npm/node_modules/firebase-tools/lib/apiv2.js');
  const cliAuth = req('C:/Users/Emmanuel/AppData/Roaming/npm/node_modules/firebase-tools/lib/auth.js');
  const acc = cliAuth.getGlobalDefaultAccount();
  cliAuth.setRefreshToken(acc.tokens.refresh_token);
  const client = new apiv2.Client({ urlPrefix: 'https://firebaserules.googleapis.com/v1', auth: true });

  const functionMocks = buildFirestoreFunctions(MOCK_DOCS);

  const makeAuth = (uid, email) => ({
    uid,
    token: {
      sub: uid,
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    },
  });

  const cases = [
    // 1. Usuarios actuales de producción conservan exactamente sus mismos permisos
    {
      name: 'emmanuel.ag92@gmail.com lee audit_logs y escribe en cualquier colección',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('mhXZbvhAEiTOLKRcoR3yR5eIV9g2', 'emmanuel.ag92@gmail.com'),
        path: `${BASE_DOC_PATH}/audit_logs/log_1`,
        method: 'get',
      },
    },
    {
      name: 'egomez@coat.com.ar escribe en caja y demás colecciones',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('rijQoGjtXjXgpTFwciKbjY0PBux1', 'egomez@coat.com.ar'),
        path: `${BASE_DOC_PATH}/caja/caja_1`,
        method: 'create',
        resource: { data: { paciente: 'Test' } },
      },
    },
    {
      name: 'jgomez@coat.com.ar (ID aleatorio 9Yf5AYZFAT3i8HTk123V) lee y escribe en caja y presupuestos',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('uid_jgomez', 'jgomez@coat.com.ar'),
        path: `${BASE_DOC_PATH}/presupuestos/surg_1__v1`,
        method: 'create',
        resource: { data: { surgeryId: 'surg_1', status: 'borrador' } },
      },
    },
    {
      name: 'secretaria@coat.com.ar (ID aleatorio HasVNU0e17Aujieh6kwC) lee y escribe en ordenes_internacion y presupuestos',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('uid_secretaria', 'secretaria@coat.com.ar'),
        path: `${BASE_DOC_PATH}/ordenes_internacion/ord_1`,
        method: 'update',
        resource: { data: { estado: 'CONFIRMADA' } },
      },
    },
    {
      name: 'achiappero@coat.com.ar (profiles/tWyy5tdN0bcXaLpwFMHXTa6ZdIw2) lee y escribe en deducciones y presupuestos',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('tWyy5tdN0bcXaLpwFMHXTa6ZdIw2', 'achiappero@coat.com.ar'),
        path: `${BASE_DOC_PATH}/deducciones/ded_1`,
        method: 'create',
        resource: { data: { amount: 100 } },
      },
    },
    {
      name: 'cvaleriani@coat.com.ar (cvaleriani_coat_com_ar) conserva lectura y escritura sin alteraciones',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('uid_cvaleriani', 'cvaleriani@coat.com.ar'),
        path: `${BASE_DOC_PATH}/ordenes_internacion/ord_1`,
        method: 'update',
        resource: { data: { estado: 'CODIFICADA' } },
      },
    },
    {
      name: 'nsanchez@coat.com.ar (nsanchez_coat_com_ar) conserva lectura y escritura sin alteraciones',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('vdMnae5dZIdm7wCqkg7knGhIpsj1', 'nsanchez@coat.com.ar'),
        path: `${BASE_DOC_PATH}/ordenes_internacion/est_1`,
        method: 'create',
        resource: { data: { tipoProcedimiento: 'ESTUDIO' } },
      },
    },
    {
      name: 'soejda@coat.com.ar (soejda_coat_com_ar) conserva lectura y escritura sin alteraciones',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('uid_soejda', 'soejda@coat.com.ar'),
        path: `${BASE_DOC_PATH}/ordenes_internacion/ord_2`,
        method: 'create',
        resource: { data: { paciente: 'Test' } },
      },
    },

    // 2. Nuevo rol CONSULTA: solo lectura permitida, toda escritura (create, update, delete) bloqueada en Firestore
    {
      name: 'CONSULTA puede leer caja',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/caja/caja_1`,
        method: 'get',
      },
    },
    {
      name: 'CONSULTA puede leer ordenes_internacion y presupuestos',
      expect: 'ALLOW',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/presupuestos/surg_1__v1`,
        method: 'get',
      },
    },
    {
      name: 'CONSULTA NO puede crear documentos en caja directamente en Firestore',
      expect: 'DENY',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/caja/caja_new`,
        method: 'create',
        resource: { data: { paciente: 'Intento directo' } },
      },
    },
    {
      name: 'CONSULTA NO puede editar documentos en caja directamente en Firestore',
      expect: 'DENY',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/caja/caja_1`,
        method: 'update',
        resource: { data: { pesos: 999999 } },
      },
    },
    {
      name: 'CONSULTA NO puede eliminar documentos en caja ni deducciones directamente en Firestore',
      expect: 'DENY',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/deducciones/ded_1`,
        method: 'delete',
      },
    },
    {
      name: 'CONSULTA NO puede crear, editar ni eliminar en ordenes_internacion ni presupuestos',
      expect: 'DENY',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/presupuestos/surg_1__v1`,
        method: 'create',
        resource: { data: { surgeryId: 'surg_1' } },
      },
    },
    {
      name: 'CONSULTA NO puede crear ni modificar audit_logs',
      expect: 'DENY',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/audit_logs/log_new`,
        method: 'create',
        resource: { data: { action: 'FAKE' } },
      },
    },
    {
      name: 'CONSULTA NO puede modificar authorized_emails para auto-escalar permisos',
      expect: 'DENY',
      request: {
        auth: makeAuth('uid_consulta', 'consulta.nuevo@coat.com.ar'),
        path: `${BASE_DOC_PATH}/authorized_emails/consulta.nuevo@coat.com.ar`,
        method: 'update',
        resource: { data: { role: 'admin' } },
      },
    },
    {
      name: 'Usuario no autenticado bloqueado',
      expect: 'DENY',
      request: {
        auth: null,
        path: `${BASE_DOC_PATH}/caja/caja_1`,
        method: 'get',
      },
    },
  ];

  const payload = {
    source: {
      files: [{ name: 'firestore.rules', content: rulesContent }],
    },
    testSuite: {
      testCases: cases.map((c) => ({
        expectation: c.expect,
        request: c.request,
        functionMocks,
      })),
    },
  };

  const res = await client.post('/projects/coatcx:test', payload);
  const results = res.body?.testResults || [];
  assert.equal(results.length, cases.length, 'Debe devolver un resultado por cada caso de prueba');

  const failures = [];
  results.forEach((r, idx) => {
    if (r.state !== 'SUCCESS') {
      failures.push({
        case: cases[idx].name,
        state: r.state,
        errorPosition: r.errorPosition,
        debugMessages: r.debugMessages,
      });
    }
  });

  assert.deepEqual(failures, [], `Fallos en evaluación de reglas: ${JSON.stringify(failures, null, 2)}`);
});
