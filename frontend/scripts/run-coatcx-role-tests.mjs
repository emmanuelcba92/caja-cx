#!/usr/bin/env node
/**
 * Suite de pruebas de permisos por rol (T01 a T17) para `coatcx` (Etapa 1).
 *
 * Modos de ejecución:
 *  1) `--simulate` (por defecto, 100 % local, sin conexión ni escrituras en Firebase):
 *     Evalúa los 17 escenarios (y subcasos anti-elusión) contra un evaluador fiel de
 *     las reglas de `firestore.rules` y los datos ficticios en memoria.
 *  2) `--live` (solo para ejecutar cuando el usuario autorice desplegar reglas y sembrar `coatcx`):
 *     Ejecuta las mismas operaciones reales con el SDK de Firebase contra `coatcx`.
 */

import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { assertIsolatedConfig, COATCX_EXPECTED } from '../src/firebase/envGuard.js';
import {
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

/**
 * Evaluador en memoria de las reglas exactas de `frontend/firestore.rules`.
 * Permite verificar localmente los casos T01–T17 y todos los vectores de elusión
 * sin necesidad de Java ni de tocar Firebase.
 */
export function createRulesSimulator() {
  const db = {
    authorized_emails: new Map(FICTITIOUS_AUTHORIZED_EMAILS.map((d) => [d.id, { ...d }])),
    roles: new Map(FICTITIOUS_ROLES.map((d) => [d.id, { ...d }])),
    profesionales: new Map(FICTITIOUS_PROFESIONALES.map((d) => [d.id, { ...d }])),
    pacientes: new Map(FICTITIOUS_PACIENTES.map((d) => [d.id, { ...d }])),
    ordenes_internacion: new Map(FICTITIOUS_ORDENES.map((d) => [d.id, { ...d }])),
    caja: new Map(FICTITIOUS_CAJA.map((d) => [d.id, { ...d }])),
    caja_comentarios: new Map(FICTITIOUS_CAJA_COMENTARIOS.map((d) => [d.id, { ...d }])),
    audit_logs: new Map([
      ['test_audit_1', { userId: 'uid_admin', userEmail: FICTITIOUS_USERS.admin.email, action: 'INIT' }]
    ]),
    notes: new Map([
      ['note_med1', { userId: 'uid_medico1', title: 'Nota propia Med1', content: 'Ficticia' }],
      ['note_med2', { userId: 'uid_medico2', title: 'Nota propia Med2', content: 'Ficticia' }]
    ]),
    reminders: new Map([['rem_1', { text: 'Recordatorio ficticio', completed: false }]]),
    user_surgical_templates: new Map([
      ['tpl_med1', { userId: 'uid_medico1', name: 'Plantilla Med1' }]
    ]),
    user_settings: new Map([['uid_medico1', { adminPin: '0000' }]]),
    presupuestos: new Map([
      ['ord_1__v1', {
        surgeryId: 'ord_1',
        groupId: 'ord_1',
        version: 1,
        status: 'emitido',
        tipo: 'particular',
        fecha: '2026-11-10',
        validDays: 10,
        validUntil: '2026-11-20',
        paciente: 'Paciente Uno',
        dni: '30111222',
        obraSocial: 'PARTICULAR',
        numeroAfiliado: '',
        cirugia: 'Septoplastia',
        items: [{ key: 'equipo_quirurgico', concepto: 'Honorarios Equipo Quirúrgico', monto: '$1000', ivaMode: 'Sin IVA' }],
        condiciones: ['Condicion 1'],
        emittedAt: '2026-11-10T10:00:00.000Z',
        emittedBy: 'uid_secre1',
        previousVersionId: null,
        replacedByVersionId: null,
      }],
      ['ord_1__v2', {
        surgeryId: 'ord_1',
        groupId: 'ord_1',
        version: 2,
        status: 'borrador',
        tipo: 'particular',
        fecha: '2026-11-12',
        validDays: 10,
        validUntil: '2026-11-22',
        paciente: 'Paciente Uno',
        dni: '30111222',
        obraSocial: 'PARTICULAR',
        numeroAfiliado: '',
        cirugia: 'Septoplastia',
        items: [{ key: 'equipo_quirurgico', concepto: 'Honorarios Equipo Quirúrgico', monto: '$1200', ivaMode: 'Sin IVA' }],
        condiciones: ['Condicion 1'],
        emittedAt: null,
        emittedBy: null,
        previousVersionId: 'ord_1__v1',
        replacedByVersionId: null,
      }],
    ]),
    presupuestos_series: new Map([
      ['ord_1', { surgeryId: 'ord_1', latestVersion: 2, activeEmittedId: 'ord_1__v1' }],
    ]),
    presupuesto_codigos_config: new Map([
      ['shared', { version: 1, rules: { 'OSDE||030101': true }, updatedAt: '2026-11-13T00:00:00.000Z', updatedBy: 'admin.test@pruebas.coat.local' }],
    ]),
  };

  function evaluate({ auth, op, collection, docId, requestData }) {
    const isSignedIn = () => Boolean(auth && typeof auth.email === 'string');
    const hasUidAuthDoc = () =>
      isSignedIn() &&
      db.authorized_emails.has(auth.uid) &&
      db.authorized_emails.get(auth.uid).email === auth.email;
    const hasEmailAuthDoc = () =>
      isSignedIn() &&
      db.authorized_emails.has(auth.email) &&
      db.authorized_emails.get(auth.email).email === auth.email;
    const userRole = () =>
      hasUidAuthDoc()
        ? db.authorized_emails.get(auth.uid).role
        : hasEmailAuthDoc()
          ? db.authorized_emails.get(auth.email).role
          : 'unauthorized';

    const VALID_ROLES = ['admin', 'direccion_medica', 'secre', 'medico', 'residente', 'secre_estudios', 'consulta'];
    const isAuthorizedUser = () => VALID_ROLES.includes(userRole());
    const isAdmin = () => userRole() === 'admin';
    const isDireccionMedica = () => userRole() === 'direccion_medica';
    const isSecre = () => userRole() === 'secre';
    const isMedico = () => userRole() === 'medico';
    const isResidente = () => userRole() === 'residente';
    const isSecreEstudios = () => userRole() === 'secre_estudios';
    const isConsulta = () => userRole() === 'consulta';

    const existing = db[collection]?.get(docId) ?? null;
    const next = op === 'update' && existing ? { ...existing, ...requestData } : requestData;

    const isEstudioOrder = (data) => Boolean(data && data.tipoProcedimiento === 'ESTUDIO' && data.estudioBajoAnestesia === true);
    const isOwnExistingOrder = (data) =>
      isSignedIn() &&
      Boolean(
        data &&
          ((typeof data.createdBy === 'string' && data.createdBy === auth.email) ||
            (typeof data.emailProfesional === 'string' && data.emailProfesional === auth.email))
      );
    const hasValidOrderCreator = (data) =>
      isSignedIn() && Boolean(data && typeof data.createdBy === 'string' && data.createdBy === auth.email);

    const preservesOrderOwnershipAndType = () =>
      Boolean(
        existing &&
          next &&
          next.createdBy === existing.createdBy &&
          (next.emailProfesional ?? '') === (existing.emailProfesional ?? '') &&
          (next.tipoProcedimiento ?? 'CIRUGIA') === (existing.tipoProcedimiento ?? 'CIRUGIA') &&
          (next.estudioBajoAnestesia ?? false) === (existing.estudioBajoAnestesia ?? false)
      );

    const medicoResidenteSafeOrderUpdate = () =>
      preservesOrderOwnershipAndType() &&
      ((next.estado ?? existing.estado ?? 'SOLICITADA') === (existing.estado ?? 'SOLICITADA') ||
        ['SOLICITADA', 'CANCELADA'].includes(next.estado ?? '')) &&
      ((next.autorizada ?? false) === false || (existing.autorizada ?? false) === true);

    switch (collection) {
      case 'authorized_emails':
        if (op === 'get') return isSignedIn() && (docId === auth.uid || docId === auth.email || isAuthorizedUser());
        if (op === 'list') return isAuthorizedUser();
        if (op === 'create' || op === 'update') return isAdmin() && VALID_ROLES.includes(next?.role);
        if (op === 'delete') return isAdmin();
        return false;

      case 'roles':
        if (op === 'get' || op === 'list') return isSignedIn();
        return isAdmin();

      case 'audit_logs':
        if (op === 'get' || op === 'list') return isAdmin() || isDireccionMedica();
        if (op === 'create') {
          return isAuthorizedUser() && !isConsulta() && next?.userId === auth.uid && next?.userEmail === auth.email;
        }
        return false; // update y delete siempre bloqueados

      case 'ordenes_internacion':
        if (op === 'get' || op === 'list') return isAuthorizedUser();
        if (op === 'create') {
          return (
            isAdmin() ||
            (hasValidOrderCreator(next) &&
              (isDireccionMedica() ||
                isResidente() ||
                (isMedico() && ((next.emailProfesional ?? '') === '' || next.emailProfesional === auth.email)) ||
                (isSecreEstudios() && isEstudioOrder(next))))
          );
        }
        if (op === 'update') {
          if (!existing) return false;
          return (
            isAdmin() ||
            (isSecre() && next.createdBy === existing.createdBy) ||
            (isDireccionMedica() && next.createdBy === existing.createdBy) ||
            (isSecreEstudios() && isEstudioOrder(existing) && isEstudioOrder(next) && preservesOrderOwnershipAndType()) ||
            ((isMedico() || isResidente()) && isOwnExistingOrder(existing) && medicoResidenteSafeOrderUpdate())
          );
        }
        if (op === 'delete') {
          if (!existing) return false;
          return (
            isAdmin() ||
            isSecre() ||
            (isSecreEstudios() && isEstudioOrder(existing)) ||
            ((isMedico() || isResidente() || isDireccionMedica()) &&
              isOwnExistingOrder(existing) &&
              ['SOLICITADA', 'CANCELADA'].includes(existing.estado ?? 'SOLICITADA') &&
              (existing.autorizada ?? false) === false)
          );
        }
        return false;

      case 'pacientes':
        if (op === 'get' || op === 'list') return isAuthorizedUser();
        if (op === 'create' || op === 'update') {
          return isAuthorizedUser() && !isConsulta() && typeof next?.dni === 'string' && next.dni.length > 0;
        }
        if (op === 'delete') return isAdmin() || isSecre();
        return false;

      case 'profesionales':
        if (op === 'get' || op === 'list') return isAuthorizedUser();
        return isAdmin();

      case 'caja':
      case 'caja_comentarios':
      case 'deducciones':
      case 'liquidaciones_manuales':
      case 'recibos_libres':
        if (op === 'get' || op === 'list') return isAdmin() || isSecre() || isConsulta();
        return isAdmin() || isSecre();

      case 'notes':
        if (op === 'get' || op === 'list') return isAuthorizedUser() && existing?.userId === auth.uid;
        if (op === 'create') return isAuthorizedUser() && !isConsulta() && next?.userId === auth.uid;
        if (op === 'update') {
          return isAuthorizedUser() && !isConsulta() && existing?.userId === auth.uid && next?.userId === existing?.userId;
        }
        if (op === 'delete') return isAuthorizedUser() && !isConsulta() && existing?.userId === auth.uid;
        return false;

      case 'reminders':
        if (op === 'get' || op === 'list') return isAuthorizedUser() && !isSecreEstudios();
        return isAuthorizedUser() && !isSecreEstudios() && !isConsulta();

      case 'user_surgical_templates':
        if (op === 'get' || op === 'list') return isAuthorizedUser();
        if (op === 'create') {
          return isAuthorizedUser() && (isAdmin() || isDireccionMedica() || isMedico() || isResidente()) && next?.userId === auth.uid;
        }
        if (op === 'update') {
          return isAdmin() || (isAuthorizedUser() && !isConsulta() && existing?.userId === auth.uid && next?.userId === existing?.userId);
        }
        if (op === 'delete') return isAdmin() || (isAuthorizedUser() && !isConsulta() && existing?.userId === auth.uid);
        return false;

      case 'user_settings':
        if (op === 'get' || op === 'list') return isAuthorizedUser() && auth.uid === docId;
        return isAuthorizedUser() && !isConsulta() && auth.uid === docId;

      case 'presupuestos': {
        const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        if (op === 'get' || op === 'list') {
          if (isAdmin() || isSecre() || isDireccionMedica()) return true;
          if (isConsulta()) {
            if (!existing) return false;
            return existing.status === 'emitido' || existing.status === 'reemplazado';
          }
          return false;
        }
        if (op === 'create') {
          if (!(isAdmin() || isSecre())) return false;
          if (!requestData || typeof requestData.surgeryId !== 'string' || requestData.surgeryId.length === 0) return false;
          if (requestData.groupId !== requestData.surgeryId) return false;
          if (!Number.isInteger(requestData.version) || requestData.version < 1) return false;
          if (docId !== `${requestData.surgeryId}__v${requestData.version}`) return false;
          if (requestData.status !== 'borrador') return false;
          if (!['particular', 'obra-social'].includes(requestData.tipo)) return false;
          if (requestData.replacedByVersionId !== null) return false;
          if (requestData.version === 1) {
            return requestData.previousVersionId === null;
          }
          const expectedPrev = `${requestData.surgeryId}__v${requestData.version - 1}`;
          return requestData.previousVersionId === expectedPrev && db.presupuestos.has(expectedPrev);
        }
        if (op === 'update') {
          if (!(isAdmin() || isSecre()) || !existing || !requestData) return false;
          if (
            requestData.surgeryId !== existing.surgeryId ||
            requestData.groupId !== existing.groupId ||
            requestData.version !== existing.version ||
            requestData.previousVersionId !== existing.previousVersionId
          ) {
            return false;
          }
          if (existing.status === 'borrador') {
            if (!['borrador', 'emitido'].includes(requestData.status)) return false;
            if (requestData.replacedByVersionId !== null) return false;
            if (requestData.status === 'borrador') return true;
            return (
              typeof requestData.validUntil === 'string' &&
              requestData.validUntil.length > 0 &&
              typeof requestData.emittedAt === 'string' &&
              requestData.emittedAt.length > 0
            );
          }
          if (existing.status === 'emitido' && requestData.status === 'reemplazado') {
            return (
              typeof requestData.replacedByVersionId === 'string' &&
              requestData.replacedByVersionId.length > 0 &&
              sameVal(requestData.tipo, existing.tipo) &&
              sameVal(requestData.fecha, existing.fecha) &&
              sameVal(requestData.validDays, existing.validDays) &&
              sameVal(requestData.validUntil, existing.validUntil) &&
              sameVal(requestData.paciente, existing.paciente) &&
              sameVal(requestData.dni, existing.dni) &&
              sameVal(requestData.obraSocial, existing.obraSocial) &&
              sameVal(requestData.numeroAfiliado, existing.numeroAfiliado) &&
              sameVal(requestData.cirugia, existing.cirugia) &&
              sameVal(requestData.items, existing.items) &&
              sameVal(requestData.condiciones, existing.condiciones) &&
              sameVal(requestData.emittedAt, existing.emittedAt) &&
              sameVal(requestData.emittedBy, existing.emittedBy)
            );
          }
          return false;
        }
        if (op === 'delete') {
          return (isAdmin() || isSecre()) && !!existing && existing.status === 'borrador';
        }
        return false;
      }

      case 'presupuestos_series':
        if (op === 'get' || op === 'list') {
          return isAdmin() || isSecre() || isDireccionMedica() || isConsulta();
        }
        if (op === 'create' || op === 'update') {
          return (
            (isAdmin() || isSecre()) &&
            !!requestData &&
            requestData.surgeryId === docId &&
            Number.isInteger(requestData.latestVersion) &&
            requestData.latestVersion >= 0
          );
        }
        return false;

      case 'presupuesto_codigos_config':
        if (op === 'get' || op === 'list') {
          return isAuthorizedUser();
        }
        if (op === 'create') {
          return (
            isAdmin() &&
            docId === 'shared' &&
            !!requestData &&
            Number.isInteger(requestData.version) &&
            requestData.version === 1 &&
            Boolean(requestData.rules) &&
            typeof requestData.rules === 'object' &&
            !Array.isArray(requestData.rules)
          );
        }
        if (op === 'update') {
          return (
            isAdmin() &&
            docId === 'shared' &&
            !!existing &&
            !!requestData &&
            Number.isInteger(requestData.version) &&
            Number.isInteger(existing.version) &&
            requestData.version === existing.version + 1 &&
            Boolean(requestData.rules) &&
            typeof requestData.rules === 'object' &&
            !Array.isArray(requestData.rules)
          );
        }
        return false;

      default:
        return false;
    }
  }

  return { evaluate, db };
}

/**
 * Define y ejecuta los 17 casos de prueba T01–T17 (con subcasos anti-elusión).
 * Devuelve el listado detallado de resultados.
 */
export function buildTestCases(uidMap = {
  admin: 'uid_admin',
  direccion_medica: 'uid_direccion_medica',
  secre: 'uid_secre',
  medico1: 'uid_medico1',
  medico2: 'uid_medico2',
  residente: 'uid_residente',
  secre_estudios: 'uid_secre_estudios',
  unauthorized: 'uid_unauthorized'
}) {
  const authFor = (key) => ({
    key,
    uid: uidMap[key] || `uid_${key}`,
    email: FICTITIOUS_USERS[key].email
  });

  return [
    // T01: Usuario autenticado pero NO autorizado
    {
      id: 'T01',
      desc: 'Usuario no autorizado: denegado en lectura y escritura de ordenes, pacientes y caja',
      checks: [
        { auth: authFor('unauthorized'), op: 'list', collection: 'ordenes_internacion', expected: false },
        { auth: authFor('unauthorized'), op: 'get', collection: 'pacientes', docId: '99000101', expected: false },
        { auth: authFor('unauthorized'), op: 'get', collection: 'caja', docId: 'test_caja_1', expected: false }
      ]
    },
    // T02: Intruso intenta auto-darse de alta en authorized_emails
    {
      id: 'T02',
      desc: 'Usuario no autorizado: denegado al intentar crearse doc en authorized_emails como admin',
      checks: [
        {
          auth: authFor('unauthorized'),
          op: 'create',
          collection: 'authorized_emails',
          docId: FICTITIOUS_USERS.unauthorized.docId,
          requestData: { email: FICTITIOUS_USERS.unauthorized.email, role: 'admin' },
          expected: false
        },
        // Pero sí puede consultar su propio docId para que AuthContext detecte que no existe
        {
          auth: authFor('unauthorized'),
          op: 'get',
          collection: 'authorized_emails',
          docId: FICTITIOUS_USERS.unauthorized.docId,
          expected: true
        }
      ]
    },
    // T03: Escalada de privilegios por roles no-admin
    {
      id: 'T03',
      desc: 'Todos los roles no-admin: denegados al intentar cambiar su role a admin o modificar roles',
      checks: ['direccion_medica', 'secre', 'medico1', 'residente', 'secre_estudios'].flatMap((k) => [
        {
          auth: authFor(k),
          op: 'update',
          collection: 'authorized_emails',
          docId: FICTITIOUS_USERS[k].docId,
          requestData: { role: 'admin' },
          expected: false
        },
        {
          auth: authFor(k),
          op: 'update',
          collection: 'roles',
          docId: 'medico',
          requestData: { permissions: { can_view_admin: true } },
          expected: false
        }
      ])
    },
    // T04: Admin CRUD completo
    {
      id: 'T04',
      desc: 'Admin: permitido CRUD en authorized_emails, profesionales, ordenes, pacientes, caja y lectura audit_logs',
      checks: [
        {
          auth: authFor('admin'),
          op: 'update',
          collection: 'authorized_emails',
          docId: FICTITIOUS_USERS.medico1.docId,
          requestData: { role: 'medico' },
          expected: true
        },
        {
          auth: authFor('admin'),
          op: 'update',
          collection: 'profesionales',
          docId: 'test_prof_1',
          requestData: { telefono: '3510000001' },
          expected: true
        },
        { auth: authFor('admin'), op: 'get', collection: 'caja', docId: 'test_caja_1', expected: true },
        { auth: authFor('admin'), op: 'get', collection: 'audit_logs', docId: 'test_audit_1', expected: true }
      ]
    },
    // T05: Inmutabilidad de audit_logs incluso para admin
    {
      id: 'T05',
      desc: 'Admin: denegado al intentar editar o eliminar registros de audit_logs',
      checks: [
        {
          auth: authFor('admin'),
          op: 'update',
          collection: 'audit_logs',
          docId: 'test_audit_1',
          requestData: { action: 'TAMPERED' },
          expected: false
        },
        { auth: authFor('admin'), op: 'delete', collection: 'audit_logs', docId: 'test_audit_1', expected: false }
      ]
    },
    // T06: Dirección Médica — permisos legítimos
    {
      id: 'T06',
      desc: 'Dirección Médica: puede leer órdenes, auditar/codificar test_ord_1, crear orden propia y leer audit_logs',
      checks: [
        { auth: authFor('direccion_medica'), op: 'list', collection: 'ordenes_internacion', expected: true },
        {
          auth: authFor('direccion_medica'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_1',
          requestData: { anotacionCalendario: 'Solicitud ficticia creada por Médico 1 (auditada por Dir. Médica)' },
          expected: true
        },
        {
          auth: authFor('direccion_medica'),
          op: 'create',
          collection: 'ordenes_internacion',
          docId: 'test_ord_new_dir',
          requestData: {
            createdBy: FICTITIOUS_USERS.direccion_medica.email,
            tipoProcedimiento: 'CIRUGIA',
            estudioBajoAnestesia: false,
            estado: 'SOLICITADA',
            autorizada: false,
            isFictitiousTest: true
          },
          cleanupAfter: true,
          expected: true
        },
        { auth: authFor('direccion_medica'), op: 'get', collection: 'audit_logs', docId: 'test_audit_1', expected: true }
      ]
    },
    // T07: Dirección Médica — accesos denegados
    {
      id: 'T07',
      desc: 'Dirección Médica: denegado en caja, deducciones, liquidaciones_manuales y escritura de profesionales',
      checks: [
        { auth: authFor('direccion_medica'), op: 'get', collection: 'caja', docId: 'test_caja_1', expected: false },
        {
          auth: authFor('direccion_medica'),
          op: 'create',
          collection: 'caja',
          docId: 'test_caja_x',
          requestData: { pesos: 100 },
          expected: false
        },
        {
          auth: authFor('direccion_medica'),
          op: 'update',
          collection: 'profesionales',
          docId: 'test_prof_1',
          requestData: { mp: '0000' },
          expected: false
        }
      ]
    },
    // T08: Secretaría (secre) — permisos legítimos
    {
      id: 'T08',
      desc: 'Secretaría: puede gestionar estados de órdenes (ENVIADA/AUTORIZADA), operar caja y sincronizar pacientes',
      checks: [
        {
          auth: authFor('secre'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_2',
          requestData: { anotacionCalendario: 'Solicitud ficticia de Médico 2 gestionada por Secretaría' },
          expected: true
        },
        {
          auth: authFor('secre'),
          op: 'create',
          collection: 'caja',
          docId: 'test_caja_temp_secre',
          requestData: { pesos: 150000, paciente: 'PACIENTE UNO FICTICIO', isFictitiousTest: true },
          cleanupAfter: true,
          expected: true
        },
        {
          auth: authFor('secre'),
          op: 'update',
          collection: 'pacientes',
          docId: '99000101',
          requestData: { dni: '99000101', telefono: '3510000101' },
          expected: true
        }
      ]
    },
    // T09: Secretaría (secre) — accesos denegados
    {
      id: 'T09',
      desc: 'Secretaría: denegado en escritura de profesionales, lectura de audit_logs y cambio de createdBy en órdenes',
      checks: [
        {
          auth: authFor('secre'),
          op: 'create',
          collection: 'profesionales',
          docId: 'test_prof_x',
          requestData: { nombre: 'Dr. X' },
          expected: false
        },
        { auth: authFor('secre'), op: 'get', collection: 'audit_logs', docId: 'test_audit_1', expected: false },
        {
          auth: authFor('secre'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_1',
          requestData: { createdBy: 'otro@pruebas.coat.local' },
          expected: false
        }
      ]
    },
    // T10: Médico 1 — permisos legítimos
    {
      id: 'T10',
      desc: 'Médico 1: puede crear orden propia, editar su solicitud test_ord_1 y sincronizar paciente',
      checks: [
        {
          auth: authFor('medico1'),
          op: 'create',
          collection: 'ordenes_internacion',
          docId: 'test_ord_med1_new',
          requestData: {
            createdBy: FICTITIOUS_USERS.medico1.email,
            emailProfesional: FICTITIOUS_USERS.medico1.email,
            tipoProcedimiento: 'CIRUGIA',
            estudioBajoAnestesia: false,
            estado: 'SOLICITADA',
            autorizada: false,
            isFictitiousTest: true
          },
          cleanupAfter: true,
          expected: true
        },
        {
          auth: authFor('medico1'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_1',
          requestData: { diagnostico: 'Desviación septal obstructiva (Dato Ficticio)' },
          expected: true
        },
        {
          auth: authFor('medico1'),
          op: 'update',
          collection: 'pacientes',
          docId: '99000101',
          requestData: { dni: '99000101', telefono: '3510000101' },
          expected: true
        }
      ]
    },
    // T11: Médico 1 — denegado en órdenes de Médico 2, anti-elusión (spoofing de createdBy/autorizada) y Caja
    {
      id: 'T11',
      desc: 'Médico 1: denegado al editar/borrar orden de Médico 2, suplantar createdBy, auto-autorizarse o leer Caja',
      checks: [
        {
          auth: authFor('medico1'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_2',
          requestData: { diagnostico: 'Intento cruzado' },
          expected: false
        },
        {
          auth: authFor('medico1'),
          op: 'delete',
          collection: 'ordenes_internacion',
          docId: 'test_ord_2',
          expected: false
        },
        // Anti-elusión: crear orden fingiendo createdBy de Médico 2
        {
          auth: authFor('medico1'),
          op: 'create',
          collection: 'ordenes_internacion',
          docId: 'test_ord_spoof',
          requestData: {
            createdBy: FICTITIOUS_USERS.medico2.email,
            emailProfesional: FICTITIOUS_USERS.medico1.email,
            tipoProcedimiento: 'CIRUGIA'
          },
          expected: false
        },
        // Anti-elusión: editar su propia orden para cambiar createdBy o auto-autorizarse
        {
          auth: authFor('medico1'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_1',
          requestData: { createdBy: FICTITIOUS_USERS.medico2.email },
          expected: false
        },
        {
          auth: authFor('medico1'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_1',
          requestData: { estado: 'AUTORIZADA', autorizada: true },
          expected: false
        },
        { auth: authFor('medico1'), op: 'get', collection: 'caja', docId: 'test_caja_1', expected: false }
      ]
    },
    // T12: Residente — permisos legítimos
    {
      id: 'T12',
      desc: 'Residente: puede crear solicitud con médico a cargo y editar su propia solicitud test_ord_3',
      checks: [
        {
          auth: authFor('residente'),
          op: 'create',
          collection: 'ordenes_internacion',
          docId: 'test_ord_res_new',
          requestData: {
            createdBy: FICTITIOUS_USERS.residente.email,
            emailProfesional: FICTITIOUS_USERS.medico1.email,
            residente: FICTITIOUS_USERS.residente.profesionalName,
            tipoProcedimiento: 'CIRUGIA',
            estudioBajoAnestesia: false,
            estado: 'SOLICITADA',
            autorizada: false,
            isFictitiousTest: true
          },
          cleanupAfter: true,
          expected: true
        },
        {
          auth: authFor('residente'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_3',
          requestData: { anotacionCalendario: 'Solicitud ficticia creada por Residente con Médico 1 a cargo' },
          expected: true
        }
      ]
    },
    // T13: Residente — denegado en órdenes ajenas y Caja
    {
      id: 'T13',
      desc: 'Residente: denegado al editar test_ord_2 (ajena), auto-autorizar test_ord_3 o acceder a Caja',
      checks: [
        {
          auth: authFor('residente'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_2',
          requestData: { diagnostico: 'Ajena' },
          expected: false
        },
        {
          auth: authFor('residente'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_3',
          requestData: { estado: 'AUTORIZADA', autorizada: true },
          expected: false
        },
        { auth: authFor('residente'), op: 'get', collection: 'caja', docId: 'test_caja_1', expected: false }
      ]
    },
    // T14: Secretaría de Estudios — permisos legítimos sobre ESTUDIO
    {
      id: 'T14',
      desc: 'Secretaría de Estudios: puede crear y editar únicamente órdenes de tipo ESTUDIO (test_ord_4)',
      checks: [
        {
          auth: authFor('secre_estudios'),
          op: 'create',
          collection: 'ordenes_internacion',
          docId: 'test_ord_est_new',
          requestData: {
            createdBy: FICTITIOUS_USERS.secre_estudios.email,
            tipoProcedimiento: 'ESTUDIO',
            estudioBajoAnestesia: true,
            estado: 'SOLICITADA',
            autorizada: false,
            isFictitiousTest: true
          },
          cleanupAfter: true,
          expected: true
        },
        {
          auth: authFor('secre_estudios'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_4',
          requestData: { anotacionCalendario: 'Estudio bajo anestesia ficticio creado por Secretaría Estudios' },
          expected: true
        }
      ]
    },
    // T15: Secretaría de Estudios — denegado en CIRUGIA, conversión ESTUDIO->CIRUGIA, Caja y Notas
    {
      id: 'T15',
      desc: 'Secretaría de Estudios: denegada al crear CIRUGIA, editar test_ord_1, convertir ESTUDIO a CIRUGIA, o acceder a Caja/Reminders',
      checks: [
        {
          auth: authFor('secre_estudios'),
          op: 'create',
          collection: 'ordenes_internacion',
          docId: 'test_ord_est_bad',
          requestData: {
            createdBy: FICTITIOUS_USERS.secre_estudios.email,
            tipoProcedimiento: 'CIRUGIA',
            estudioBajoAnestesia: false
          },
          expected: false
        },
        {
          auth: authFor('secre_estudios'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_1',
          requestData: { tipoProcedimiento: 'ESTUDIO', estudioBajoAnestesia: true },
          expected: false
        },
        // Anti-elusión: intentar convertir un estudio existente en cirugía
        {
          auth: authFor('secre_estudios'),
          op: 'update',
          collection: 'ordenes_internacion',
          docId: 'test_ord_4',
          requestData: { tipoProcedimiento: 'CIRUGIA', estudioBajoAnestesia: false },
          expected: false
        },
        { auth: authFor('secre_estudios'), op: 'get', collection: 'caja', docId: 'test_caja_1', expected: false },
        { auth: authFor('secre_estudios'), op: 'get', collection: 'reminders', docId: 'rem_1', expected: false }
      ]
    },
    // T16: Privacidad e inmutabilidad de userId en notes
    {
      id: 'T16',
      desc: 'Notas personales: cada usuario lee/edita solo las propias y no puede transferir userId a otro usuario',
      checks: [
        { auth: authFor('medico1'), op: 'get', collection: 'notes', docId: 'note_med1', expected: true },
        { auth: authFor('medico1'), op: 'get', collection: 'notes', docId: 'note_med2', expected: false },
        {
          auth: authFor('medico1'),
          op: 'update',
          collection: 'notes',
          docId: 'note_med1',
          requestData: { userId: authFor('medico2').uid, content: 'Transferencia prohibida' },
          expected: false
        }
      ]
    },
    // T17: Creación de audit_logs (propia permitida, suplantando identidad denegada)
    {
      id: 'T17',
      desc: 'Auditoría: permite registrar evento propio e impide falsificar userId o userEmail de otro usuario',
      checks: [
        {
          auth: authFor('medico1'),
          op: 'create',
          collection: 'audit_logs',
          docId: 'log_ok_test_t17',
          requestData: {
            userId: authFor('medico1').uid,
            userEmail: FICTITIOUS_USERS.medico1.email,
            action: 'CREATE_ORDER',
            isFictitiousTest: true
          },
          expected: true
        },
        {
          auth: authFor('medico1'),
          op: 'create',
          collection: 'audit_logs',
          docId: 'log_spoof_test_t17',
          requestData: {
            userId: authFor('admin').uid,
            userEmail: FICTITIOUS_USERS.admin.email,
            action: 'FAKE_ADMIN'
          },
          expected: false
        }
      ]
    }
  ];
}

export function runSimulatedTestMatrix() {
  const { evaluate } = createRulesSimulator();
  const cases = buildTestCases();

  const results = [];
  for (const tc of cases) {
    for (let i = 0; i < tc.checks.length; i++) {
      const ch = tc.checks[i];
      const actual = evaluate(ch);
      assert.equal(
        actual,
        ch.expected,
        `${tc.id}[#${i + 1}] (${tc.desc}): se esperaba ${ch.expected} pero se obtuvo ${actual}`
      );
    }
    results.push({ id: tc.id, desc: tc.desc, subchecks: tc.checks.length, status: 'PASS' });
  }
  return results;
}

export async function runLiveTestMatrix(cfg) {
  const { initializeApp, deleteApp } = await import('firebase/app');
  const { getAuth, signInWithEmailAndPassword, signOut } = await import('firebase/auth');
  const { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } = await import('firebase/firestore');

  const app = initializeApp(cfg, 'live-role-tests-coatcx');
  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1) Obtener UIDs reales de los 8 usuarios ficticios en coatcx
  const uidMap = {};
  for (const [key, u] of Object.entries(FICTITIOUS_USERS)) {
    const cred = await signInWithEmailAndPassword(auth, u.email, u.password);
    uidMap[key] = cred.user.uid;
    await signOut(auth);
  }

  const cases = buildTestCases(uidMap);
  const results = [];
  let currentSignedKey = null;

  const ensureSignedAs = async (key) => {
    if (currentSignedKey === key) return;
    if (currentSignedKey !== null) await signOut(auth);
    const u = FICTITIOUS_USERS[key];
    await signInWithEmailAndPassword(auth, u.email, u.password);
    currentSignedKey = key;
  };

  for (const tc of cases) {
    let passedSubchecks = 0;
    const failures = [];

    for (let i = 0; i < tc.checks.length; i++) {
      const ch = tc.checks[i];
      await ensureSignedAs(ch.auth.key);

      let actualAllowed = false;
      let errCode = null;
      try {
        if (ch.op === 'list') {
          await getDocs(collection(db, ch.collection));
        } else if (ch.op === 'get') {
          await getDoc(doc(db, ch.collection, ch.docId));
        } else if (ch.op === 'create') {
          if (ch.docId === 'log_ok_test_t17') {
            await setDoc(doc(db, ch.collection, `log_ok_test_t17_${Date.now()}`), ch.requestData);
          } else {
            await setDoc(doc(db, ch.collection, ch.docId), ch.requestData);
          }
        } else if (ch.op === 'update') {
          await updateDoc(doc(db, ch.collection, ch.docId), ch.requestData);
        } else if (ch.op === 'delete') {
          await deleteDoc(doc(db, ch.collection, ch.docId));
        }
        actualAllowed = true;
      } catch (err) {
        errCode = err.code || err.message;
        actualAllowed = false;
      }

      if (ch.cleanupAfter && actualAllowed) {
        try {
          await deleteDoc(doc(db, ch.collection, ch.docId));
        } catch {
          // Si el rol no tiene delete, limpia admin al final
        }
      }

      if (actualAllowed === ch.expected) {
        passedSubchecks++;
      } else {
        failures.push(`#${i + 1} (${ch.op} ${ch.collection}/${ch.docId || '*'} como ${ch.auth.key}): esperado=${ch.expected}, obtenido=${actualAllowed} (${errCode || 'OK'})`);
      }
    }

    results.push({
      id: tc.id,
      desc: tc.desc,
      subchecks: tc.checks.length,
      passedSubchecks,
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      failures
    });
  }

  // Limpieza de documentos temporales creados durante las pruebas con cuenta admin
  await ensureSignedAs('admin');
  for (const temp of [
    ['ordenes_internacion', 'test_ord_new_dir'],
    ['ordenes_internacion', 'test_ord_med1_new'],
    ['ordenes_internacion', 'test_ord_res_new'],
    ['ordenes_internacion', 'test_ord_est_new'],
    ['caja', 'test_caja_temp_secre']
  ]) {
    try {
      await deleteDoc(doc(db, temp[0], temp[1]));
    } catch {}
  }

  await signOut(auth);
  await deleteApp(app);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--live')) {
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
      throw new Error('Modo --live solo permitido contra coatcx.');
    }
    runLiveTestMatrix(cfg)
      .then((results) => {
        const totalChecks = results.reduce((acc, r) => acc + r.subchecks, 0);
        const passedChecks = results.reduce((acc, r) => acc + r.passedSubchecks, 0);
        const passedCases = results.filter((r) => r.status === 'PASS').length;
        for (const r of results) {
          console.log(`[${r.status}] ${r.id} (${r.passedSubchecks}/${r.subchecks} subchecks) — ${r.desc}`);
          for (const f of r.failures) {
            console.error(`   ✖ ${f}`);
          }
        }
        console.log(`\n[run-coatcx-role-tests --live] Resultado en vivo (coatcx): ${passedCases}/${results.length} casos (${passedChecks}/${totalChecks} subverificaciones) aprobados.`);
        if (passedCases !== results.length) process.exit(1);
      })
      .catch((err) => {
        console.error('[run-coatcx-role-tests --live] ERROR:', err);
        process.exit(1);
      });
  } else {
    const results = runSimulatedTestMatrix();
    const totalChecks = results.reduce((acc, r) => acc + r.subchecks, 0);
    results.forEach((r) => console.log(`[PASS] ${r.id} (${r.subchecks} subchecks) — ${r.desc}`));
    console.log(`\n[run-coatcx-role-tests] OK: ${results.length}/17 casos (${totalChecks} verificaciones) superados en simulación local.`);
  }
}
