import { db, storage, isTestEnv, LOCAL_API_URL } from '../firebase/config';
import {
  collection, getDocs, addDoc, updateDoc, doc, deleteDoc,
  query, where, orderBy, getDoc, setDoc, writeBatch, onSnapshot, limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Servicio de abstracción para Firestore.
 * Reemplaza las llamadas directas a localStorage por operaciones en la nube.
 */
const apiService = {
  /**
   * Obtener todos los documentos de una colección
   */
  async getCollection(collectionName, filters = []) {
    if (isTestEnv) {
      return this._getLocalCollection(collectionName);
    }

    try {
      let q = collection(db, collectionName);
      
      // Ap filtros
      if (filters.length > 0) {
        const constraints = filters.map(f => where(f.field, f.op || '==', f.value));
        q = query(q, ...constraints);
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
    } catch (error) {
      console.error(`Error getting collection ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Obtener un documento por ID
   */
  async getDocument(collectionName, docId) {
    if (isTestEnv) {
      return this._getLocalDocument(collectionName, docId);
    }

    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return { ...docSnap.data(), id: docSnap.id };
    } catch (error) {
      console.error(`Error getting document ${collectionName}/${docId}:`, error);
      throw error;
    }
  },

  /**
   * Agregar un documento nuevo
   */
  async addDocument(collectionName, data) {
    if (isTestEnv) {
      return this._addLocalDocument(collectionName, data);
    }

    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return docRef.id;
    } catch (error) {
      console.error(`Error adding document to ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Actualizar un documento existente
   */
  async updateDocument(collectionName, docId, data) {
    if (isTestEnv) {
      return this._updateLocalDocument(collectionName, docId, data);
    }

    try {
      const docRef = doc(db, collectionName, docId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error(`Error updating document ${collectionName}/${docId}:`, error);
      throw error;
    }
  },

  /**
   * Eliminar un documento
   */
  async deleteDocument(collectionName, docId) {
    if (isTestEnv) {
      return this._deleteLocalDocument(collectionName, docId);
    }

    try {
      await deleteDoc(doc(db, collectionName, docId));
      return true;
    } catch (error) {
      console.error(`Error deleting document ${collectionName}/${docId}:`, error);
      throw error;
    }
  },

  /**
   * Establecer un documento (crea o reemplaza)
   */
  async setDocument(collectionName, docId, data) {
    if (isTestEnv) {
      return this._addLocalDocument(collectionName, { ...data, id: docId });
    }

    try {
      await setDoc(doc(db, collectionName, docId), {
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return true;
    } catch (error) {
      console.error(`Error setting document ${collectionName}/${docId}:`, error);
      throw error;
    }
  },

  /**
   * Escuchar cambios en tiempo real
   */
  onCollectionSnapshot(collectionName, callback, filters = []) {
    let q = collection(db, collectionName);
    
    if (filters.length > 0) {
      const constraints = filters.map(f => where(f.field, f.op || '==', f.value));
      q = query(q, ...constraints);
    }

    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      callback(data);
    });
  },

  // ========== MÉTODOS LOCALE (localStorage) ==========

  _getLocalCollection(collectionName) {
    const data = localStorage.getItem(`coat_${collectionName}`);
    return data ? JSON.parse(data) : [];
  },

  _getLocalDocument(collectionName, docId) {
    const items = this._getLocalCollection(collectionName);
    return items.find(item => item.id === docId) || null;
  },

  _addLocalDocument(collectionName, data) {
    const items = this._getLocalCollection(collectionName);
    const newId = data.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem = { ...data, id: newId };
    items.push(newItem);
    localStorage.setItem(`coat_${collectionName}`, JSON.stringify(items));
    return newId;
  },

  _updateLocalDocument(collectionName, docId, data) {
    const items = this._getLocalCollection(collectionName);
    const index = items.findIndex(item => item.id === docId);
    if (index === -1) return false;
    items[index] = { ...items[index], ...data };
    localStorage.setItem(`coat_${collectionName}`, JSON.stringify(items));
    return true;
  },

  _deleteLocalDocument(collectionName, docId) {
    let items = this._getLocalCollection(collectionName);
    items = items.filter(item => item.id !== docId);
    localStorage.setItem(`coat_${collectionName}`, JSON.stringify(items));
    return true;
  },

  /**
   * Eliminar todos los documentos de una colección (BLOQUEADO EN PRUEBAS)
   */
  async clearCollection(collectionName) {
    const isProtected = import.meta.env.VITE_BLOCK_DELETES === 'true' || 
                        window.location.hostname.includes('test') ||
                        window.location.hostname.includes('cxtest');
    if (isProtected) {
      console.warn(`[SEGURIDAD BLOQUEADA] Se evitó vaciar la colección ${collectionName}`);
      alert("Acción bloqueada: No se puede vaciar la base de datos desde el entorno de pruebas.");
      return 0;
    }

    if (isTestEnv) {
      localStorage.removeItem(`coat_${collectionName}`);
      return 0;
    }

    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const snapshot = await getDocs(query(collection(db, collectionName), limit(500)));
      if (snapshot.docs.length === 0) { hasMore = false; break; }

      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += snapshot.docs.length;
    }

    return totalDeleted;
  },

  /**
   * Subir archivo a Firebase Storage
   */
  async uploadFile(path, file) {
    if (!storage) {
      throw new Error("Firebase Storage no está configurado.");
    }
    try {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error(`Error uploading file to ${path}:`, error);
      throw error;
    }
  }
};

export default apiService;
export { apiService };
