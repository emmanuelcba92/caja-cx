/**
 * Utilidades para normalización y formateo canónico de nombres de profesionales médicos.
 * Formato canónico requerido en COAT: [Prefijo] [Apellido] [Nombre] (ej: "Dra. Venier Melisa")
 * Formato para carátulas: Solo [Prefijo] [Apellido] (ej: "Dra. Venier")
 */

const KNOWN_PREFIXES = ['dr', 'dra', 'lic', 'dr(a)', 'med', 'méd'];

const KNOWN_SURNAMES = [
  'venier', 'carranza', 'bruera', 'jasin', 'paredes', 'sanchez', 'sánchez', 
  'romani', 'teilletchea', 'telechter', 'turiella', 'valdez', 'valeriani', 
  'valeri', 'zalazar servino', 'zalazar', 'schafer', 'baffico', 'candolfi', 
  'curet', 'filloy', 'hoyos', 'musri', 'ojeda', 'romero orellano', 'romero', 
  'zernotti', 'navarro pirra', 'navarro', 'corbell', 'perez', 'pérez', 
  'garcia', 'garcía', 'martinez', 'martínez', 'fernandez', 'fernández', 
  'lopez', 'lópez', 'gonzalez', 'gonzález', 'diaz', 'díaz', 'molina', 'torres'
];

/**
 * Normaliza un prefijo a su forma canónica con punto (ej: "Dra.", "Dr.", "Lic.")
 */
export const normalizePrefix = (prefix) => {
  if (!prefix) return 'Dr.';
  const clean = prefix.toLowerCase().replace(/[^a-z()]/g, '');
  if (clean === 'dra') return 'Dra.';
  if (clean === 'lic') return 'Lic.';
  if (clean.includes('dr(a)')) return 'Dr(a).';
  return 'Dr.';
};

/**
 * Convierte cualquier formato sucio o duplicado de nombre médico en el formato canónico:
 * [Prefijo] [Apellido] [Nombre]
 * Ejemplos:
 * - "DRA DRA MARIA SOL CARRANZA CARRANZA" -> "Dra. Carranza María Sol"
 * - "Dra Dra Carranza Maria Sol" -> "Dra. Carranza María Sol"
 * - "DRA. DRA. MELISA VENIER" -> "Dra. Venier Melisa"
 * - "Dra. Melisa Venier" -> "Dra. Venier Melisa"
 * - "Dra Venier Melisa" -> "Dra. Venier Melisa"
 * - "Dr. Pérez" -> "Dr. Pérez"
 */
