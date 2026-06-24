import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Static source assets (favicon, etc.) live in static/ so that public/ can
  // be used as the build target without the two folders colliding.
  publicDir: 'static',
  // Build straight into public/ so the Express server (static root ./public)
  // serves the bundle directly — no separate dist/ + copy step.
  build: {
    outDir: 'public',
    emptyOutDir: true,
  },
  // In dev, proxy the SSE stream and JSON API to the Express server on :3000.
  server: {
    proxy: {
      '/sse': { target: 'http://localhost:3000', changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
