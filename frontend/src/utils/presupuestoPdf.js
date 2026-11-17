import { jsPDF } from 'jspdf';
import {
  calculateValidUntil,
  defaultConditions,
  resolveConditionsEnabled,
} from '../data/presupuestoRules.js';
import {
  formatDate,
  formatDocumentDate,
  formatItemAmountWithIva,
  parseRichText,
  buildPdfFilename,
} from './presupuestoFormat.js';
import { drawPdfHeader, drawPdfFooter } from './institutionalPdf.js';

export const PDF_LAYOUT = {
  PAGE_WIDTH: 210,
  PAGE_HEIGHT: 297,
  LEFT_MARGIN: 20,
  RIGHT_MARGIN: 20,
  CONTENT_WIDTH: 170,
  CONTENT_TOP_Y: 39,
  CONTENT_BOTTOM_Y: 270,
  LINE_HEIGHT: 5.0,
};

function tokenizeRichWords(prefixTokens, bodyText) {
  const tokens = [
    ...prefixTokens,
    ...parseRichText(bodyText || ''),
  ];
  const segments = [];
  for (const token of tokens) {
    const parts = String(token.text || '').split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      segments.push({ text: part, bold: Boolean(token.bold), isSpace: /^\s+$/.test(part) });
    }
  }
  return segments;
}

