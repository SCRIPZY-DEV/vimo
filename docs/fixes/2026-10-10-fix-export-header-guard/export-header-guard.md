# Fix: el guard del botón de exportar del editor vuelve a pasar

- 📅 **Fecha:** 2026-10-10
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el guard `scripts/test/check-export-header-ui.mjs` (Chrome headless). No toca código de
  producto.
- **Relacionado:** [ADR-0017](../../adr/ADR-0017-formato-de-video-16-9-y-9-16.md) (el guard nació
  con el botón de exportar en los dos formatos),
  [ADR-0056](../../adr/ADR-0056-layout-propio-del-editor-a-pantalla-completa.md) (la barra del
  editor), el PR #91 (`c007e008`, 2026-09-30) y el
  [fix del guard del personaje en el editor](../2026-10-09-fix-editor-character-guard/editor-character-guard.md),
  con la misma familia de causa.

## Causa

`node scripts/test/check-export-header-ui.mjs` ni siquiera armaba el bundle. El guard monta la vista
real `LibraryEditor` con hooks simulados, y la vista cambió por debajo en dos tandas sin que el
guard la acompañara. Cada causa aparecía recién al arreglar la anterior:

1. **Bundle:** `No matching export in "fixture:@/modules/videos/hooks/useCreateTask" for import
"hasBusyCreateTask"` (y `subscribeCreateTask`). Desde el PR #91 la vista importa
   `EditorAnimationRange` y `EditorImageGallery`, que traen la cola real del editor
   (`useLibraryEditorTask`), y esa cola importa esas dos funciones del pipeline de Crear. El
   simulacro de `useCreateTask` solo exportaba el hook.
2. **Render:** `Cannot read properties of undefined (reading 'has')`. El objeto simulado de
   `useLibraryEditor` no tenía lo que la vista lee hoy al renderizar (PR #91):
   `configuredProviders`, `videoProvider`, `editorTask.canStartAnimation`, `savingChanges` y
   compañía.
3. **`No QueryClient set`:** el saldo de la animación y la galería usan TanStack Query, y el guard
   no montaba un `QueryClientProvider`.
4. **`videosApi.isNative is not a function`:** la galería (`useLibraryProjectDetail`) y la
   estimación de la animación (`useCostCheck`) lo preguntan; el simulacro de `videosApi` solo tenía
   `videoSource`.
5. **Layout (ADR-0056, en esta rama desde `50c4c566`, 2026-10-07):** el título y las acciones del
   editor pasaron por portal (`SlotPortal`) a los huecos de la barra del layout. Sin esos huecos no
   se pinta ni el título ni «Exportar», y el guard buscaba el encabezado como «el abuelo del `h1`».
6. **Versión de transiciones:** un render cuenta como vigente solo si
   `metadata.renderTransitionVersion` es `TRANSITION_POLICY_VERSION` (PR #91). Sin ese campo el
   caso «current» se habría visto como desactualizado.

Para el usuario no hubo nada roto: el botón y su lógica estaban bien. El guard había quedado viejo.

## Corrección

En `scripts/test/check-export-header-ui.mjs`:

- El simulacro de `useCreateTask` suma `hasBusyCreateTask()` (false) y `subscribeCreateTask()` (un
  desuscriptor vacío): no hay otra tarea pesada en curso.
- El simulacro de `videosApi` suma `isNative: () => false`, así la galería y la estimación no
  consultan nada.
- El objeto de `useLibraryEditor` trae lo que la vista lee al renderizar, sin escena elegida y sin
  claves de animación, y la metadata lleva la versión de transiciones vigente.
- El árbol se monta con un `QueryClientProvider` (sin reintentos) y con los dos huecos de la barra
  (`EDITOR_BAR_SLOT_IDS.title` y `.actions`), como los pone el layout. Las comprobaciones del
  «encabezado» miran ahora el hueco de acciones: «Exportar» único ahí, el progreso y la cancelación
  mientras renderiza, «Exportar clips» separado y ningún botón flotante sobre el timeline.
- La raíz ya guardaba `onUncaughtError` y lo lanzaba en la espera; el `FAIL` final ahora también lo
  suma cuando el error de render cae fuera de una espera, como en el guard del personaje.

## Límites deliberados

- No se tocó código de producto, ni el layout ni la barra.
- El guard sigue probando solo los botones de la barra; el contenido del editor (timeline, visor,
  diálogos de música y audio) sigue simulado o fuera.
- El guard sigue siendo un script de Chrome headless a mano; migra a Vitest o Playwright cuando se
  decida el framework (ver `scripts/test/README.md`).

## Validación reproducible

1. `node scripts/test/check-export-header-ui.mjs` (no necesita `pnpm build`: arma su propio bundle
   de JS con esbuild y no carga CSS; Chrome en la ruta de macOS por defecto, o la ruta
   como primer argumento). Salida esperada: `PASS: export header in both formats (10 cases)`.
2. Para ver que sigue mordiendo: en `src/modules/videos/views/LibraryEditor/LibraryEditor.tsx`,
   pasarle `busy={false}` a `RenderVideoButton` y correr el guard. Debe fallar con
   `FAIL: bloqueo ocupado conservado` (restaurar la línea después).
3. Para ver el diagnóstico de render: en una copia del guard, quitar
   `canStartAnimation: () => false` del simulacro. Debe fallar con
   `FAIL: editor.editorTask.canStartAnimation is not a function`.

Verificado el 2026-10-10: el paso 1 pasa; los pasos 2 y 3 fallan con los mensajes indicados.

## Pruebas manuales

No aplica: es un guard automático y no cambia nada en la app.
