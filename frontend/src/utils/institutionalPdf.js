export const loadPdfImage = (source) => new Promise((resolve, reject) => {
  if (!source || typeof Image === 'undefined' || typeof document === 'undefined') {
    reject(new Error('Sin imagen'));
    return;
  }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    resolve({ data: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height });
  };
  image.onerror = reject;
  image.src = source;
});

export const drawPdfHeader = async (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  try {
    const logo = await loadPdfImage('/coat_logo.png');
    const width = 28;
    doc.addImage(logo.data, 'PNG', 16, 11, width, width / logo.ratio);
  } catch {
    // El texto institucional sigue presente aunque el logo no se pueda cargar.
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CENTRO OTOAUDIOLÓGICO DE ALTA TECNOLOGÍA', pageWidth / 2 + 8, 17, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('NARIZ • GARGANTA • OÍDO', pageWidth / 2 + 8, 22, { align: 'center' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(16, 32, pageWidth - 16, 32);
  doc.setTextColor(0, 0, 0);
};

export const drawPdfFooter = (doc) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(16, pageHeight - 19, pageWidth - 16, pageHeight - 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Urquiza 401 - Alberdi • Córdoba • Tel: (0351) 423-0530 / 423-9428 • WhatsApp: 3543579794', pageWidth / 2, pageHeight - 13, { align: 'center' });
  doc.text('Email: info@coat.com.ar • Web: www.coat.com.ar', pageWidth / 2, pageHeight - 9, { align: 'center' });
  doc.setTextColor(0, 0, 0);
};