export const formatDoctorDisplayName = (rawName, fallbackPrefix = 'Dr.') => {
  if (!rawName || typeof rawName !== 'string') return '';

  // 1. Limpiar caracteres de puntuación como comas y espacios múltiples
  let str = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!str) return '';

  // 2. Extraer prefijo y separar tokens restantes
  const rawTokens = str.split(' ').filter(Boolean);
  let detectedPrefix = null;
  const nonPrefixTokens = [];

  for (const token of rawTokens) {
    const cleanToken = token.toLowerCase().replace(/[^a-z()]/g, '');
    if (KNOWN_PREFIXES.includes(cleanToken)) {
      if (!detectedPrefix) {
        detectedPrefix = normalizePrefix(cleanToken);
      }
      continue;
    }
    nonPrefixTokens.push(token);
  }

  const finalPrefix = detectedPrefix || normalizePrefix(fallbackPrefix);

  // 3. Deduplicar repeticiones al inicio y fin (ej: ["Carranza", "Maria", "Sol", "Carranza"])
  let tokens = nonPrefixTokens;
  if (tokens.length >= 2) {
    const first = tokens[0].toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
    const last = tokens[tokens.length - 1].toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
    if (first && first === last) {
      tokens = tokens.slice(1);
    }
  }

  // 4. Deduplicar tokens repetidos case-insensitive manteniendo el orden
  const seen = new Set();
  const deduped = [];
  for (const t of tokens) {
    const norm = t.toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
    if (!norm) continue;
    if (!seen.has(norm)) {
      seen.add(norm);
      deduped.push(t);
    }
  }

  if (deduped.length === 0) {
    return finalPrefix;
  }

  // 5. Normalizar orden: Apellido primero, luego Nombre
  // Caso compuesto: "Zalazar Servino", "Romero Orellano", "Navarro Pirra"
  const fullTextClean = deduped.map(t => t.toLowerCase().replace(/[^a-záéíóúüñ]/gi, '')).join(' ');

  let reorderedTokens = [...deduped];

  if (deduped.length >= 2) {
    // Verificar si el apellido está al final (ej: "Melisa Venier", "María Sol Carranza", "Esteban Bruera")
    // y moverlo al inicio -> "Venier Melisa", "Carranza María Sol", "Bruera Esteban"
    const lastWord = deduped[deduped.length - 1].toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
    const firstWord = deduped[0].toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');

    // Verificar si las dos últimas forman un apellido compuesto (ej: "Manuela Belén Zalazar Servino")
    if (deduped.length >= 3) {
      const lastTwo = `${deduped[deduped.length - 2]} ${deduped[deduped.length - 1]}`.toLowerCase().replace(/[^a-záéíóúüñ ]/gi, '');
      if (KNOWN_SURNAMES.includes(lastTwo) && !KNOWN_SURNAMES.includes(`${deduped[0]} ${deduped[1]}`.toLowerCase())) {
        const surnameTokens = deduped.slice(-2);
        const nameTokens = deduped.slice(0, -2);
        reorderedTokens = [...surnameTokens, ...nameTokens];
      } else if (KNOWN_SURNAMES.includes(lastWord) && !KNOWN_SURNAMES.includes(firstWord)) {
        const surnameToken = deduped[deduped.length - 1];
        const nameTokens = deduped.slice(0, -1);
        reorderedTokens = [surnameToken, ...nameTokens];
      }
    } else if (deduped.length === 2) {
      if (KNOWN_SURNAMES.includes(lastWord) && !KNOWN_SURNAMES.includes(firstWord)) {
        // "Melisa Venier" -> "Venier Melisa"
        reorderedTokens = [deduped[1], deduped[0]];
      }
    }
  }

  // 6. Formatear palabras a Title Case
  const formattedWords = reorderedTokens.map(w => {
    if (w === w.toUpperCase() && w.length > 1) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return `${finalPrefix} ${formattedWords.join(' ')}`.trim();
};

/**
 * Retorna versión corta del profesional para Carátulas: SOLO [Prefijo] [Apellido]
 * Ejemplos:
 * - "Dra. Venier Melisa" -> "Dra. Venier"
 * - "Dra. Melisa Venier" -> "Dra. Venier"
 * - "Dr. Esteban Bruera" -> "Dr. Bruera"
 * - "Dra. Carranza María Sol" -> "Dra. Carranza"
 * - "Dra. Zalazar Servino Manuela Belén" -> "Dra. Zalazar Servino"
 */
export const shortDoctorName = (rawName) => {
  if (!rawName || typeof rawName !== 'string') return '';
  const full = formatDoctorDisplayName(rawName);
  if (!full) return '';

  const parts = full.split(' ');
  const prefix = parts[0]; // ej: "Dra."
  const remaining = parts.slice(1); // ej: ["Venier", "Melisa"] o ["Zalazar", "Servino", "Manuela"]

  if (remaining.length === 0) return prefix;
  if (remaining.length === 1) return `${prefix} ${remaining[0]}`.trim();

  // Verificar si las dos primeras palabras corresponden a un apellido compuesto
  const firstTwo = `${remaining[0]} ${remaining[1]}`.toLowerCase().replace(/[^a-záéíóúüñ ]/gi, '');
  if (KNOWN_SURNAMES.includes(firstTwo)) {
    return `${prefix} ${remaining[0]} ${remaining[1]}`.trim();
  }

  // Por defecto, la primera palabra después del prefijo es el apellido
  const surname = remaining[0]; // ej: "Venier"
  return `${prefix} ${surname}`.trim();
};

/**
 * Descompone un nombre completo o datos estructurados en partes limpias
 * para uso en formularios y vistas administrativas (prefijo, nombrePila, apellido)
 */
export const parseDoctorNameParts = (rawName, existingPrefijo = '', existingNombreOnly = '', existingApellido = '') => {
  if (existingApellido && existingNombreOnly && existingNombreOnly !== rawName) {
    let cleanNombre = existingNombreOnly.trim();
    let cleanApellido = existingApellido.trim();
    let cleanPref = existingPrefijo || 'Dr';

    cleanNombre = cleanNombre.replace(/^(dr|dra|lic|dr\(a\))\.?\s+/i, '').trim();
    if (cleanNombre.toLowerCase().endsWith(' ' + cleanApellido.toLowerCase())) {
      cleanNombre = cleanNombre.slice(0, -(cleanApellido.length + 1)).trim();
    }
    return {
      prefijo: cleanPref.replace(/\./g, ''),
      nombrePila: cleanNombre,
      apellido: cleanApellido
    };
  }

  const formatted = formatDoctorDisplayName(rawName || `${existingPrefijo} ${existingApellido} ${existingNombreOnly}`);
  if (!formatted) {
    return {
      prefijo: (existingPrefijo || 'Dr').replace(/\./g, ''),
      nombrePila: '',
      apellido: ''
    };
  }

  const parts = formatted.split(' ');
  const prefijo = parts[0].replace(/\./g, '');
  const remaining = parts.slice(1);

  if (remaining.length === 0) {
    return { prefijo, nombrePila: '', apellido: '' };
  }
  if (remaining.length === 1) {
    return { prefijo, nombrePila: '', apellido: remaining[0] };
  }

  // En formato canónico: la primera parte es el apellido (o las dos primeras si es compuesto)
  const firstTwo = `${remaining[0]} ${remaining[1]}`.toLowerCase().replace(/[^a-záéíóúüñ ]/gi, '');
  if (remaining.length >= 3 && KNOWN_SURNAMES.includes(firstTwo)) {
    const apellido = `${remaining[0]} ${remaining[1]}`;
    const nombrePila = remaining.slice(2).join(' ');
    return { prefijo, nombrePila, apellido };
  }

  const apellido = remaining[0];
  const nombrePila = remaining.slice(1).join(' ');

  return { prefijo, nombrePila, apellido };
};

/**
 * Limpia un nombre de usuario o email ficticio para mostrar solo el nombre de usuario limpio
 */
export const getCleanUsername = (emailOrName) => {
  if (!emailOrName || typeof emailOrName !== 'string') return '';
  const trimmed = emailOrName.trim();
  if (trimmed.includes('@')) {
    return trimmed.split('@')[0].trim();
  }
  return trimmed;
};
