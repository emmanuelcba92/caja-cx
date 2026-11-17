/**
 * Datos ficticios y matriz de pruebas para `coatcx` (Etapa 1).
 *
 * 100 % SINTÉTICO: no contiene nombres, DNIs, matrículas, correos ni importes
 * reales de COAT. Todos los registros usan prefijo `test_` / DNIs `99000xxx` /
 * dominio `@pruebas.coat.local` para poder identificarse y limpiarse sin tocar
 * los datos preexistentes de `coatcx`.
 */

export const TARGET_TEST_PROJECT = 'coatcx';

/**
 * Devuelve el ID de documento en `authorized_emails` para las reglas sin `.lower()` ni `.replace()`:
 * se utiliza el email exacto (que es un ID válido en Firestore al no contener `/`).
 * También exportamos `emailToLegacyDocId` por compatibilidad con utilidades del cliente.
 */
export function emailToAuthDocId(email) {
  return String(email).trim();
}

export function emailToLegacyDocId(email) {
  return String(email).trim().toLowerCase().replace(/[.@]/g, '_');
}

/**
 * 8 usuarios ficticios de prueba (los 6 roles del sistema + 1 segundo médico para
 * pruebas cruzadas de propiedad + 1 usuario autenticado pero NO autorizado).
 */
export const FICTITIOUS_USERS = Object.freeze({
  admin: {
    key: 'admin',
    email: 'admin.test@pruebas.coat.local',
    password: 'TestCoat2026!Adm',
    role: 'admin',
    username: 'admin.test',
    profesionalName: 'Admin Prueba Ficticio',
    professionalId: null,
    docId: 'admin.test@pruebas.coat.local'
  },
  direccion_medica: {
    key: 'direccion_medica',
    email: 'direccion.test@pruebas.coat.local',
    password: 'TestCoat2026!Dir',
    role: 'direccion_medica',
    username: 'direccion.test',
    profesionalName: 'Dra. Elena Vega (Ficticia)',
    professionalId: 'test_prof_dir',
    docId: 'direccion.test@pruebas.coat.local'
  },
  secre: {
    key: 'secre',
    email: 'secre.test@pruebas.coat.local',
    password: 'TestCoat2026!Sec',
    role: 'secre',
    username: 'secre.test',
    profesionalName: 'Secretaría General (Ficticia)',
    professionalId: null,
    docId: 'secre.test@pruebas.coat.local'
  },
  medico1: {
    key: 'medico1',
    email: 'medico1.test@pruebas.coat.local',
    password: 'TestCoat2026!Med1',
    role: 'medico',
    username: 'medico1.test',
    profesionalName: 'Dr. Marcos Ibáñez (Ficticio)',
    professionalId: 'test_prof_1',
    docId: 'medico1.test@pruebas.coat.local'
  },
  medico2: {
    key: 'medico2',
    email: 'medico2.test@pruebas.coat.local',
    password: 'TestCoat2026!Med2',
    role: 'medico',
    username: 'medico2.test',
    profesionalName: 'Dra. Clara Sosa (Ficticia)',
    professionalId: 'test_prof_2',
    docId: 'medico2.test@pruebas.coat.local'
  },
  residente: {
    key: 'residente',
    email: 'residente.test@pruebas.coat.local',
    password: 'TestCoat2026!Res',
    role: 'residente',
    username: 'residente.test',
    profesionalName: 'Dr. Tomás Luna (Residente Ficticio)',
    professionalId: null,
    docId: 'residente.test@pruebas.coat.local'
  },
  secre_estudios: {
    key: 'secre_estudios',
    email: 'estudios.test@pruebas.coat.local',
    password: 'TestCoat2026!Est',
    role: 'secre_estudios',
    username: 'estudios.test',
    profesionalName: 'Secretaría Estudios (Ficticia)',
    professionalId: null,
    docId: 'estudios.test@pruebas.coat.local'
  },
  unauthorized: {
    key: 'unauthorized',
    email: 'intruso.test@pruebas.coat.local',
    password: 'TestCoat2026!Int',
    role: null, // NO tiene documento en authorized_emails
    username: 'intruso.test',
    profesionalName: 'Usuario No Autorizado (Ficticio)',
    professionalId: null,
    docId: 'intruso.test@pruebas.coat.local'
  }
});

