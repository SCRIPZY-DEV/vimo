# Fix: el guard de las escenas mudas vuelve a pasar (fragmento según ADR-0043)

- 📅 **Fecha:** 2026-10-09
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el guard `scripts/test/check-silent-scene-images.mjs`. No toca código de producto.
- **Relacionado:** el guard nació con el
  [fix de las escenas mudas](../2026-09-22-fix-silent-scene-images/silent-scene-images.md); la
  regla que cambió es de la
  [ADR-0043](../../adr/ADR-0043-correspondencia-temporal-de-prompts.md), entrada con el PR #91
  (`c007e008`, 2026-09-30).

## Causa

`node --test scripts/test/check-silent-scene-images.mjs` daba 5/6: fallaba
«prompts stage writes the silent scene from its neighbours, without the director» con
`one writer call, no director: 9 !== 1`, en esta rama y también en puntas anteriores (lo vio la
revisión del WP-2b). No era el entorno, ni FFmpeg (este caso no lo usa), ni el simulacro del
revisor narrativo (ese lo arregló el PR #94 con `narrative-review-fixture.mjs`).

Con una copia del guard fuera del repo que anota cada pedido al LLM:

- El pedido del redactor era el correcto (la escena 328, con el bloque de pausa), pero una
  aserción **dentro** del `fetch` simulado fallaba: el test esperaba que el `FRAGMENT` fuera la
  narración anterior y la siguiente juntas (`${before} ${after}`), la regla del fix del
  2026-09-22. El código manda solo la anterior.
- Esa regla cambió a propósito en el PR #91 (`narrationFragmentFor`, `prompt-composer.ts`): la
  ADR-0043 decidió que «los silencios sostienen el contexto previo», así que el fragmento de una
  escena muda es la narración de la escena anterior (la siguiente, solo si no hay anterior). Las
  dos vecinas siguen llegando en el bloque `SURROUNDING NARRATION`.
- Una aserción que falla dentro del `fetch` el proveedor la toma como un fallo de red y sube por
  su escalera de modelos (Llama 4 Scout, gpt-oss-120b Turbo y Ultra, tres rondas): 9 llamadas en
  ~7 s. El test solo veía el conteo, `9 !== 1`, y la causa quedaba escondida.

El propósito del guard seguía cumpliéndose: la escena muda recibe prompt e imagen (los otros
cinco casos pasaban). Lo viejo era la expectativa.

## Corrección

En `scripts/test/check-silent-scene-images.mjs`:

- El caso de la fase de prompts espera como fragmento la narración anterior (`before`), con un
  comentario que cita la ADR-0043; sigue exigiendo el bloque de pausa y las dos vecinas en el
  pedido.
- `mockProviders` anota las aserciones que fallan dentro del `fetch` simulado
  (`requests.failures`), y el caso afirma que no hubo ninguna antes de contar llamadas: un pedido
  inesperado ya no se disfraza de «9 !== 1».

## Límites deliberados

- **No se tocó el texto de los prompts.** `SILENT_PAUSE_BLOCK` (carril del catálogo,
  `pipeline/prompts/scene-prompt-blocks.ts`) y `SILENT_PAUSE_NOTE` (carril de Mi estilo,
  `verbatim-lane.ts`) todavía le dicen al modelo que el fragmento es «la narración inmediatamente
  anterior y posterior a la pausa» y que ilustre el momento ENTRE esas líneas; con la ADR-0043 el
  fragmento es solo la anterior y la consigna es sostenerla. Cambiar esos textos cambia los
  prompts del pipeline: queda para el dueño. Dos caminos: (a) reescribirlos a «sostené el momento
  anterior» (lo que dice la ADR-0043); (b) volver a mandar las dos vecinas, que contradice la
  ADR-0043. **Resuelto el 2026-10-11 con el camino (a):** ver el
  [fix de los textos de la pausa](../2026-10-11-fix-silent-pause-prompts/silent-pause-prompts.md).
- `check-export-header-ui.mjs` también está roto (su simulacro de `useCreateTask`, del PR #91);
  queda fuera de este fix.
- El guard sigue en `scripts/test/` hasta que exista el framework de tests (ver
  `scripts/test/README.md`).

## Validación reproducible

1. `node --test scripts/test/check-silent-scene-images.mjs`. Salida esperada: `# tests 6`,
   `# pass 6`, en menos de un segundo (antes, 5/6 en ~7 s).
2. Para ver que el caso sigue mordiendo: en `pipeline/stages/scene-prompts/prompt-composer.ts`,
   cambiar en `narrationFragmentFor` `(previous?.text || next?.text || '')` por
   `[previous?.text, next?.text].filter(Boolean).join(' ')` (la regla vieja) y correr el guard.
   Debe fallar el caso de prompts con `the writer request is the expected one` y el detalle de la
   aserción (restaurar la línea después).

Verificado el 2026-10-09: el paso 1 da 6/6 en 277 ms; el paso 2 falla con el mensaje indicado.

## Pruebas manuales

No aplica: es un guard automático y no cambia nada en la app.
