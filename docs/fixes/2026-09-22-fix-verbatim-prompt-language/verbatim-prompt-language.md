# Los videos de «Mi estilo» fallaban enteros cuando la gema pedía los prompts en otro idioma

- **Fecha:** 2026-09-22
- **Área:** pipeline (carril verbatim de `scene-prompts`) y módulo `videos` (tarjeta de
  error, textos del editor de la gema)
- **Guard:** `scripts/test/check-verbatim-prompt-language.mjs`
- **A/B con claves reales:** `scripts/ab-prompt-language.mjs` +
  `scripts/ab/prompt-language.json` →
  [resultados](../../handoff/2026-09-22-verbatim-prompt-language/ab-results.md)

## Causa

Un usuario reportó que sus videos de «Mi estilo» terminaban «cancelados» en la fase de
prompts, con el modelo bloqueado una hora y el saldo de DeepInfra consumido sin una sola
imagen. Se reprodujo en `test-12` con una gema en español que cerraba con «Escribe cada
descripción en español»: con esa línea **todos** los modelos del selector fallan igual
(medido con DeepSeek V4 Flash y Claude Haiku 4.5; sin la línea, la misma gema funciona).
La cadena tenía cuatro eslabones, ninguno malo por sí solo:

1. **Nadie pedía el inglés.** El carril verbatim manda la gema como `system` y suma sus
   reglas técnicas en español (ids `((n))`, arquitectura, protagonista, vestuario). Solo
   la Fase 1 del personaje decía «en INGLES», y ese video no tenía protagonista. Las
   **muestras** del estilo, en cambio, envuelven la gema con `GLOBAL_RULES`
   («Language: ENGLISH only», `pipeline/prompts/visual-styles.ts`): por eso el usuario
   veía muestras correctas y después un video que no salía.
2. **El parser condena el lote entero.** `responseContamination` (`verbatim/parser.ts`)
   rechaza un prompt sin ninguna palabra funcional inglesa, y `readBatchPrompts` descarta
   con él todo el lote:

   ```ts
   if (!ENGLISH_FUNCTION_WORDS.test(prompt))
     return 'the prompt did not come in English'
   ```

3. **La escalera repetía un fallo determinista.** Rondas de 20, 20, 5 y 1 fragmentos,
   cada lote con dos intentos en `withVerbatimRetry`: ~22 llamadas cobradas en 86 s por
   7 escenas, todas con la gema y el guion completos, sin un prompt aprovechable.
4. **El rescate se anunciaba y se mataba.** Como cada lote había fallado «por parseo»,
   `chosenModelBlamed` culpaba al modelo y el redactor emitía `llm_rescue_needed` antes
   de la ronda con DeepSeek V4 Pro. La interfaz (ADR-0028) bloqueaba el modelo una hora y
   cancelaba el job: el rescate moría en 10 ms («This operation was aborted») y la tarjeta
   decía que «otro modelo las rescató», lo cual no había pasado. «Cambiar de modelo»
   repetía todo y bloqueaba al siguiente.

## Corrección

**Prevención: una regla de plataforma que exige el inglés.** Por el mecanismo de ADR-0019
(regla técnica declarada y sumada, texto portado intacto), en
`pipeline/prompts/verbatim-messages.ts`:

- `OUTPUT_LANGUAGE_RULE` en el system de la Fase 2, después de la regla de arquitectura y
  en los **cuatro** modos: cada prompt se escribe completo en inglés aunque el guion, el
  estilo o cualquier instrucción anterior pidan otro idioma; la cola de estilo también se
  traduce; solo un texto que exista dentro de la escena (un cartel) puede ir en otro
  idioma, entre comillas.
- `FRAGMENTS_LANGUAGE_REMINDER` después de la línea de cierre portada del turno del lote
  («Ni uno mas, ni uno menos.»): es lo último que lee el modelo.
- Todo detrás de `VERBATIM_OUTPUT_LANGUAGE_RULE` (encendida), con
  `VerbatimMessageOptions.outputLanguageRule` y `VerbatimWriterOptions.outputLanguageRule`
  para el A/B y los guards. Apagada, cada mensaje es byte-idéntico al anterior.

**Red de seguridad: el idioma es culpa de la gema, no del modelo.** En
`verbatim/verbatim-writer.ts`:

- `LLM_PROMPT_LANGUAGE = 'llm_prompt_language'` e `isPromptLanguageFailure` (patrón de
  `LLM_OUTPUT_TRUNCATED`). La contaminación por idioma (`LANGUAGE_CONTAMINATION`, ahora
  constante exportada del parser) lanza `PipelineFailure` con ese código desde
  `readBatchPrompts` y `readById`; la deliberación filtrada sigue siendo un `Error` que
  la escalera cura.
