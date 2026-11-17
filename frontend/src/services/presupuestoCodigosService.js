import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import apiService from './apiService';
import { logAction, AUDIT_ACTIONS } from './auditService';

export const PRESUPUESTO_CODIGOS_COLLECTION = 'presupuesto_codigos_config';
export const PRESUPUESTO_CODIGOS_DOC_ID = 'shared';
export const PRESUPUESTO_CODIGOS_LOCAL_KEY = 'os_code_presupuesto';

export function buildCodeRuleKey(obraSocial, code) {
  if (typeof obraSocial !== 'string' || typeof code !== 'string') {
    throw new Error('obraSocial y código deben ser cadenas de texto.');
  }
  const cleanOs = obraSocial.trim();
  const cleanCode = code.trim();
  if (!cleanOs || !cleanCode) {
    throw new Error('obraSocial y código son obligatorios.');
  }
  if (cleanOs.includes('||') || cleanCode.includes('||')) {
    throw new Error('obraSocial y código no pueden contener "||".');
  }
  return `${cleanOs}||${cleanCode}`;
}

export function parseCodeRuleKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('||');
  if (parts.length !== 2) return null;
  const obraSocial = parts[0].trim();
  const code = parts[1].trim();
  if (!obraSocial || !code) return null;
  return { obraSocial, code };
}

export function normalizeRulesMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
    return {};
  }
  const normalized = {};
  for (const [rawKey, value] of Object.entries(rawMap)) {
    if (!value) continue;
    const parsed = parseCodeRuleKey(rawKey);
    if (!parsed) continue;
    const canonicalKey = buildCodeRuleKey(parsed.obraSocial, parsed.code);
    normalized[canonicalKey] = true;
  }
  return normalized;
}