function buildWrappedRichLines(doc, segments, maxWidth, fontSize) {
  doc.setFontSize(fontSize);
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  for (const seg of segments) {
    if (seg.text.includes('\n')) {
      const subParts = seg.text.split('\n');
      subParts.forEach((sub, idx) => {
        if (sub) {
          doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
          const w = doc.getTextWidth(sub);
          if (currentLine.length > 0 && currentWidth + w > maxWidth) {
            lines.push(currentLine);
            currentLine = [];
            currentWidth = 0;
          }
          currentLine.push({ text: sub, bold: seg.bold, width: w });
          currentWidth += w;
        }
        if (idx < subParts.length - 1) {
          lines.push(currentLine);
          currentLine = [];
          currentWidth = 0;
        }
      });
      continue;
    }

    doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
    const w = doc.getTextWidth(seg.text);

    if (seg.isSpace && currentLine.length === 0) {
      continue;
    }

    if (currentLine.length > 0 && !seg.isSpace && currentWidth + w > maxWidth) {
      while (currentLine.length > 0 && currentLine[currentLine.length - 1].isSpace) {
        currentWidth -= currentLine[currentLine.length - 1].width;
        currentLine.pop();
      }
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }

    currentLine.push({ ...seg, width: w });
    currentWidth += w;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [[]];
}

export async function createPresupuestoPdfDocument(quote, options = {}) {
  if (!quote || typeof quote !== 'object') {
    throw new Error('Se requiere un presupuesto válido para generar el PDF.');
  }

  const drawHeader = options.drawHeader || drawPdfHeader;
  const drawFooter = options.drawFooter || drawPdfFooter;
  const doc = options.doc || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const isObraSocial = quote.tipo === 'obra-social';
  const condiciones = {
    ...defaultConditions(quote.tipo),
    ...(quote.condiciones || {}),
  };
  const condicionesActivas = resolveConditionsEnabled(quote.tipo, quote.condicionesActivas);
  const validUntil = quote.validUntil || calculateValidUntil(quote.fecha, quote.tipo);

  let currentPage = 1;
  let cursorY = PDF_LAYOUT.CONTENT_TOP_Y;
  const placements = [];

  await drawHeader(doc);
  drawFooter(doc);

  const ensureSpace = async (neededHeight) => {
    if (cursorY + neededHeight > PDF_LAYOUT.CONTENT_BOTTOM_Y) {
      doc.addPage();
      currentPage += 1;
      await drawHeader(doc);
      drawFooter(doc);
      cursorY = PDF_LAYOUT.CONTENT_TOP_Y;
    }
  };

  const recordPlacement = (yTop, yBottom) => {
    placements.push({ page: currentPage, yTop, yBottom });
  };

  const writeSimpleLine = async (text, {
    x = PDF_LAYOUT.LEFT_MARGIN,
    fontSize = 10.5,
    bold = false,
    align = 'left',
    lineHeight = PDF_LAYOUT.LINE_HEIGHT,
    maxWidth = PDF_LAYOUT.CONTENT_WIDTH,
    color = [17, 17, 17],
  } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const wrapped = doc.splitTextToSize(String(text || ''), maxWidth);
    for (const line of wrapped) {
      await ensureSpace(lineHeight);
      doc.text(line, x, cursorY, align !== 'left' ? { align } : undefined);
      recordPlacement(cursorY - 3.5, cursorY + 1.5);
      cursorY += lineHeight;
    }
    doc.setTextColor(17, 17, 17);
  };

  const writeLabeledRichParagraph = async (label, body, { fontSize = 9.8, lineHeight = 4.6, gapAfter = 2.4 } = {}) => {
    const segments = tokenizeRichWords(
      label ? [{ text: `${label} `, bold: true }] : [],
      body || ''
    );
    const lines = buildWrappedRichLines(doc, segments, PDF_LAYOUT.CONTENT_WIDTH, fontSize);

    for (const line of lines) {
      await ensureSpace(lineHeight);
      let x = PDF_LAYOUT.LEFT_MARGIN;
      doc.setFontSize(fontSize);
      doc.setTextColor(17, 17, 17);
      for (const seg of line) {
        doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
        doc.text(seg.text, x, cursorY);
        x += seg.width;
      }
      recordPlacement(cursorY - 3.2, cursorY + 1.2);
      cursorY += lineHeight;
    }
    cursorY += gapAfter;
  };

  // Fecha de emisión (alineada a la derecha)
  const rightX = PDF_LAYOUT.LEFT_MARGIN + PDF_LAYOUT.CONTENT_WIDTH;
  await writeSimpleLine(formatDocumentDate(quote.fecha), {
    x: rightX,
    align: 'right',
    fontSize: 10.5,
  });

  if (isObraSocial) {
    cursorY += 1.5;
    await writeSimpleLine(`O. Soc. ${quote.obraSocial || ''}`, {
      fontSize: 10.5,
      bold: true,
    });
  }

  cursorY += 2;
  await writeSimpleLine('PRESUPUESTO PARA CIRUGIA', {
    x: PDF_LAYOUT.PAGE_WIDTH / 2,
    align: 'center',
    fontSize: 11.5,
    bold: true,
    lineHeight: 6,
  });
  cursorY += 3;

  // Datos del paciente
  if (isObraSocial) {
    await writeSimpleLine(`Apellido y Nombre: ${quote.paciente || ''}`, { fontSize: 10.5 });
    await writeSimpleLine(`DNI: ${quote.dni || ''}`, { fontSize: 10.5 });
    await writeSimpleLine(`AF. N.º: ${quote.numeroAfiliado || ''}`, { fontSize: 10.5 });
  } else {
    await writeLabeledRichParagraph('Paciente:', quote.paciente || '', { fontSize: 10.5, lineHeight: 5.2, gapAfter: 0.4 });
    await writeLabeledRichParagraph('D.N.I.:', quote.dni || '', { fontSize: 10.5, lineHeight: 5.2, gapAfter: 0.4 });
    await writeLabeledRichParagraph('Cirugía:', quote.cirugia || '', { fontSize: 10.5, lineHeight: 5.2, gapAfter: 1.0 });
  }

  cursorY += 4;

  // Ítems / conceptos / prácticas
  const items = Array.isArray(quote.items) ? quote.items : [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const prefix = !isObraSocial ? `${i + 1}) ` : '';
    const codePart = isObraSocial && item?.codigo ? `${item.codigo} ` : '';
    const descText = `${prefix}${codePart}${item?.descripcion || ''}`.trim();
    const amountText = formatItemAmountWithIva(item);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.2);
    const amountWidth = amountText ? doc.getTextWidth(amountText) : 0;
    const descMaxWidth = Math.max(70, PDF_LAYOUT.CONTENT_WIDTH - amountWidth - 10);
    const descLines = doc.splitTextToSize(descText, descMaxWidth);
    const rowHeight = Math.max(1, descLines.length) * 5.0 + 1.5;

    await ensureSpace(rowHeight);

    const rowStartY = cursorY;
    for (let lIdx = 0; lIdx < descLines.length; lIdx += 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.2);
      doc.text(descLines[lIdx], PDF_LAYOUT.LEFT_MARGIN, cursorY);
      if (lIdx === 0 && amountText) {
        doc.setFont('helvetica', 'bold');
        doc.text(amountText, rightX, cursorY, { align: 'right' });

        // Línea guía si entra en una línea con espacio suficiente
        if (descLines.length === 1) {
          doc.setFont('helvetica', 'normal');
          const descWidth = doc.getTextWidth(descLines[0]);
          const leaderStart = PDF_LAYOUT.LEFT_MARGIN + descWidth + 2.5;
          const leaderEnd = rightX - amountWidth - 2.5;
          if (leaderEnd - leaderStart > 5) {
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.2);
            doc.line(leaderStart, cursorY - 0.8, leaderEnd, cursorY - 0.8);
          }
        }
      }
      cursorY += 5.0;
    }
    recordPlacement(rowStartY - 3.5, cursorY - 0.5);
    cursorY += 1.2;
  }

  cursorY += 4;

  // Condiciones según modelo (solo las activadas, sin dejar títulos ni espacios cuando se desactivan)
  if (isObraSocial) {
    const hasAnyObraSocialCondition =
      condicionesActivas.inclusiones ||
      condicionesActivas.anestesista ||
      condicionesActivas.exclusiones ||
      condicionesActivas.nota;

    if (hasAnyObraSocialCondition) {
      await writeSimpleLine('MÓDULO QUIRÚRGICO:', { fontSize: 10.2, bold: true, lineHeight: 5.5 });
      cursorY += 1;
      if (condicionesActivas.inclusiones) {
        await writeLabeledRichParagraph('INCLUSIONES:', condiciones.inclusiones);
      }
      if (condicionesActivas.anestesista) {
        await writeLabeledRichParagraph('Honorarios del Anestesista:', condiciones.anestesista);
      }
      if (condicionesActivas.exclusiones) {
        await writeLabeledRichParagraph('EXCLUSIONES:', condiciones.exclusiones);
      }
      if (condicionesActivas.nota) {
        await writeLabeledRichParagraph('Nota:', condiciones.nota);
      }
    }
  } else {
    if (condicionesActivas.incluye) {
      await writeLabeledRichParagraph('Incluye:', condiciones.incluye);
    }
    if (condicionesActivas.excluye) {
      await writeLabeledRichParagraph('Excluye:', condiciones.excluye);
    }
    if (condicionesActivas.nota) {
      await writeLabeledRichParagraph('Nota:', condiciones.nota);
    }
    if (condicionesActivas.facturacion) {
      await writeLabeledRichParagraph('FACTURACION INDIVIDUAL (Cirujano, Anestesista, Clínica):', condiciones.facturacion);
    }
    if (condicionesActivas.transferencia) {
      await writeLabeledRichParagraph('TRANSFERENCIA:', condiciones.transferencia);
    }
  }

  return {
    doc,
    fileName: buildPdfFilename(quote),
    pageCount: currentPage,
    placements,
  };
}

export async function downloadPresupuestoPdf(quote, options = {}) {
  const result = await createPresupuestoPdfDocument(quote, options);
  result.doc.save(result.fileName);
  return result;
}
