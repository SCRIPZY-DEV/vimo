import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// package.json es la única fuente de la versión: tauri.conf.json la lee de ahí
// y la UI la recibe como constante de build (Brand.version). Ver ADR-0027.
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