export function readLocalCodeRules(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage || typeof storage.getItem !== 'function') return {};
  try {
    const raw = storage.getItem(PRESUPUESTO_CODIGOS_LOCAL_KEY);
    if (!raw) return {};
    return normalizeRulesMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function analyzeLocalImport(localRulesInput, remoteRulesInput) {
  const localRules = normalizeRulesMap(localRulesInput);
  const remoteRules = normalizeRulesMap(remoteRulesInput);
  const localKeys = Object.keys(localRules);
  const remoteKeys = Object.keys(remoteRules);

  const newKeys = [];
  const overlappingKeys = [];
  const remoteOnlyKeys = [];

  for (const key of localKeys) {
    if (remoteRules[key]) {
      overlappingKeys.push(key);
    } else {
      newKeys.push(key);
    }
  }
  for (const key of remoteKeys) {
    if (!localRules[key]) {
      remoteOnlyKeys.push(key);
    }
  }

  return {
    localCount: localKeys.length,
    remoteCount: remoteKeys.length,
    newKeys,
    overlappingKeys,
    remoteOnlyKeys,
    hasConflicts: overlappingKeys.length > 0 || remoteKeys.length > 0,
  };
}

function createFirestoreAdapter(firestoreDb = db) {
  const sharedDocRef = () => doc(firestoreDb, PRESUPUESTO_CODIGOS_COLLECTION, PRESUPUESTO_CODIGOS_DOC_ID);

  return {
    async getShared() {
      const snap = await getDoc(sharedDocRef());
      if (!snap.exists()) {
        return { version: 0, rules: {}, updatedAt: null, updatedBy: null, exists: false };
      }
      const data = snap.data() || {};
      return {
        version: Number(data.version) || 0,
        rules: normalizeRulesMap(data.rules),
        updatedAt: data.updatedAt || null,
        updatedBy: data.updatedBy || null,
        exists: true,
      };
    },
    subscribeShared(onNext, onError) {
      return onSnapshot(
        sharedDocRef(),
        (snap) => {
          if (!snap.exists()) {
            onNext({ version: 0, rules: {}, updatedAt: null, updatedBy: null, exists: false });
            return;
          }
          const data = snap.data() || {};
          onNext({
            version: Number(data.version) || 0,
            rules: normalizeRulesMap(data.rules),
            updatedAt: data.updatedAt || null,
            updatedBy: data.updatedBy || null,
            exists: true,
          });
        },
        onError
      );
    },
    async runTx(callback) {
      return runTransaction(firestoreDb, async (tx) => {
        const ref = sharedDocRef();
        const txAdapter = {
          async getShared() {
            const snap = await tx.get(ref);
            if (!snap.exists()) {
              return { version: 0, rules: {}, updatedAt: null, updatedBy: null, exists: false };
            }
            const data = snap.data() || {};
            return {
              version: Number(data.version) || 0,
              rules: normalizeRulesMap(data.rules),
              updatedAt: data.updatedAt || null,
              updatedBy: data.updatedBy || null,
              exists: true,
            };
          },
          setShared(payload, isCreate) {
            if (isCreate) {
              tx.set(ref, payload);
            } else {
              tx.update(ref, payload);
            }
          },
        };
        return callback(txAdapter);
      });
    },
  };
}

export function createPresupuestoCodigosService({
  adapter = createFirestoreAdapter(),
  isReadOnly = () => apiService.isReadOnlyMode(),
  auditLog = logAction,
} = {}) {
  function assertWritable(op) {
    if (isReadOnly()) {
      throw new Error(`[CONSULTA] Operación "${op}" bloqueada: el rol CONSULTA es de solo lectura.`);
    }
  }

  return {
    async getSharedConfig() {
      return adapter.getShared();
    },

    subscribeSharedConfig(onNext, onError) {
      return adapter.subscribeShared(onNext, onError);
    },

    async toggleCodeRule({ obraSocial, code, expectedVersion = null, user = {} } = {}) {
      assertWritable('presupuestoCodigos.toggleCodeRule');
      const key = buildCodeRuleKey(obraSocial, code);
      const actor = user?.email || user?.uid || 'admin';

      const result = await adapter.runTx(async (tx) => {
        const current = await tx.getShared();
        const currentVersion = Number(current?.version) || 0;

        if (expectedVersion !== null && expectedVersion !== undefined && currentVersion !== Number(expectedVersion)) {
          throw new Error(
            'Conflicto de concurrencia: otro administrador modificó la configuración compartida. Recargá antes de volver a guardar.'
          );
        }

        const nextRules = normalizeRulesMap(current?.rules);
        let enabled;
        if (nextRules[key]) {
          delete nextRules[key];
          enabled = false;
        } else {
          nextRules[key] = true;
          enabled = true;
        }

        const nextVersion = currentVersion + 1;
        const now = new Date().toISOString();
        const payload = {
          version: nextVersion,
          rules: nextRules,
          updatedAt: now,
          updatedBy: actor,
        };
        tx.setShared(payload, !current?.exists);

        return {
          ...payload,
          exists: true,
          key,
          enabled,
        };
      });

      await auditLog(
        AUDIT_ACTIONS.UPDATE_PRESUPUESTO_CODIGOS,
        PRESUPUESTO_CODIGOS_DOC_ID,
        `Regla presupuesto ${result.key}: ${result.enabled ? 'SI' : 'NO'}`,
        { key: result.key, enabled: result.enabled, version: result.version }
      );

      return result;
    },

    async importLocalRules({
      localRules,
      expectedVersion = null,
      mode = 'merge',
      confirmOverwrite = false,
      user = {},
    } = {}) {
      assertWritable('presupuestoCodigos.importLocalRules');
      if (mode !== 'merge' && mode !== 'replace') {
        throw new Error('Modo de importación inválido. Use "merge" o "replace".');
      }

      const normalizedLocal = normalizeRulesMap(localRules);
      if (Object.keys(normalizedLocal).length === 0) {
        throw new Error('No hay reglas locales válidas para importar.');
      }

      const actor = user?.email || user?.uid || 'admin';
      const result = await adapter.runTx(async (tx) => {
        const current = await tx.getShared();
        const currentVersion = Number(current?.version) || 0;
        const currentRules = normalizeRulesMap(current?.rules);

        if (expectedVersion !== null && expectedVersion !== undefined && currentVersion !== Number(expectedVersion)) {
          throw new Error(
            'Conflicto de concurrencia: otro administrador modificó la configuración compartida durante la importación.'
          );
        }

        const summary = analyzeLocalImport(normalizedLocal, currentRules);
        if ((summary.hasConflicts || mode === 'replace') && summary.remoteCount > 0 && !confirmOverwrite) {
          throw new Error(
            'La configuración remota ya contiene reglas o conflictos. Confirmá explícitamente antes de sobrescribir o combinar.'
          );
        }

        const nextRules =
          mode === 'replace'
            ? { ...normalizedLocal }
            : { ...currentRules, ...normalizedLocal };

        const nextVersion = currentVersion + 1;
        const now = new Date().toISOString();
        const payload = {
          version: nextVersion,
          rules: nextRules,
          updatedAt: now,
          updatedBy: actor,
        };
        tx.setShared(payload, !current?.exists);

        return {
          ...payload,
          exists: true,
          mode,
          summary,
        };
      });

      await auditLog(
        AUDIT_ACTIONS.IMPORT_PRESUPUESTO_CODIGOS,
        PRESUPUESTO_CODIGOS_DOC_ID,
        `Importación de reglas (${result.mode}) v${result.version}`,
        {
          mode: result.mode,
          version: result.version,
          localCount: result.summary.localCount,
          newCount: result.summary.newKeys.length,
          overlappingCount: result.summary.overlappingKeys.length,
        }
      );

      return result;
    },
  };
}

const presupuestoCodigosService = createPresupuestoCodigosService();
export default presupuestoCodigosService;
