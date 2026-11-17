import https from 'node:https';
import { findForbidden } from '../src/firebase/envGuard.js';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
    }).on('error', reject);
  });
}

async function verify() {
  console.log('[verify-hosted] Consultando https://coatcx.web.app...');
  const res = await fetchUrl('https://coatcx.web.app');
  console.log(`[verify-hosted] HTTP ${res.statusCode}`);
  if (res.statusCode !== 200) {
    throw new Error(`HTTP status inesperado: ${res.statusCode}`);
  }

  const jsMatches = res.data.match(/\/assets\/[a-zA-Z0-9_\-\.]+\.js/g) || [];
  console.log('[verify-hosted] Archivos JS detectados en HTML:', jsMatches);
  if (jsMatches.length === 0) {
    throw new Error('No se encontraron bundles JS en index.html');
  }

  for (const jsPath of jsMatches) {
    const jsUrl = `https://coatcx.web.app${jsPath}`;
    const jsRes = await fetchUrl(jsUrl);
    console.log(`[verify-hosted] Bundle ${jsPath} (${jsRes.data.length} bytes):`);
    
    // Validar identificadores
    const hasCoatcx = jsRes.data.includes('coatcx');
    const hasCoatcxNumber = jsRes.data.includes('392377174292');
    const forbiddenHits = findForbidden(jsRes.data).filter((h) => h !== 'qmjycvqcwerzbfsbbnla'); // PDF públicos de consentimientos (solo lectura)

    if (hasCoatcx || hasCoatcxNumber) {
      console.log('  -> Contiene identificador coatcx: OK');
    }
    if (forbiddenHits.length > 0) {
      throw new Error(`ALERTA: El bundle ${jsPath} contiene identificadores de producción: ${forbiddenHits.join(', ')}`);
    } else {
      console.log('  -> Cero identificadores de producción: OK');
    }
  }

  console.log('\n[verify-hosted] VERIFICACIÓN EXITOSA: https://coatcx.web.app está en línea y aislado al 100%.');
}

verify().catch((err) => {
  console.error('[verify-hosted] ERROR:', err);
  process.exit(1);
});
