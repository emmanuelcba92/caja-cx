import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { runChecks } from './scripts/verify-isolation.mjs'

// Aislamiento Etapa 1: aborta `vite` (dev/build/preview) si el entorno efectivo no está aislado de producción.
// Redundante con `npm run verify:isolation`, pero cubre ejecuciones directas de `npx vite`.
const isolationGuard = () => ({
  name: 'coat-isolation-guard',
  configResolved(config) {
    const { errors } = runChecks({ mode: config.mode, root: config.root })
    if (errors.length) {
      throw new Error('[aislamiento] Ejecución detenida:\n - ' + errors.join('\n - '))
    }
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), isolationGuard()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})