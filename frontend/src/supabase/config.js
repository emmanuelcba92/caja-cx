import { createClient } from '@supabase/supabase-js';
import { EXTERNAL_SERVICES_ENABLED } from '../firebase/envGuard';

// AISLAMIENTO ETAPA 1: sin URL ni clave por defecto. En modo pruebas Supabase está DESHABILITADO
// (ninguna operación sale a la red). Para habilitarlo en el futuro se requiere autorización explícita,
// cambiar EXTERNAL_SERVICES_ENABLED y un proyecto Supabase de pruebas vía VITE_SUPABASE_URL/KEY.

const disabledError = { message: 'Supabase deshabilitado en modo pruebas (aislamiento Etapa 1).' };
const disabledBucket = {
  upload: async () => ({ data: null, error: disabledError }),
  remove: async () => ({ data: null, error: disabledError }),
  list: async () => ({ data: [], error: disabledError }),
  download: async () => ({ data: null, error: disabledError }),
  getPublicUrl: () => ({ data: { publicUrl: '' } })
};
const disabledClient = { storage: { from: () => disabledBucket } };

function buildClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('[ENV GUARD] Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (sin valores por defecto).');
  }
  return createClient(url, key);
}

export const supabase = EXTERNAL_SERVICES_ENABLED ? buildClient() : disabledClient;

// Bucket name para firmas y PDFs
export const STORAGE_BUCKET = 'Cirugias';