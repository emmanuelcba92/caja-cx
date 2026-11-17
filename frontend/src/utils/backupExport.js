/**
 * Utilidad de exportación de respaldos operativos de Cirugías 2.0 (solo lectura).
 * Preserva IDs originales de Firestore, fechas/Timestamps, tipos y referencias entre documentos.
 */

export const BACKUP_FORMAT_VERSION = '2.0';

/**
 * Colecciones de Firestore legibles globalmente por ADMIN según firestore.rules.
 */
export const BACKUP_COLLECTIONS = Object.freeze([
  { name: 'ordenes_internacion', category: 'clinica', description: 'Órdenes de internación, cirugías y estudios' },
  { name: 'pacientes', category: 'clinica', description: 'Padrón de pacientes' },
  { name: 'profesionales', category: 'clinica', description: 'Profesionales y matrículas' },
  { name: 'material_requests', category: 'clinica', description: 'Solicitudes de materiales' },
  { name: 'consentimientos', category: 'consentimientos', description: 'Metadatos de consentimientos (PDFs en Supabase)' },
  { name: 'consent_mappings', category: 'consentimientos', description: 'Mapeos de códigos a consentimientos' },
  { name: 'caja', category: 'financiera', description: 'Movimientos de caja' },
  { name: 'caja_comentarios', category: 'financiera', description: 'Comentarios diarios de caja' },
  { name: 'deducciones', category: 'financiera', description: 'Deducciones de liquidación' },
  { name: 'liquidaciones_manuales', category: 'financiera', description: 'Liquidaciones manuales' },
  { name: 'recibos_libres', category: 'financiera', description: 'Recibos libres' },
  { name: 'presupuestos', category: 'presupuestos', description: 'Presupuestos quirúrgicos (solo lectura)' },
  { name: 'presupuestos_series', category: 'presupuestos', description: 'Series de versionado de presupuestos' },
  { name: 'presupuesto_codigos_config', category: 'presupuestos', description: 'Configuración compartida de códigos de presupuesto' },
  { name: 'authorized_emails', category: 'seguridad', description: 'Usuarios y roles autorizados' },
  { name: 'roles', category: 'seguridad', description: 'Definición de roles y permisos' },
  { name: 'user_surgical_templates', category: 'configuracion', description: 'Plantillas quirúrgicas' },
  { name: 'reminders', category: 'agenda', description: 'Recordatorios operativos' },
  { name: 'audit_logs', category: 'auditoria', description: 'Registro inmutable de auditoría' },
]);

/**
 * Colecciones privadas por usuario según firestore.rules (no exportables globalmente desde el cliente).
 */
export const EXCLUDED_PRIVATE_COLLECTIONS = Object.freeze([
  {
    name: 'notes',
    reason: 'Privada por usuario según firestore.rules (solo listable por userId == auth.uid).',
  },
  {
    name: 'user_settings',
    reason: 'Privada por usuario según firestore.rules (configuración personal y PINs).',
  },
  {
    name: 'access_grants',
    reason: 'Privada por usuario según firestore.rules (ownerUid / grantedEmail).',
  },
]);

function isFirestoreTimestamp(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.toDate === 'function') return true;
  return (
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number' &&
    Object.keys(value).every((k) => k === 'seconds' || k === 'nanoseconds' || k === 'toDate' || k === 'toMillis')
  );
}

/**
 * Serializa valores de Firestore preservando Timestamps, Dates, arrays y objetos anidados.
 */
export function serializeFirestoreValue(value) {
  if (value === null || value === undefined) return value;

  if (isFirestoreTimestamp(value)) {
    const date = typeof value.toDate === 'function'
      ? value.toDate()
      : new Date(value.seconds * 1000 + Math.floor(value.nanoseconds / 1e6));
    return {
      __type: 'firestore_timestamp',
      seconds: typeof value.seconds === 'number' ? value.seconds : Math.floor(date.getTime() / 1000),
      nanoseconds: typeof value.nanoseconds === 'number' ? value.nanoseconds : (date.getTime() % 1000) * 1e6,
      iso: Number.isNaN(date.getTime()) ? null : date.toISOString(),
    };
  }

  if (value instanceof Date) {
    return {
      __type: 'date',
      iso: Number.isNaN(value.getTime()) ? null : value.toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (val !== undefined && typeof val !== 'function') {
        out[key] = serializeFirestoreValue(val);
      }
    }
    return out;
  }

  return value;
}

/**
 * Serializa un documento de Firestore preservando su doc.id original y cualquier campo `id` interno distinto.
 */
export function serializeDocRecord(docSnap) {
  const docId = String(docSnap.id);
  const rawData = typeof docSnap.data === 'function' ? docSnap.data() : (docSnap.data || {});
  const serialized = serializeFirestoreValue(rawData) || {};
  const hasDistinctFieldId =
    serialized.id !== undefined &&
    serialized.id !== null &&
    String(serialized.id) !== docId;

  return {
    ...serialized,
    ...(hasDistinctFieldId ? { _fieldId: serialized.id } : {}),
    _docId: docId,
    id: docId,
  };
}

/**
 * Ejecuta la exportación de respaldo de solo lectura para un administrador autorizado.
 */
export async function exportOperationalBackup({
  db,
  getDocsFn,
  collectionFn,
  isAdmin,
  environment,
  exportedByEmail = null,
  collections = BACKUP_COLLECTIONS,
}) {
  if (!isAdmin) {
    throw new Error('Acceso denegado: solo un administrador autorizado puede exportar respaldos.');
  }
  if (!db || typeof getDocsFn !== 'function' || typeof collectionFn !== 'function') {
    throw new Error('Configuración de Firestore inválida para exportar respaldos.');
  }

  const data = {};
  const counts = {};
  const includedCollections = [];
  const failedCollections = [];

  for (const col of collections) {
    const colName = typeof col === 'string' ? col : col.name;
    try {
      const snap = await getDocsFn(collectionFn(db, colName));
      const docs = (snap?.docs || []).map(serializeDocRecord);
      data[colName] = docs;
      counts[colName] = docs.length;
      includedCollections.push(colName);
    } catch (error) {
      failedCollections.push({
        collection: colName,
        code: error?.code || 'unknown',
        message: error?.message || 'Error al leer la colección',
      });
    }
  }

  const complete = failedCollections.length === 0;
  const backup = {
    metadata: {
      formatVersion: BACKUP_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      environment: environment || 'unknown',
      exportedBy: exportedByEmail || null,
      complete,
      includedCollections,
      excludedCollections: EXCLUDED_PRIVATE_COLLECTIONS,
      failedCollections,
      counts,
      notes: [
        'Los binarios PDF de consentimientos permanecen en Supabase Storage; este respaldo incluye únicamente los metadatos autorizados en Firestore.',
        'Las colecciones privadas por usuario (notes, user_settings, access_grants) y las cuentas de Firebase Auth no se exportan desde el cliente.',
      ],
    },
    data,
  };

  return {
    backup,
    complete,
    includedCollections,
    failedCollections,
  };
}
