/**
 * Sincronización segura de deducciones y liquidaciones manuales entre
 * localStorage (legado/caché local) y Firestore (fuente de verdad).
 *
 * Evita que registros ya sincronizados o eliminados desde otro equipo
 * vuelvan a crearse en Firestore al reabrir Liquidaciones.
 */

const REGISTRY_PREFIX = 'coat_liq_synced_ids_';

function getDefaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function isLikelyFirestoreId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{15,}$/.test(id) && !/^\d+$/.test(id);
}

export function readSyncedIdRegistry(collectionName, storage = getDefaultStorage()) {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(`${REGISTRY_PREFIX}${collectionName}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function recordSyncedIds(collectionName, ids, storage = getDefaultStorage()) {
  if (!storage) return;
  try {
    const registry = readSyncedIdRegistry(collectionName, storage);
    let changed = false;
    for (const id of ids) {
      if (id !== undefined && id !== null && String(id) !== '') {
        const key = String(id);
        if (!registry.has(key)) {
          registry.add(key);
          changed = true;
        }
      }
    }
    if (changed) {
      storage.setItem(`${REGISTRY_PREFIX}${collectionName}`, JSON.stringify([...registry]));
    }
  } catch {
    // Ignorar errores de cuota de almacenamiento local
  }
}

export function shouldMigrateLocalItem(item, knownCloudIds, syncedRegistry) {
  if (!item || item.id === undefined || item.id === null) return false;
  if (item._synced === true) return false;
  if (item.legacyId !== undefined && item.legacyId !== null && String(item.legacyId) !== '') {
    return false;
  }
  const idStr = String(item.id);
  if (isLikelyFirestoreId(idStr)) return false;
  if (knownCloudIds.has(idStr)) return false;
  if (syncedRegistry.has(idStr)) return false;
  return true;
}

export async function syncLiquidationCollection({
  collectionName,
  localItems = [],
  cloudItems = [],
  addDocumentFn,
  storage = getDefaultStorage(),
}) {
  const knownCloudIds = new Set();
  const cloudIdsToRecord = [];

  for (const item of cloudItems) {
    if (item?.id !== undefined && item?.id !== null) {
      knownCloudIds.add(String(item.id));
      cloudIdsToRecord.push(String(item.id));
    }
    if (item?.legacyId !== undefined && item?.legacyId !== null && String(item.legacyId) !== '') {
      knownCloudIds.add(String(item.legacyId));
      cloudIdsToRecord.push(String(item.legacyId));
    }
  }

  const syncedRegistry = readSyncedIdRegistry(collectionName, storage);
  const missingItems = (localItems || []).filter((item) =>
    shouldMigrateLocalItem(item, knownCloudIds, syncedRegistry)
  );

  const migrated = await Promise.all(
    missingItems.map(async ({ id, _synced, ...item }) => {
      const legacyId = String(id);
      const savedId = await addDocumentFn(collectionName, { ...item, legacyId });
      cloudIdsToRecord.push(legacyId, String(savedId));
      return { ...item, id: savedId, legacyId, _synced: true };
    })
  );

  recordSyncedIds(collectionName, cloudIdsToRecord, storage);

  return [
    ...(cloudItems || []).map((item) => ({ ...item, _synced: true })),
    ...migrated,
  ];
}

export function markLiquidationItemDeleted({
  collectionName,
  id,
  legacyId,
  storage = getDefaultStorage(),
}) {
  recordSyncedIds(collectionName, [id, legacyId], storage);
}

/**
 * Carga deducciones y liquidaciones manuales exclusivamente desde Firestore.
 * No migra ni modifica datos de localStorage y lanza error si la lectura falla,
 * evitando interpretar un fallo de red/permisos como una colección vacía.
 */
export async function loadFirestoreLiquidations({ getCollectionFn }) {
  if (typeof getCollectionFn !== 'function') {
    throw new Error('getCollectionFn es obligatorio para leer liquidaciones desde Firestore.');
  }
  const [cloudDeductions, cloudManualLiqs] = await Promise.all([
    getCollectionFn('deducciones'),
    getCollectionFn('liquidaciones_manuales'),
  ]);
  if (!Array.isArray(cloudDeductions) || !Array.isArray(cloudManualLiqs)) {
    throw new Error('Respuesta inválida al leer deducciones o liquidaciones manuales desde Firestore.');
  }
  return {
    deductions: cloudDeductions,
    manualLiqs: cloudManualLiqs,
  };
}

/**
 * Actualiza la marca `isTransfer` de un movimiento existente de Caja en Firestore,
 * utilizando exactamente el mismo campo (`isTransfer`) que al registrar el pago.
 */
export async function updateCajaTransferStatus({
  entryId,
  isTransfer,
  updateDocumentFn,
}) {
  if (entryId === undefined || entryId === null || String(entryId).trim() === '') {
    throw new Error('No se identificó el movimiento de Caja a actualizar.');
  }
  if (typeof updateDocumentFn !== 'function') {
    throw new Error('updateDocumentFn es obligatorio para actualizar Transferencia en Firestore.');
  }
  const normalizedTransfer = Boolean(isTransfer);
  await updateDocumentFn('caja', String(entryId), { isTransfer: normalizedTransfer });
  return normalizedTransfer;
}

