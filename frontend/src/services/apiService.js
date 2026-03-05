import { db, USE_LOCAL_DB, LOCAL_API_URL } from '../firebase/config';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getDoc } from 'firebase/firestore';

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
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return response.json();
        } else {
            const docRef = await addDoc(collection(db, collectionName), data);
            return { id: docRef.id, ...data };
        }
    },

    async updateDocument(collectionName, id, data) {
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return response.json();
        } else {
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, data);
            return { id, ...data };
        }
    },

    async deleteDocument(collectionName, id) {
        if (USE_LOCAL_DB) {
            const response = await fetch(`${LOCAL_API_URL}/data/${collectionName}/${id}`, {
                method: 'DELETE'
            });
            return response.json();
        } else {
            await deleteDoc(doc(db, collectionName, id));
            return { id };
        }
    }
};

export { apiService };
export default apiService;
