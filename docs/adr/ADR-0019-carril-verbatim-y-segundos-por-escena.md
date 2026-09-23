# ADR-0019 — Carril verbatim y segundos por escena («Mi estilo», fase completa)

- **Estado:** Aceptada
- **Fecha:** 2026-09-02
- **Área:** pipeline / app
- **Parte de:** [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md)
  (rama 10 del roadmap); **extiende a**
  [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md) (los estilos
  propios dejan de escribirse con el redactor de la casa).

## Problema

La fase básica (ADR-0018) hacía funcionar un estilo propio inyectándolo en la
maquinaria del catálogo: el systemPrompt del usuario + planos + `GLOBAL_RULES`
(contrato JSON), con biblia visual, director de escenas y una llamada LLM por
escena. Eso pisa la naturaleza de una gema de chat: está escrita para recibir
el GUION, diseñar su personaje (Fase 1) y devolver los prompts de una LISTA de
fragmentos en un bloque de código (Fase 2) — no para el contrato JSON de la
casa. El origen (`vimo_dev`) resolvió esto con un motor propio de ~2.700
líneas medidas en producción, y además dejó que el usuario elija la DURACIÓN
de cada escena (el número sale del audio) en vez del conteo.

## Decisión

1. **Carril verbatim** (`pipeline/stages/scene-prompts/verbatim/`): con
   `options.customStyle`, la gema viaja **entera y sin envoltorio como
   `system`** — sin `GLOBAL_RULES`, sin planos, sin `response_format` — y toda
   mecánica nuestra va en mensajes de usuario o como **regla técnica de la
   plataforma declarada y sumada al final** (ids `((n))`, arquitectura del
   prompt, protagonista del usuario). La conversación del playground se
   replica turno por turno (guion → turno de assistant con el retrato →
   fragmentos). Piezas: `verbatim-messages.ts` (mensajes byte-idénticos al
   origen), `parser.ts` y `subject-weaver.ts` (funciones puras: conteo
   sagrado, doble lectura por ids, des-envoltura JSON, reparación de fichas
   E35, cola de estilo E33/v1.14, tejido `[subject]` → rol + descripción),
   `verbatim-writer.ts` (Fase 1 con señales E42 y fase de personaje inyectada
   en reintentos; Fase 2 en lotes de **20** con escalera de reintentos
   **[20, 5, 1]** y **ronda de rescate con otra familia de modelo** del
   catálogo, `model-catalog.ts`).
2. **Se saltean biblia visual, director de escenas y clasificador de
   presencia** para proyectos con estilo propio (paridad con el origen: el
   estilo trae el ritmo, el guion completo es el contexto). La presencia del
   protagonista la informa el motor (`scenesWithSubject` →
   `charactersPresent`).
3. **E34 — el estilo del usuario nunca se pisa**: la recuperación por
   content-policy de la fase de imágenes reescribe los prompts de un proyecto
   custom por el MISMO carril, con la nota de reintento pegada al fragmento.
   Si el carril propio tampoco puede, la escena queda declarada — jamás se
   escribe con el estilo de la casa (la Capa 4 determinística de imágenes
   sigue de red última).
4. **Segundos por escena** (`stages/scene-cuts/by-seconds.ts`): con
   `options.secondsPerScene` (2–15, solo con `customStyle`), la Fase 3 corta
   por ventanas fijas de reloj con las cuatro reglas del origen (bordes
   `k·N`, recorte al fin real del audio, palabra al punto medio, absorción de
   ventana muda y del resto < 30 %). `preview-scene-cuts` responde el slider
   del diálogo con la MISMA función pura — la vista previa no puede mentir.
   Una confirmación por conteo en este carril se traduce a segundos
   equivalentes (red v1.31.1). El valor elegido se recuerda
   (`vimo:create:secondsPerScene`).
5. **Catálogo de modelos LLM** (`providers/llm/model-catalog.ts` +
   `verbatim-client.ts`): solo perfiles DeepInfra (decisión v0.99.0 del
   origen), cada entrada es un **perfil de petición** (campo de tokens,
   `reasoning_effort`, margen); cliente streaming siempre, timeout por
   llamada, corte por tokens como fallo determinista y escalera de esperas
   ante 429 que no consume intentos. Sin `modelos-extra.json` ni overrides de
   `.env` (ADR-0010 prohíbe el entorno). El selector de modelo llegó en la
   rama 11 ([ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md)).