/** Documentos de `authorized_emails` (todos salvo `unauthorized`). */
export const FICTITIOUS_AUTHORIZED_EMAILS = Object.values(FICTITIOUS_USERS)
  .filter((u) => u.role !== null)
  .map((u) => ({
    id: u.docId,
    email: u.email,
    username: u.username,
    role: u.role,
    profesionalName: u.profesionalName,
    professionalId: u.professionalId,
    isFictitiousTest: true,
    createdBy: 'seed-coatcx-fictitious'
  }));

/** Roles a garantizar en `roles` (con merge, sin borrar los existentes en coatcx). */
export const FICTITIOUS_ROLES = [
  {
    id: 'admin',
    name: 'Administrador',
    isSystem: true,
    permissions: {
      can_view_admin: true,
      can_manage_users: true,
      can_view_shared_catalog: true,
      can_view_ordenes: true,
      can_share_ordenes: true,
      can_view_stats: true,
      can_delete_data: true,
      can_edit_data: true,
      can_edit_own: true,
      can_delete_own: true,
      readonly_caja: false,
      is_ephemeral: false
    }
  },
  {
    id: 'direccion_medica',
    name: 'Dirección Médica',
    isSystem: true,
    permissions: {
      can_view_admin: true,
      can_view_stats: true,
      can_manage_users: false,
      can_view_shared_catalog: true,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_data: false,
      can_edit_own: false,
      can_delete_own: false,
      readonly_caja: true,
      is_ephemeral: false
    }
  },
  {
    id: 'secre',
    name: 'Secretaria',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: true,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_own: true,
      can_delete_own: true,
      readonly_caja: false,
      is_ephemeral: false
    }
  },
  {
    id: 'medico',
    name: 'Médico',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_data: false,
      can_edit_own: true,
      can_delete_own: false,
      readonly_caja: true,
      is_ephemeral: false
    }
  },
  {
    id: 'residente',
    name: 'Residente',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_delete_data: false,
      can_edit_data: false,
      can_edit_own: true,
      can_delete_own: false,
      readonly_caja: true,
      is_ephemeral: false
    }
  },
  {
    id: 'secre_estudios',
    name: 'Secretaria de Estudios',
    isSystem: true,
    permissions: {
      can_view_admin: false,
      can_manage_users: false,
      can_view_shared_catalog: false,
      can_view_ordenes: true,
      can_share_ordenes: false,
      can_view_stats: false,
      can_delete_data: false,
      can_edit_data: true,
      can_edit_own: true,
      can_delete_own: false,
      readonly_caja: true,
      only_estudios: true,
      is_ephemeral: false
    }
  }
];

