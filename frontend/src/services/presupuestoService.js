import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import apiService from './apiService';
import { logAction, AUDIT_ACTIONS } from './auditService';
import {
  createQuote,
  getQuoteDerivedStatus,
  prepareEmissionSnapshot,
  prepareNewVersionDraft,
} from '../data/presupuestoRules';
import { getQuoteIssues } from '../utils/presupuestoFormat';

const COLLECTION = 'presupuestos';
const SERIES_COLLECTION = 'presupuestos_series';

export function buildPresupuestoDocId(surgeryId, version) {
  if (!surgeryId || typeof surgeryId !== 'string') {
    throw new Error('surgeryId es obligatorio para identificar un presupuesto.');
  }
  const numVersion = Number(version);
  if (!Number.isInteger(numVersion) || numVersion < 1) {
    throw new Error('El número de versión debe ser un entero mayor o igual a 1.');
  }
  return `${surgeryId}__v${numVersion}`;
}

function createFirestoreAdapter(firestoreDb = db) {
  return {
    async listBySurgery(surgeryId, { onlyEmitted = false } = {}) {
      const colRef = collection(firestoreDb, COLLECTION);
      const constraints = [where('surgeryId', '==', surgeryId)];
      if (onlyEmitted) {
        constraints.push(where('status', 'in', ['emitido', 'reemplazado']));
      }
      const snap = await getDocs(query(colRef, ...constraints));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async getById(presupuestoId) {
      const snap = await getDoc(doc(firestoreDb, COLLECTION, presupuestoId));
      return snap.exists() ? { ...snap.data(), id: snap.id } : null;
    },
    async deleteById(presupuestoId) {
      await deleteDoc(doc(firestoreDb, COLLECTION, presupuestoId));
    },
    async runTx(callback) {
      return runTransaction(firestoreDb, async (tx) => {
        const txAdapter = {
          async getBudget(id) {
            const snap = await tx.get(doc(firestoreDb, COLLECTION, id));
            return snap.exists() ? { ...snap.data(), id: snap.id } : null;
          },
          async getSeries(surgeryId) {
            const snap = await tx.get(doc(firestoreDb, SERIES_COLLECTION, surgeryId));
            return snap.exists() ? { ...snap.data(), id: snap.id } : null;
          },
          setBudget(id, data) {
            tx.set(doc(firestoreDb, COLLECTION, id), data);
          },
          updateBudget(id, data) {
            tx.update(doc(firestoreDb, COLLECTION, id), data);
          },
          deleteBudget(id) {
            tx.delete(doc(firestoreDb, COLLECTION, id));
          },
          setSeries(surgeryId, data) {
            tx.set(doc(firestoreDb, SERIES_COLLECTION, surgeryId), data);
          },
        };
        return callback(txAdapter);
      });
    },
  };
}

function sortVersionsDesc(items = []) {
  return [...items].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
}

export function createPresupuestoService({ adapter = createFirestoreAdapter(), isReadOnly = () => apiService.isReadOnlyMode(), auditLog = logAction } = {}) {
  function assertWritable(op) {
    if (isReadOnly()) {
      throw new Error(`[CONSULTA] Operación "${op}" bloqueada: el rol CONSULTA es de solo lectura.`);
    }
  }

  return {
    /**
     * Consulta el historial de versiones de una cirugía.
     * Para CONSULTA (`onlyEmitted: true`), filtra en la query de Firestore
     * únicamente `emitido` y `reemplazado` para cumplir con firestore.rules.
     */
    async getVersionsBySurgery(surgeryId, { onlyEmitted = false, referenceDateISO } = {}) {
      if (!surgeryId) return [];
      const effectiveOnlyEmitted = onlyEmitted || isReadOnly();
      const rows = await adapter.listBySurgery(surgeryId, { onlyEmitted: effectiveOnlyEmitted });
      const filtered = effectiveOnlyEmitted
        ? rows.filter((r) => r.status === 'emitido' || r.status === 'reemplazado')
        : rows;
      return sortVersionsDesc(filtered).map((row) => ({
        ...row,
        derivedStatus: getQuoteDerivedStatus(row, referenceDateISO),
      }));
    },

    async getEmittedVersions(surgeryId, options = {}) {
      return this.getVersionsBySurgery(surgeryId, { ...options, onlyEmitted: true });
    },

    async getActiveVersion(surgeryId, options = {}) {
      const versions = await this.getVersionsBySurgery(surgeryId, options);
      return (
        versions.find((v) => v.status === 'emitido') ||
        versions.find((v) => v.status === 'borrador') ||
        versions[0] ||
        null
      );
    },

    /**
     * Crea un borrador inicial asociado a una cirugía (v1) o un borrador de
     * renovación/actualización (vN+1) sin alterar la versión emitida previa.
     */
    async createDraft({ surgeryId, tipo = 'particular', initialData = {}, previousVersionId = null, motivoActualizacion = '', user = {} } = {}) {
      assertWritable('presupuestos.createDraft');
      if (!surgeryId || typeof surgeryId !== 'string') {
        throw new Error('surgeryId es obligatorio para crear un presupuesto.');
      }

      const created = await adapter.runTx(async (tx) => {
        const series = await tx.getSeries(surgeryId);
        const currentLatest = Number(series?.latestVersion) || 0;

        if (currentLatest > 0) {
          const latestId = buildPresupuestoDocId(surgeryId, currentLatest);
          const latestDoc = await tx.getBudget(latestId);
          if (latestDoc && latestDoc.status === 'borrador') {
            throw new Error(`Ya existe un borrador abierto (v${currentLatest}) para esta cirugía.`);
          }
        }

        let draft;
        if (previousVersionId || series?.activeEmittedId) {
          const prevId = previousVersionId || series.activeEmittedId;
          const prevDoc = await tx.getBudget(prevId);
          if (!prevDoc) {
            throw new Error('No se encontró la versión emitida previa para renovar/actualizar.');
          }
          if (prevDoc.surgeryId !== surgeryId) {
            throw new Error('La versión previa no pertenece a la cirugía indicada.');
          }
          if (prevDoc.status !== 'emitido') {
            throw new Error('Solo se puede crear una nueva versión a partir de un presupuesto emitido.');
          }
          const nextVersion = Math.max(currentLatest, Number(prevDoc.version) || 1) + 1;
          const docId = buildPresupuestoDocId(surgeryId, nextVersion);
          const baseDraft = prepareNewVersionDraft(prevDoc, {
            fecha: initialData.fecha,
            motivoActualizacion,
          });
          draft = {
            ...baseDraft,
            ...initialData,
            id: docId,
            surgeryId,
            groupId: surgeryId,
            version: nextVersion,
            status: 'borrador',
            previousVersionId: prevId,
            replacedByVersionId: null,
            createdBy: user.email || null,
            createdByName: user.nombre || null,
            updatedBy: user.email || null,
          };
        } else {
          const nextVersion = currentLatest + 1;
          const docId = buildPresupuestoDocId(surgeryId, nextVersion);
          draft = createQuote(tipo, {
            ...initialData,
            id: docId,
            surgeryId,
            groupId: surgeryId,
            version: nextVersion,
            status: 'borrador',
            previousVersionId: null,
            replacedByVersionId: null,
            createdBy: user.email || null,
            createdByName: user.nombre || null,
            updatedBy: user.email || null,
          });
        }

        tx.setBudget(draft.id, draft);
        tx.setSeries(surgeryId, {
          surgeryId,
          latestVersion: draft.version,
          activeEmittedId: series?.activeEmittedId || null,
          updatedAt: draft.updatedAt,
          updatedBy: user.email || null,
        });
        return draft;
      });

      await auditLog(
        AUDIT_ACTIONS.CREATE_PRESUPUESTO_DRAFT,
        created.id,
        `Borrador presupuesto v${created.version} (${surgeryId})`,
        { surgeryId, version: created.version, tipo: created.tipo }
      );
      return created;
    },

    /**
     * Guarda cambios únicamente sobre un presupuesto en estado `borrador`.
     * Rechaza cualquier intento de modificar un presupuesto `emitido` o `reemplazado`.
     */
    async updateDraft(presupuestoId, patch = {}, user = {}) {
      assertWritable('presupuestos.updateDraft');
      if (!presupuestoId) {
        throw new Error('presupuestoId es obligatorio.');
      }

      return adapter.runTx(async (tx) => {
        const existing = await tx.getBudget(presupuestoId);
        if (!existing) {
          throw new Error('Presupuesto no encontrado.');
        }
        if (existing.status !== 'borrador') {
          throw new Error('No se puede modificar un presupuesto ya emitido o reemplazado.');
        }
        if (patch.surgeryId && patch.surgeryId !== existing.surgeryId) {
          throw new Error('No está permitido cambiar la cirugía asociada a un presupuesto.');
        }
        if (patch.groupId && patch.groupId !== existing.groupId) {
          throw new Error('No está permitido cambiar el groupId de un presupuesto.');
        }
        if (patch.version !== undefined && patch.version !== existing.version) {
          throw new Error('No está permitido alterar el número de versión.');
        }

        const merged = createQuote(patch.tipo || existing.tipo, {
          ...existing,
          ...patch,
          id: existing.id,
          surgeryId: existing.surgeryId,
          groupId: existing.groupId,
          version: existing.version,
          status: 'borrador',
          previousVersionId: existing.previousVersionId ?? null,
          replacedByVersionId: null,
          emittedAt: null,
          emittedBy: null,
          emittedByName: null,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy ?? null,
          createdByName: existing.createdByName ?? null,
          updatedAt: new Date().toISOString(),
          updatedBy: user.email || existing.updatedBy || null,
        });

        tx.updateBudget(presupuestoId, merged);
        return merged;
      });
    },

    /**
     * Emite atómicamente un borrador y, si reemplaza una versión emitida previa,
     * la marca como `reemplazado` en la misma transacción sin alterar sus datos.
     */
    async emitPresupuesto(presupuestoId, emitter = {}) {
      assertWritable('presupuestos.emitPresupuesto');
      if (!presupuestoId) {
        throw new Error('presupuestoId es obligatorio para emitir.');
      }

      const emitted = await adapter.runTx(async (tx) => {
        const draft = await tx.getBudget(presupuestoId);
        if (!draft) {
          throw new Error('Presupuesto no encontrado.');
        }
        if (draft.status !== 'borrador') {
          throw new Error('Este presupuesto ya fue emitido o reemplazado.');
        }

        const issues = getQuoteIssues(draft);
        if (issues.length > 0) {
          throw new Error(`Faltan datos obligatorios para emitir: ${issues.join(', ')}.`);
        }

        const series = await tx.getSeries(draft.surgeryId);
        const prevIdToReplace = draft.previousVersionId || series?.activeEmittedId || null;

        let prevDoc = null;
        if (prevIdToReplace) {
          if (prevIdToReplace === presupuestoId) {
            throw new Error('Referencia histórica inválida: un presupuesto no puede reemplazarse a sí mismo.');
          }
          prevDoc = await tx.getBudget(prevIdToReplace);
          if (!prevDoc) {
            throw new Error('La versión anterior referenciada no existe.');
          }
          if (prevDoc.surgeryId !== draft.surgeryId) {
            throw new Error('La versión anterior pertenece a otra cirugía.');
          }
          if (prevDoc.status !== 'emitido') {
            throw new Error('La versión anterior ya fue reemplazada por otra emisión simultánea.');
          }
        }

        const snapshot = prepareEmissionSnapshot(draft, emitter);
        tx.updateBudget(presupuestoId, snapshot);

        if (prevDoc) {
          tx.updateBudget(prevDoc.id, {
            status: 'reemplazado',
            replacedByVersionId: presupuestoId,
            replacedAt: snapshot.emittedAt,
            updatedAt: snapshot.emittedAt,
          });
        }

        tx.setSeries(draft.surgeryId, {
          surgeryId: draft.surgeryId,
          latestVersion: Math.max(Number(series?.latestVersion) || 0, Number(snapshot.version) || 1),
          activeEmittedId: presupuestoId,
          updatedAt: snapshot.emittedAt,
          updatedBy: snapshot.emittedBy,
        });

        return snapshot;
      });

      await auditLog(
        AUDIT_ACTIONS.EMIT_PRESUPUESTO,
        emitted.id,
        `Presupuesto emitido v${emitted.version} (${emitted.surgeryId})`,
        { surgeryId: emitted.surgeryId, version: emitted.version, previousVersionId: emitted.previousVersionId }
      );
      return emitted;
    },

    /**
     * Prepara una renovación / actualización creando un borrador v(N+1)
     * mientras la versión emitida anterior permanece vigente/vencida sin cambios.
     */
    async prepareRenewalDraft(previousPresupuestoId, { fecha, motivoActualizacion = '', user = {} } = {}) {
      assertWritable('presupuestos.prepareRenewalDraft');
      const prev = await adapter.getById(previousPresupuestoId);
      if (!prev) {
        throw new Error('No se encontró el presupuesto a renovar.');
      }
      if (prev.status !== 'emitido') {
        throw new Error('Solo se puede renovar o actualizar un presupuesto emitido.');
      }
      return this.createDraft({
        surgeryId: prev.surgeryId,
        tipo: prev.tipo,
        initialData: fecha ? { fecha } : {},
        previousVersionId: prev.id,
        motivoActualizacion,
        user,
      });
    },

    async deleteDraft(presupuestoId) {
      assertWritable('presupuestos.deleteDraft');
      const deleted = await adapter.runTx(async (tx) => {
        const existing = await tx.getBudget(presupuestoId);
        if (!existing) return null;
        if (existing.status !== 'borrador') {
          throw new Error('No se puede eliminar un presupuesto emitido o reemplazado.');
        }

        const series = await tx.getSeries(existing.surgeryId);
        tx.deleteBudget(presupuestoId);

        if (series && Number(series.latestVersion) === Number(existing.version)) {
          tx.setSeries(existing.surgeryId, {
            ...series,
            surgeryId: existing.surgeryId,
            latestVersion: Math.max(0, Number(existing.version) - 1),
            updatedAt: new Date().toISOString(),
          });
        }

        return existing;
      });

      if (!deleted) return false;
      await auditLog(
        AUDIT_ACTIONS.DELETE_PRESUPUESTO_DRAFT,
        presupuestoId,
        `Borrador eliminado v${deleted.version} (${deleted.surgeryId})`,
        { surgeryId: deleted.surgeryId, version: deleted.version }
      );
      return true;
    },
  };
}

const presupuestoService = createPresupuestoService();
export default presupuestoService;