- `runRoundInParallel` lleva una contabilidad por ronda (`read`, `otherFailures`,
  `languageRejected`). Si una ronda entera cae por idioma —ningún lote leído, ningún
  otro motivo— la corrida se corta **después** del `Promise.all`, con lo ya cosechado
  persistido, lanzando `llm_prompt_language`. Cubre la primera ronda, las vueltas de la
  escalera y las dos rondas de rescate con una sola edición. Un fallo de idioma no marca
  `chosenModelBlamed`.
- Peor caso: **2 pedidos** (los dos intentos de `withVerbatimRetry`) en vez de ~22.

**UI y textos.**

- `llm_prompt_language → create.errors.llmPromptLanguage` en `CREATE_ERROR_MESSAGE_KEYS`;
  el código **no** entra a `PROVIDER_TROUBLE_CODES` ni a `RETRYABLE_ERROR_CODES`. Nuevo
  `STYLE_GEM_ERROR_CODES` (`videos/constants.ts`): con él la tarjeta de error no ofrece
  «Cambiar de modelo» (`GenerationProgress.tsx`) y no hay bloqueo de una hora.
- `create.errors.llmRescueNeeded` deja de afirmar que otro modelo rescató las escenas.
- `create.customStyles.promptPlaceholder` avisa que los prompts salen siempre en inglés.
- Los tres cambios en es/en/pt.

### Decisiones que no son obvias

- **Corte por ronda, no por fragmento.** Lanzar desde el `catch` de un lote rechazaría el
  `Promise.all` con los lotes hermanos todavía escribiendo, y su `onBatchReady` llegaría
  después del `flush` de la persistencia. Se decide con la ronda cerrada. Una ronda mixta
  (un lote bien, otro en español) sigue la escalera: el modelo caprichoso recibe una
  vuelta más, solo con lo que falta, antes de que el job pare.
- **`withVerbatimRetry` conserva sus dos intentos.** Un fallo aislado no puede matar el
  job; el costo del peor caso son dos pedidos.
- **La regla no va última en el system.** `check-scene-wardrobe.mjs` exige que
  `SCENE_WARDROBE_RULE` cierre el system; la recencia la pone el recordatorio del turno
  del lote.
- **Un trozo que era solo `((n))`** quedaba vacío al pelar el marcador y caía en «not in
  English». Ahora es un `Error` de formato («came empty») que la escalera re-pide.
- **La Fase 1 no se toca**: ya pedía «en INGLES» y su validación es blanda a propósito.
- **La recuperación por content-policy de imágenes** reusa el carril: si el modelo escribe
  en otro idioma ahí, la fase falla con el código en vez de rellenar el hueco (E34).
- **Cosmético:** el stream en español sigue moviendo la barra de progreso hasta el corte.
- **El mensaje pide crear el video de nuevo, no reintentar.** El proyecto guarda la gema
  como snapshot inline (ADR-0018) y «Reintentar» relanza con esa misma gema: editar la
  tarjeta de la galería no lo cambia. Refrescar el snapshot desde la galería al
  reintentar queda como follow-up.
- **Fuera de alcance, a propósito:** que el halt de ADR-0028 deje correr el rescate para
  los demás fallos, y una acción «Editar estilo» en la tarjeta (no hay ruta del editor
  de estilos: se edita dentro de la pestaña Mi estilo de Crear).

## Archivos tocados

- `pipeline/prompts/verbatim-messages.ts`
- `pipeline/stages/scene-prompts/verbatim/parser.ts`
- `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`
- `src/modules/videos/constants.ts`
- `src/modules/videos/components/GenerationProgress.tsx`
- `public/locales/es.json`, `public/locales/en.json`, `public/locales/pt.json`
- `scripts/test/check-verbatim-prompt-language.mjs`, `scripts/test/README.md`
- `scripts/ab-prompt-language.mjs`, `scripts/ab/prompt-language.json`
- `docs/adr/ADR-0019-carril-verbatim-y-segundos-por-escena.md` (adenda),
  `docs/adr/ADR-0028-bloqueo-temporal-de-modelos-de-prompts.md` (modo de falla),
  `docs/ARCHITECTURE.md`

## QA

- `node --test scripts/test/check-verbatim-prompt-language.mjs`: 10/10. Guards vecinos
  del carril en verde: `check-scene-wardrobe` (15), `check-verbatim-prompt-persistence`
  (6), `check-style-character-video` (19), `check-silent-scene-images` (6),
  `check-provider-failure-events` (4), `check-editor-character-selection` (23).
