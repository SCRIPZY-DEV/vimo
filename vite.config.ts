import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// Retorno del login con Google en `pnpm tauri dev` (ADR-0006, nota del
// 2026-10-02). En macOS el deep link vimo:// solo llega a la app empaquetada,
// así que en dev el navegador vuelve a este servidor: guarda el código y la
// app, que corre en este mismo origen, se lo pide. Solo existe en el servidor
// de dev; el build no lo incluye. Misma ruta que AUTH_DEV_CALLBACK_PATH
// (src/modules/auth/constants.ts).
const DEV_AUTH_CALLBACK_PATH = '/auth/desktop-callback'

function devAuthCallback(): Plugin {
  let pendingCode: string | null = null
  const page = (message: string) =>
    `<!doctype html><meta charset="utf-8"><title>Vimo</title><body style="font-family:system-ui;padding:2rem">${message}</body>`

  return {
    name: 'vimo-dev-auth-callback',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(DEV_AUTH_CALLBACK_PATH, (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        // La app pregunta: el código se entrega una sola vez.
        if (url.pathname === '/code') {
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ code: pendingCode }))
          pendingCode = null
          return
        }

        // El navegador vuelve de Google: con code, o con el error de Supabase.
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        const code = url.searchParams.get('code')
        if (!code) {
          response.end(
            page('No se pudo iniciar sesión. Volvé a Vimo y probá de nuevo.'),
          )
          return
        }
        pendingCode = code
        response.end(page('Listo: ya podés volver a Vimo.'))
      })
    },
  }
}

// package.json es la única fuente de la versión: tauri.conf.json la lee de ahí
// y la UI la recibe como constante de build (Brand.version). Ver ADR-0027.
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devAuthCallback()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Desde la animación (PR #91), `src/` importa VALORES puros de
      // `pipeline/` (bloques de escena, planificador, constantes de video). El
      // build los resolvía por los paths de tsconfig y el servidor de dev no:
      // sin este alias, `pnpm tauri dev` no cargaba la app. Ver ADR-0010.
      '@pipeline': fileURLToPath(new URL('./pipeline', import.meta.url)),
    },
  },
})
