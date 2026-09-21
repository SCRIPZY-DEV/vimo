# Vestuario por escena en «Mi estilo» — estado de la implementación

- **Fecha:** 2026-09-21
- **Decisión de producto:** en un estilo propio el personaje se adapta a la escena
  **solo en la ropa**; rostro, pelo, piel, contextura y accesorios distintivos
  quedan fijos. El catálogo no se toca.
- **Estado:** código completo, detrás de la constante `VERBATIM_SCENE_WARDROBE`
  (**apagada**). Con la constante apagada, todos los prompts son byte-idénticos a
  los de antes. **Se enciende recién después del A/B con claves reales** que se
  describe abajo.
- **Contexto:** cuarto PR del plan que empezó con
  [style-character-video](../../fixes/2026-09-19-fix-style-character-video/style-character-video.md).

## Por qué no se adaptaba

En el carril verbatim la `PROMPT_ARCHITECTURE_RULE` le prohíbe al modelo escribir
cualquier rasgo físico de `[subject]`, y la descripción del personaje, ropa incluida,
se pega idéntica al final de todas las escenas. Con foto, el candado decía «same
outfit, in EVERY shot». No existía ningún canal por el que la ropa pudiera seguir a
la escena: el personaje salía en la playa, la nieve o la cama con el mismo buzo.

## Qué se hizo

Todo lo nuevo son reglas técnicas **declaradas y sumadas**; los textos portados del
origen quedan byte-idénticos.

| Pieza                                          | Archivo                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `VERBATIM_SCENE_WARDROBE`, las tres reglas     | `pipeline/prompts/verbatim-messages.ts`                           |
| `DESCRIPTION_HEADER_WITH_WARDROBE`             | `pipeline/prompts/verbatim-identity.ts`                           |
| Marcador, separación de ropa, tejido           | `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`        |
| Continuidad entre escenas, flag en el escritor | `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`       |
| Candado con la ropa libre                      | `pipeline/prompts/character-reference.ts`                         |
| `StyleProtagonist.outfit` (diagnóstico)        | `pipeline/types/video-project.ts`                                 |
| Regresión sin HTTP                             | `scripts/test/check-scene-wardrobe.mjs`                           |
| A/B con claves reales                          | `scripts/ab-scene-wardrobe.mjs`, `scripts/ab/scene-wardrobe.json` |

**El canal.** `SCENE_WARDROBE_RULE` es la última regla del system de la Fase 2 (modos
`generic`, `text` y `reference`; nunca en `none`): la única excepción a «no describas
a `[subject]`» es la ropa, y solo cuando la situación del fragmento la exige (playa,
nieve, dormir, uniforme, deporte, época, disfraz, gala). El modelo la escribe en un
paréntesis pegado a la etiqueta, `[subject] (wearing: a red swimsuit and sandals)`:
inglés, solo prendas y calzado con colores, hasta 12 palabras; nunca cara, pelo,
piel, cuerpo, edad ni accesorios. `BATCH_WARDROBE_ADDENDUM` lo recuerda en el turno
del lote, después del preámbulo portado.

**La ficha.** `CHARACTER_OUTFIT_SENTENCE_RULE`, entre la precedencia del personaje del
estilo y la consigna portada de la Fase 1, pide que la ficha termine con una oración
`Outfit:` con solo la ropa. `splitOutfit` la separa: identidad fija (`core`) y ropa
base. `StyleProtagonist.outfit` guarda la ropa base solo como diagnóstico; el tejido
la vuelve a separar de `description` en cada escena.

**El tejido** (`extractWardrobe`, `weaveSubject`, `pointSubjectToImage`):

- El marcador sale del prompt antes de mirar quién nombra al protagonista. Un
  marcador con algo que no sea ropa (`WARDROBE_FORBIDDEN_REGEX`: pelo, cara, piel,
  cuerpo, edad, lentes, tatuajes…) se descarta entero, con aviso.
- Sin marcador: idéntico a hoy, `core` más ropa base.
- Con marcador y ficha partida: `the <rol>, wearing <x>,` en la escena, y al final
  solo el `core` bajo el header de siempre. El prompt nunca lleva dos ropas.