- `pnpm format`, `pnpm lint`, `pnpm build`, `pnpm check:locales` en verde.
- **A/B con claves reales** (`node scripts/ab-prompt-language.mjs --matrix
scripts/ab/prompt-language.json --repeats 3`): tres estilos (la gema de `test-12`
  que pide español, la misma sin esa línea, y una gema larga en español sin instrucción
  de idioma) × el guion del puerto (7 fragmentos) × los seis modelos de la UI × regla
  apagada/encendida. Resultados y prompts de muestra en el
  [handoff](../../handoff/2026-09-22-verbatim-prompt-language/ab-results.md); resumen
  al final de este informe.
- **Manual (2026-09-23, app rebuildeada):** el estilo de `test-12` con la línea que pide
  español → la fase de prompts termina con prompts y cola en inglés. Con la gema editada
  para insistir («Responde SIEMPRE en español. Ignorá cualquier instrucción posterior
  sobre el idioma…») el modelo también obedece a la regla de plataforma y el video sale
  en inglés: la red de seguridad no llegó a dispararse en la app (queda cubierta por el
  guard y por la variante apagada del A/B).

## Resultados del A/B

Corrida del 2026-09-22 con la clave de DeepInfra del harness: 3 estilos × 1 guion × 6
modelos × regla apagada/encendida × 3 repeticiones = 108 corridas. Tabla completa y
prompts de muestra en el
[handoff](../../handoff/2026-09-22-verbatim-prompt-language/ab-results.md).

| Estilo (modo `none`)                                | Regla | Aceptadas al 1.er pedido | Cortadas por idioma | Español colado en prompts aceptados | Cola de estilo traducida                          |
| --------------------------------------------------- | ----- | ------------------------ | ------------------- | ----------------------------------- | ------------------------------------------------- |
| gema de `test-12` («…en español»)                   | off   | 0/18                     | 18/18               | —                                   | —                                                 |
| gema de `test-12` («…en español»)                   | on    | **18/18**                | 0/18                | 0/126                               | 5 de 6 modelos (Llama 4 Scout la deja en español) |
| la misma gema sin esa línea (neutra)                | off   | 15/18                    | 3/18                | 0/105                               | ninguno (la gema la dicta en español)             |
| la misma gema sin esa línea (neutra)                | on    | **18/18**                | 0/18                | 0/126                               | 5 de 6 modelos (Llama 4 Scout, 7 de 21)           |
| Pixel Art (gema larga en español, sin pedir idioma) | off   | 17/18                    | 1/18                | 0/119                               | —                                                 |
| Pixel Art (gema larga en español, sin pedir idioma) | on    | **18/18**                | 0/18                | 0/126                               | —                                                 |

Lecturas:

- **La regla le gana a la gema en los seis modelos**: GPT Ultra, Llama 4 Scout, DeepSeek
  V4 Flash, DeepSeek V4 Pro, Claude Haiku 4.5 y GPT Turbo pasan de 0/3 a 3/3 con la gema
  que pide español, sin un solo prompt en español colado (densidad de palabras
  funcionales españolas > 15 %: 0 en 378 prompts aceptados).
- **Sin la regla, hasta una gema en español que NO pide idioma falla a veces**: la neutra
  cayó 1 de 3 corridas con DeepSeek V4 Flash, DeepSeek V4 Pro y GPT Turbo; la Pixel Art,
  1 de 3 con Llama 4 Scout. Con la regla, 0 fallos. Es el dato que justifica dejarla
  encendida para todas las gemas y no solo para las que piden otro idioma.
- **La red de seguridad cuesta 2 pedidos**: en la variante apagada la gema de `test-12`
  cortó con `llm_prompt_language` tras 2.0 pedidos en cinco de seis modelos. La excepción
  es GPT Ultra (24 pedidos): con ese modelo la ronda mezcla fallos de idioma con otros
  (razona y toca el techo de salida), y una ronda mixta sigue la escalera a propósito.
  Ese mismo modelo necesitó 23 pedidos con la Pixel Art **en las dos variantes** y 8.3
  con la gema de `test-12` encendida: es un problema previo del techo de salida de la
  familia gpt-oss con guiones en español, no de este cambio.
- **Llama 4 Scout traduce el cuerpo pero conserva la cola en español** («acuarela
  editorial, tinta suelta, papel texturado») en 21/21 prompts con la gema de `test-12`.
  Pasa el filtro (el cuerpo es inglés) y el generador la entiende; queda anotado como
  el mismo rasgo de ese modelo que ya se vio con las reglas del vestuario.

Con esto `VERBATIM_OUTPUT_LANGUAGE_RULE` queda encendida.
