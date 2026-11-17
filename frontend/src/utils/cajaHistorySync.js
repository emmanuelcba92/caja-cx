/**
 * Inicialización y suscripción segura del historial de Caja.
 * En modo conectado (USE_LOCAL_DB === false), utiliza exclusivamente Firestore
 * y nunca carga ni escribe SEED_CAJA / caja_proto.
 */

export function getInitialCajaHistoryState({ useLocalDb, storageKey, seedCaja = [], storage }) {
  if (!useLocalDb) {
    return {
      history: [],
      status: 'loading',
      error: '',
    };
  }

  let initial = [];
  try {
    const cleared = storage?.getItem('data_cleared');
    const saved = storage?.getItem(storageKey);
    if (saved) {
      initial = JSON.parse(saved);
    } else if (!cleared) {
      storage?.setItem(storageKey, JSON.stringify(seedCaja));
      initial = seedCaja;
    }
  } catch {
    initial = [];
  }

  return {
    history: Array.isArray(initial) ? initial : [],
    status: 'ready',
    error: '',
  };
}

export function subscribeCajaHistory({
  onCollectionSnapshotFn,
  getCollectionFn,
  onData,
  onError,
}) {
  let active = true;
  let unsubscribe;

  const handleSuccess = (rows) => {
    if (!active) return;
    if (Array.isArray(rows)) {
      onData(rows);
    } else {
      onError(new Error('Respuesta inválida al leer el historial de Caja desde Firestore.'));
    }
  };

  const handleFailure = (err) => {
    if (!active) return;
    onError(err instanceof Error ? err : new Error(err?.message || 'Error al cargar el historial de Caja desde Firestore.'));
  };

  try {
    unsubscribe = onCollectionSnapshotFn('caja', handleSuccess, [], handleFailure);
  } catch (syncError) {
    if (typeof getCollectionFn === 'function') {
      Promise.resolve(getCollectionFn('caja'))
        .then(handleSuccess)
        .catch(handleFailure);
    } else {
      handleFailure(syncError);
    }
  }

  return () => {
    active = false;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
