import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The backend session cookie is `SameSite=lax`, which means `localhost` and
 * `127.0.0.1` are different sites: a cross-hostname setup logs in with a 200
 * and then 401s on every subsequent request, silently.
 *
 * We sidestep that entire class of bug in development by proxying `/api`
 * through the dev server, so the browser only ever sees one origin and the
 * cookie is first-party. `VITE_API_URL` overrides this for pointing at a
 * remote API (in which case that origin must be listed in the backend's
 * CORS_ORIGINS, and the hostname rule applies again).
 */
const BACKEND = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false, ws: true },
      // Uploaded files are served from the backend root, not under /api.
      '/uploads': { target: BACKEND, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the vendor libraries out of the route chunks so navigating
        // between screens never re-downloads React.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)/.test(id)) return 'react'
          if (/[\\/]node_modules[\\/](@tanstack|axios)/.test(id)) return 'query'
          if (/[\\/]node_modules[\\/](motion|framer-motion)/.test(id)) return 'motion'
          return undefined
        },
      },
    },
  },
})
