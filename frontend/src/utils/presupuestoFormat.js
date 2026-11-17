import { ivaSuffix } from '../data/presupuestoRules.js';

const moneyFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BOLD_PATTERN = /\*\*([\s\S]*?)\*\*/g;

export function parseRichText(text) {
  const input = String(text ?? '');
  if (!input) return [];

  const tokens = [];
  let lastIndex = 0;
  let match;

  BOLD_PATTERN.lastIndex = 0;
  while ((match = BOLD_PATTERN.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: input.slice(lastIndex, match.index), bold: false });
    }
    tokens.push({ text: match[1], bold: true });
    lastIndex = BOLD_PATTERN.lastIndex;
  }

  if (lastIndex < input.length) {
    tokens.push({ text: input.slice(lastIndex), bold: false });
  }

  return tokens;
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `$ ${moneyFormatter.format(number)}.-`;
}

export function formatDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

export function formatDocumentDate(iso) {
  const date = formatDate(iso);
  return date ? `Córdoba, ${date}` : 'Córdoba,';
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function quoteTitle(quote) {
  return quote?.paciente?.trim() || 'Sin paciente';
}

export function quoteSubtitle(quote) {
  if (!quote) return '';
  if (quote.tipo === 'obra-social') {
    return quote.obraSocial?.trim() || 'Sin obra social';
  }
  return quote.cirugia?.trim() || 'Sin cirugía';
}

export function getItemAmountText(item) {
  if (!item) return '';
  if (item.aConvenir) return 'A valor convenido.';
  return formatMoney(item.monto);
}

export function formatItemAmountWithIva(item) {
  const amount = getItemAmountText(item);
  if (!amount) return '';
  const suffix = ivaSuffix(item?.iva);
  return suffix ? `${amount} ${suffix}` : amount;
}

export function getQuoteIssues(quote) {
  const issues = [];
  if (!quote) return ['Presupuesto inválido'];

  if (!quote.paciente?.trim()) issues.push('Paciente');
  if (quote.tipo === 'obra-social') {
    if (!quote.obraSocial?.trim()) issues.push('Obra social');
  } else if (!quote.cirugia?.trim()) {
    issues.push('Cirugía');
  }

  if (!quote.items?.length) {
    issues.push('Al menos un concepto');
    return issues;
  }

  quote.items.forEach((item, index) => {
    if (!item.descripcion?.trim()) {
      issues.push(`Descripción del concepto ${index + 1}`);
    }
    const needsAmount = quote.tipo === 'obra-social' ? !item.aConvenir : true;
    if (
      needsAmount &&
      (item.monto === null ||
        item.monto === undefined ||
        item.monto === '' ||
        !Number.isFinite(Number(item.monto)))
    ) {
      issues.push(`Importe del concepto ${index + 1}`);
    }
  });

  return issues;
}

export function sanitizeFilename(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function buildPdfFilename(quote) {
  const tipo = quote?.tipo === 'obra-social' ? 'Obra-social' : 'Particular';
  const paciente = sanitizeFilename(quote?.paciente) || 'sin-paciente';
  const fecha = quote?.fecha || 'sin-fecha';
  return `COAT-${tipo}-${paciente}-${fecha}.pdf`;
}
