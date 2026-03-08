import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 109', 'not IE 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  base: '/',
  build: {
    target: ['chrome109', 'es2015'],
    cssTarget: 'chrome109',
    minify: 'terser', // Terser es más robusto para código antiguo
  }
})