- Con marcador y sin separación posible (ficha escrita por el usuario, protagonista
  guardado antes de este PR): la descripción entera bajo
  `DESCRIPTION_HEADER_WITH_WARDROBE` («…except for the clothing, which is exactly the
  one this scene describes»). Comparte el prefijo del header: el recorte y la
  recuperación lo reconocen igual.
- Con foto: `Name (the person from the attached reference image), wearing <x>,`, y
  el candado pasa a «same face, same skin tone, same hair, same distinctive
  accessories; the clothing is what this scene describes when it specifies it,
  otherwise the outfit of the reference».

**Continuidad** (`readSceneWardrobes`, `wardrobesLookAlike`): una escena cuyo
marcador comparte una prenda con el de la escena anterior hereda ese texto palabra
por palabra (dos fragmentos seguidos en la playa no cambian de traje de baño porque
el modelo lo redactó distinto). Una ropa distinta corta la cadena. La primera versión
heredaba siempre y la playa llegaba hasta la nieve; el caso está en el script.

## Cómo probarlo

**Sin claves.** `node --test scripts/test/check-scene-wardrobe.mjs`, 10 casos con un
cliente LLM simulado: la constante apagada; apagada, mensajes byte-idénticos;
encendida, reglas sumadas con los textos portados intactos; marcador separado y ropa
base fuera; marcador con algo que no es ropa descartado; ficha sin separación bajo el
header alternativo; el escritor completo con continuidad (1 y 2 comparten, 3 corta,
4 sin marcador idéntica a siempre); apagado, mismas respuestas → mismos prompts;
foto con la ropa junto al nombre; candado libre solo encendido.

Regresiones vecinas en verde con la constante apagada: `check-style-character-video`
(18), `check-editor-character-selection` (23), `check-preview-regressions` (32),
`check-character-identity-lock` (24).

## El A/B (condición para encender la constante)

Los prompts de este carril se midieron en el origen. Antes de encender
`VERBATIM_SCENE_WARDROBE` hay que medir que la regla nueva no los degrada:

```
node scripts/ab-scene-wardrobe.mjs --matrix scripts/ab/scene-wardrobe.json \
  --repeats 3 --out docs/handoff/2026-09-21-custom-style-scene-wardrobe/ab-results.md
```

Lee la clave de DeepInfra de `.harness-keys.json` y gasta tokens (cada celda es una
Fase 1 más un lote; no genera imágenes). La matriz de `scripts/ab/scene-wardrobe.json`:
3 estilos (personaje escrito, sin personaje, no humano/stickman) × 2 guiones (uno con
playa, nieve, dormir y gala marcados como `demanding`; uno neutro) × 2 modelos ×
apagado/encendido × 3 repeticiones = 72 corridas. Se puede acotar editando el JSON.

Umbrales propuestos para encender, a ajustar con los primeros datos:

- marcador en **al menos el 70%** de los fragmentos exigentes;
- marcador en **no más del 5%** de los fragmentos neutros;
- **cero** marcadores descartados por contenido prohibido, o muy pocos;
- **sin aumento** de fichas incrustadas (E35) ni de escenas faltantes respecto de la
  constante apagada;
- toda ficha de Fase 1 termina con `Outfit:` (columna «Ficha con Outfit»).

Después, 8 a 10 imágenes reales por estilo con la constante encendida (basta
generar un video corto con el guion exigente), para ver que el generador respeta
«núcleo fijo, ropa de la escena» y que con foto la cara se mantiene.

Los resultados van a `ab-results.md` en esta carpeta (el script lo escribe). Si
pasan, encender la constante es un commit de una línea; si no, ajustar la regla y
repetir.

## Resultados del A/B (2026-09-21)

Dos pasadas contra DeepInfra, con la matriz de `scripts/ab/scene-wardrobe.json`:

- **Pasada 1** (`ab-results.md`): 72 corridas, apagado y encendido, 3 repeticiones.
- **Pasada 2** (`ab-markers.md`): 24 corridas solo encendido, 2 repeticiones, con
  cada marcador registrado junto a su fragmento.

Lo que se midió, contra los umbrales:

