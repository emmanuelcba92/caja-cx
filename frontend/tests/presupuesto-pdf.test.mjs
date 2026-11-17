import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPresupuestoPdfDocument, PDF_LAYOUT } from '../src/utils/presupuestoPdf.js';
import { createQuote, defaultConditions } from '../src/data/presupuestoRules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function extractPdfTextContent(doc) {
  const pages = doc?.internal?.pages || [];
  const raw = pages
    .filter(Array.isArray)
    .map((pageLines) => pageLines.join('\n'))
    .join('\n');
  const matches = [...raw.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)].map((m) =>
    m[1].replace(/\\([()\\])/g, '$1')
  );
  return matches.join('');
}

function assertNoHeaderFooterOverlap(placements) {
  assert.ok(placements.length > 0, 'Debe registrar ubicaciones de texto');
  for (const p of placements) {
    assert.ok(
      p.yTop >= PDF_LAYOUT.CONTENT_TOP_Y - 4,
      `Contenido invade membrete en pág ${p.page}: yTop=${p.yTop}`
    );
    assert.ok(
      p.yBottom <= PDF_LAYOUT.CONTENT_BOTTOM_Y + 2,
      `Contenido invade pie de página en pág ${p.page}: yBottom=${p.yBottom}`
    );
  }
}

test('Etapa 4: PDF modelo Particular incluye 3 conceptos, Sin IVA, condiciones completas, vigencia 15 días y texto seleccionable', async () => {
  const quote = createQuote('particular', {
    fecha: '2026-11-14',
    paciente: 'Carlos Alberto Ruiz',
    dni: '30444555',
    cirugia: 'Septoplastia + Turbinoplastia',
  });
  quote.items[0].monto = 1200000;
  quote.items[1].monto = 450000;
  quote.items[2].monto = 800000;

  const result = await createPresupuestoPdfDocument(quote);
  assert.equal(result.pageCount, 1);
  assert.match(result.fileName, /COAT-Particular-carlos-alberto-ruiz-2026-11-14\.pdf/);
  assertNoHeaderFooterOverlap(result.placements);

  const rawPdf = extractPdfTextContent(result.doc);
  assert.match(rawPdf, /CENTRO OTOAUDIOL/);
  assert.match(rawPdf, /PRESUPUESTO PARA CIRUGIA/);
  assert.match(rawPdf, /Carlos Alberto Ruiz/);
  assert.match(rawPdf, /30444555/);
  assert.match(rawPdf, /14\/11\/2026/);
  assert.doesNotMatch(rawPdf, /Vigencia hasta:/);
  assert.match(rawPdf, /Validez el presupuesto 15/);
  assert.match(rawPdf, /\$ 1\.200\.000,00\.- Sin IVA/);
  assert.match(rawPdf, /\$ 450\.000,00\.- Sin IVA/);
  assert.match(rawPdf, /\$ 800\.000,00\.-/);
  // Derechos sanatoriales no debe mostrar Sin IVA ni recalcular
  assert.doesNotMatch(rawPdf, /\$ 800\.000,00\.- Sin IVA/);
  assert.match(rawPdf, /FACTURACION INDIVIDUAL/);
  assert.match(rawPdf, /TRANSFERENCIA:/);
  // No debe repetir el bloque institucional en el cuerpo de particulares, pero sí conservar el pie institucional
  assert.doesNotMatch(rawPdf, /C\.O\.A\.T\. CUIT: 30-68228543-1/);
  assert.doesNotMatch(rawPdf, /De Cl.*nica Privada COAT SRL/);
  assert.doesNotMatch(rawPdf, /TEL: 54-351-4-230530/);
  assert.match(rawPdf, /Urquiza 401 - Alberdi/);
  assert.match(rawPdf, /info@coat\.com\.ar/);
});

