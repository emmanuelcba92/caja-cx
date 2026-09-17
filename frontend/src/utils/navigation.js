/**
 * Scroll to top of page or specific element
 */
export const scrollToTop = (elementId = null) => {
  if (elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (e) {
      document.body.removeChild(textArea);
      return false;
    }
  }
};

/**
 * Format currency (ARS)
 */
export const formatCurrency = (amount, currency = 'ARS') => {
  if (currency === 'USD') {
    return `U$S ${Number(amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${Number(amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Format date for display
 */
export const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch (e) {
    return dateStr;
  }
};
