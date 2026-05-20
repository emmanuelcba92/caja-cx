// =====================================================
// SCRIPT PARA ACTUALIZAR PROFESIONALES CON MP/ME
// =====================================================
// 
// INSTRUCCIONES:
// 1. Abrí la app en http://localhost:5173
// 2. Asegurate de estar logueado como Super Admin
// 3. Abrí la consola del navegador (F12 -> pestaña Console)
// 4. Copiá y pegá TODO este código
// 5. Presioná Enter
// =====================================================

(async function () {
    const { collection, getDocs, updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const profesionalesData = {
        'curet': { mp: '9981', me: '2770', especialidad: 'Otorrinolaringología' },
        'romani': { mp: '21911', me: '8310', especialidad: 'Otorrinolaringología' },
        'bruera': { mp: '21944', me: '8961', especialidad: 'Otorrinolaringología' },
        'valeriani': { mp: '25054', me: '9996', especialidad: 'Otorrinolaringología' },
        'escalera': { mp: '26667', me: '11426', especialidad: 'Otorrinolaringología' },
        'sapag': { mp: '27213', me: '14573', especialidad: 'Otorrinolaringología' },
        'hoyos': { mp: '38191', me: '19890', especialidad: 'Otorrinolaringología' },
        'venier': { mp: '39500', me: '20561', especialidad: 'Otorrinolaringología' },
        'valenzuela': { mp: '39500', me: '20651', especialidad: 'Otorrinolaringología' },
        'caballero': { mp: '26027', me: '10613', especialidad: 'Otorrinolaringología' },
        'jasin': { mp: '23780', me: '9993', especialidad: 'Otorrinolaringología' },
        'paredes': { mp: '40998', me: '21700', especialidad: 'Otorrinolaringología' },
        'romero': { mp: '23015', me: '8719', especialidad: 'Otorrinolaringología' },
        'orellano': { mp: '23015', me: '8719', especialidad: 'Otorrinolaringología' },
        'zalazar': { mp: '43805', me: '', especialidad: 'Otorrinolaringología' },
        'ojeda': { mp: '44518', me: '', especialidad: 'Otorrinolaringología' },
        'carranza': { mp: '41671', me: '22476', especialidad: 'Otorrinolaringología' },
    };

    function findData(nombre) {
        const nombreLower = nombre.toLowerCase();
        if (nombreLower.includes('ayudante')) return null;

        for (const [apellido, data] of Object.entries(profesionalesData)) {
            if (nombreLower.includes(apellido)) {
                return data;
            }
        }
        return null;
    }

    console.log('🔄 Buscando profesionales en Firebase...');

    const db = window.__FIREBASE_DB__;
    if (!db) {
        console.error('❌ Error: Firebase DB no disponible. Refrescá la página e intentá de nuevo.');
        return;
    }

    const profsRef = collection(db, 'profesionales');
    const snapshot = await getDocs(profsRef);

    let updated = 0;
    let skipped = 0;

    for (const docSnap of snapshot.docs) {
        const prof = docSnap.data();
        const data = findData(prof.nombre || '');

        if (data) {
            console.log(`✅ Actualizando: ${prof.nombre} -> MP ${data.mp}, ME ${data.me || '-'}`);
            await updateDoc(doc(db, 'profesionales', docSnap.id), {
                mp: data.mp,
                me: data.me,
                especialidad: data.especialidad
            });
            updated++;
        } else {
            console.log(`⏭️ Ignorando: ${prof.nombre}`);
            skipped++;
        }
    }

    console.log('');
    console.log(`✅ Actualizados: ${updated}`);
    console.log(`⏭️ Ignorados: ${skipped}`);
    console.log('🎉 ¡Listo! Refrescá la página para ver los cambios.');
})();
