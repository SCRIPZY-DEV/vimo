# El video no se armaba por una escena sin imagen caída en una pausa de la narración

- **Fecha:** 2026-09-22
- **Área:** pipeline (`scene-cuts` → `scene-prompts` → `images` → `render`) y módulo `videos`
  (tarjetas de error, reproductor, banner del editor)
- **Guard:** `scripts/test/check-silent-scene-images.mjs`

> **Actualización (2026-10-11):** lo que este informe cuenta del fragmento de la pausa (la ventana de
> las vecinas) y de la consigna («ilustrar el momento ENTRE las líneas vecinas») cambió con la
> ADR-0043 (PR #91): hoy el fragmento es la narración anterior a la pausa (la siguiente, solo si la
> pausa abre el video) y la imagen la sostiene. Ver el
> [fix de los textos de la pausa](../2026-10-11-fix-silent-pause-prompts/silent-pause-prompts.md).

## Causa

Un usuario con una narración de ~16 minutos falló al final de todo, en el render, con
`render_missing_images: 328`. En su `scenes.json` la escena 328 tenía `"text": ""` y ningún
`imagePrompt`: nunca se le generó imagen. El corte clásico reparte las palabras por ventana
de tiempo, y si en una ventana no arranca ninguna palabra —una pausa de la narración más
larga que la escena, ~3 s— la escena nace vacía. El propio cortador lo declaraba como
contrato:

```ts
// pipeline/stages/scene-cuts/scene-cuts.ts
// Una escena puede quedar con texto vacío (corte en silencio): el resto del
// pipeline la trata como «sin prompt necesario».
```

Y tres fases cumplían ese contrato con un `hasText` local: `scene-prompts` no la ponía en
pendientes, el redactor no la procesaba, el carril verbatim la dejaba fuera de `pending`, e
`images` la eximía en su `skip()`, en las pasadas de recuperación y en el gate final
`images_incomplete`. Pero la cuarta fase exige lo contrario:

```ts
// pipeline/stages/render/render.ts — collectRenderableScenes
// Toda escena que ocupa un tramo del timeline (tiene timestamps) DEBE tener
// imagen válida: descartarla en silencio dejaría el video más corto que el
// audio (voz cortada) y desincronizaría todo lo posterior.
```

Consecuencias:

- **Reanudar entraba en bucle.** Todas las fases eran cache-hit (la muda no contaba) y el
  render volvía a fallar con el mismo código, mientras el mensaje decía «Reanudá para
  completarlas».
- **La UI no ofrecía el rescate.** «Continuar en el editor» solo aparecía con la fase caída
  en `images`; acá la fase caída era `render`. Desde la biblioteca el proyecto en error va al
  reproductor, cuya tarjeta solo ofrecía «Reintentar».
- **Y en el editor tampoco alcanzaba:** «Regenerar» sobre la muda fallaba con
  `image_missing_prompt`, porque no había narración de la que redactar, y el banner decía que
  «su descripción quedó guardada». Solo salía escribiendo una descripción a mano.

El cortador por segundos de Mi estilo (`by-seconds.ts`, regla 4b) absorbe las ventanas mudas
en la escena anterior, así que solo el corte clásico produce este estado. Es determinístico:
cualquier narración con una pausa más larga que la ventana lo repetía, después de pagar todas
las demás imágenes.

## Corrección

**Toda escena con tiempos lleva prompt e imagen, tenga texto o no.** Una escena muda se ilustra
como pausa desde la narración vecina.

- `prompt-composer.ts` — nuevo `narrationFragmentFor(scene, orderedScenes, fullScript)`: la
  narración propia si la hay; si no, la ventana de vecinas (`SILENT_SCENE_WINDOW_CHARS`, el
  mismo tope que ya usaban el rescate por content policy y el fallback determinístico) y como
  último recurso el inicio del guion. `buildSceneUserPrompt` recibe `isSilentPause` e inserta
  `SILENT_PAUSE_BLOCK` en la rama automática: ilustrar el momento ENTRE las líneas vecinas,
  sin repetir la imagen anterior ni adelantar la siguiente. Con `false` la salida es
  byte-idéntica.
- `prompt-writer.ts` — se quita la exención por texto en `scenesMissingPrompt` y en
  `toProcess`; `composeSceneRequest` usa el helper y deriva `isSilentPause`;
  `regeneratePromptsForRejected` reemplaza su copia del patrón por el helper. La clave de
  deduplicación entre escenas (`fragmentKey`) cae al id cuando el fragmento es vacío: dos
  mudas no comparten `''`.
- `scene-prompts.ts` — `catalogPendingIds` y `skip()` cuentan a la muda; el progreso reporta
  `total = scenes.length` (como ya hacía el carril verbatim).
- `verbatim-lane.ts` — `pending` sin la condición de texto; el fragmento de una muda es la
  ventana vecina con `SILENT_PAUSE_NOTE` pegada (mismo mecanismo que la nota de content
  policy).
- `images.ts` — `skip()`, pasadas de recuperación, gate final, chequeo de catálogo y fallback
  de Mi estilo sin `hasText`.
- UI — `CreateTask.errorCode` (aditivo) guarda el código crudo del fallo;
  `EDITOR_RESCUE_ERROR_CODES` (`images_incomplete`, `render_missing_images`) gobierna
  «Continuar en el editor» en `GenerationProgress` y en la tarjeta del reproductor (ahí con
  `metadata.errorCode`, que ya estaba en disco). Con esos códigos la tarjeta usa los textos
  genéricos del checkpoint y no «tus imágenes ya están listas». `estimateResumeCost` cuenta
  la muda entre las imágenes pendientes. Los textos `continueHint` y `missingImagesHint`
  dejan de prometer una descripción guardada (es/en/pt).