> **Adenda 2026-09-07.** La pausa del carril de segundos no tiene casilla en
> el formulario: con «Mi estilo» la decide la preferencia «No preguntarme al
> generar» de Ajustes (`confirmScenes` de `SceneDurationDefaults`, PR #37), que
> Create copia al proyecto como `options.confirmScenes` vía
> `CreateFormValue.confirmSceneDuration`. La casilla «Confirmar escenas antes
> de generar» queda solo para el estilo de catálogo, donde no hay preferencia
> que la reemplace. El contrato del sidecar no cambia: sigue recibiendo el
> booleano y pausando igual.

> **Adenda 2026-09-11.** La pregunta «¿Cada cuánto aparece tu personaje?»
> tampoco se ofrece con «Mi estilo»: es la cara visible del punto 2 de arriba
> — el carril verbatim saltea el clasificador de presencia, así que en qué
> escenas sale el protagonista lo decide dónde pone su `[subject]` el prompt
> de la gema, no un reparto nuestro. Con estilo propio
> `options.characterFrequency` ya ni siquiera viaja (`createProjectPayload`):
> una opción que nadie aplica no se guarda en el proyecto. En el catálogo la
> pregunta pasa a ser la tarjeta de dos niveles del origen (v0.61.0):
> «Equilibrado» (50 %) y «Siempre» (100 %) — si el usuario eligió personaje es
> porque quiere verlo. Los niveles intermedios (`rarely`, `often`,
> `almost-always`) siguen soportados por el sidecar para proyectos ya
> guardados; la UI no los ofrece.

### Adenda 2026-09-19 — reglas propias sobre el texto portado, y el recorte final

La regla de este carril se mantiene: los textos portados del origen viajan
byte-idénticos y la gema va verbatim. Lo que la plataforma agrega es una regla
técnica DECLARADA, en una constante propia, sumada sin editar el texto portado.
Bajo esa regla entraron `STYLE_CHARACTER_PRECEDENCE_RULE` (Fase 1) y
`PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE` (reintentos): el personaje que el estilo
describe es el protagonista del video.

El scrub final (`sanitizeFinalPrompt`) reconoce la identidad tejida de este carril.
Cuando un prompt no entra, cede primero el núcleo de la escena, después la cola de
estilo y la identidad recién al final. Antes cortaba por el final, que es donde va
la identidad. Sin identidad tejida, el corte del carril de la casa no cambia.
Ver [causa, implementación y QA](../fixes/2026-09-19-fix-style-character-video/style-character-video.md).

### Adenda 2026-09-21 — vestuario por escena, detrás de una constante

Decisión de producto: con estilo propio el personaje se adapta a la escena solo en
la ropa. Entra por el mismo mecanismo de esta ADR (reglas técnicas declaradas y
sumadas; los textos portados intactos): `SCENE_WARDROBE_RULE` al final del system,
`BATCH_WARDROBE_ADDENDUM` tras el preámbulo, `CHARACTER_OUTFIT_SENTENCE_RULE` en la
Fase 1. El modelo escribe `[subject] (wearing: …)` solo cuando la situación lo exige;
el código separa la ropa, la teje junto al rol y deja la ropa base fuera de la
descripción; lo que caracteriza al personaje (sombrero, placa, abrigo, lo que lleva
en la mano) se queda encima de la ropa de la escena salvo que la escena lo haga
imposible. Todo detrás de `VERBATIM_SCENE_WARDROBE`, encendida el 2026-09-21 tras
tres A/B con claves reales (`scripts/ab-scene-wardrobe.mjs`); apagada, cada prompt
vuelve a ser byte-idéntico al anterior.
Ver [estado, tejido y protocolo del A/B](../handoff/2026-09-21-custom-style-scene-wardrobe/implementation.md).

### Adenda 2026-09-22 — idioma de salida y el fallo `llm_prompt_language`

Caso real (`test-12`): una gema en español que cerraba con «Escribe cada descripción en
español» hacía que todos los modelos devolvieran los prompts en español; el parser los
rechazaba de a lote entero, la escalera y el rescate repetían el mismo pedido (~22
llamadas cobradas por 7 escenas) y el halt de ADR-0028 bloqueaba al modelo, que no tenía
la culpa. Este carril nunca había pedido el inglés: solo lo pedían las muestras, vía
`GLOBAL_RULES`. Entra por el mismo mecanismo de esta ADR: `OUTPUT_LANGUAGE_RULE` en el
system después de la arquitectura, en los cuatro modos, y `FRAGMENTS_LANGUAGE_REMINDER`
después de la línea de cierre portada del lote, detrás de
`VERBATIM_OUTPUT_LANGUAGE_RULE`, encendida tras el A/B con claves reales
(`scripts/ab-prompt-language.mjs`, 108 corridas): la gema que pide español pasa de 0/18
a 18/18 corridas aceptadas en los seis modelos, y una gema en español que no pide idioma
—que sin la regla fallaba 1 de 3 corridas en tres modelos— pasa a 18/18. Y una red
de seguridad en el redactor: la contaminación por idioma es `PipelineFailure` con código
`llm_prompt_language`, una ronda entera en otro idioma corta la corrida antes de la
escalera y del rescate (dos pedidos, con lo ya cosechado persistido), el código no está
en `PROVIDER_TROUBLE_CODES` y la UI pide editar la gema en vez de bloquear o cambiar el
modelo. Ver [causa, corrección y QA](../fixes/2026-09-22-fix-verbatim-prompt-language/verbatim-prompt-language.md).

## Qué NO cambia

- Un proyecto **sin** `customStyle` recorre el carril de la casa byte por
  byte (biblia, director, redactor JSON, cortes por conteo).
- Un proyecto custom **previo** a esta ADR (sin `secondsPerScene`) sigue
  cortando por conteo clásico.
- `resolveProjectStyle` y el snapshot inline de ADR-0018 quedan intactos: la
  fase de imágenes (sanitización, fallback, hash E26/E27) sigue usándolos.

## Alternativas consideradas

- **Seguir con el carril básico (ADR-0018) para siempre** — rechazada: el
  contrato JSON pisa el formato que la gema define, y el 1:1 por lotes con
  ids es lo que hace confiable un video de 60+ escenas con estilo propio.
- **Reusar `motor-web/` del origen como dependencia** — rechazada: es
  CommonJS acoplado al server web; se reescribe en `pipeline/` con las
  convenciones del repo (fetch, PipelineFailure, emitter — sin `console`).
- **Portar también CometAPI y `modelos-extra.json`** — rechazada: proveedor
  deshabilitado en el origen mismo y archivo que exige leer el entorno.

## Consecuencias

- (+) Fidelidad al estilo del usuario medida en el origen (fichas pegadas
  105/270 → 0/270 con la línea de arquitectura; 1:1 con ids).
- (+) Escenas de duración elegida con vista previa exacta y gratuita.
- (−) La fase de prompts custom es secuencial por lotes: más latencia que el
  paralelo por escena de la casa (se paga a propósito: fidelidad > velocidad).
- (−) Los avisos del motor viajan como logs en inglés por el canal de
  eventos; el aviso rico de «tu gema no define personaje» del origen queda
  para una rama de UI posterior (ADR-0020 le da a la gema el modo de
  personaje, lo que vuelve ese aviso menos frecuente, pero no lo porta).

## Verificación de cumplimiento

- `pnpm format && pnpm lint && pnpm build` en verde (los tres catálogos
  i18n alineados: `pnpm check:locales`).
- Aserciones puras sin créditos (Node type-stripping) sobre parser, tejedor,
  mensajes, lectura de lotes, catálogo y cortador por segundos — incluido el
  caso canónico 47.4 s @ 3 s → 16 escenas sin huecos y con ids 1..N.
- Harness sin claves: `preview-scene-cuts` (16 @ 3 s, 5 @ 10 s,
  `../evil` → `invalid_payload`) y `confirm-scenes` (por segundos escribe
  `scenes-confirmed.json`; ambos campos a la vez o fuera de rango →
  `invalid_payload`).
- Guard de no-regresión del carril de la casa: sin `customStyle`,
  `scene-prompts`, `images` y `scene-cuts` no tocan ninguna rama nueva
  (grep de los guards `context.options.customStyle`).
- Con claves reales (pendiente conocido del proyecto): video completo por el
  carril verbatim con confirmación por segundos, y regeneración de una escena
  rechazada por content-policy conservando el estilo.

## Referencias

- Origen: `motor-web/verbatim/{modelos,cliente,mensajes,parseo,sujeto,motor}.ts`,
  `motor-web/puente/fase_prompts.ts`, `motor-web/fragmentos/fragmentador.ts`
  (rama `vimo_dev` de cursor-video).
- Doctrinas E33/E34/E35/E42/E47/E49 y v1.31.1 del histórico del origen.