test('Etapa 4: PDF modelo Obra Social incluye afiliado, prácticas, A valor convenido, condiciones y vigencia 30 días', async () => {
  const quote = createQuote('obra-social', {
    fecha: '2026-11-01',
    obraSocial: 'SANCOR SALUD',
    paciente: 'Laura Fernández',
    dni: '29111222',
    numeroAfiliado: '887766-01',
    items: [
      { id: '1', codigo: '030473', descripcion: 'TURBINOPLASTIA POR RADIOFRECUENCIA', monto: null, aConvenir: true, iva: 'no-indicar', ivaEditable: true },
      { id: '2', codigo: '030101', descripcion: 'SEPTOPLASTIA', monto: 950000, aConvenir: false, iva: 'no-indicar', ivaEditable: true },
    ],
  });

  const result = await createPresupuestoPdfDocument(quote);
  assert.equal(result.pageCount, 1);
  assertNoHeaderFooterOverlap(result.placements);

  const rawPdf = extractPdfTextContent(result.doc);
  assert.match(rawPdf, /O\. Soc\. SANCOR SALUD/);
  assert.match(rawPdf, /Apellido y Nombre: Laura Fern/);
  assert.match(rawPdf, /AF\. N\..*: 887766-01/);
  assert.match(rawPdf, /01\/11\/2026/);
  assert.doesNotMatch(rawPdf, /Vigencia hasta:/);
  assert.match(rawPdf, /Vigencia del presente presupuesto 30/);
  assert.match(rawPdf, /030473 TURBINOPLASTIA POR RADIOFRECUENCIA/);
  assert.match(rawPdf, /A valor convenido\./);
  assert.match(rawPdf, /\$ 950\.000,00\.-/);
  assert.match(rawPdf, /MODULO QUIRURGICO:|M.*DULO QUIR.*RGICO:/);
  assert.match(rawPdf, /INCLUSIONES:/);
  assert.match(rawPdf, /EXCLUSIONES:/);
});

test('Etapa 4: documento multipágina con muchas prácticas y condiciones extensas no invade membrete ni pie', async () => {
  const manyItems = Array.from({ length: 34 }, (_, idx) => ({
    id: `p_${idx}`,
    codigo: `0304${String(idx).padStart(2, '0')}`,
    descripcion: `Práctica quirúrgica otorrinolaringológica número ${idx + 1} con detalle extendido de módulo`,
    monto: idx % 2 === 0 ? 500000 + idx * 1000 : null,
    aConvenir: idx % 2 !== 0,
    iva: 'no-indicar',
    ivaEditable: true,
  }));

  const longNote = Array.from({ length: 12 }, (_, i) => `Cláusula histórica adicional ${i + 1} con texto extenso de cobertura y condiciones administrativas.`).join(' ');
  const quote = createQuote('obra-social', {
    fecha: '2026-11-14',
    obraSocial: 'OSDE',
    paciente: 'Paciente Multipágina',
    dni: '27000111',
    numeroAfiliado: '123456',
    items: manyItems,
    condiciones: {
      ...defaultConditions('obra-social'),
      inclusiones: `${defaultConditions('obra-social').inclusiones} ${longNote}`,
      exclusiones: `${defaultConditions('obra-social').exclusiones} ${longNote}`,
    },
  });

  const result = await createPresupuestoPdfDocument(quote);
  assert.ok(result.pageCount >= 2, `Se esperaban >= 2 páginas, se obtuvieron ${result.pageCount}`);
  assertNoHeaderFooterOverlap(result.placements);
});

test('Etapa 4: reproducción fiel de snapshot histórico sin escrituras en Firestore', async () => {
  const historicalSnapshot = {
    id: 'ord_hist__v1',
    tipo: 'particular',
    status: 'reemplazado',
    fecha: '2025-05-10',
    validUntil: '2025-05-25',
    paciente: 'Paciente Histórico',
    dni: '20999888',
    cirugia: 'Amigdalectomía',
    items: [
      { id: '1', roleKey: 'equipo_quirurgico', descripcion: 'Honorarios Equipo Quirúrgico', monto: 600000, iva: 'sin-iva', ivaEditable: true },
      { id: '2', roleKey: 'anestesista', descripcion: 'Honorarios Anestesista', monto: 220000, iva: 'iva-21', ivaEditable: true },
      { id: '3', roleKey: 'derechos_sanatoriales', descripcion: 'Derechos Sanatoriales COAT', monto: 400000, iva: 'no-indicar', ivaEditable: false },
    ],
    condiciones: {
      incluye: 'Texto histórico original 2025.',
      excluye: 'Exclusión histórica original 2025.',
      nota: 'Validez histórica 15 días.',
      facturacion: 'Facturación histórica.',
      transferencia: 'Alias histórico COAT.2025',
    },
  };

  const result = await createPresupuestoPdfDocument(historicalSnapshot);
  const rawPdf = extractPdfTextContent(result.doc);
  assert.match(rawPdf, /10\/05\/2025/);
  assert.doesNotMatch(rawPdf, /Vigencia hasta:/);
  assert.match(rawPdf, /Texto hist.*original 2025/);
  assert.match(rawPdf, /Alias hist.*COAT\.2025/);
  assert.match(rawPdf, /\$ 220\.000,00\.- \+ IVA 21%\./);

  // Verificar que ni presupuestoPdf.js ni PresupuestoPreview.jsx importan Firestore ni realizan escrituras
  const pdfSrc = readFileSync(resolve(ROOT, 'src/utils/presupuestoPdf.js'), 'utf8');
  const previewSrc = readFileSync(resolve(ROOT, 'src/components/PresupuestoPreview.jsx'), 'utf8');
  assert.doesNotMatch(pdfSrc, /firebase\/firestore|setDoc|updateDoc|addDoc|deleteDoc|runTransaction/);
  assert.doesNotMatch(previewSrc, /firebase\/firestore|setDoc|updateDoc|addDoc|deleteDoc|runTransaction/);

  // Verificar reutilización del membrete/pie compartido entre PrintConsole y PresupuestoPreview
  const printSrc = readFileSync(resolve(ROOT, 'src/components/PrintConsole.jsx'), 'utf8');
  assert.match(printSrc, /from '\.\/InstitutionalBrand'/);
  assert.match(previewSrc, /from '\.\/InstitutionalBrand\.jsx'/);
  assert.doesNotMatch(previewSrc, /C\.O\.A\.T\. CUIT:/);
  assert.match(previewSrc, /<InstitutionalFooter \/>/);
});

