# Fix: el retrato de un personaje con estilo propio tardaba y no mostraba al personaje como el video

- **Fecha:** 2026-10-04
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

El retrato (preview) de un personaje creado desde cero se genera en el modal de Personajes con
«Generar preview en …». Con un estilo propio (Mi estilo, un estilo clonado con IA o una gema del
catálogo nuevo) tiene dos pasos: la IA escribe el prompt de la imagen y después se genera la
imagen. Con los 5 estilos clásicos el prompt sale de una plantilla fija, sin IA.

**Lento.** El primer paso usaba `createSceneLlm` con `tier: 'balanced'`, que es Qwen3 235B fijo,
con 120 s de plazo. No era el modelo de Ajustes ni un modelo rápido.

- **En producción** (`diagnostic_logs`, del 2026-09-21 al 2026-10-04, todos los usuarios): con
  estilo propio la preview tardó 36 s de mediana; con un estilo clásico, 16,6 s. El paso del
  prompt solo tardó 16,7 s de mediana y llegó a 124,7 s. La imagen, 16,5 s.
- **Con tres estilos del dueño** (2026-10-04): Qwen3 235B tardó de 40 a 57 s, y 2 de 6 pedidos
  dieron `llm_rate_limited`.

**Distinto del video.** `buildCustomPreviewRequest` le pasaba la descripción del personaje al
modelo y le pedía conservarla, así que el modelo la reescribía con sus palabras. En el video, en
cambio, la descripción se pega palabra por palabra al final de cada escena (`weaveSubject`). Por
eso el retrato podía no mostrar al personaje como sale en el video. En la prueba del 2026-10-04:

- Qwen3 235B dejó un `[subject]` pelado en el prompt que va al generador de imágenes.
- GPT o4-mini TURBO perdió casi toda la descripción (conservó el 8 % de sus palabras) o devolvió
  vacío.
- DeepSeek V4.1 Flash conservó la descripción, pero sumó un cartel «CHARACTER».

## Corrección

- **Quién escribe** (`pipeline/commands/characters/generate-character-preview.ts`): la escena del
  retrato la escribe DeepSeek V4.1 Flash y, si falla o no devuelve escena, DeepSeek V3.2
  (`PORTRAIT_SCENE_MODELS`, 30 s por modelo). La clave rechazada, el saldo agotado y la cancelación
  cortan sin pedir el respaldo. El avance simulado de la fase «prompt» pasa de 15 a 4 s.
- **Qué escribe** (`pipeline/prompts/character-preview.ts`): `CUSTOM_PORTRAIT_REQUEST` reemplaza a
  `buildCustomPreviewRequest`. Pide solo la escena del retrato con `[subject]` en el lugar del
  personaje: cuerpo entero, de frente, fondo neutro, sin otras personas, objetos ni carteles. Ya no
  lleva la descripción.
- **Cómo viaja la descripción** (`pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`):
  - `weavePortraitSubject` la pega palabra por palabra al final, con el encabezado de las escenas
    del video («The character in this scene must look exactly like this:»), también si el modelo
    no escribió `[subject]`. En una gema de plantilla queda antes del final fijo.
  - El sujeto se nombra «the character» y no con el rol que `roleFromDescription` saca de la
    primera frase: el retrato tiene una sola figura, y una descripción que abre con un rasgo daba
    un rol falso («Long», de «Long, dark brown hair…»).
  - Un artículo escrito antes de la etiqueta («of a [subject]») se va con ella.
  - El pegado del narrador desnudo del video pasa a la función `appendDescription`, con el mismo
    resultado.
- **Texto** (`public/locales/{es,en,pt}.json`): `characters.preview.customStyleNote` dice que la
  gema escribe la escena del retrato y que Vimo le suma la descripción tal cual, como en el video.
- **Docs:** enmienda del 2026-10-04 en la ADR-0021, párrafo de personajes de `docs/ARCHITECTURE.md`
  §5 e índice de guards.

## Límites deliberados

- **Estilos clásicos:** los 5 siguen con su plantilla fija, sin IA.
- **Modelo de Ajustes:** el retrato no lo usa. El del dueño (GPT o4-mini TURBO) falló en la
  prueba. El retrato es una tarea auxiliar con modelos fijos, como el juez narrativo.
- **Los otros dos botones:** «Mejorar descripción con IA» (DeepSeek V3.2 fijo, mediana 11 s) y
  «Crear personaje con mi estilo» (modelo de Ajustes, mediana 2,7 s) no cambian.
- **Hallazgo del video, sin tocar:** el video teje como sujeto el rol que `roleFromDescription`
  saca de la primera frase. Con una descripción que abre con un rasgo seguido de coma, sale
  «Long walks into the cave». Se comprobó con tres personajes del dueño: Isabel Martínez y Ariadne
  («Long») y Luna Martínez («Short»). La regla E47 no lo detecta porque es una sola palabra.
  Arreglarlo cambia las escenas de todos los videos: lo decide el dueño.
- **Gema con muñeco propio:** como en el video, un personaje de la biblioteca en una gema cuyo
  protagonista propio es un muñeco (2D Stickman) sale dibujado como persona en el estilo de la
  gema. El retrato muestra lo mismo que va a salir en el video.

## Validación reproducible

- `node --test scripts/test/check-custom-style-portrait.mjs scripts/test/check-catalog-preview.mjs scripts/test/check-gem-project-snapshot.mjs`:
  43 de 43. Los casos nuevos se vieron fallar contra el código anterior: 6 de 8 al principio, y
  después los del sujeto neutro y del artículo.
- Guards del video que usan el tejido (`check-catalog-gems`, `check-gem-fixed-phrases`,
  `check-style-character-video`, `check-gem-verbatim-lane`, `check-scene-wardrobe`,
  `check-verbatim-prompt-persistence`): 103 de 103.
- Suite completa (`node --test scripts/test/check-*.mjs`): 800 de 805. Los 5 que fallan fallan
  igual en `dev`: `check-api-key-ui`, `check-editor-character-ui`, `check-export-header-ui`,
  `check-packaged-editor` y el caso de la escena muda que hace 9 llamadas al redactor.
- `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales` (1620 claves) en verde.
- **Prueba real sin imágenes** (script local, fuera del repo): 10 combinaciones de estilos y
  personajes del dueño (3 clonados con IA, 2 gemas del catálogo nuevo, una copia del catálogo, 3
  de Mi estilo y uno de texto). DeepSeek V4.1 Flash escribió la escena en 1,0 a 9,9 s, con
  `[subject]` en las 10 y sin pedir el respaldo.
- **Prueba real con imágenes** (4 retratos en calidad baja, 1,12 créditos de Evolink del dueño):
  - «Hombre Musculoso» en «Alcohol en Músculos» sale igual que su retrato anterior.
  - Isabel Martínez es la misma (trenza, anteojos redondos, chaleco caqui y libreta) en
    2D Stickman, COMIC y CLAYMATION, cada uno en su estilo.

## Pruebas manuales

Pendientes del dueño en la app de prueba `0.9.2-prueba.6`:

1. Personajes → crear un personaje sin foto → «Generar preview en …» con un estilo propio:
   «Escribiendo el prompt…» dura unos segundos y el retrato completo, unos 20 s.
2. El mismo personaje con un estilo clonado y con una gema del catálogo nuevo: es el mismo
   personaje en los dos, cada uno en su estilo.
3. Con los 5 estilos clásicos no cambia nada.
