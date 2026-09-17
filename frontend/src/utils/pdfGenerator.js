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

/**
 * Generate PDF for surgery orders (internación or material)
 * @param {Object} previewData - Surgery data
 * @param {string} type - 'internacion' | 'material' | 'ambas'
 * @param {string} mode - 'save' | 'print'
 */
export const generateOrdenPDF = async (previewData, type, mode = 'save') => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const centerX = pageWidth / 2;

    const drawPage = async (targetDoc, pageType) => {
        const isInternacionPage = pageType === 'internacion';
        const isEstudio = previewData.tipoProcedimiento === 'ESTUDIO' || !!previewData.estudioBajoAnestesia;
        const title = isInternacionPage
            ? (isEstudio ? 'PEDIDO DE ESTUDIO BAJO ANESTESIA' : 'ORDEN DE INTERNACIÓN')
            : 'ORDEN DE PEDIDO DE MATERIAL';

        // Header: Logo and Clinic Info
        if (isInternacionPage) {
            try {
                const logoData = await optimizeImage('/coat_logo.png', 400);
                if (logoData) {
                    targetDoc.addImage(logoData.data, 'PNG', 15, 12, 20, 20 / logoData.ratio, undefined, 'FAST');
                }
            } catch (e) {}

            targetDoc.setTextColor(0);
            targetDoc.setFontSize(13);
            targetDoc.setFont("helvetica", "bold");
            targetDoc.text("CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA", centerX, 22, { align: 'center' });

            targetDoc.setFontSize(9);
            targetDoc.setFont("helvetica", "normal");
            targetDoc.text("NARIZ • GARGANTA • OÍDO", centerX, 28, { align: 'center' });

            targetDoc.setLineWidth(0.2);
            targetDoc.setDrawColor(200);
            targetDoc.line(15, 33, pageWidth - 15, 33);

            // Date
            targetDoc.setFontSize(11);
            targetDoc.setFont("helvetica", "normal");
            targetDoc.text(`Córdoba, ${formatLongDate(previewData.fechaCirugia || previewData.fechaDocumento)}`, pageWidth - 15, 22, { align: 'right' });
        }

        // Title
        targetDoc.setFontSize(14);
        targetDoc.setFont("helvetica", "bold");
        targetDoc.text(title, centerX, isInternacionPage ? 42 : 22, { align: 'center' });

        targetDoc.setLineWidth(0.2);
        targetDoc.setDrawColor(200);
        targetDoc.line(15, (isInternacionPage ? 46 : 26), pageWidth - 15, (isInternacionPage ? 46 : 26));

        // Content
        let y = isInternacionPage ? 54 : 34;
        const lineHeight = 7;

        const addField = (label, value) => {
            if (!value) return;
            targetDoc.setFontSize(10);
            targetDoc.setFont("helvetica", "bold");
            targetDoc.text(`${label}:`, 15, y);
            targetDoc.setFont("helvetica", "normal");
            targetDoc.text(String(value), 60, y);
            y += lineHeight;
        };

        if (isInternacionPage) {
            addField("Profesional", previewData.profesional);
            addField("Paciente", previewData.afiliado || previewData.paciente);
            addField("DNI", previewData.dni);
            addField("Obra Social", previewData.obraSocial);
            addField("N° Afiliado", previewData.numeroAfiliado);
            addField(isEstudio ? "Fecha del Estudio" : "Fecha de Cirugía", formatDate(previewData.fechaCirugia));
            addField("Hora", previewData.horaCirugia);
            addField("Sala", previewData.salaCirugia);
            addField("Anestesia", previewData.tipoAnestesia);
            addField("Diagnóstico", previewData.diagnostico);
            y += 3;

            // Codes
            if (previewData.codigosCirugia?.length > 0) {
                targetDoc.setFont("helvetica", "bold");
                targetDoc.text(isEstudio ? "Estudios:" : "Códigos:", 15, y);
                y += lineHeight;
                targetDoc.setFont("helvetica", "normal");
                previewData.codigosCirugia.forEach(code => {
                    targetDoc.text(`• ${code.codigo} - ${code.nombre}`, 20, y);
                    y += lineHeight;
                });
            }
            y += 3;

            // Material
            if (previewData.incluyeMaterial && previewData.descripcionMaterial) {
                targetDoc.setFont("helvetica", "bold");
                targetDoc.text("Material:", 15, y);
                y += lineHeight;
                targetDoc.setFont("helvetica", "normal");
                const materialLines = targetDoc.splitTextToSize(previewData.descripcionMaterial, pageWidth - 40);
                targetDoc.text(materialLines, 20, y);
                y += materialLines.length * lineHeight;
            }

            // Signature area
            y += 20;
            targetDoc.setLineWidth(0.2);
            targetDoc.line(15, y, 80, y);
            targetDoc.setFontSize(9);
            targetDoc.setFont("helvetica", "normal");
            targetDoc.text("Firma y sello del profesional", 15, y + 5);

            targetDoc.line(pageWidth - 80, y, pageWidth - 15, y);
            targetDoc.text("Aclaración", pageWidth - 80, y + 5);
        } else {
            // Material page
            addField("Profesional", previewData.profesional);
            addField("Paciente", previewData.afiliado || previewData.paciente);
            addField("Fecha", formatDate(previewData.fechaCirugia));
            y += 5;

            if (previewData.descripcionMaterial) {
                targetDoc.setFont("helvetica", "bold");
                targetDoc.text("Material solicitado:", 15, y);
                y += lineHeight;
                targetDoc.setFont("helvetica", "normal");
                const materialLines = targetDoc.splitTextToSize(previewData.descripcionMaterial, pageWidth - 40);
                targetDoc.text(materialLines, 20, y);
            }
        }
    };

    // Draw pages
    const isAmbas = type === 'ambas';

    if (type === 'internacion' || isAmbas) {
        await drawPage(doc, 'internacion');
    }

    if (isAmbas) {
        doc.addPage();
    }

    if (type === 'material' || isAmbas) {
        await drawPage(doc, 'material');
    }

    // Output
    const fileName = `orden_${previewData.afiliado || previewData.paciente || 'paciente'}_${previewData.fechaCirugia || 'fecha'}.pdf`;

    if (mode === 'print') {
        doc.autoPrint();
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url);
        if (printWindow) {
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    } else {
        doc.save(fileName);
    }

    return fileName;
};