/** 4 profesionales 100 % ficticios */
export const FICTITIOUS_PROFESIONALES = [
  {
    id: 'test_prof_1',
    prefijo: 'Dr.',
    nombreOnly: 'Marcos',
    apellido: 'Ibáñez (Ficticio)',
    nombre: 'Dr. Marcos Ibáñez (Ficticio)',
    categoria: 'ORL',
    especialidad: 'Otorrinolaringología',
    mp: '90101',
    me: '40101',
    telefono: '3510000001',
    email: 'medico1.test@pruebas.coat.local',
    modeloLiquidacion: '1',
    isFictitiousTest: true
  },
  {
    id: 'test_prof_2',
    prefijo: 'Dra.',
    nombreOnly: 'Clara',
    apellido: 'Sosa (Ficticia)',
    nombre: 'Dra. Clara Sosa (Ficticia)',
    categoria: 'ORL',
    especialidad: 'Otorrinolaringología',
    mp: '90202',
    me: '40202',
    telefono: '3510000002',
    email: 'medico2.test@pruebas.coat.local',
    modeloLiquidacion: '1',
    isFictitiousTest: true
  },
  {
    id: 'test_prof_dir',
    prefijo: 'Dra.',
    nombreOnly: 'Elena',
    apellido: 'Vega (Ficticia)',
    nombre: 'Dra. Elena Vega (Ficticia)',
    categoria: 'ORL',
    especialidad: 'Otorrinolaringología',
    mp: '90303',
    me: '40303',
    telefono: '3510000003',
    email: 'direccion.test@pruebas.coat.local',
    modeloLiquidacion: '1',
    isFictitiousTest: true
  },
  {
    id: 'test_prof_anes',
    prefijo: 'Dr.',
    nombreOnly: 'Bruno',
    apellido: 'Ríos (Ficticio)',
    nombre: 'Anestesista Dr. Bruno Ríos (Ficticio)',
    categoria: 'Anestesista',
    especialidad: 'Anestesista',
    mp: '88900',
    me: '38900',
    telefono: '3510000004',
    email: 'rios.test@pruebas.coat.local',
    modeloLiquidacion: '1',
    isFictitiousTest: true
  }
];

/** 4 pacientes 100 % ficticios (DNIs serie 99000xxx) */
export const FICTITIOUS_PACIENTES = [
  {
    id: '99000101',
    dni: '99000101',
    nombre: 'PACIENTE UNO FICTICIO',
    paciente: 'PACIENTE UNO FICTICIO',
    obraSocial: 'Particular',
    numeroAfiliado: 'TEST-PART-101',
    telefono: '3510000101',
    edad: '34',
    isFictitiousTest: true
  },
  {
    id: '99000102',
    dni: '99000102',
    nombre: 'PACIENTE DOS FICTICIA',
    paciente: 'PACIENTE DOS FICTICIA',
    obraSocial: 'OSDE',
    numeroAfiliado: 'TEST-OSDE-102',
    telefono: '3510000102',
    edad: '7',
    isFictitiousTest: true
  },
  {
    id: '99000103',
    dni: '99000103',
    nombre: 'PACIENTE TRES FICTICIO',
    paciente: 'PACIENTE TRES FICTICIO',
    obraSocial: 'APROSS',
    numeroAfiliado: 'TEST-APROSS-103',
    telefono: '3510000103',
    edad: '52',
    isFictitiousTest: true
  },
  {
    id: '99000104',
    dni: '99000104',
    nombre: 'PACIENTE CUATRO FICTICIA',
    paciente: 'PACIENTE CUATRO FICTICIA',
    obraSocial: 'SWISS MEDICAL',
    numeroAfiliado: 'TEST-SM-104',
    telefono: '3510000104',
    edad: '28',
    isFictitiousTest: true
  }
];

