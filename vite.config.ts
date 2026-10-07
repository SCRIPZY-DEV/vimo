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
  // La página que ve la persona en el navegador al volver de Google. En
  // producción no existe (el navegador entrega el deep link y la app pasa al
  // frente); acá la app también pasa al frente sola al recibir el código, así
  // que solo hay que decirle que ya puede cerrar la pestaña.
  const page = (ok: boolean, title: string, message: string) =>
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Vimo</title><style>` +
    `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1f2347;color:#fff;font-family:system-ui,-apple-system,sans-serif}` +
    `main{max-width:420px;margin:16px;padding:40px 32px;border-radius:24px;background:#141730;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center}` +
    `.mark{display:inline-grid;place-items:center;width:64px;height:64px;border-radius:20px;background:${ok ? '#f5b63a' : '#e86f5e'};color:#1f2347;font:800 32px/1 system-ui}` +
    `h1{font-size:22px;margin:20px 0 8px}p{margin:0;color:#c7c9d9;line-height:1.5}` +
    `small{display:block;margin-top:20px;color:#8a8ea8;font-size:12px}` +
    `</style></head><body><main><span class="mark">${ok ? '✓' : '!'}</span>` +
    `<h1>${title}</h1><p>${message}</p>` +
    `<small>Vimo · entorno de desarrollo</small></main></body></html>`

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
            page(
              false,
              'No se pudo iniciar sesión',
              'Volvé a Vimo y tocá el botón de nuevo.',
            ),
          )
          return
        }
        pendingCode = code
        response.end(
          page(
            true,
            'Listo',
            'Vimo ya tiene tu sesión y pasa al frente solo. Podés cerrar esta pestaña.',
          ),
        )
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
