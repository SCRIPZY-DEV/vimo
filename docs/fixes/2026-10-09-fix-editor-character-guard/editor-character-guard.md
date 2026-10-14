# Fix: el guard del personaje en el panel del editor vuelve a pasar

- 📅 **Fecha:** 2026-10-09
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el guard `scripts/test/check-editor-character-ui.mjs` (Chrome headless). No toca código
  de producto.
- **Relacionado:** el guard nació con el
  [fix del personaje en el editor](../2026-09-13-fix-custom-style-editor-character-selection/custom-style-editor-character-selection.md);
  quedó viejo con el PR #91 (`c007e008`, 2026-09-30, animación de escenas con Kie).

## Causa

`node scripts/test/check-editor-character-ui.mjs` fallaba con `FAIL: panel cargado`: el panel nunca
mostraba la casilla del personaje. El mensaje no decía por qué; se averiguó con una copia del guard
fuera del repo que guarda el error no capturado de la raíz de React
(`createRoot(..., { onUncaughtError })`). Había **dos** desfasajes, los dos del PR #91, y el
segundo recién aparece cuando se arregla el primero:

1. **El simulacro de `useLibraryEditorTask` no tenía `isProjectBusy`.** Desde el PR #91,
   `useLibraryEditor` pregunta `editorTask.isProjectBusy(projectId)` en cada render (para las
   fronteras del timeline: `timingBusy`). El simulacro del guard solo traía `task`, `enqueueRegen` y
   `setPendingImageProvider`: el render del editor caía con
   `editorTask.isProjectBusy is not a function`, React desmontaba el árbol y el guard esperaba en
   vano la casilla.
2. **`EditorScenePanel` exige la prop `animation`** (`SceneAnimationControls`, ADR-0047) y el guard
   no la pasaba: `Cannot read properties of undefined (reading 'undo')`. Además, sin clave de Kie
   la sección de animación muestra un `<Link>` a Claves API, que necesita un router, y el guard no
   montaba ninguno.

En la app no pasa nada de esto: `LibraryEditor` usa el hook real y arma `animation` completo. Era
el guard el que había quedado viejo.

## Corrección

En `scripts/test/check-editor-character-ui.mjs`:

- El simulacro de `useLibraryEditorTask` suma `isProjectBusy() { return false }`: el proyecto no
  tiene otra tarea en curso. El bloqueo durante el guardado que verifica el guard sale del propio
  editor (`savingChanges`), no de este método.
- El panel recibe `animation` con el estado más simple (sin clave de Kie, sin plan, sin actividad)
  y `errorKey={undefined}`, y el árbol se monta dentro de un `MemoryRouter`, como en la app.
- La raíz de React guarda el error no capturado y el `FAIL` lo agrega: un render roto ya no se
  disfraza de «panel cargado» (por ejemplo,
  `FAIL: panel cargado (render error: editorTask.isProjectBusy is not a function)`).

## Límites deliberados

- No se tocó código de producto ni el resto de los guards.
- El guard sigue sin probar la animación: el panel la muestra en su estado sin clave solo para
  poder montarse.
- `check-export-header-ui.mjs` falla por la misma familia de causa (su simulacro de
  `useCreateTask` no exporta `hasBusyCreateTask` ni `subscribeCreateTask`, también del PR #91) y
  queda fuera de este fix: no estaba en el pedido. Falla igual sin este cambio.
- El guard sigue siendo un script de Chrome headless a mano; migra a Vitest o Playwright cuando se
  decida el framework (ver `scripts/test/README.md`).

## Validación reproducible

1. `node scripts/test/check-editor-character-ui.mjs` (no necesita `pnpm build`: arma su propio
   bundle de JS con esbuild y no carga CSS; necesita Chrome en la ruta de macOS por
   defecto, o la ruta como primer argumento). Salida esperada: `PASS: editor selection UI (4 cases)`.
2. Para ver que el guard sigue mordiendo: en `src/modules/videos/hooks/useLibraryEditor.ts`, sacar
   `commitMutation.isPending ||` de la guarda de `regenerateSelected` y correr el guard. Debe fallar
   con `FAIL: handler tampoco encola antes de persistir` (restaurar la línea después).
3. Para ver el diagnóstico nuevo: en una copia del guard, quitar `isProjectBusy() { return false }`
   del simulacro. Debe fallar con
   `FAIL: panel cargado (render error: editorTask.isProjectBusy is not a function)`.

Verificado el 2026-10-09: el paso 1 pasa; los pasos 2 y 3 fallan con los mensajes indicados.

## Pruebas manuales

No aplica: es un guard automático y no cambia nada en la app.
