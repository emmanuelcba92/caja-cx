/**
 * Utility functions for professional name normalization, fuzzy matching,
 * canonical name resolution and short header formatting.
 */

export const cleanProfText = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '')
    .replace(/\s*\(\s*Manual\s*\)/gi, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[\.,\-_/\\()]/g, ' ') // replace punctuation with spaces
    .trim();
};

const STOPWORDS = new Set([
  'dr', 'dra', 'lic', 'licenciado', 'licenciada', 'medico', 'medica',
  'anest', 'anestesista', 'anestesia', 'oftalmologo', 'oftalmologa',
  'cirujano', 'cirujana', 'prof', 'profesional'
]);

export const getProfTokens = (name) => {
  const cleaned = cleanProfText(name).toLowerCase();
  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  const words = rawWords.filter(w => !STOPWORDS.has(w));
  return words.length > 0 ? words : rawWords;
};

/**
 * Checks if two professional name strings refer to the same person.
 * Examples:
 * - "Dra. Venier" and "Dra. Florencia Venier" -> true
 * - "Dra Zalazar" and "Dra. Romina Zalazar" -> true
 * - "Dr. Paredes" and "Dr. Sergio Paredes" -> true
 */
export const isSameProf = (nameA, nameB) => {
  if (!nameA || !nameB) return false;
  const rawA = cleanProfText(nameA).toLowerCase();
  const rawB = cleanProfText(nameB).toLowerCase();
  if (rawA === rawB) return true;

  const tokensA = getProfTokens(nameA);
  const tokensB = getProfTokens(nameB);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Exact token match
  if (tokensA.length === tokensB.length && tokensA.every((t, i) => t === tokensB[i])) {
    return true;
  }

  // Subset match (e.g. ['venier'] is in ['florencia', 'venier'])
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const aSubB = tokensA.every(t => setB.has(t));
  const bSubA = tokensB.every(t => setA.has(t));

  if (aSubB || bSubA) {
    return true;
  }

  // Check if they share the main surname when one is a single-word name
  const lastA = tokensA[tokensA.length - 1];
  const lastB = tokensB[tokensB.length - 1];
  if (lastA && lastB && lastA === lastB && (tokensA.length === 1 || tokensB.length === 1)) {
    return true;
  }

  return false;
};

/**
 * Resolves a raw name to its canonical version based on the registered professionals list.
 */
export const getCanonicalProf = (rawName, registeredProfs = []) => {
  if (!rawName) return '';
  const clean = rawName.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '').trim();
  if (registeredProfs && Array.isArray(registeredProfs)) {
    const found = registeredProfs.find(p => {
      const pName = typeof p === 'string' ? p : p?.nombre;
      return isSameProf(pName, clean);
    });
    if (found) {
      return typeof found === 'string' ? found.trim() : found.nombre.trim();
    }
  }
  return clean;
};

/**
 * Generates a clean short header for column headers (e.g. "DRA. VENIER", "DR. PAREDES").
 */
export const getShortProfHeader = (fullName) => {
  if (!fullName) return '';
  const rawClean = fullName.replace(/\s*\(\s*Liq\.?\s*Manual\s*\)/gi, '').trim();
  const rawParts = rawClean.split(/\s+/).filter(Boolean);
  if (rawParts.length === 0) return '';

  const prefixMap = {
    'dr': 'DR.',
    'dr.': 'DR.',
    'dra': 'DRA.',
    'dra.': 'DRA.',
    'lic': 'LIC.',
    'lic.': 'LIC.',
    'anestesista': 'ANEST.'
  };

  const firstLower = rawParts[0].toLowerCase().replace(/\.$/, '');
  const prefix = prefixMap[rawParts[0].toLowerCase()] || (firstLower === 'dr' ? 'DR.' : firstLower === 'dra' ? 'DRA.' : firstLower === 'lic' ? 'LIC.' : null);

  if (prefix) {
    if (rawParts.length === 2) {
      return `${prefix} ${rawParts[1]}`.toUpperCase();
    }
    // For full names like "Dra. Florencia Venier", surname is the last part
    const surname = rawParts[rawParts.length - 1];
    return `${prefix} ${surname}`.toUpperCase();
  }

  if (rawParts.length >= 2) {
    return `${rawParts[0]} ${rawParts[1]}`.toUpperCase();
  }
  return rawParts[0].toUpperCase();
};