/** 5 órdenes de internación ficticias que cubren los 6 roles y estados */
export const FICTITIOUS_ORDENES = [
  {
    id: 'test_ord_1',
    afiliado: 'PACIENTE UNO FICTICIO',
    paciente: 'PACIENTE UNO FICTICIO',
    profesional: 'Dr. Marcos Ibáñez (Ficticio)',
    nombreProfesional: 'Dr. Marcos Ibáñez (Ficticio)',
    emailProfesional: 'medico1.test@pruebas.coat.local',
    professionalId: 'test_prof_1',
    residente: '',
    tipoProcedimiento: 'CIRUGIA',
    estudioBajoAnestesia: false,
    conveniosEstudios: {},
    obraSocial: 'Particular',
    numeroAfiliado: 'TEST-PART-101',
    dni: '99000101',
    edad: '34',
    telefono: '3510000101',
    fechaSolicitud: '2026-11-09',
    fechaCirugia: '2026-11-15',
    horaCirugia: '08:00',
    horaFin: '09:30',
    horaIngreso: '07:15',
    ordenIngreso: '1°',
    duracion: '1:30 hs',
    diagnostico: 'Desviación septal obstructiva (Dato Ficticio)',
    tipoAnestesia: 'General',
    incluyeMaterial: false,
    requiereMaterial: 'NO',
    requierePresupuesto: 'SI',
    descripcionMaterial: '',
    anotacionCalendario: 'Solicitud ficticia creada por Médico 1',
    salaCirugia: 'Quirófano 1',
    codigosCirugia: [{ codigo: '03.01.04', nombre: 'Septoplastia' }],
    status: 'pendiente',
    estado: 'SOLICITADA',
    autorizada: false,
    enviada: false,
    createdBy: 'medico1.test@pruebas.coat.local',
    creador: 'Dr. Marcos Ibáñez (Ficticio)',
    creadorRol: 'Medico',
    isFictitiousTest: true
  },
  {
    id: 'test_ord_2',
    afiliado: 'PACIENTE TRES FICTICIO',
    paciente: 'PACIENTE TRES FICTICIO',
    profesional: 'Dra. Clara Sosa (Ficticia)',
    nombreProfesional: 'Dra. Clara Sosa (Ficticia)',
    emailProfesional: 'medico2.test@pruebas.coat.local',
    professionalId: 'test_prof_2',
    residente: '',
    tipoProcedimiento: 'CIRUGIA',
    estudioBajoAnestesia: false,
    conveniosEstudios: {},
    obraSocial: 'APROSS',
    numeroAfiliado: 'TEST-APROSS-103',
    dni: '99000103',
    edad: '52',
    telefono: '3510000103',
    fechaSolicitud: '2026-11-09',
    fechaCirugia: '2026-11-16',
    horaCirugia: '10:00',
    horaFin: '11:30',
    horaIngreso: '09:00',
    ordenIngreso: '2°',
    duracion: '1:30 hs',
    diagnostico: 'Otosclerosis bilateral (Dato Ficticio)',
    tipoAnestesia: 'Local + Sedación',
    incluyeMaterial: true,
    requiereMaterial: 'SI',
    requierePresupuesto: 'NO',
    descripcionMaterial: 'Prótesis de pistón ficticia',
    anotacionCalendario: 'Solicitud ficticia de Médico 2 ya codificada',
    salaCirugia: 'Quirófano 1',
    codigosCirugia: [{ codigo: '03.02.07', nombre: 'Estapedectomía' }],
    status: 'auditada',
    estado: 'CODIFICADA',
    autorizada: false,
    enviada: false,
    createdBy: 'medico2.test@pruebas.coat.local',
    creador: 'Dra. Clara Sosa (Ficticia)',
    creadorRol: 'Medico',
    isFictitiousTest: true
  },
  {
    id: 'test_ord_3',
    afiliado: 'PACIENTE CUATRO FICTICIA',
    paciente: 'PACIENTE CUATRO FICTICIA',
    profesional: 'Dr. Marcos Ibáñez (Ficticio)',
    nombreProfesional: 'Dr. Marcos Ibáñez (Ficticio)',
    emailProfesional: 'medico1.test@pruebas.coat.local',
    professionalId: 'test_prof_1',
    residente: 'Dr. Tomás Luna (Residente Ficticio)',
    tipoProcedimiento: 'CIRUGIA',
    estudioBajoAnestesia: false,
    conveniosEstudios: {},
    obraSocial: 'SWISS MEDICAL',
    numeroAfiliado: 'TEST-SM-104',
    dni: '99000104',
    edad: '28',
    telefono: '3510000104',
    fechaSolicitud: '2026-11-09',
    fechaCirugia: '2026-11-17',
    horaCirugia: '09:00',
    horaFin: '10:00',
    horaIngreso: '08:15',
    ordenIngreso: '1°',
    duracion: '1:00 hs',
    diagnostico: 'Amigdalitis crónica recurrente (Dato Ficticio)',
    tipoAnestesia: 'General',
    incluyeMaterial: false,
    requiereMaterial: 'NO',
    requierePresupuesto: 'SI',
    descripcionMaterial: '',
    anotacionCalendario: 'Solicitud ficticia creada por Residente con Médico 1 a cargo',
    salaCirugia: 'Quirófano 2',
    codigosCirugia: [{ codigo: '03.05.01', nombre: 'Amigdalectomía' }],
    status: 'pendiente',
    estado: 'SOLICITADA',
    autorizada: false,
    enviada: false,
    createdBy: 'residente.test@pruebas.coat.local',
    creador: 'Dr. Tomás Luna (Residente Ficticio)',
    creadorRol: 'Residente',
    isFictitiousTest: true
  },
  {
    id: 'test_ord_4',
    afiliado: 'PACIENTE DOS FICTICIA',
    paciente: 'PACIENTE DOS FICTICIA',
    profesional: 'Dra. Clara Sosa (Ficticia)',
    nombreProfesional: 'Dra. Clara Sosa (Ficticia)',
    emailProfesional: 'medico2.test@pruebas.coat.local',
    professionalId: 'test_prof_2',
    residente: '',
    tipoProcedimiento: 'ESTUDIO',
    estudioBajoAnestesia: true,
    conveniosEstudios: {
      'PEA + OEA + IMPEDANCIOMETRÍA': { convenido: false, valor: '140000' },
      ANESTESIA: { convenido: false, valor: '90000' },
      MEDICAMENTOS_DESCARTABLES: { convenido: true, valor: '' }
    },
    obraSocial: 'OSDE',
    numeroAfiliado: 'TEST-OSDE-102',
    dni: '99000102',
    edad: '7',
    telefono: '3510000102',
    fechaSolicitud: '2026-11-09',
    fechaCirugia: '2026-11-18',
    horaCirugia: '10:30',
    horaFin: '11:30',
    horaIngreso: '09:45',
    ordenIngreso: '1°',
    duracion: '1:00 hs',
    diagnostico: 'Hipoacusia en estudio - PEA bajo anestesia (Dato Ficticio)',
    tipoAnestesia: 'Sedación',
    incluyeMaterial: false,
    requiereMaterial: 'NO',
    requierePresupuesto: 'SI',
    descripcionMaterial: '',
    anotacionCalendario: 'Estudio bajo anestesia ficticio creado por Secretaría Estudios',
    salaCirugia: 'Sala Estudios',
    codigosCirugia: [
      { codigo: 'PEA + OEA + IMPEDANCIOMETRÍA', nombre: 'Potenciales Evocados Auditivos bajo anestesia' }
    ],
    status: 'pendiente',
    estado: 'CODIFICADA',
    autorizada: false,
    enviada: true,
    createdBy: 'estudios.test@pruebas.coat.local',
    creador: 'Secretaría Estudios (Ficticia)',
    creadorRol: 'Secre Estudios',
    isFictitiousTest: true
  },
  {
    id: 'test_ord_5',
    afiliado: 'PACIENTE UNO FICTICIO',
    paciente: 'PACIENTE UNO FICTICIO',
    profesional: 'Dra. Elena Vega (Ficticia)',
    nombreProfesional: 'Dra. Elena Vega (Ficticia)',
    emailProfesional: 'direccion.test@pruebas.coat.local',
    professionalId: 'test_prof_dir',
    residente: '',
    tipoProcedimiento: 'CIRUGIA',
    estudioBajoAnestesia: false,
    conveniosEstudios: {},
    obraSocial: 'Particular',
    numeroAfiliado: 'TEST-PART-101',
    dni: '99000101',
    edad: '34',
    telefono: '3510000101',
    fechaSolicitud: '2026-11-09',
    fechaCirugia: '2026-11-19',
    horaCirugia: '08:00',
    horaFin: '09:00',
    horaIngreso: '07:15',
    ordenIngreso: '1°',
    duracion: '1:00 hs',
    diagnostico: 'Microcirugía laríngea (Dato Ficticio)',
    tipoAnestesia: 'General',
    incluyeMaterial: false,
    requiereMaterial: 'NO',
    requierePresupuesto: 'SI',
    descripcionMaterial: '',
    anotacionCalendario: 'Solicitud propia de Dirección Médica ya autorizada',
    salaCirugia: 'Quirófano 1',
    codigosCirugia: [{ codigo: '03.06.08', nombre: 'Microcirugía de laringe' }],
    status: 'autorizada',
    estado: 'AUTORIZADA',
    autorizada: true,
    enviada: true,
    createdBy: 'direccion.test@pruebas.coat.local',
    creador: 'Dra. Elena Vega (Ficticia)',
    creadorRol: 'Directora',
    isFictitiousTest: true
  }
];

