import { db, USE_LOCAL_DB, LOCAL_API_URL, isLocalEnv } from '../firebase/config';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getDoc, setDoc } from 'firebase/firestore';

const sanitizeData = (data) => {
    if (data === null || typeof data !== 'object') return data;
    
    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item));
    }

    const sanitized = {};
    Object.keys(data).forEach(key => {
        const value = data[key];
        if (value !== undefined) {
            sanitized[key] = (typeof value === 'object' && value !== null) 
                ? sanitizeData(value) 
                : value;
        }
    });
    return sanitized;
};

const apiService = {
    // Methods for any collection
    async getCollection(collectionName, filters = {}) {
        if (USE_LOCAL_DB) {
            const params = new URLSearchParams(filters);
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}?${params}`);
            return response.json();
        } else {
            let q = collection(db, collectionName);
            if (Object.keys(filters).length > 0) {
                Object.keys(filters).forEach(key => {
                    q = query(q, where(key, "==", filters[key]));
                });
            }
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    },

    async getDocument(collectionName, id) {
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}/${id}`);
            if (response.status === 404) return null;
            return response.json();
        } else {
            const docRef = doc(db, collectionName, id);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        }
    },

    async addDocument(collectionName, data) {
        const cleanData = sanitizeData(data);
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cleanData)
            });
            return response.json();
        } else {
            if (cleanData.id) {
                const { id, ...rest } = cleanData;
                const docRef = doc(db, collectionName, id);
                await setDoc(docRef, rest);
                return { id, ...rest };
            } else {
                const docRef = await addDoc(collection(db, collectionName), cleanData);
                return { id: docRef.id, ...cleanData };
            }
        }
    },

    async updateDocument(collectionName, id, data) {
        const cleanData = sanitizeData(data);
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cleanData)
            });
            return response.json();
        } else {
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, cleanData);
            return { id, ...cleanData };
        }
    },

    async deleteDocument(collectionName, id) {
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}/${id}`, {
                method: 'DELETE'
            });
            return response.json();
        } else {
            // SEGURIDAD: Evitar borrados en la nube desde local
            if (isLocalEnv) {
                console.warn("⚠️ Intento de borrado bloqueado: Estás en modo LOCAL conectado a la CLOUD.");
                alert("🔒 SEGURIDAD: No se permite eliminar datos de la nube desde el entorno local.");
                throw new Error("Borrado no permitido en entorno local.");
            }
            await deleteDoc(doc(db, collectionName, id));
            return { id };
        }
    }
};

export { apiService };
export default apiService;
