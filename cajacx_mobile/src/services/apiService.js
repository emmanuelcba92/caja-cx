import { db } from './firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getDoc, orderBy, limit } from 'firebase/firestore';

const apiService = {
    // Detectar origen para base de datos unificada
    getOrigin() {
        return 'android'; // Marca específica para la App Nativa
    },

    async getCollection(collectionName, filters = {}, sortField = null) {
        let q = collection(db, collectionName);
        
        // Aplicar filtros
        if (Object.keys(filters).length > 0) {
            Object.keys(filters).forEach(key => {
                q = query(q, where(key, "==", filters[key]));
            });
        }

        // Ordenar si se especifica
        if (sortField) {
            q = query(q, orderBy(sortField, "desc"));
        }

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async addDocument(collectionName, data) {
        const enrichedData = {
            ...data,
            origin: this.getOrigin(),
            createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, collectionName), enrichedData);
        return { id: docRef.id, ...enrichedData };
    },

    async updateDocument(collectionName, id, data) {
        const docRef = doc(db, collectionName, id);
        await updateDoc(docRef, data);
        return { id, ...data };
    },

    async deleteDocument(collectionName, id) {
        await deleteDoc(doc(db, collectionName, id));
        return { id };
    }
};

export { apiService };
export default apiService;
