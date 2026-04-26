import jsPDF from 'jspdf';

const optimizeImage = async (src, maxWidth = 600) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const scale = Math.min(1, maxWidth / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve({ 
                data: canvas.toDataURL('image/png', 0.8), 
                ratio: img.width / img.height 
            });
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    } catch (e) { return dateStr; }
};

const formatLongDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-');
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return dateStr; }
};

export const generateOrdenPDF = async (previewData, type, mode = 'save') => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const centerX = pageWidth / 2;

    const isInternacion = type === 'internacion' || type === 'ambas';
    const isMaterial = type === 'material' || type === 'ambas';

    const drawPage = async (targetDoc, pageType) => {
        const isInternacionPage = pageType === 'internacion';
        const isEstudio = previewData.estudioBajoAnestesia;
        const title = isInternacionPage
            ? (isEstudio ? 'PEDIDO DE ESTUDIO BAJO ANESTESIA' : 'ORDEN DE INTERNACIÓN')
            : 'ORDEN DE PEDIDO DE MATERIAL';

        // 1. Header: Logo
        try {
            const logoData = await optimizeImage('/coat_logo.png', 400);
            if (logoData) {
                targetDoc.addImage(logoData.data, 'PNG', 15, 12, 35, 35 / logoData.ratio, undefined, 'FAST');
            }
        } catch (e) {}

        // 2. Date at top right
        targetDoc.setFontSize(11);
        targetDoc.setFont("helvetica", "normal");
        targetDoc.setTextColor(0);
        const dateStr = `Córdoba, ${formatLongDate(previewData.fechaDocumento)}`;
        targetDoc.text(dateStr, pageWidth - 15, 20, { align: 'right' });

        // 3. Title
        targetDoc.setFontSize(14);
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text(title, centerX, 55, { align: 'center' });

        // 4. Patient Info
        let y = 70;
        targetDoc.setFontSize(11);
        targetDoc.setFont("helvetica", "normal");
        
        const info = [
            { label: 'Afiliado:', value: (previewData.afiliado || '').toUpperCase() },
            { label: 'Obra social:', value: (previewData.obraSocial || '').toUpperCase() },
            { label: 'Número de afiliado:', value: previewData.numeroAfiliado || '-' },
        ];
        if (previewData.dni) info.push({ label: 'DNI:', value: previewData.dni });

        info.forEach(item => {
            targetDoc.setFont("helvetica", "bold");
            targetDoc.text(item.label, 20, y);
            const labelWidth = targetDoc.getTextWidth(item.label);
            targetDoc.setFont("helvetica", "normal");
            targetDoc.text(String(item.value), 20 + labelWidth + 2, y);
            y += 8;
        });

        // 5. Codes or Materials
        y += 4;
        if (isInternacionPage) {
            targetDoc.setFont("helvetica", "bold");
            const codesLabel = isEstudio ? 'Estudio a realizar:' : 'Códigos de cirugía:';
            targetDoc.text(codesLabel, 20, y);
            y += 8;
            targetDoc.setFont("helvetica", "normal");
            if (previewData.codigosCirugia && previewData.codigosCirugia.length > 0) {
                previewData.codigosCirugia.forEach(cod => {
                    if (cod.codigo || cod.nombre) {
                        const line = `${isEstudio ? '' : cod.codigo} ${cod.nombre ? cod.nombre.toUpperCase() : ''}`;
                        targetDoc.text(line, 25, y);
                        y += 6;
                    }
                });
            }
        } else {
            targetDoc.setFont("helvetica", "bold");
            targetDoc.text("Detalle del material:", 20, y);
            y += 8;
            targetDoc.setFont("helvetica", "normal");
            const splitMaterial = targetDoc.splitTextToSize(previewData.descripcionMaterial || '-', pageWidth - 40);
            targetDoc.text(splitMaterial, 20, y);
            y += (splitMaterial.length * 6);
        }

        // 6. Common fields
        y += 4;
        const details = [
            { label: 'Tipo de anestesia:', value: previewData.tipoAnestesia },
            { label: 'Fecha de cirugía:', value: formatDate(previewData.fechaCirugia) },
        ];
        if (isInternacionPage) details.push({ label: 'Material:', value: previewData.incluyeMaterial ? 'si' : 'no' });
        details.push({ label: 'Diagnóstico:', value: previewData.diagnostico });

        details.forEach(item => {
            targetDoc.setFont("helvetica", "bold");
            targetDoc.text(item.label, 20, y);
            const labelWidth = targetDoc.getTextWidth(item.label);
            targetDoc.setFont("helvetica", "normal");
            targetDoc.text(String(item.value), 20 + labelWidth + 2, y);
            y += 8;
        });

        // 7. Signature Area
        const sigX = pageWidth - 60;
        const sigY = pageHeight - 50;
        
        const profName = previewData.profesional;
        const signatureUrl = previewData.firmaUrl;
        
        if (signatureUrl) {
            try {
                const sigData = await optimizeImage(signatureUrl, 400);
                if (sigData) {
                    // Move signature slightly higher (sigY - 30 instead of -25)
                    targetDoc.addImage(sigData.data, 'PNG', sigX - 15, sigY - 32, 50, 50 / sigData.ratio, undefined, 'FAST');
                }
            } catch (e) {
                console.error("Error loading signature image:", e);
            }
        }

        targetDoc.setFontSize(9);
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text(profName.toUpperCase(), sigX + 10, sigY, { align: 'center' });
        
        const profData = previewData.profesionalData || {};
        targetDoc.setFont("helvetica", "normal");
        const especialidad = profData.especialidad || 'Médico';
        targetDoc.text(especialidad, sigX + 10, sigY + 4, { align: 'center' });
        
        if (profData.mp) {
            let matLine = `MP ${profData.mp}`;
            if (profData.me) matLine += ` - ME ${profData.me}`;
            targetDoc.text(matLine, sigX + 10, sigY + 8, { align: 'center' });
        }
    };

    const fileName = `${type === 'caratula' ? 'Caratula' : 'Orden'}_${(previewData.afiliado || 'Paciente').replace(/\s+/g, '_').toUpperCase()}.pdf`;
    
    // Set document properties so browsers use the correct name when saving from preview
    doc.setProperties({
        title: fileName,
        subject: 'Orden de Internación / Material',
        author: 'COAT Cirugías'
    });

    if (type === 'caratula') {
        const drawCaratula = (targetDoc) => {
            targetDoc.setFontSize(26);
            targetDoc.setFont("helvetica", "bold");
            let cy = 80;
            targetDoc.text((previewData.afiliado || '').toUpperCase(), centerX, cy, { align: 'center' });
            cy += 15;
            targetDoc.text(`DNI ${previewData.dni || '-'}`, centerX, cy, { align: 'center' });
            cy += 15;
            targetDoc.text((previewData.obraSocial || '').toUpperCase(), centerX, cy, { align: 'center' });
            cy += 15;
            targetDoc.text((previewData.profesional || '').toUpperCase(), centerX, cy, { align: 'center' });
            cy += 15;
            targetDoc.text(formatDate(previewData.fechaCirugia || previewData.fechaDocumento), centerX, cy, { align: 'center' });
            cy += 15;
            targetDoc.text(`ALERGIA (${previewData.alergias?.toUpperCase() || '-'})`, centerX, cy, { align: 'center' });
            
            if (previewData.habitacion) {
                targetDoc.setFontSize(30);
                targetDoc.text(previewData.habitacion, pageWidth - 30, 30, { align: 'right' });
            }
        };
        drawCaratula(doc);
    } else if (type === 'generico') {
        // For generic, we just open the generic PDF URL from Firebase
    } else if (type === 'ambas') {
        await drawPage(doc, 'internacion');
        doc.addPage();
        await drawPage(doc, 'material');
    } else {
        await drawPage(doc, type);
    }

    if (mode === 'save') {
        doc.save(fileName);
    } else {
        window.open(doc.output('bloburl'), '_blank');
    }
};
