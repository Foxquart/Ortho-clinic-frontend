import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
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
export default defineConfig(({ mode }) => {
  /* `.env*` files are not on `process.env` in the config file, so read them
     explicitly. Prefix `''` keeps non-VITE keys such as VITE_PROXY_TARGET. */
  const env = loadEnv(mode, process.cwd(), '')
  const BACKEND = env.VITE_PROXY_TARGET || process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

  /*
   * The hosted API lives on a parent domain and stamps its cookies with
   * `Domain=.foxquart.com; Secure`. The browser will not store a cookie for a
   * domain the page is not on, so proxying to it unchanged still leaves the
   * session cookie on the floor and every request after login 401s.
   *
   * `cookieDomainRewrite: ''` strips the Domain attribute on the way back, which
   * makes each cookie host-only for localhost — exactly what the same-origin dev
   * setup has always relied on. `changeOrigin` sets a correct Host header, which
   * Fly.io (and any virtual-host router) needs to pick the right app.
   */
  const backendProxy = {
    target: BACKEND,
    changeOrigin: true,
    cookieDomainRewrite: '',
  }

  return {
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
        '/api': { ...backendProxy, ws: true },
        // Uploaded files are served from the backend root, not under /api.
        '/uploads': backendProxy,
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
  }
})