test('Condiciones opcionales: al desactivar una condición no aparece título, texto ni espacio reservado en el PDF, conservando su texto en datos', async () => {
  const fullOssQuote = createQuote('obra-social', {
    fecha: '2026-11-16',
    obraSocial: 'OSDE',
    paciente: 'Lucía Sosa',
    dni: '33222111',
    numeroAfiliado: '554433',
    items: [
      { id: '1', codigo: '030101', descripcion: 'SEPTOPLASTIA', monto: 850000, aConvenir: false, iva: 'no-indicar', ivaEditable: true },
    ],
  });

  const fullResult = await createPresupuestoPdfDocument(fullOssQuote);
  const fullBottomY = Math.max(...fullResult.placements.map((p) => p.yBottom));

  // Desactivar "anestesista" y "exclusiones" manteniendo su texto en condiciones
  const partialOssQuote = createQuote('obra-social', {
    ...fullOssQuote,
    condicionesActivas: {
      inclusiones: true,
      anestesista: false,
      exclusiones: false,
      nota: true,
    },
  });

  // El texto original sigue conservado en el objeto del presupuesto
  assert.match(partialOssQuote.condiciones.anestesista, /ADAARC/);
  assert.match(partialOssQuote.condiciones.exclusiones, /laboratorio/);

  const partialResult = await createPresupuestoPdfDocument(partialOssQuote);
  const partialRaw = extractPdfTextContent(partialResult.doc);
  const partialBottomY = Math.max(...partialResult.placements.map((p) => p.yBottom));

  // Las condiciones activas aparecen con título y texto
  assert.match(partialRaw, /INCLUSIONES:/);
  assert.match(partialRaw, /Derechos de quir.*fano/);
  assert.match(partialRaw, /Nota:/);
  assert.match(partialRaw, /Vigencia del presente presupuesto 30/);

  // Las condiciones desactivadas NO aparecen (ni título ni texto) y no reservan espacio vertical
  assert.doesNotMatch(partialRaw, /Honorarios del Anestesista:/);
  assert.doesNotMatch(partialRaw, /ADAARC/);
  assert.doesNotMatch(partialRaw, /EXCLUSIONES:/);
  assert.doesNotMatch(partialRaw, /anatom.*a patol.*gica/i);
  assert.ok(
    partialBottomY < fullBottomY - 15,
    `El PDF sin 2 condiciones debe ocupar menos altura (partialBottomY=${partialBottomY}, fullBottomY=${fullBottomY})`
  );

  // Si todas las condiciones de obra social están desactivadas, tampoco aparece el encabezado MÓDULO QUIRÚRGICO
  const noCondQuote = createQuote('obra-social', {
    ...fullOssQuote,
    condicionesActivas: {
      inclusiones: false,
      anestesista: false,
      exclusiones: false,
      nota: false,
    },
  });
  const noCondResult = await createPresupuestoPdfDocument(noCondQuote);
  const noCondRaw = extractPdfTextContent(noCondResult.doc);
  assert.doesNotMatch(noCondRaw, /MODULO QUIRURGICO:|M.*DULO QUIR.*RGICO:/);
  assert.doesNotMatch(noCondRaw, /INCLUSIONES:/);
  assert.doesNotMatch(noCondRaw, /Nota:/);
});

