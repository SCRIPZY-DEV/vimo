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
