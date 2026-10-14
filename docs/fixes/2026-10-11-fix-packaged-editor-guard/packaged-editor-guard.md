# Fix: el guard del editor empaquetado vuelve a pasar (juez de correspondencia y código de fallo)

- 📅 **Fecha:** 2026-10-11
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el guard `scripts/test/check-packaged-editor.mjs` (el sidecar real, empaquetado con Node
  SEA, contra un LLM local). No toca código de producto.
- **Relacionado:** [ADR-0043](../../adr/ADR-0043-correspondencia-temporal-de-prompts.md) (el juez de
  correspondencia, PR #91, `c007e008`, 2026-09-30); el guard hermano
  `check-editor-character-selection.mjs`, que prueba el mismo escenario sin binario y ya esperaba el
  código nuevo; el [fix de selección de personaje del editor](../2026-09-13-fix-custom-style-editor-character-selection/custom-style-editor-character-selection.md)
  donde nació; y, con la misma familia de causa, el
  [fix del guard de las escenas mudas](../2026-10-09-fix-silent-scene-guard/silent-scene-guard.md) y
  el [del encabezado de exportar](../2026-10-10-fix-export-header-guard/export-header-guard.md).

## Causa

`node scripts/test/check-packaged-editor.mjs` moría con un `AssertionError` («The expression evaluated
to a falsy value») en `assert.ok(input.messages[0].content.startsWith(gem))`, dentro del servidor
LLM simulado. Las revisiones de la entrega 2 del avatar lo anotaron tres veces como «preexistente:
usa el sidecar empaquetado de `src-tauri/binaries`, que este worktree no reconstruye». **No era el
binario.** Se comprobó construyendo un SEA nuevo con el `pipeline/` de hoy en una carpeta aparte
(sin tocar el binario compartido) y corriendo contra él el guard sin arreglar: falló igual y con el
mismo mensaje. Eran dos expectativas viejas del test, que aparecieron una detrás de la otra:

1. **El servidor LLM simulado tomaba todo pedido por uno del redactor.** Desde el PR #91, después de
   escribir cada prompt, el sidecar llama al juez de correspondencia (su system empieza con
   `You audit the FULL narrative meaning`) a la **misma** URL base. El simulacro ponía ese pedido
   en `requests` y afirmaba `startsWith(gem)` sobre él. Como la aserción vive dentro del handler
   asíncrono del `http.Server`, la falla es un rechazo sin manejar que mata el proceso con solo
   «falsy value», sin decir de qué pedido. Medido con una copia del guard que imprime el inicio de
   cada system message: un pedido del redactor y cuatro del juez (DeepSeek V4.1 Flash y, de respaldo,
   V3.2, dos veces cada uno), y con los del juez fuera de la aserción el conteo daba `5 !== 1`.
2. **El código del fallo del tercer caso («contradicción persistente») cambió.** Con el juez ya
   aprobado, la escena sin protagonista cuyo prompt trae siempre `[subject]` sigue sin poder
   escribirse tras todas las rondas y el rescate con Claude Haiku 4.5, pero el job corta con
   `scene_prompt_alignment_failed` («scene prompts could not satisfy the narrative contract for IDs
   1; no filler images requested»), no con `llm_empty_response`. Es el código del PR #91
   (`verbatim-lane.ts`, cuando `result.missing` no queda vacío) y el mismo que afirma
   `check-editor-character-selection.mjs` («desde el PR #91 una escena sin prompt corta con este
   código»).

El producto estaba bien: el guard sigue comprobando lo que le importa (sin clave de imagen no se
manda ningún POST pago, el prompt se persiste sin protagonista cuando la selección lo pide, y una
contradicción persistente no toca la imagen anterior).

## Corrección

En `scripts/test/check-packaged-editor.mjs`:

- El servidor simulado importa `isNarrativeReviewRequest` y `narrativeReviewAnswer` de
  `narrative-review-fixture.mjs` (el apoyo que ya usan `check-editor-character-selection`,
  `check-silent-scene-images`, `check-narrative-review` y `check-avatar-scenes-skip-images`). Al
  juez le contesta la aprobación, como JSON, y ese pedido no entra en
  `requests`: el conteo `before + 1` y la aserción de la gema vuelven a hablar solo del redactor.
- El tercer caso espera `scene_prompt_alignment_failed`, con un comentario que cita el PR #91.
- La aserción dentro del servidor lleva ahora un mensaje con el inicio del system de un pedido
  inesperado: la próxima vez que el sidecar sume otra llamada al mismo servidor, el guard dice cuál
  es en vez de «falsy value».

## Límites deliberados

- **No se reconstruye ni se versiona el binario.** `src-tauri/binaries/` está ignorado por git; el
  guard usa el que haya (o el que se le pase como argumento) y vale para un sidecar con el PR #91
  (con el juez y el código nuevo). Uno empaquetado antes de ese PR ya no es lo que el guard espera.
- **El juez solo aprueba.** El guard mide el editor y la persistencia, no el juez; sus rechazos y
  caídas los cubre `check-narrative-review.mjs`.
- **La aserción sigue dentro del servidor simulado.** Si falla, el proceso muere con ese mensaje (ahora
  claro) en vez de acumularse como error del guard; mover las aserciones fuera del servidor cambiaría
  la forma del guard y no hacía falta para devolverlo a verde.
- Las demás aserciones (no se inicia la fase `images`, `imagePrompt` sigue sin persistirse, la
  imagen paga previa queda intacta) no cambian.

## Validación reproducible

1. Con el binario del repo (se arma con `pnpm build:sidecar`, con un Node oficial):

   ```sh
   node scripts/test/check-packaged-editor.mjs
   ```

   Esperado: `Editor SEA: unchecked, checked and persistent contradiction passed (3/3).`

2. Contra un SEA recién construido con el `pipeline/` de hoy, sin tocar `src-tauri/binaries/`
   (el script de build resuelve sus carpetas relativas a su propia ubicación):

   ```sh
   work=$(mktemp -d) && mkdir -p "$work/scripts"
   cp scripts/build-sidecar.mjs scripts/target-triple.mjs "$work/scripts/"
   cp -R pipeline package.json "$work/" && ln -s "$PWD/node_modules" "$work/node_modules"
   (cd "$work" && node scripts/build-sidecar.mjs)
   node scripts/test/check-packaged-editor.mjs "$work/src-tauri/binaries/vimo-pipeline-aarch64-apple-darwin"
   ```

   (En otra plataforma, el nombre lleva su triple de destino.) El mismo mensaje de éxito. Con el
   guard anterior a este fix, esta corrida muere en `assert.ok(input.messages[0].content.startsWith(gem))`.

3. `pnpm exec prettier --check scripts/test/check-packaged-editor.mjs docs/fixes` y
   `pnpm exec eslint scripts/test/check-packaged-editor.mjs`.

Verificado el 2026-10-11: el paso 1 y el paso 2 dan el mensaje de éxito (el binario compartido es del
2026-10-10 23:44; el nuevo, de las 11:16 de hoy); cinco corridas seguidas del paso 1 pasan.

## Pruebas manuales

No aplica a la app: es un guard automático sobre el sidecar y no cambia nada de lo que ve la persona.