Con esto el proyecto ya roto se repara con un simple «Reanudar»: la fase de prompts detecta
que la 328 no tiene prompt, lo redacta desde 327 y 329, imágenes la genera y el render pasa.
Y «Regenerar» desde el editor funciona sobre una muda sin escribir nada.

### Decisiones que no son obvias

**El director y la presencia de personajes no cambian.** `scenesNeedPlan` y `directScenes`
siguen excluyendo el texto vacío con el mismo predicado (ese es el invariante que evita
re-dirigir en cada reanudación), así que la muda no lleva SCENE PLAN —`buildScenePlanBlock`
devuelve `''`— y queda con `charactersPresent: []`. En un proyecto con personajes se ilustra
como contenido, sin forzar al personaje: para una pausa es lo esperable, y evitó tocar el
clasificador.

**En la reescritura por content policy se conserva el override de narración.** Ahí la
narración manda sobre la descripción manual, como antes; el helper solo reemplaza la copia
del patrón y el bloque de pausa viaja porque `composeSceneRequest` lo deriva de la escena, no
del override.

**El rescate se gobierna por el código de error, no por la fase caída.** `render_missing_images`
cae en `render` con todo lo demás en disco: mirar solo `failedStage` lo dejaba afuera. Por eso
la tarea conserva el código además de la clave i18n.

## Archivos tocados

- `pipeline/prompts/scene-prompt-blocks.ts`
- `pipeline/stages/scene-prompts/prompt-composer.ts`
- `pipeline/stages/scene-prompts/prompt-writer.ts`
- `pipeline/stages/scene-prompts/scene-prompts.ts`
- `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`
- `pipeline/stages/images/images.ts`
- `pipeline/stages/scene-cuts/scene-cuts.ts` (comentario de contrato)
- `pipeline/types/scenes.ts` (comentario)
- `src/modules/videos/types/create.ts`
- `src/modules/videos/constants.ts`
- `src/modules/videos/hooks/useCreateTask.ts`
- `src/modules/videos/components/GenerationProgress.tsx`
- `src/modules/videos/components/GenerationErrorCard.tsx`
- `src/modules/videos/views/LibraryPlayer/LibraryPlayer.tsx`
- `src/modules/videos/utilities/estimateResumeCost.ts`
- `public/locales/{es,en,pt}.json`
- `scripts/test/check-silent-scene-images.mjs` (nuevo)
- `scripts/test/README.md`, `docs/ARCHITECTURE.md`

## QA

`pnpm format && pnpm lint && pnpm build`, `pnpm check:locales`, y `node --test` sobre los
guards del pipeline (`check-catalog-prompts`, `check-verbatim-prompt-persistence`,
`check-editor-character-selection`, `check-style-character-video`,
`check-character-identity-lock`, `check-image-account-failures`, `check-scene-wardrobe`,
`check-provider-failure-events`): verdes **sin tocarlos**, que es la prueba de que las escenas
con texto salen igual que antes.

El guard nuevo reproduce el proyecto del usuario (327 y 329 completas, 328 muda) sin
personajes, con seis casos; cuatro fallan con el código anterior:

1. `cutScenesByTime` deja una ventana sin palabras como escena de texto vacío (fija la fuente);
2. la fase de prompts la cuenta en `skip()` y la redacta con la narración de 327 y 329 y el
   bloque de pausa, sin invocar al director ni tocar a las vecinas (**fallaba**: `skip()`
   devolvía `true`);
3. la fase de imágenes la cuenta en `skip()` y genera su archivo sin tocar los vecinos
   (**fallaba**);
4. si el proveedor la rechaza por contenido, la reescritura conserva el bloque de pausa y el
   gate final la lista en `images_incomplete`;
5. la reanudación repara el proyecto de punta a punta y una segunda corrida es cache-hit sin
   llamadas (**fallaba**);
6. `regenerate-scene-images` desde el editor la regenera sin descripción del usuario
   (**fallaba** con `image_missing_prompt`).

Manual: (a) el proyecto real del usuario — en la biblioteca el reproductor ofrece «Reanudar» y
«Continuar en el editor»; reanudar redacta una escena, genera una imagen y el render completa
con las vecinas intactas; (b) proyecto nuevo con audio propio con una pausa de ~5 s en
estilo de catálogo y en Mi estilo — la escena vacía recibe prompt e imagen y el prompt se lee
como transición; (c) en el editor, «Regenerar» sobre la muda sin descripción produce imagen, y
con descripción gana la descripción; (d) la tarjeta de progreso con `render_missing_images`
muestra «Reintentar desde el último paso» con el texto genérico y «Continuar en el editor».

## Fuera de alcance

- Que el corte clásico absorba las ventanas mudas en la escena anterior, como hace el de
  segundos (regla 4b): cambia el conteo respecto del confirmado y la caché del corte, y no
  sirve para proyectos ya cortados.
- Reutilizar la imagen anterior en el render cuando falta la de una muda: el editor, la
  exportación de clips y la vista previa seguirían viendo un hueco.
- `preview-scene-cuts` cuenta con el cortador por segundos, así que su conteo puede diferir
  del corte clásico real.
- La fase de imágenes persiste en `scenes.json` el prompt con las cláusulas finales del scrub
  anexadas a TODAS las escenas (texto-en-imagen, anonimato): comportamiento previo, el guard
  lo tolera comparando la narrativa.