/** 2 movimientos de caja ficticios + 1 comentario diario */
export const FICTITIOUS_CAJA = [
  {
    id: 'test_caja_1',
    fecha: '2026-11-09',
    paciente: 'PACIENTE UNO FICTICIO',
    dni: '99000101',
    obra_social: 'Particular',
    prof_1: 'Dr. Marcos Ibáñez (Ficticio)',
    prof_2: 'Dra. Clara Sosa (Ficticia)',
    prof_3: '',
    porcentaje_prof_1: 75,
    porcentaje_prof_2: 25,
    porcentaje_prof_3: 0,
    pesos: 400000,
    dolares: 200,
    liq_prof_1: 240000,
    liq_prof_1_currency: 'ARS',
    liq_prof_2: 80000,
    liq_prof_2_currency: 'ARS',
    liq_prof_3: 0,
    liq_prof_3_currency: 'ARS',
    anestesista: 'Anestesista Dr. Bruno Ríos (Ficticio)',
    liq_anestesista: 60000,
    liq_anestesista_currency: 'ARS',
    coat_pesos: 20000,
    coat_dolares: 200,
    isTransfer: false,
    comentario: 'Movimiento ficticio 1 en coatcx',
    creadoPor: 'Secretaría General (Ficticia)',
    isFictitiousTest: true
  },
  {
    id: 'test_caja_2',
    fecha: '2026-11-09',
    paciente: 'PACIENTE CUATRO FICTICIA',
    dni: '99000104',
    obra_social: 'SWISS MEDICAL',
    prof_1: 'Dra. Clara Sosa (Ficticia)',
    prof_2: '',
    prof_3: '',
    porcentaje_prof_1: 100,
    porcentaje_prof_2: 0,
    porcentaje_prof_3: 0,
    pesos: 220000,
    dolares: 0,
    liq_prof_1: 150000,
    liq_prof_1_currency: 'ARS',
    liq_prof_2: 0,
    liq_prof_2_currency: 'ARS',
    liq_prof_3: 0,
    liq_prof_3_currency: 'ARS',
    anestesista: 'Anestesista Dr. Bruno Ríos (Ficticio)',
    liq_anestesista: 40000,
    liq_anestesista_currency: 'ARS',
    coat_pesos: 30000,
    coat_dolares: 0,
    isTransfer: true,
    comentario: 'Movimiento ficticio 2 en coatcx',
    creadoPor: 'Admin Prueba Ficticio',
    isFictitiousTest: true
  }
];

export const FICTITIOUS_CAJA_COMENTARIOS = [
  {
    id: '2026-11-09',
    text: 'Cierre diario ficticio de prueba en coatcx',
    updatedBy: 'secre.test@pruebas.coat.local',
    isFictitiousTest: true
  }
];
