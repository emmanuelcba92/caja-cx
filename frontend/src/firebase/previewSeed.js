/**
 * Semilla de datos ficticios mínimos para el Modo Vista Previa Local.
 * Exclusivo del entorno local (localhost / 127.0.0.1) cuando se activa explícitamente.
 * NO contiene ni descarga datos reales de producción.
 */

const PREVIEW_SEED_VERSION = 'coat_preview_seed_v1';

export function seedPreviewDataIfNeeded() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const today = new Date().toISOString().slice(0, 10);

  const demoProfesionales = [
    {
      id: 'demo_prof_1',
      prefijo: 'Dr.',
      nombreOnly: 'Martín',
      apellido: 'Valeriani (Demo)',
      nombre: 'Dr. Martín Valeriani (Demo)',
      categoria: 'ORL',
      especialidad: 'Otorrinolaringología',
      mp: '30101',
      me: '15101',
      telefono: '3515000001',
      email: 'valeriani.demo@coat.local',
      modeloLiquidacion: '1'
    },
    {
      id: 'demo_prof_2',
      prefijo: 'Dra.',
      nombreOnly: 'Laura',
      apellido: 'Romani (Demo)',
      nombre: 'Dra. Laura Romani (Demo)',
      categoria: 'ORL',
      especialidad: 'Otorrinolaringología',
      mp: '30202',
      me: '15202',
      telefono: '3515000002',
      email: 'romani.demo@coat.local',
      modeloLiquidacion: '1'
    },
    {
      id: 'demo_prof_3',
      prefijo: 'Dr.',
      nombreOnly: 'Carlos',
      apellido: 'Molina (Demo)',
      nombre: 'Anestesista Dr. Molina (Demo)',
      categoria: 'Anestesista',
      especialidad: 'Anestesista',
      mp: '28900',
      me: '12900',
      telefono: '3515000003',
      email: 'molina.demo@coat.local',
      modeloLiquidacion: '1'
    }
  ];

  const demoPacientes = [
    {
      id: '30111222',
      dni: '30111222',
      nombre: 'GÓMEZ JUAN CARLOS (DEMO)',
      paciente: 'GÓMEZ JUAN CARLOS (DEMO)',
      obraSocial: 'Particular',
      numeroAfiliado: 'PART-001',
      telefono: '3516111222',
      edad: '38',
      lastUpdate: new Date().toISOString()
    },
    {
      id: '42333444',
      dni: '42333444',
      nombre: 'PÉREZ MARÍA SOL (DEMO)',
      paciente: 'PÉREZ MARÍA SOL (DEMO)',
      obraSocial: 'OSDE',
      numeroAfiliado: '61-042333444-01',
      telefono: '3516333444',
      edad: '9',
      lastUpdate: new Date().toISOString()
    },
    {
      id: '27555666',
      dni: '27555666',
      nombre: 'LÓPEZ SOFÍA ELENA (DEMO)',
      paciente: 'LÓPEZ SOFÍA ELENA (DEMO)',
      obraSocial: 'APROSS',
      numeroAfiliado: '27-555666-00',
      telefono: '3516555666',
      edad: '45',
      lastUpdate: new Date().toISOString()
    },
    {
      id: '35777888',
      dni: '35777888',
      nombre: 'FERNÁNDEZ LUCAS (DEMO)',
      paciente: 'FERNÁNDEZ LUCAS (DEMO)',
      obraSocial: 'SWISS MEDICAL',
      numeroAfiliado: '8000-35777888',
      telefono: '3516777888',
      edad: '29',
      lastUpdate: new Date().toISOString()
    }
  ];

  const demoOrdenes = [
    {
      id: 'demo_ord_1',
      afiliado: 'GÓMEZ JUAN CARLOS (DEMO)',
      paciente: 'GÓMEZ JUAN CARLOS (DEMO)',
      profesional: 'Dr. Martín Valeriani (Demo)',
      nombreProfesional: 'Dr. Martín Valeriani (Demo)',
      emailProfesional: 'valeriani.demo@coat.local',
      professionalId: 'demo_prof_1',
      tipoProcedimiento: 'CIRUGIA',
      estudioBajoAnestesia: false,
      conveniosEstudios: {},
      obraSocial: 'Particular',
      numeroAfiliado: 'PART-001',
      dni: '30111222',
      edad: '38',
      telefono: '3516111222',
      fechaSolicitud: today,
      fechaCirugia: today,
      horaCirugia: '08:00',
      horaFin: '09:30',
      horaIngreso: '07:15',
      ordenIngreso: '1°',
      duracion: '1:30 hs',
      diagnostico: 'Desviación septal obstructiva + Hipertrofia de cornetes (Ficticio)',
      tipoAnestesia: 'General',
      incluyeMaterial: false,
      requiereMaterial: 'NO',
      requierePresupuesto: 'SI',
      descripcionMaterial: '',
      anotacionCalendario: 'Paciente particular con presupuesto aprobado (Demo)',
      salaCirugia: 'Quirófano 1',
      codigosCirugia: [
        { codigo: '03.01.04', nombre: 'Septoplastia' },
        { codigo: '03.01.09', nombre: 'Turbinoplastia bilateral' }
      ],
      status: 'autorizada',
      estado: 'AUTORIZADA',
      autorizada: true,
      enviada: true,
      createdBy: 'preview@coat.local',
      creadorRol: 'Admin',
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_ord_2',
      afiliado: 'PÉREZ MARÍA SOL (DEMO)',
      paciente: 'PÉREZ MARÍA SOL (DEMO)',
      profesional: 'Dra. Laura Romani (Demo)',
      nombreProfesional: 'Dra. Laura Romani (Demo)',
      emailProfesional: 'romani.demo@coat.local',
      professionalId: 'demo_prof_2',
      tipoProcedimiento: 'ESTUDIO',
      estudioBajoAnestesia: true,
      conveniosEstudios: {
        'PEA + OEA + IMPEDANCIOMETRÍA': { convenido: false, valor: '145000' },
        ANESTESIA: { convenido: false, valor: '95000' },
        MEDICAMENTOS_DESCARTABLES: { convenido: true, valor: '' }
      },
      obraSocial: 'OSDE',
      numeroAfiliado: '61-042333444-01',
      dni: '42333444',
      edad: '9',
      telefono: '3516333444',
      fechaSolicitud: today,
      fechaCirugia: today,
      horaCirugia: '10:00',
      horaFin: '11:00',
      horaIngreso: '09:15',
      ordenIngreso: '2°',
      duracion: '1:00 hs',
      diagnostico: 'Hipoacusia neurosensorial en estudio - PEA bajo anestesia (Ficticio)',
      tipoAnestesia: 'Sedación',
      incluyeMaterial: false,
      requiereMaterial: 'NO',
      requierePresupuesto: 'SI',
      descripcionMaterial: '',
      anotacionCalendario: 'Estudio bajo anestesia con presupuesto de prácticas no convenidas (Demo)',
      salaCirugia: 'Sala Estudios',
      codigosCirugia: [
        { codigo: 'PEA + OEA + IMPEDANCIOMETRÍA', nombre: 'Potenciales Evocados Auditivos bajo anestesia' }
      ],
      status: 'pendiente',
      estado: 'CODIFICADA',
      autorizada: false,
      enviada: true,
      createdBy: 'preview@coat.local',
      creadorRol: 'Secre Estudios',
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_ord_3',
      afiliado: 'LÓPEZ SOFÍA ELENA (DEMO)',
      paciente: 'LÓPEZ SOFÍA ELENA (DEMO)',
      profesional: 'Dr. Martín Valeriani (Demo)',
      nombreProfesional: 'Dr. Martín Valeriani (Demo)',
      emailProfesional: 'valeriani.demo@coat.local',
      professionalId: 'demo_prof_1',
      tipoProcedimiento: 'CIRUGIA',
      estudioBajoAnestesia: false,
      conveniosEstudios: {},
      obraSocial: 'APROSS',
      numeroAfiliado: '27-555666-00',
      dni: '27555666',
      edad: '45',
      telefono: '3516555666',
      fechaSolicitud: today,
      fechaCirugia: today,
      horaCirugia: '11:30',
      horaFin: '13:00',
      horaIngreso: '10:30',
      ordenIngreso: '3°',
      duracion: '1:30 hs',
      diagnostico: 'Otosclerosis bilateral (Ficticio)',
      tipoAnestesia: 'Local + Sedación',
      incluyeMaterial: true,
      requiereMaterial: 'SI',
      requierePresupuesto: 'NO',
      descripcionMaterial: '1 (una) Prótesis de estapedectomía de pistón de teflón y platino (Demo)',
      anotacionCalendario: 'Verificar recepción de prótesis en quirófano (Demo)',
      salaCirugia: 'Quirófano 1',
      codigosCirugia: [
        { codigo: '03.02.07', nombre: 'Estapedectomía' }
      ],
      status: 'auditada',
      estado: 'CODIFICADA',
      autorizada: false,
      enviada: false,
      createdBy: 'preview@coat.local',
      creadorRol: 'Medico',
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_ord_4',
      afiliado: 'FERNÁNDEZ LUCAS (DEMO)',
      paciente: 'FERNÁNDEZ LUCAS (DEMO)',
      profesional: 'Dra. Laura Romani (Demo)',
      nombreProfesional: 'Dra. Laura Romani (Demo)',
      emailProfesional: 'romani.demo@coat.local',
      professionalId: 'demo_prof_2',
      tipoProcedimiento: 'CIRUGIA',
      estudioBajoAnestesia: false,
      conveniosEstudios: {},
      obraSocial: 'SWISS MEDICAL',
      numeroAfiliado: '8000-35777888',
      dni: '35777888',
      edad: '29',
      telefono: '3516777888',
      fechaSolicitud: today,
      fechaCirugia: today,
      horaCirugia: '13:30',
      horaFin: '14:30',
      horaIngreso: '12:45',
      ordenIngreso: '4°',
      duracion: '1:00 hs',
      diagnostico: 'Amigdalitis crónica recurrente (Ficticio)',
      tipoAnestesia: 'General',
      incluyeMaterial: false,
      requiereMaterial: 'NO',
      requierePresupuesto: 'SI',
      descripcionMaterial: '',
      anotacionCalendario: 'Módulo SM 01 con presupuesto diferencial (Demo)',
      salaCirugia: 'Quirófano 2',
      codigosCirugia: [
        { codigo: '03.05.01', nombre: 'Amigdalectomía' }
      ],
      status: 'autorizada',
      estado: 'AUTORIZADA',
      autorizada: true,
      enviada: true,
      createdBy: 'preview@coat.local',
      creadorRol: 'Admin',
      createdAt: new Date().toISOString()
    }
  ];

  const demoCaja = [
    {
      id: 'demo_caja_1',
      fecha: today,
      paciente: 'GÓMEZ JUAN CARLOS (DEMO)',
      dni: '30111222',
      obra_social: 'Particular',
      prof_1: 'Dr. Martín Valeriani (Demo)',
      prof_2: 'Dra. Laura Romani (Demo)',
      prof_3: '',
      porcentaje_prof_1: 75,
      porcentaje_prof_2: 25,
      porcentaje_prof_3: 0,
      pesos: 480000,
      dolares: 300,
      liq_prof_1: 300000,
      liq_prof_1_currency: 'ARS',
      liq_prof_2: 100000,
      liq_prof_2_currency: 'ARS',
      liq_prof_3: 0,
      liq_prof_3_currency: 'ARS',
      anestesista: 'Anestesista Dr. Molina (Demo)',
      liq_anestesista: 80000,
      liq_anestesista_currency: 'ARS',
      coat_pesos: 0,
      coat_dolares: 300,
      isTransfer: false,
      comentario: 'Registro ficticio de demostración (Particular)',
      creadoPor: 'Admin (Vista Previa)'
    },
    {
      id: 'demo_caja_2',
      fecha: today,
      paciente: 'FERNÁNDEZ LUCAS (DEMO)',
      dni: '35777888',
      obra_social: 'SWISS MEDICAL',
      prof_1: 'Dra. Laura Romani (Demo)',
      prof_2: '',
      prof_3: '',
      porcentaje_prof_1: 100,
      porcentaje_prof_2: 0,
      porcentaje_prof_3: 0,
      pesos: 350000,
      dolares: 0,
      liq_prof_1: 210000,
      liq_prof_1_currency: 'ARS',
      liq_prof_2: 0,
      liq_prof_2_currency: 'ARS',
      liq_prof_3: 0,
      liq_prof_3_currency: 'ARS',
      anestesista: 'Anestesista Dr. Molina (Demo)',
      liq_anestesista: 60000,
      liq_anestesista_currency: 'ARS',
      coat_pesos: 80000,
      coat_dolares: 0,
      isTransfer: true,
      comentario: 'Registro ficticio de demostración (Coseguro / Diferencial)',
      creadoPor: 'Admin (Vista Previa)'
    }
  ];

  const demoUsers = [
    {
      id: 'preview_coat_local',
      email: 'preview@coat.local',
      username: 'admin.demo',
      role: 'admin',
      profesionalName: 'Dr. Admin (Vista Previa)'
    },
    {
      id: 'valeriani_demo_coat_local',
      email: 'valeriani.demo@coat.local',
      username: 'valeriani.demo',
      role: 'medico',
      profesionalName: 'Dr. Martín Valeriani (Demo)'
    },
    {
      id: 'estudios_demo_coat_local',
      email: 'estudios.demo@coat.local',
      username: 'estudios.demo',
      role: 'secre_estudios',
      profesionalName: 'Secretaría de Estudios (Demo)'
    }
  ];

  const demoNotes = [
    {
      id: 'demo_note_1',
      userId: 'preview-local-admin',
      title: 'Modo Vista Previa Local Activo',
      content: 'Esta nota y todos los registros visibles son datos ficticios locales para revisar el rediseño visual de COAT Cirugías sin conexión a Firebase de producción.',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo_note_2',
      userId: 'preview-local-admin',
      title: 'Verificación de Presupuestos y Caja',
      content: 'Puede recorrer Solicitudes, Presupuestos por Obra Social, Calendario Quirúrgico, Caja Diaria, Liquidaciones, Pacientes, Profesionales, Métricas y Administración.',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ];

  const demoAuditLogs = [
    {
      id: 'demo_audit_1',
      fecha: new Date().toISOString(),
      usuario: 'Admin (Vista Previa)',
      accion: 'CREAR',
      detalle: 'Solicitud ficticia creada para: GÓMEZ JUAN CARLOS (DEMO) - Presupuesto Particular'
    },
    {
      id: 'demo_audit_2',
      fecha: new Date().toISOString(),
      usuario: 'Admin (Vista Previa)',
      accion: 'CODIFICAR',
      detalle: 'Estudio bajo anestesia codificado con presupuesto: PÉREZ MARÍA SOL (DEMO)'
    }
  ];

  // Si aún no se sembró o si las colecciones locales están vacías, sembrar datos ficticios
  const alreadySeeded = localStorage.getItem(PREVIEW_SEED_VERSION) === 'true';
  if (!alreadySeeded || !localStorage.getItem('coat_ordenes_internacion')) {
    localStorage.setItem('coat_profesionales', JSON.stringify(demoProfesionales));
    localStorage.setItem('professionals_proto', JSON.stringify(demoProfesionales));
    localStorage.setItem('profesionales_caja', JSON.stringify(demoProfesionales));

    localStorage.setItem('coat_pacientes', JSON.stringify(demoPacientes));

    localStorage.setItem('coat_ordenes_internacion', JSON.stringify(demoOrdenes));
    localStorage.setItem('surgeries_proto', JSON.stringify(demoOrdenes));

    localStorage.setItem('coat_caja', JSON.stringify(demoCaja));
    localStorage.setItem('caja_proto', JSON.stringify(demoCaja));

    localStorage.setItem('coat_authorized_emails', JSON.stringify(demoUsers));
    localStorage.setItem('coat_notes', JSON.stringify(demoNotes));
    localStorage.setItem('cirugiascoat_audit_log', JSON.stringify(demoAuditLogs));

    // Configurar par de códigos de ejemplo con presupuesto activo para visualizar badges de Presupuesto
    if (!localStorage.getItem('os_code_presupuesto')) {
      localStorage.setItem('os_code_presupuesto', JSON.stringify({
        'Particular||03.01.04': true,
        'SWISS MEDICAL||03.05.01': true,
        'OSDE||03.01.04': true
      }));
    }

    localStorage.setItem(PREVIEW_SEED_VERSION, 'true');
  }
}
