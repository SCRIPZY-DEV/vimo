# Fix: los textos de la escena muda dicen lo que manda la ADR-0043

- 📅 **Fecha:** 2026-10-11
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** pipeline, fase de prompts (`pipeline/prompts/scene-prompt-blocks.ts`,
  `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`, comentarios de `prompt-composer.ts`) y
  el guard `scripts/test/check-silent-scene-images.mjs`. El código que arma el fragmento no se toca.
- **Relacionado:** [ADR-0043](../../adr/ADR-0043-correspondencia-temporal-de-prompts.md) («los
  silencios sostienen el contexto previo», PR #91, `c007e008`, 2026-09-30); el
  [fix de las escenas mudas](../2026-09-22-fix-silent-scene-images/silent-scene-images.md) que creó
  los dos textos; el [fix del guard](../2026-10-09-fix-silent-scene-guard/silent-scene-guard.md) que
  dejó esto anotado como «límite deliberado, queda para el dueño» y propuso el camino (a), el que se
  aplica acá.

## Causa

Una escena muda es la que el corte clásico deja sin texto porque una pausa de la narración fue más
larga que su ventana. Para ilustrarla, el redactor recibe un fragmento y una consigna que le explica
qué es ese fragmento. Los dos textos de esa consigna se escribieron el 2026-09-22, cuando el
fragmento era la ventana de las vecinas, y no se tocaron cuando el PR #91 cambió la regla:

- **Qué manda el código hoy.** El fragmento de una escena muda es la narración **anterior** a la
  pausa, y la **siguiente** solo si no hay anterior (`narrationFragmentFor` en
  `prompt-composer.ts`, y `narrativeCandidateFor` en `narrative-alignment.ts` para Mi estilo, donde
  esa escena se llama `silent-hold`). La ADR-0043 lo decide así («los silencios sostienen el contexto
  previo»; los vecinos solo completan pronombres, no prestan acontecimientos), y las dos reglas que
  el modelo ya recibe lo repiten: `NARRATION_ALIGNMENT_RULE` («During a silent hold, retain the
  established setting without advancing the story») y la del juez de correspondencia (`silent-hold`:
  mantener sujeto, lugar y objetos de la escena anterior sin agregar un hecho nuevo).
- **Qué decían los textos.** Que el fragmento era «la narración inmediatamente anterior y posterior
  a la pausa» y que había que ilustrar «el momento ENTRE esas líneas», un puente de la línea
  anterior a la siguiente (`bridges the previous line into the next one`). Dos contradicciones: el
  fragmento ya no trae la línea posterior, y pedir un puente hacia la línea siguiente es invitar a
  adelantar un hecho de otro intervalo, justo lo que la ADR-0043 prohíbe. En el carril del Catálogo
  la tentación es real: la «narración que rodea» (`SURROUNDING NARRATION`) todavía lista las dos
  vecinas. Con ese texto el redactor podía anticipar la línea siguiente, y el juez asesor, que no
  autoriza anticipar actos de una pausa, objetarlo (una reescritura de más).

El fix del guard del 2026-10-09 ya había comprobado que el código era el correcto (cambió la
expectativa del test, no el código) y dejó el texto de los dos prompts como decisión pendiente.

## Corrección

Textos nuevos (mismo registro de cada uno: el bloque en inglés con título `#` y énfasis en
mayúsculas; la nota en español, «tú», como mensaje al modelo y cerrando con el estilo visual).

`SILENT_PAUSE_BLOCK` (carril del Catálogo, `scene-prompt-blocks.ts`). Antes:

```text
# THIS SCENE IS A NARRATION PAUSE
No words are spoken during this scene's time range: the FRAGMENT below is the narration immediately BEFORE and AFTER the pause, not what is said here. Illustrate the beat BETWEEN those lines — a transition, a reaction, a lingering detail of the same moment or place — that bridges the previous line into the next one. Do NOT repeat the previous scene's image and do NOT illustrate the next line literally.
```

Ahora:

```text
# THIS SCENE IS A NARRATION PAUSE
No words are spoken during this scene's time range: the FRAGMENT below is the narration that comes right BEFORE the pause (or, when the pause opens the video, the narration that comes right AFTER it), not what is said here. HOLD that moment — keep its subject, place and props and show a lingering detail, a quiet reaction or a settled pose, adding no new event. Do NOT repeat the previous scene's image and do NOT illustrate anything beyond the FRAGMENT. If the pause opens the video, only establish the subject and place of that first line; do not act out its action yet.
```

`SILENT_PAUSE_NOTE` (carril de Mi estilo, `verbatim-lane.ts`). Antes:

```text
En el tramo de esta escena no se dice nada: el fragmento es la narración inmediatamente anterior y posterior a la pausa. Ilustra el momento ENTRE esas líneas (una transición, una reacción, un detalle del mismo lugar), sin repetir la imagen de la escena anterior ni ilustrar literalmente la línea siguiente, manteniendo intacto el estilo visual.
```

Ahora:

```text
En el tramo de esta escena no se dice nada: el fragmento es la narración inmediatamente anterior a la pausa (la siguiente, si la pausa abre el video). Sostén ese momento (una reacción, un detalle del mismo lugar, una pose en reposo) sin agregar ningún hecho nuevo, sin repetir la imagen de la escena anterior ni ilustrar nada más allá del fragmento; si la pausa abre el video, solo presenta el sujeto y el lugar de esa primera línea, sin actuarla todavía, manteniendo intacto el estilo visual.
```

Qué cambia en el mensaje: el fragmento es la narración anterior (o la siguiente si la pausa abre el
video); la imagen **sostiene** ese momento (sin hechos nuevos, ni un puente hacia la línea que
sigue); y la pausa inicial solo presenta sujeto y lugar, como pide el juez para un `silent-hold`
sin línea previa. Se conserva de antes «no repetir la imagen de la escena anterior».

Otros cambios:

- `prompt-composer.ts`: solo comentarios. El de `narrationFragmentFor` decía «la ventana de
  vecinas» y el de `isSilentPause`, «ilustrar la pausa entre esas líneas». El código que arma el
  fragmento no cambia.
- El comentario de `SILENT_PAUSE_BLOCK` y el docblock de `SILENT_PAUSE_NOTE` cuentan la regla nueva.
- `scripts/test/check-silent-scene-images.mjs` (de 6 a 8 tests). El guard ya construía el pedido con
  la constante (`SILENT_PAUSE_BLOCK.trim()`), así que ningún test afirmaba el texto viejo y los seis
  existentes siguen pasando sin cambios; los dos nuevos son los que ataban texto y código:
  - `the pause texts say what ADR-0043 sends…`: los dos textos dicen la narración anterior a la
    pausa, la siguiente solo si la pausa abre el video, «sostener» sin hechos nuevos, y ya no dicen
    «anterior y posterior», `BETWEEN`, `ENTRE esas líneas`, `bridges` ni `transición`.
  - `a pause that opens the video is written from the line that follows it`: una escena muda
    primera, sin narración anterior, llega al redactor con la primera línea como fragmento y con el
    bloque de pausa. Es el caso «la siguiente, solo si no hay anterior» que los textos ahora anuncian
    y que ningún test cubría.

## Límites deliberados

- **No se cambia qué fragmento se manda.** La ADR-0043 decidió que una pausa sostiene el contexto
  previo; el camino (b) del informe del 2026-10-09 (volver a mandar las dos vecinas) la contradice.
- **La «narración que rodea» del Catálogo sigue listando las dos vecinas.** Es contexto para
  completar pronombres y frases cortadas (ADR-0043); el bloque nuevo le dice al modelo que no
  ilustre nada más allá del fragmento.
- **No se midió con modelos reales.** Esta tarea no usa claves ni red, así que no hay imágenes
  generadas con los textos nuevos. Lo verificado es lo que recibe el modelo y que los guards pasan;
  que las pausas salgan mejor se ve con un proyecto real con una pausa larga.
- **Mi estilo no tiene un guard de comportamiento para la nota.** El texto de `SILENT_PAUSE_NOTE`
  queda fijado por el test nuevo, pero que `runVerbatimLane` la pegue al fragmento de una escena
  `silent-hold` (y no a otra) no lo mira ningún guard: ya era así. Los fingerprints de
  `check-gem-verbatim-lane.mjs` no cambian porque sus escenas no tienen pausas.
- **No se reescriben prompts ya generados:** un proyecto con pausas ilustradas con la regla vieja
  conserva sus imágenes (ADR-0043: no se reescriben assets pagados de proyectos históricos).

## Validación reproducible

1. `node --test scripts/test/check-silent-scene-images.mjs`. Esperado: `# tests 8`, `# pass 8`,
   `# fail 0` (antes, 6 de 6).
2. Que los tests nuevos muerden, sobre una copia (los dos pasos se probaron el 2026-10-11 en una
   copia de `pipeline/` y del guard en el scratchpad, no en el árbol de trabajo):
   - Volver `SILENT_PAUSE_BLOCK` y `SILENT_PAUSE_NOTE` a los textos de arriba («Antes»): falla
     solo `the pause texts say what ADR-0043 sends…`, con el mensaje
     `SILENT_PAUSE_BLOCK says /narration that comes right BEFORE the pause/` (7 de 8).
   - En `narrationFragmentFor`, cambiar `(previous?.text || next?.text || '')` por
     `(previous?.text || '')`: falla solo `a pause that opens the video…` (el fragmento cae al
     inicio del guion; 7 de 8).
   - Cambiarlo por `([previous?.text, next?.text].filter(Boolean).join(' ') || '')` (la regla
     del 2026-09-22): falla solo `prompts stage writes the silent scene from its neighbours…`
     (7 de 8).
3. Los guards de las dos fases de prompts siguen verdes: `node --test` sobre
   `check-catalog-prompts`, `check-catalog-gems`, `check-catalog-preview`,
   `check-catalog-draft-samples`, `check-gem-verbatim-lane`, `check-gem-fixed-phrases`,
   `check-gem-template-frame`, `check-gem-treatment-tags`, `check-gem-project-snapshot`,
   `check-gem-style-samples`, `check-verbatim-prompt-language`, `check-verbatim-prompt-persistence`,
   `check-narrative-review`, `check-scene-wardrobe`, `check-character-identity-lock`,
   `check-editor-character-selection`, `check-style-character-video`, `check-custom-style-portrait`,
   `check-prompt-identity-travels-as-text`, `check-preview-regressions` y
   `check-avatar-scenes-skip-images` (437 tests en total, 0 fallos).
4. `pnpm exec tsc -p tsconfig.pipeline.json --noEmit`, `pnpm exec eslint` y
   `pnpm exec prettier --check` sobre los archivos tocados.

## Pruebas manuales

No aplica a la app: es texto de prompts del pipeline y esta tarea no usa claves ni red. Lo que se
hizo a mano el 2026-10-11 fue armar con un script descartable el pedido real que recibe el redactor
de una escena muda, en las dos posiciones (pausa en el medio y pausa que abre el video), y leerlo
completo en los dos carriles: el `buildSceneUserPrompt` del Catálogo (la «narración que rodea»
con las dos vecinas, el bloque de pausa y el `FRAGMENT` con la línea anterior, o con la siguiente si
no hay anterior) y el `buildFragmentsMessage` de Mi estilo (la nota dentro de
`[PEDIDO DEL USUARIO PARA ESTA ESCENA: …]` junto a ese mismo fragmento). El texto se lee coherente
con el fragmento en los cuatro casos.
