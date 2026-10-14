# Fix: «Obtener clave» de Kie.ai no abría en la app nativa

- 📅 **Fecha:** 2026-10-09
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** permisos de Tauri (`src-tauri/capabilities/default.json`) y el módulo `api-keys`.
- **Relacionado:** la observación 2 del reporte de la tarea 1 de la entrega 1
  (`docs/handoff/2026-10-09-avatar-heygen/execution/task-1-report.md` (interno)): se vio al agregar el enlace
  de HeyGen y se difirió a esta entrega.

## Causa

La tarjeta de Kie.ai apunta a `https://kie.ai/api-key` (`getKeyUrl`, el botón «Obtener clave») y
su página de recarga a `https://kie.ai/pricing` (`billingUrl`, la que abren los avisos de saldo
insuficiente de animación). Los dos enlaces se abren con `openUrl` del plugin opener, que en la app
nativa solo deja pasar una URL si cuadra con algún patrón del permiso `opener:allow-open-url` de
`capabilities/default.json`. Ese permiso nunca tuvo `kie.ai`: el historial del archivo no menciona
el dominio (`git log -S'kie.ai' -- src-tauri/capabilities/default.json` no devuelve commits).

El scope del plugin es una lista de patrones `glob` que se evalúan contra la URL completa; sin
coincidencia, el comando rechaza la apertura. Quienes la llaman la lanzan con `void`
(`ApiKeyCard`, `apiKeysApi.openBillingPage`), así que el rechazo no se ve: el clic no hace nada y
no aparece ningún mensaje. En el navegador (`pnpm dev`) no pasaba, porque `openProviderPage` usa
`window.open` cuando la app no es nativa.

Verificación de la causa (2026-10-09): una revisión puntual, sin commitear, que emula la coincidencia
`glob` del plugin sobre `providers.ts` y `default.json`. En `HEAD` quedaban sin permiso exactamente
dos URLs de proveedores con tarjeta, `kie.getKeyUrl` y `kie.billingUrl`; ningún otro proveedor tenía
el hueco.

## Corrección

- `src-tauri/capabilities/default.json`: `{ "url": "https://kie.ai/*" }` dentro de
  `opener:allow-open-url`, entre `console.deepgram.com` y `app.heygen.com` (el orden del catálogo de
  proveedores). Cubre `/api-key` y `/pricing`.

## Límites deliberados

- PoYo no se agrega: es `hidden: true`, sin tarjeta ni enlace de compra (`openBillingPage` también
  lo omite).
- No se agrega `www.kie.ai` ni otros subdominios: los enlaces del catálogo van sin ellos. Si el
  proveedor cambia el dominio de sus páginas, el enlace vuelve a fallar hasta tocar el permiso.
- El rechazo sigue siendo silencioso. Que la tarjeta avise cuando el sistema no pudo abrir un enlace
  es un cambio de comportamiento de la UI y queda para otra tarea.
- No hay prueba automática de que la app nativa abra el enlace: el plugin evalúa el permiso en
  ejecución, dentro de Tauri. Lo automático cubre que el permiso compila y que cada URL del
  catálogo cuadra con un patrón.

## Validación reproducible

1. `pnpm test:tauri`: recompila `app` con `tauri-build`, que procesa
   `capabilities/default.json` (un permiso mal formado rompe la compilación) y deja
   `https://kie.ai/*` en `src-tauri/gen/schemas/capabilities.json` (generado, ignorado por git).
   Salida esperada: `test result: ok. 61 passed`.
2. Cobertura de cada URL del catálogo, desde la raíz del repo. Un patrón cuadra cuando `*` abarca
   cualquier secuencia de caracteres, incluida `/`, como en `glob::Pattern`:

   ```sh
   node --input-type=module -e '
   import { readFileSync } from "node:fs"
   import { transformSync } from "esbuild"
   const source = readFileSync("src/modules/api-keys/providers.ts", "utf8")
   const code = transformSync(source, { loader: "ts", format: "esm" }).code
   const { API_KEY_PROVIDERS } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"))
   const { permissions } = JSON.parse(readFileSync(process.argv[1], "utf8"))
   const allowed = permissions.find((entry) => entry.identifier === "opener:allow-open-url").allow
   const toRegex = (glob) => new RegExp("^" + glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$")
   const covered = (url) => allowed.some((entry) => toRegex(entry.url).test(url))
   for (const provider of API_KEY_PROVIDERS.filter((entry) => !entry.hidden))
     for (const url of [provider.getKeyUrl, provider.billingUrl])
       if (!covered(url)) console.log("SIN permiso:", provider.id, url)
   console.log("revisado")
   ' src-tauri/capabilities/default.json
   ```

   Con el archivo corregido imprime solo `revisado`. Para ver el antes, guardá la revisión anterior
   del archivo con `git show <rev-anterior>:src-tauri/capabilities/default.json > before.json` y
   pasala como argumento en lugar de la ruta: imprime una línea `SIN permiso:` para
   `https://kie.ai/api-key` y otra para `https://kie.ai/pricing`.

Verificado el 2026-10-09: el paso 1 pasa (61 tests) y el paso 2 reproduce el antes y el después tal
como se describe.

## Pruebas manuales

Pendientes del dueño, en la app nativa (el permiso lo evalúa Tauri en ejecución; el navegador no lo
prueba):

1. Claves API, tarjeta de Kie.ai, «Obtener clave»: se abre `https://kie.ai/api-key` en el navegador
   del sistema.
2. Con una cuenta de Kie.ai sin créditos, el aviso de saldo insuficiente de una animación y su botón
   de recarga: se abre `https://kie.ai/pricing`.

No se probó en la app nativa durante este fix.
