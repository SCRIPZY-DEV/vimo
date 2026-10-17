# Fix: integrar dev 0.11.0 con Flow y el editor

- **Fecha:** 2026-10-14
- **Rama:** `feat/flow-export-motion`
- **Base integrada:** `origin/dev` en `6404f8fdb080bc357c4695e3cac2b641dbb575a4`.
- **Alcance:** candidato local para aceptación; Google real y proyectos del usuario pendientes.

## Causa

La rama de Flow y `dev` modificaban Crear, el editor y la persistencia de escenas.
`dev` incorporó editor a pantalla completa, pistas reordenables, avatares,
cancelación de exportación, ai33 y carpetas de historial con nombre. La combinación
requería conservar además las regeneraciones concurrentes y la recuperación de
Flow, el movimiento opcional de clips y los tiradores pastel individuales.

La composición de los helpers de escritura adquiría dos veces el mismo lease no
reentrante al guardar una selección. Las rutas propias de Flow también podían
contar avatares como imágenes faltantes. El guardado de metadata debía actualizar
el objeto compartido dentro de la cola para no perder el estado al terminar una
fase de avatar concurrente.

## Corrección

- Integración completa de la base indicada, preservando fullscreen, avatares,
  pistas, voces e historial de `dev` y las funciones Flow de la rama.
- Persistencia selectiva con una adquisición para releer, combinar y escribir;
  conservación de recibos de avatar y exclusión de sus escenas antes de calcular
  el ámbito de regeneración, recuperación y completado pago de imágenes.
- Metadata con orden lease entre procesos → cola local → relectura → escritura;
  Flow actualiza el contexto compartido dentro de esa operación.
- Crear y editor conservan exclusión por proyecto y las regeneraciones disjuntas
  de Flow; ai33 se reconoce al exigir la clave de la voz elegida.
- Tirador pastel visible por hover individual, foco de teclado o arrastre activo;
  claves estables al modificar tiempos, bloqueo de fronteras avatar y marcador de
  transición siempre visible. La tarjeta compartida mantiene borde blanco al hover.
- Exportación de clips conserva movimiento opcional, cancelación incluso antes de
  recibir el ID y limpieza de archivos parciales.
- ADR Flow renumeradas a 0058/0059 para no colisionar con 0052/0053 de `dev`;
  documentación del diseño vigente consolidada.

## Límites deliberados

No se cambió la extensión 0.2.36 ni se enviaron tareas reales a Google o proveedores
pagos durante esta integración. La aceptación de esa extensión con Google sigue
pendiente. No se modificaron proyectos personales para probar. El candidato local
no es una publicación, y este informe no equivale a aceptación de producción.

Los scripts y capturas temporales permanecen fuera de Git. Tres guards de UI
existentes contienen supuestos previos de fixture/diseño; sus copias temporales
se adaptaron al contrato actual y se conserva el diff exacto en la evidencia.
No se presenta el resultado de esas copias como ejecución verde del original.

## Validación reproducible

Desde la raíz, con Node oficial 22 y las dependencias del lockfile:

```sh
pnpm install --frozen-lockfile
pnpm --config.verify-deps-before-run=false format
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.pipeline.json --noEmit
pnpm --config.verify-deps-before-run=false check:locales
pnpm --config.verify-deps-before-run=false test:tauri
pnpm --config.verify-deps-before-run=false build:sidecar
node --test scripts/test/check-stage-runner-alongside.mjs scripts/test/check-avatar-scenes-skip-images.mjs scripts/test/check-silent-scene-images.mjs
node --test scripts/test/check-packaged-resume.mjs scripts/test/check-packaged-editor.mjs scripts/test/check-packaged-catalog.mjs
```

Resultados: formato, lint, build, tipos y locales sin errores; Rust 97/97;
concurrencia/escenas 49/49; los tres checks del SEA reconstruido pasan y se
repitieron contra el ejecutable dentro de la app entregada. La app 0.11.0 pasa
`codesign --verify --deep --strict`; los binarios de la copia coinciden con el
bundle. La firma que añade Tauri se normalizó sólo en copias temporales para
comparar el payload del pipeline con el sidecar de origen.

Checks adicionales: layout 8/8; regeneración avatar 429, Crear avatar 403,
galería avatar 201; copias compatibles de timeline 43 y borradores 33; preview
32/32; cancelación de exportación con el store real aprobada. El banco de tiradores
con componentes y CSS reales pasa sus 10 grupos y cuatro casos en WKWebView nativo
(reposo, foco y arrastre por ambos lados, con eventos DOM sintéticos).
Las pruebas controladas de backend cubren además render/export avatar,
redimensionado, pines y render por fragmentos. El caso temporal con `ownedIds`
termina con el arreglo y se bloquea al reponer la llamada reentrante.

La copia compatible del encabezado pasó sus 12 combinaciones de estado/formato,
incluyendo abrir/cancelar el diálogo, Escape real, movimiento marcado/desmarcado,
una única llamada con el booleano elegido y cancelación de exportación activa.
Los cuatro casos temporales de integración se repitieron sobre la fuente final.

Evidencia y scripts reproducibles fuera del repo:
`/Users/sebas/Documents/Vimo-Flow-QA/2026-10-14/dev-integrado-0.11.0/`.
Las pruebas de navegador usan fixtures y mocks locales, nunca claves reales.

## Pruebas manuales

- Inspección visual de capturas Chromium y WKWebView del timeline integrado: tirador activo pastel y
  transiciones visibles con el vecino enfocado. El arrastre y los casos de
  teclado, modo oscuro y clips mínimos se ejercitaron con automatización.
- La apertura y edición de un proyecto personal, generación real con Google,
  reconexión de cuentas y exportación del proyecto del usuario quedan para la
  aceptación siguiendo la guía incluida con la app. No se declaran probadas.