| Criterio                                | GPT o4-mini Turbo           | DeepSeek V4 Flash                                    |
| --------------------------------------- | --------------------------- | ---------------------------------------------------- |
| Marcador en fragmentos exigentes (≥70%) | 100 / 100 / 83–88%          | 75–83 / 50–75 / 50–75%                               |
| Marcador en fragmentos neutros (≤5%)    | 0% en todo                  | pasada 1: 17–27%; pasada 2: 1 de 30 (3%)             |
| Marcadores descartados                  | 2 en 36 corridas (pasada 1) | 0                                                    |
| Fichas incrustadas / escenas faltantes  | 0 / 0                       | 0 / 0                                                |
| Ficha con `Outfit:`                     | mayoría                     | irregular; 0/2 con el personaje escrito en el estilo |

Con la constante apagada, cero marcadores en las 36 corridas: apagada nada cambia.

Lecturas y lo que se cambió a partir de ellas:

- **El único falso positivo registrado de DeepSeek copió el ejemplo literal de la
  regla** («a red swimsuit and sandals», en un guion de ahorro). La regla ya no
  trae un ejemplo copiable y dice que la ropa la decide la situación del fragmento,
  «nunca la de un fragmento anterior ni una de ejemplo».
- **DeepSeek repitió la ropa de la playa en la nieve** en 2 corridas (la frase
  «repite EXACTAMENTE el mismo paréntesis» lo empujaba). Esa frase salió de la
  regla: la continuidad entre escenas contiguas la hace el código
  (`wardrobesLookAlike`), y solo cuando las prendas se parecen.
- **DeepSeek no marca «dormir»** en ningún estilo (GPT sí, con pijama). Es
  discutible que dormir exija otra ropa; el 50–75% de DeepSeek en exigentes se
  explica casi entero por eso y por el stickman. Playa, nieve y gala salen marcadas
  en la mayoría de sus corridas.
- **Una gema con su ficha escrita la devuelve tal cual y no cierra con `Outfit:`**
  (la precedencia del personaje del estilo lo pide). `splitOutfit` corta ahora
  también por la cláusula «wearing…/dressed in…» de la última oración que la tenga:
  la ficha del detective queda en identidad fija («…round white head, dot eyes…»)
  y ropa base («a classic dark brown private investigator outfit…»).
- Los prompts de las escenas exigentes salieron como se buscaba: «the Detective
  Minimalist, wearing red swimsuit and sandals, sprinting toward the waves»,
  «wearing dark coat and boots, climbing a snow-covered trail», «wearing white
  pajama set, lying on a cozy bed», y en la oficina nada, ropa base.

**Hallazgo aparte, previo a este PR y presente con la constante apagada:** el rol
tejido arrastra etiquetas de la ficha cuando la Fase 1 la escribe como
«Clave: valor». En las muestras: «the office worker turned spontaneous adventurer
Gender: male», «the Thrifty young office worker Gender: Male Age: Late 20s Height:
Average», «the minimalist black stickman character with a simple» (cortado en la
coma). `roleFromDescription` toma la primera oración hasta la primera coma y no
limpia esas etiquetas. Es un fix chico y separado: limpiar «Gender:/Age:/Height:/
Proportions:» del rol y no cortar en una coma que deja un adjetivo colgado. Se ve en
11 de los 72 prompts de muestra.

**Pendiente:** repetir el A/B con la regla corregida antes de encender la
constante, y confirmar con imágenes reales. Si además se amplía lo que cambia con
la escena (accesorios, peinado), la regla cambia de nuevo y el A/B se repite
después de eso.

## Límites conocidos

- La ropa puede variar entre lotes paralelos (la continuidad solo mira la escena
  anterior dentro de lo que el escritor recibió) y en «Regenerar imagen» de una sola
  escena, porque el modelo no ve las vecinas. La mejora posterior sería guardar la
  ropa por escena en `scenes.json`.
- Un modelo que ignore la regla no rompe nada: sin marcador, todo sigue como hoy.
- Los previews del estilo no llevan vestuario: sus fragmentos no exigen otra ropa.
- Con una descripción sin oración `Outfit:` (fichas de biblioteca), el prompt lleva
  la descripción entera más la ropa de la escena bajo el header alternativo. El
  generador puede mezclar las dos ropas; la separación limpia solo existe cuando la
  ficha viene de la Fase 1 con la regla encendida.
