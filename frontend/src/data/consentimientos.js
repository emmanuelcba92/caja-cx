// Mapeo de códigos de cirugía a consentimientos
// Cada cirugía puede tener versión adulto y/o menor

// Consentimientos COMBO - requieren múltiples códigos juntos
// Se evalúan PRIMERO, y si aplican, se omiten los individuales de esos códigos
export const CONSENTIMIENTOS_COMBO = [
    {
        nombre: 'TimpanoMastoide',
        codigos: ['030202', '030207'], // Debe tener AMBOS códigos
        adulto: 'TimpanoMastoide adulto.pdf',
        menor: 'TimpanoMastoide Menor.pdf'
    }
];

// Consentimientos individuales por código
export const CONSENTIMIENTOS_MAP = {
    // Amigdalectomía
    '031301': {
        nombre: 'Amigdalectomía',
        adulto: 'Amigdalectomia adulto.pdf',
        menor: 'Amigdalectomia meno.pdf'
    },

    // Microcirugía de laringe (solo uno, sin distinción adulto/menor)
    '030608': {
        nombre: 'Microcirugía de Laringe',
        adulto: 'Microcirugia de laringe.pdf',
        menor: 'Microcirugia de laringe.pdf'
    },

    // Miringoplastia (solo menor disponible)
    '030201': {
        nombre: 'Miringoplastia',
        adulto: null,
        menor: 'Miringoplastia Menor.pdf'
    },

    // Miringotomia
    '030203': {
        nombre: 'Miringotomía',
        adulto: 'Miringotomia adulto.pdf',
        menor: 'Miringotomia menor.pdf'
    },

    // Septumplastia
    '030409': {
        nombre: 'Septumplastia',
        adulto: 'Septumplastia adulto.pdf',
        menor: 'Septumplastia menor.pdf'
    },
    '030412': {
        nombre: 'Septumplastia',
        adulto: 'Septumplastia adulto.pdf',
        menor: 'Septumplastia menor.pdf'
    },

    // Timpanoplastia
    '030202': {
        nombre: 'Timpanoplastia',
        adulto: 'Timpanoplastia Adulto.pdf',
        menor: 'Timpanoplastia Menor.pdf'
    },

    // Mastoide (código individual, para cuando no viene con timpano)
    '030207': {
        nombre: 'Mastoidectomía',
        adulto: null,  // Si no tiene consentimiento individual, poner null
        menor: null
    },

    // Cirugía Endoscópica
    '030517': {
        nombre: 'Cirugía Endoscópica',
        adulto: 'Cirugia Endoscopica adulto.pdf',
        menor: 'Cirugia Endoscopica menor.pdf'
    },
    '030562': {
        nombre: 'Cirugía Endoscópica',
        adulto: 'Cirugia Endoscopica adulto.pdf',
        menor: 'Cirugia Endoscopica menor.pdf'
    },
    '030565': {
        nombre: 'Cirugía Endoscópica',
        adulto: 'Cirugia Endoscopica adulto.pdf',
        menor: 'Cirugia Endoscopica menor.pdf'
    },
    '030566': {
        nombre: 'Cirugía Endoscópica',
        adulto: 'Cirugia Endoscopica adulto.pdf',
        menor: 'Cirugia Endoscopica menor.pdf'
    }
};

// Archivo genérico
export const CONSENTIMIENTO_GENERICO = 'Consentimiento_Generico.pdf';
