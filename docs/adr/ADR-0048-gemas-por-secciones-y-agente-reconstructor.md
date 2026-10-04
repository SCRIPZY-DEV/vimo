# ADR-0048 — Gemas por secciones y agente reconstructor

- **Estado:** Aceptada
- **Fecha:** 2026-09-30
- **Área:** pipeline / app / servidor
- **Retoma:** [ADR-0039](ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md) (Propuesta). Esta ADR
  es la Entrega 1 de esa migración; la ADR-0039 pasa a Aceptada con la Entrega 2.
- **Extiende a:** [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md) (la gema guardada
  y su copia en el proyecto), [ADR-0019](ADR-0019-carril-verbatim-y-segundos-por-escena.md) (el
  carril verbatim) y [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md) (el modo
  de personaje de la gema).
- **Spec:** [design.md](../handoff/2026-09-30-catalog-on-custom-style-lane/design.md), §4 a §7.

## Problema

Vimo redacta los prompts de escena de dos formas (ADR-0039). El Catálogo pasa por biblia visual,
reparto de presencia y director de escenas, con una llamada al modelo por escena: unas 218 para un
video de 200 escenas. «Mi estilo» manda la gema del usuario como `system` y escribe en lotes de 20:
unas 10 llamadas para el mismo video (ADR-0019). La ADR-0039 propuso dejar un solo carril, el de Mi
estilo, pero ese carril tiene dos huecos:

- **Cada gema tiene su propia estructura.** La plataforma no sabe dónde están el estilo, el
  personaje o el ritmo de una gema: lo que necesita lo pide con reglas sumadas al final, y esas
  reglas compiten con lo que dice la gema. Caso real: una gema que pedía escribir en español hacía
  que el parser rechazara lotes enteros, hasta que llegó `OUTPUT_LANGUAGE_RULE` (ADR-0019, adenda
  del 2026-09-22). Y las preguntas que dejó abiertas la ADR-0039 para migrar el Catálogo (cómo
  pedirle a una gema una escena sin el personaje, dónde vive el ritmo) no tienen dónde resolverse
  en un texto libre.
- **El personaje se controla solo por instrucción.** Si una gema trae a su personaje escrito dentro
  del texto del estilo, elegir «sin personaje» no lo borra: la descripción viaja igual en el
  `system` y el modelo la vuelve a escribir en las escenas.

Restricciones:

- Un `customStyle` sin secciones (proyectos viejos, gemas todavía no reconstruidas, cuentas sin el
  interruptor) tiene que producir los mismos mensajes que hoy, byte por byte.
- El agente usa la clave de Vimo (B3), que no puede viajar dentro de la app: el sidecar solo tiene
  las claves del usuario.
- `character`, `promptStart` y `promptEnd` se pegan tal cual en el prompt de imagen: no pueden
  depender de que el modelo los traduzca.
- Cada entrega se enciende primero para los admins y se abre a todos con el visto bueno del dueño,
  sin sacar versión de la app (F4 del spec).

## Decisión

**Las gemas de «Mi estilo» se guardan por secciones fijas que arma un agente en el servidor de
Vimo. Al generar, el sidecar las envuelve con el marco de Vimo, que aplica por código el
personaje, el dinamismo y las frases fijas. Una gema sin secciones sigue por el camino de hoy
hasta que se reconstruye.**

Decisiones del spec (§2) que esta ADR fija, con su texto:

| ID  | Decisión                                                                                                                                                                                                                                             | Origen                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| B1  | La gema se guarda por secciones fijas (spec §4). El marco de Vimo las envuelve al generar (spec §5).                                                                                                                                                 | Dueño                  |
| B2  | El modal muestra una caja por sección. Editar una sección guarda directo, sin agente: la estructura sigue igual y no tiene sentido reescribirla. «Pegar gema nueva» manda el texto completo al agente.                                               | Dueño                  |
| B3  | El agente corre en el servidor de Vimo (`vimo-landing`), con la clave de Vimo.                                                                                                                                                                       | Dueño                  |
| B4  | El marco vive en el código de la app y llega a todos con la actualización.                                                                                                                                                                           | Recomendación aceptada |
| B5  | Una gema guardada sin secciones se reconstruye sola la primera vez que se abre o se usa. Su texto original queda de respaldo.                                                                                                                        | Recomendación aceptada |
| B6  | El agente conserva estilo visual, dinamismo y prohibiciones. Saca formato de salida, idioma, fases de conversación e instrucciones sobre el personaje (el personaje va a su sección). No inventa nada.                                               | Recomendación aceptada |
| C6  | El personaje funciona igual que hoy en Mi estilo: con texto se dibuja en el estilo; con foto conserva su aspecto (`APPEARANCE LOCK`).                                                                                                                | Dueño                  |
| F5  | El filtro de color es un preset del estilo, elegido de una lista: Natural, Fantasía (colores vivos) y Terror (blanco y negro).                                                                                                                       | Recomendación aceptada |
| F6  | Hay dinamismo solo si el autor lo escribió. El agente lo junta completo y bien redactado en su sección. Cada escena viene etiquetada con su tratamiento para medir el reparto. La verificación por código se agrega solo si la QA muestra monotonía. | Dueño                  |
| L1  | Cada reconstrucción intentada deja una fila en Supabase, con éxito o con error (spec §6.5).                                                                                                                                                          | Dueño                  |

### Forma

```
modal de Mi estilo ── gema completa + sesión ──► POST vimo.click/api/estilos/reconstruir
        ▲                                          │ sesión, acceso, interruptor y cupo
        │                                          ├──► modelo (RECONSTRUCTOR_*) + zod
        └───────── secciones + warnings ◄──────────┤
                                                   └──► gem_rebuild_logs (una fila por intento)

modal ─────────► style-save ───────────► _styles/<id>/style.json  (sections, sourcePrompt, ...)
Crear ─────────► create-video-project ─► project.json             (copia en options.customStyle)
scene-prompts ─► buildTemplateSystem(sections, modo) ─► carril verbatim de siempre
render ────────► filterFinal del preset de color
```

| Pieza                 | Estado    | Ubicación                                                                               | Para qué                                                                      |
| --------------------- | --------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Contrato de la gema   | extendido | `pipeline/types/styles.ts`, `video-project.ts`, `scenes.ts`                             | `GemSections`, `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION`, `COLOR_FILTER_IDS` |
| Almacén de estilos    | extendido | `pipeline/commands/styles/style-store.ts`, `style-save.ts`                              | Límites, `sections` o `systemPrompt`, conservar lo que una escritura no trae  |
| Marco                 | nuevo     | `pipeline/prompts/template-frame.ts`                                                    | `buildTemplateSystem` y `composeGemText`                                      |
| Carril verbatim       | extendido | `pipeline/stages/scene-prompts/verbatim/`                                               | Rama con secciones, etiqueta de tratamiento y frases fijas                    |
| Presets de color      | nuevo     | `pipeline/prompts/color-filters.ts`                                                     | `filterFinal` del estilo vía `resolveProjectStyle`                            |
| Agente reconstructor  | nuevo     | `vimo-landing`: `functions/api/estilos/reconstruir.ts`, `functions/_lib/reconstructor/` | Gema completa → secciones                                                     |
| Reglas de acceso      | extraído  | `vimo-landing`: `functions/_lib/acceso.ts`                                              | Sesión y acceso de `verificar-acceso`, compartidos con el agente              |
| Interruptores         | nuevo     | `vimo-landing`: `functions/_lib/interruptores.ts`, `functions/api/verificar-acceso.ts`  | `admin` y `features` desde `VIMO_FLAG_*`                                      |
| Registro              | nuevo     | Supabase: `gem_rebuild_logs`                                                            | Una fila por reconstrucción intentada                                         |
| Cliente de vimo.click | nuevo     | `src/modules/common/` (`vimoServerFetch`)                                               | Llamadas a vimo.click con la sesión de Supabase                               |
| UI de Mi estilo       | extendida | `src/modules/videos/`                                                                   | Modal por secciones y migración de gemas viejas                               |

### Capa 1: la gema por secciones

| Clave                       | Idioma       | Qué contiene                                                                                                                                                            | Tope   |
| --------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `visualStyle` (obligatoria) | El del autor | Técnica, paleta, luz, textura y composición característica.                                                                                                             | 12 000 |
| `character`                 | Inglés       | El protagonista fijo del estilo, si lo trae: identidad física y, al final, una oración que empieza con «Outfit:» con la ropa base. Es la única sección que lo describe. | 700    |
| `dynamism`                  | El del autor | Cuándo sale el protagonista y cuándo una metáfora, un objeto o un lugar, y en qué proporción. Habla de «el protagonista», nunca de su descripción.                      | 12 000 |
| `camera`                    | El del autor | Planos, ángulos y reglas de variedad. Reemplaza a `shots`.                                                                                                              | 12 000 |
| `rules`                     | El del autor | Lo que el estilo nunca hace.                                                                                                                                            | 12 000 |
| `promptStart`               | Inglés       | Frase que el código antepone a cada prompt de imagen.                                                                                                                   | 600    |
| `promptEnd`                 | Inglés       | Frase que el código agrega al final de cada prompt de imagen.                                                                                                           | 600    |

- La suma tiene un tope de 30 000 caracteres (`GEM_SECTIONS_TOTAL_CHAR_LIMIT`), el que tenía una
  gema, porque las secciones van en cada pedido de prompts. La gema que se pega admite hasta 100 000
  (`SYSTEM_PROMPT_CHAR_LIMIT`, también para las gemas viejas y el respaldo): el dueño lo subió el
  2026-10-01 porque hay gemas más largas, y el agente las condensa. El de `character` es el de la
  identidad tejida (`MAX_WOVEN_IDENTITY_CHARS`).
- `style.json` y `CustomStyleSummary` suman `sections`, `templateVersion`, `sourcePrompt` (el texto
  que se mandó al agente: solo respaldo, no se usa para generar), `colorFilter`, `origin` (copias
  del catálogo, Entrega 2) y `updatedAt`. `systemPrompt` pasa a ser opcional: solo lo tienen las
  gemas viejas.
- **Una gema tiene `sections` o `systemPrompt`, nunca los dos.** Lo validan `style-save` y
  `create-video-project`. `ProjectCustomStyle`, la copia que guarda el proyecto, suma `sections`,
  `templateVersion`, `colorFilter` y `catalogStyleId`.
- `GEM_TEMPLATE_VERSION = 1` es la versión de la estructura que entienden el sidecar y la app. El
  agente la devuelve y `style-save` la guarda junto con las secciones.
- Editar una sección guarda directo con `style-save`. «Pegar gema nueva» manda el texto completo
  al agente y reemplaza todas las secciones y el `sourcePrompt`. Un estilo nuevo pasa por el
  agente antes de su primer guardado. Sin `visualStyle` no se guarda.

### Capa 2: el marco de Vimo

`buildTemplateSystem(sections, mode, options)` arma el `system` de una gema de plantilla en este
orden:

```
# VISUAL STYLE          visualStyle
# CAMERA AND FRAMING    camera                            (si hay)
# DYNAMISM              dynamism + TREATMENT_TAG_RULE     (si hay)
# STYLE RULES           rules                             (si hay)
CONTENT_SAFETY_RULE
OUTPUT_FORMAT_RULE
FIXED_PHRASES_RULE                                        (si hay promptStart o promptEnd)
+ las reglas que el carril ya suma hoy, en el mismo orden y según el modo: SCENE_ID_RULE, la
  arquitectura del modo, OUTPUT_LANGUAGE_RULE, USER_PROTAGONIST_RULE,
  SCENE_WITHOUT_PROTAGONIST_RULE y SCENE_WARDROBE_RULE
```

`CONTENT_SAFETY_RULE` trae al carril la seguridad de contenido que hoy solo tiene el Catálogo (sin
gore, sin violencia explícita, sin nombres reales ni personajes con copyright).
`OUTPUT_FORMAT_RULE` fija lo que hoy fija cada gema: un bloque de código con un prompt por
fragmento y su id `((n))`, que el parser actual ya lee. `FIXED_PHRASES_RULE` avisa que el inicio y
el final los agrega el código.

**La sección `character` nunca entra al `system`.** El modo de personaje decide si viaja y cómo:

| Modo en la UI      | `character.mode` | Qué hace el marco                                                                                                                                                                                                                                                             |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personaje genérico | `generic`        | Con sección `character`, ese texto es el protagonista: va como turno del retrato y el código lo teje en cada escena que lo nombra. No corre la Fase 1 y queda en `styleProtagonist` con `source: 'style-section'`. Sin sección, la Fase 1 lo diseña desde el guion, como hoy. |
| Mi personaje       | `own`            | `character` no viaja. Manda el personaje del proyecto: con texto se teje y se dibuja en el estilo; con foto va como referencia con `APPEARANCE LOCK` (C6).                                                                                                                    |
| Cinemático         | `none`           | `character` no viaja. Arquitectura sin `[subject]`. Si el dinamismo nombra al protagonista, la escena sale sin protagonista recurrente: entorno, objetos o personas anónimas.                                                                                                 |

- **Dinamismo (F6).** Con `dynamism`, `TREATMENT_TAG_RULE` pide que cada prompt empiece con
  `((n)) [T:<tratamiento>]`, uno de los `SceneTreatment` que ya existen. El parser quita la
  etiqueta y guarda el valor en `scene.treatment`; si falta o no es válida, el prompt igual vale y
  no se reintenta. Al cerrar la fase, un evento `log` informa el reparto. Sin `dynamism` no se pide
  etiqueta. Cuando el tratamiento elegido no incluye al protagonista (una metáfora, un objeto, un
  lugar), la regla pide escribir la escena sin `[subject]`, aunque la arquitectura general del
  prompt lo nombre: si no, el dinamismo no podría dar escenas sin protagonista.
- **Frases fijas.** Después de tejer `[subject]`, el código arma
  `promptStart + ' ' + escena + ' ' + promptEnd`. Con `promptEnd` no corre `restoreStyleTail`. Si
  el prompt no entra en `MAX_PROMPT_CHARS`, `sanitizeFinalPrompt` cede primero el núcleo de la
  escena, después `promptEnd` y la identidad al final; `promptStart` no se corta. El rescate de una
  escena que pierde su foto de referencia (`rescueWithoutReference`, en la fase de imágenes) sigue
  el mismo orden: quita las frases del prompt guardado, teje la identidad de biblioteca dentro de
  la escena y vuelve a pegarlas, así que el prompt es inicio → escena → identidad → final y el
  recorte cede igual. **Corregido en la implementación (2026-09-30):** el plan del sidecar (P5)
  pegaba la identidad después del final fijo, y entonces el recorte tomaba el final por el cierre
  de la escena y lo cedía antes que el núcleo; la revisión de la Tarea A6 lo revirtió porque
  contradecía el spec §5.4.
- **Filtro de color (F5).** `pipeline/prompts/color-filters.ts` define `none` (Natural), `fantasy`
  (Fantasía) y `horror-bw` (Terror) con los filtros de FFmpeg que hoy viven en `VISUAL_STYLES`.
  `resolveProjectStyle` toma `filterFinal` de `customStyle.colorFilter`; ausente es `none`.
- **Muestras.** `generate-style-samples` usa el mismo marco y el mismo modo de personaje que el
  video: un lote verbatim con los 4 momentos fijos, el modelo de Ajustes (`promptModel` en el
  payload, resuelto con `resolveVerbatimModel` contra la oferta validada de la ADR-0044) y las
  frases fijas pegadas por código. Con una gema de plantilla, la Fase 1 de las muestras también
  corre con ese modelo: es la excepción, para estas gemas, al modelo fijo que la ADR-0044 §3 usa
  para diseñar el protagonista de las muestras. Con foto, solo las muestras cuyo momento nombra al
  protagonista llevan la referencia y el `APPEARANCE LOCK`, como en el video; si ninguna lo nombra,
  la foto no se sube y un `log` de nivel `info` lo explica. Las gemas viejas siguen por el camino de
  hoy.
- **La gema como texto.** Los usos que no escriben escenas reciben `composeGemText(sections)`: las
  secciones con sus títulos, sin las reglas de la plataforma y sin `character`, para que el
  personaje del estilo no se cuele en otro. La Fase 1 del carril y el diseño de un personaje con el
  estilo («Crear personaje con mi estilo», `design-style-character`) la reciben con
  `composeGemText(sections, { fixedPhrases: false })`, sin el inicio ni el final fijos: la ficha de
  un retrato no es un prompt de escena, y un final fijo copiado ahí haría rechazar la ficha o se
  tejería con la identidad en cada escena, antes del mismo final que pega el código. El retrato de
  un personaje de la biblioteca (preview) y el estilo del respaldo de imágenes la reciben completa,
  con las frases, porque son prompts de imagen; antes de pegarlas por código quitan la copia exacta
  que el modelo haya escrito (`stripFixedPhrases`). `DesignStyleCharacterPayload` acepta `gem` o
  `sections`, nunca los dos. **Corregido en la implementación (2026-09-30):** el spec §5.6 bis daba
  el texto completo a todos esos usos; la revisión de la Tarea A3 mostró que en la Fase 1 las
  frases se colaban en la identidad tejida.
- **El marco vive en el código del sidecar, que viaja dentro de la app (B4):** cambiarlo cambia
  todos los videos nuevos con la actualización, sin reprocesar ninguna gema.
- **No cambian:** lotes de 20, escalera [20, 5, 1], ronda de rescate, parser, tejido de
  `[subject]`, vestuario por escena, regla de idioma, E34, vigilancia del modelo (ADR-0028) y
  `styleProtagonist` en `project.json`.

### El agente reconstructor

- `POST https://vimo.click/api/estilos/reconstruir` con `Authorization: Bearer <access_token>`.
  Pedido: `{ text, origin, appVersion, locale }`, con `text` de 1 a 100 000 caracteres y `origin`
  `mi-estilo`, `catalogo` o `migracion`. Respuesta 200:
  `{ templateVersion, sections, suggestions, warnings }`, con los `warnings` en el idioma de la app.
- Errores con `{ code }`: 401 `sin-token` y `token-invalido`; 403 `sin-acceso` y
  `funcion-desactivada`; 400 `pedido-invalido` y `texto-invalido`; 422 `sin-estilo-visual`; 429
  `cupo-agotado` (con `retryAfterSeconds`); 500 `error-interno`; 502 `modelo-fallo`; 504
  `modelo-timeout`. La app traduce cada código con su clave de i18n.
- **Un texto que no es una gema tiene su código** (sumado el 2026-10-01, a pedido del dueño). Si el
  texto no dice nada de cómo se ven las imágenes (un guion, una lista de temas), el modelo responde
  `{ noVisualStyle, reason }` en vez de inventar un estilo, y el endpoint devuelve 422
  `sin-estilo-visual` sin gastar cupo. La app explica qué tiene que tener una gema y no ofrece
  «Reintentar», porque el mismo texto daría lo mismo.
- **El servidor no confía en la app.** Valida la sesión y las reglas de acceso con
  `functions/_lib/acceso.ts`, extraído de `verificar-acceso` sin cambiar su respuesta (con tests de
  caracterización escritos antes de extraer). Vuelve a comprobar el interruptor y el cupo, y
  responde `funcion-desactivada` a `origin: "catalogo"` si quien llama no es admin.
- **Reglas del agente (B6)**, versionadas en `vimo-landing/functions/_lib/reconstructor/`:
  conserva todo lo que la gema dice del estilo visual; lleva la descripción del protagonista fijo a
  `character`; incluye `dynamism`, `camera`, `rules`, `promptStart` y `promptEnd` solo si la gema
  los trae; descarta el formato de salida, el idioma, las fases de conversación y las instrucciones
  para el usuario; escribe las secciones descriptivas en el idioma de la gema; no inventa, y lista
  en `warnings` lo que descartó o era ambiguo.
- La respuesta del modelo se valida con zod (topes de la capa 1 y `visualStyle` obligatorio). Si no
  pasa, se reintenta una vez con el error de validación; si vuelve a fallar, `modelo-fallo`.
- **Modelo:** cliente de Chat Completions compatible con OpenAI, configurado con
  `RECONSTRUCTOR_API_URL`, `RECONSTRUCTOR_API_KEY` y `RECONSTRUCTOR_MODEL`; los parámetros propios
  de cada modelo van en `RECONSTRUCTOR_EXTRA_BODY`. Timeout de 120 s y hasta dos reintentos ante 429
  o 5xx (desde el 2026-10-01; antes uno). Una respuesta cortada por largo es `modelo-fallo` y no se
  reintenta igual. El cliente sirve sin cambios para CometAPI y DeepInfra. El proveedor y el modelo
  salieron de una comparación de 13 casos, elegidos el 2026-10-01: CometAPI con `gpt-5.4-nano` y
  `{"reasoning_effort":"medium"}`, la única configuración que acertó todos (spec §6.3). Una segunda
  ronda contra Gemini, Grok, Haiku y otros lo confirmó: es el que menos reglas de estilo pierde, a unos
  0,39 centavos de dólar por reconstrucción. Se pide con su id con fecha, `gpt-5.4-nano-2026-03-17`,
  porque CometAPI llegó a atender el alias con `gpt-5.4-mini`. La columna `model` de
  `gem_rebuild_logs` guarda «pedido → respondió» cuando no coinciden.
- **Cupo:** 30 reconstrucciones `ok` por usuario en las últimas 24 h, contadas en
  `gem_rebuild_logs`. Los admins no tienen cupo.

### Registro en `gem_rebuild_logs` (L1)

- Deja fila todo pedido que pasó la sesión, el acceso y la validación del cuerpo: `status` `ok`,
  `error` (`modelo-fallo`, `modelo-timeout`, `sin-estilo-visual`, `funcion-desactivada` o
  `error-interno`) o `quota`
  (`cupo-agotado`). Los 401, el 403 `sin-acceso` y los 400 se deciden antes de tener un cuerpo
  válido y quedan solo en el log de la Function.
- La fila guarda el usuario y su correo, el origen, el código y el detalle del error, el proveedor
  y el modelo, la versión de la plantilla, los caracteres de entrada y de salida, la duración, los
  tokens, los `warnings`, la versión de la app y **el texto de entrada y el JSON de salida**, para
  poder diagnosticar.
- RLS activo y sin políticas: solo el service role, desde `vimo-landing`, como `demo_accesos`.
  Retención de 60 días con pg_cron (el dueño la llevó de 30 a 60 el 2026-10-01). El SQL está en el spec (§6.5) y lo
  aplica el dueño.
- Si falla la escritura del registro, el usuario igual recibe su respuesta y el error queda en el
  log de la Function.

### Interruptores y gemas viejas

- Las respuestas autorizadas de `verificar-acceso` suman `admin: true` (solo para admins) y
  `features: { gemTemplate, newCatalog }` (siempre). Cada interruptor sale de una variable de
  entorno de `vimo-landing`, `VIMO_FLAG_GEM_TEMPLATE` y `VIMO_FLAG_NEW_CATALOG`, con valor `off`,
  `admins` o `all`; ausente o con otro valor cuenta como `off`. Arrancan en `admins` y pasan a
  `all` con el visto bueno del dueño.
- `gemTemplate` enciende esta ADR; `newCatalog` queda para las Entregas 2 y 3. La app lee los
  interruptores con `useAccessFeature` (en `common`): ausentes o incompletos son `false` y, sin
  red, valen los últimos recibidos para ese correo, con la misma memoria que `demo`. Sin
  `gemTemplate`, la UI de Mi estilo queda como hoy para toda gema sin secciones.
- **Gemas viejas (B5).** La primera vez que una gema sin secciones se abre en el modal o se elige en
  Crear, la app la manda al agente con `origin: 'migracion'`, con sus `shots` en el texto (el
  bloque `# ALLOWED SHOTS` de hoy) para que el agente los pase a `camera`. Si sale bien, guarda las
  secciones y el texto enviado como `sourcePrompt`, **antes** de que el autor las vea. Por eso la
  galería muestra un aviso para revisar las secciones y el modal de esa gema muestra los avisos del
  agente en `GemAgentWarnings`. Es un solo aviso, en memoria de la sesión, y se va cuando el autor
  lo descarta en cualquiera de los dos lugares o cuando vuelve a preparar la gema con «Pegar gema
  nueva». El `sourcePrompt` se ve, solo de lectura, en la
  caja «Texto original» del modal. Si falla, avisa con un botón para reintentar y la gema sigue
  funcionando por el camino viejo, sin bloquear al usuario.
- Un `customStyle` sin `sections` sigue por `buildVerbatimSystem(gema)`, byte por byte. El payload
  depende de lo guardado y no del interruptor: si `gemTemplate` vuelve a `off`, las gemas ya
  reconstruidas siguen generando por secciones (sin agente) y las viejas no se migran.

## Alternativas consideradas

- **Seguir con dos carriles** — es lo vigente mientras la ADR-0039 sea Propuesta. Cada corrección
  de identidad, de política de contenido o de reanudación se paga dos veces, y Mi estilo sigue sin
  estructura: el personaje escrito dentro del estilo se cuela igual en cinemático. Descartada: el
  objetivo es un solo carril y una sola estructura para todas las gemas (spec §1).
- **Llevar solo el tejido de `[subject]` al Catálogo** — el paso intermedio que dejó anotado la
  ADR-0039. Ataca la deriva de identidad del Catálogo con menos cambio, pero deja dos mecanismos de
  identidad conviviendo en un mismo carril y no resuelve nada de Mi estilo. Descartada.
- **Que el agente reescriba la gema entera como un prompt limpio, sin secciones** — normaliza el
  formato, pero el personaje, el dinamismo y las frases fijas siguen mezclados en un solo texto y
  la plataforma los sigue pidiendo por instrucción. Cada cambio de las reglas obligaría a
  reprocesar todas las gemas con el agente, en vez de llegar con la actualización (B4), y la
  primera edición a mano devolvería la gema a texto libre o la haría pasar otra vez por el agente
  (B2). Descartada.

## Consecuencias

- ✅ **Control determinístico del personaje.** Solo la sección `character` lo describe y el código
  decide si viaja según el modo. En cinemático no entra al `system` ni se teje.
- ✅ Cambiar el marco cambia todos los videos nuevos sin reprocesar ninguna gema, y editar una
  sección no llama al agente.
- ✅ Mi estilo gana la seguridad de contenido del Catálogo (`CONTENT_SAFETY_RULE`) y un reparto
  medible del dinamismo (`scene.treatment`).
- ✅ Los estilos del Catálogo se pueden escribir como gemas de plantilla: es la base de la Entrega 2
  de la ADR-0039.
- ⚠️ **Costo del agente por gema.** Cada gema nueva, reemplazada o migrada es una llamada a un
  modelo de primera línea con la clave de Vimo; el usuario no la paga. Lo acotan el cupo diario y
  que editar una sección no pasa por el agente. El costo por reconstrucción se mide en la
  comparación de modelos.
- ⚠️ **El control del personaje depende de que el agente lo separe bien.** Una mención que quede
  en `visualStyle` viaja al `system` en todos los modos. Lo vigilan la comparación de modelos con
  claves reales y el autor. Una gema vieja se migra y se guarda **antes** de que el autor la
  revise, y desde el 2026-10-02 también una recién pegada: se guarda como texto al tocar «Preparar con
  IA» y se adapta en segundo plano por el mismo camino (ver la nota posterior). En los dos casos, los avisos del agente y el texto original se le muestran después (el aviso de la
  galería, `GemAgentWarnings` en el modal y la caja «Texto original»), y hasta que los mira, su
  próximo video puede salir con las secciones sin revisar.
- ⚠️ **Excepción de texto frente a la ADR-0038.** `diagnostic_logs` no sube contenido del usuario;
  `gem_rebuild_logs` guarda el texto de la gema y el JSON de salida, por decisión del dueño, para
  poder diagnosticar el agente. Es una tabla aparte, solo accesible con el service role y con 60
  días de retención, y la política de privacidad de vimo.click lo dice.
- ⚠️ **Valores espejados.** `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION` y `COLOR_FILTER_IDS` viven en
  `pipeline/types/styles.ts`, y `src/` solo importa tipos del sidecar (el alias `@pipeline` es solo
  para `import type`, ADR-0010). La app los copia en `src/modules/videos/utilities/gemTemplate.ts`
  con una anotación `typeof` (`GEM_SECTION_KEYS: typeof PIPELINE_GEM_SECTION_KEYS`): si divergen,
  `pnpm build` deja de compilar.
- ⚠️ Preparar o migrar una gema necesita conexión con vimo.click. Sin red, una gema vieja sigue por
  el camino viejo, pero no se puede crear una gema de plantilla nueva.
- ⚠️ Hasta que no queden gemas viejas, el carril verbatim tiene dos ramas: con secciones y sin
  ellas.
- 🔒 Una gema nunca tiene `sections` y `systemPrompt` a la vez, y la sección `character` nunca entra
  al `system` del marco.
- 🔒 Ningún cambio del marco puede alterar el camino sin secciones: sus mensajes son los de hoy,
  byte por byte.
- 🔒 Solo pasan por el agente una gema completa nueva y una gema vieja sin secciones. Editar una
  sección, nunca.
- 🔒 El endpoint no confía en la app: la sesión, el acceso, el interruptor y el cupo se comprueban
  en el servidor.

## Verificación de cumplimiento

**Guards del sidecar** (`scripts/test/`, locales, con `node --test`):

| Guard                                  | Tarea    | Qué fija                                                                                                                                                                       |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check-gem-sections-store.mjs`         | A1       | Topes de la capa 1; `sections` o `systemPrompt`, nunca los dos; `style-save` conserva respaldo, filtro, origen y `character` si la escritura no los trae; lectura tolerante    |
| `check-gem-color-filters.mjs`          | A2       | Los tres presets con los filtros de `VISUAL_STYLES`; sin estilo propio, `resolveProjectStyle` devuelve el mismo objeto del catálogo                                            |
| `check-gem-template-frame.mjs`         | A3       | El `system` del marco byte a byte en los cuatro modos del carril (`generic`, `text`, `reference` y `none`); `character` fuera del `system`; la gema vieja sale igual que antes |
| `check-gem-verbatim-lane.mjs`          | A4       | Huellas SHA-256 del camino sin secciones; `character` como protagonista en genérico y ausente en `own` y `none`; E34 y el editor con el mismo marco                            |
| `check-gem-treatment-tags.mjs`         | A5       | Etiqueta `[T:…]`, `scene.treatment`, prompt válido sin etiqueta y log del reparto                                                                                              |
| `check-gem-fixed-phrases.mjs`          | A6       | Frases pegadas por código, sin `restoreStyleTail` con `promptEnd`, recorte con prioridad (también en el rescate sin foto) y `promptStart` intacto                              |
| `check-gem-style-samples.mjs`          | A7       | Muestras con el marco, el modo y el modelo de Ajustes; la gema vieja por el lote de siempre                                                                                    |
| `check-gem-project-snapshot.mjs`       | A8a, A8b | `create-video-project` exige uno de `sections` o `systemPrompt`; la gema como texto con `composeGemText`                                                                       |
| `check-gem-style-character-design.mjs` | A8c      | `design-style-character` con `sections`, sin la sección `character`                                                                                                            |

También siguen en verde los guards del carril verbatim: `check-preview-regressions.mjs`,
`check-style-character-video.mjs`, `check-scene-wardrobe.mjs`,
`check-verbatim-prompt-persistence.mjs`, `check-verbatim-prompt-language.mjs` y
`check-editor-character-selection.mjs`.

**Servidor** (`vimo-landing`, vitest con Supabase y el modelo simulados, `pnpm test`):
`tests/functions/verificarAcceso.test.ts` (caracterización antes de extraer `acceso.ts`, y después
`admin` y `features`), `acceso.test.ts`, `interruptores.test.ts`, `reconstructorEsquema.test.ts`,
`reconstructorInstrucciones.test.ts`, `reconstructorModelo.test.ts` (plazo, reintento y respuesta
cortada), `reconstructorRegistro.test.ts` (fila y cupo) y `reconstruir.test.ts` (el endpoint de
punta a punta). El build de `vimo-landing` no chequea los tipos de `functions/`, así que estos
tests son su red principal.

**App** (`scripts/test/check-app-*.mjs`, módulos puros de `src/` con `node --test`):
`check-app-access-flags.mjs` (interruptores ausentes o raros = `false`, memoria por correo),
`check-app-vimo-server.mjs` (el cliente contra un servidor HTTP local), `check-app-gem-rebuild.mjs`
(un solo pedido en vuelo por clave), `check-app-gem-sections.mjs` (topes, guardado con
`templateVersion` y aviso de inglés), `check-app-gem-migration.mjs` (una gema vieja se manda una
sola vez, un fallo no se repite solo y la migrada queda con los avisos del agente hasta que se
descarta), `check-app-custom-style-payload.mjs` (la gema vieja viaja
byte por byte; decide el dato, no el interruptor) y `check-app-style-character-gem.mjs`
(`sections` o `gem`, nunca los dos).

**Build:** `pnpm format:check`, `pnpm lint`, `pnpm build` (que compila los espejos con `typeof`) y
`pnpm check:locales`.

**Con claves reales** (paso del dueño): la comparación de modelos del agente con 10 gemas, y el
flujo completo en la app instalada: crear, editar, migrar una gema vieja y generar en los tres
modos.

**Cómo se vería una regresión:**

- El personaje del estilo aparece en un video cinemático hecho con una gema reconstruida.
- Un proyecto con una gema vieja cambia sus prompts: falla la huella de
  `check-gem-verbatim-lane.mjs`.
- Editar una sección deja una fila en `gem_rebuild_logs`, o una reconstrucción no deja ninguna.

## Modos de falla

| Caso                                                                        | Qué pasa                                                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| El agente falla, tarda (120 s en el servidor, 150 s en la app) o no hay red | El modal muestra el error traducido y un botón para reintentar. El texto pegado no se pierde y no se guarda nada a medias. |
| Cupo agotado                                                                | Mensaje con la hora en que vuelve a haber cupo.                                                                            |
| El agente devuelve algo inválido                                            | El servidor reintenta una vez. Si sigue mal, `modelo-fallo` y una fila con el detalle.                                     |
| El servidor tiene el interruptor apagado                                    | `funcion-desactivada`: el modal avisa que la función no está disponible para la cuenta y no reintenta.                     |
| Una gema vieja no se pudo reconstruir                                       | Sigue por el camino viejo, con aviso y reintento.                                                                          |
| `verificar-acceso` sin `features` (servidor viejo o a medio desplegar)      | Todo apagado: la app se comporta como hoy.                                                                                 |
| Falla la escritura del registro                                             | El usuario recibe su respuesta; el error queda en el log de la Function.                                                   |

## Fuera de alcance

- El catálogo nuevo y su administración (Entregas 2 y 3, ADR-0039 y la ADR de la Entrega 3).
  «Publicar en el catálogo» desde Mi estilo (D6) tampoco entra.
- La verificación del dinamismo por código (F6), salvo que la QA muestre monotonía.
- Dos personajes en el carril verbatim.
- `suggestions` del agente (modos permitidos y modo sugerido): viaja en la respuesta, pero la
  Entrega 1 no la usa.
- Un panel web para `gem_rebuild_logs`: por ahora los registros se consultan en Supabase.

## Referencias

- [ADR-0039](ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md): esta ADR es su Entrega 1.
- [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md),
  [ADR-0019](ADR-0019-carril-verbatim-y-segundos-por-escena.md) y
  [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md), extendidas: la gema guardada
  y su copia en el proyecto suman secciones, el carril verbatim arma el `system` con el marco y el
  modo de personaje decide si viaja la sección `character`.
- [ADR-0006](ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md), que recibe una
  enmienda en esta entrega: `vimoServerFetch` vive en `common` y adjunta la sesión, y los
  interruptores se leen con `useAccessFeature`. La clave del veredicto pasa a
  `commonQueryKeys.access`, así `videos` no importa nada de `auth`.
- [ADR-0038](ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md), que recibe una nota
  posterior sobre `gem_rebuild_logs` y su excepción de texto.
- [ADR-0043](ADR-0043-correspondencia-temporal-de-prompts.md): la revisión de correspondencia
  temporal sigue igual sobre el carril verbatim, también con gemas de plantilla.
- [ADR-0044](ADR-0044-oferta-de-redactores-validada.md): el lote de muestras de una gema de
  plantilla usa el redactor de Ajustes, resuelto contra la oferta validada con
  `resolveVerbatimModel`. El modelo del agente no es parte de esa oferta: lo fija
  `RECONSTRUCTOR_MODEL` en el servidor.
- Spec y planes: `docs/handoff/2026-09-30-catalog-on-custom-style-lane/` (`design.md`, `plan.md`,
  `plan-e1-sidecar.md`, `plan-e1-server.md` y `plan-e1-app.md`).
- Servidor: repo `vimo-landing`, rama `feat/reconstructor-gemas`. El SQL de `gem_rebuild_logs` y
  las variables de entorno están en `SETUP_RECONSTRUCTOR_GEMAS.md`.

## Nota posterior 2026-10-02 — la gema pegada se adapta en segundo plano

Pedido del dueño: que la adaptación de una gema muestre «Generando adaptación a ficha de Vimo manteniendo
tu gema», siga aunque se cierre el modal y se guarde sola.

- **Al tocar «Preparar con IA»,** el modal guarda la gema tal cual, como texto (`pastedGemSavePayload`:
  sin planos y con el respaldo vacío). La galería la manda al store de migraciones
  (`adaptPastedGem`, `origin: 'mi-estilo'`) y, con la lista nueva, pasa el modal a la gema guardada.
- **Al terminar,** la adaptación guarda las secciones con el texto pegado de respaldo
  (`migrationStyleSavePayload`). El modal se vuelve a sembrar con ellas, igual que tras la migración de
  una gema vieja.
- **«Reintentar»** repite el mismo origin. Con una adaptación en vuelo no sale otra.
- **Se quitó** `useGemRebuild` (con su single-flight): el modal ya no llama al agente.
- **El modal no se traba:**
  - la galería pone la gema guardada en la lista cacheada (`showSavedStyle`) antes de pasar el modal a
    ella, así el modal no se desmonta aunque el refetch tarde o falle;
  - el almacén de estilos (`useCustomStyles`) usa `networkMode: 'always'`, porque el sidecar es local:
    con el modo por defecto, sin red el guardado quedaba en pausa y el modal no se podía cerrar.
- **No toca el sidecar:** `style-save` ya guarda una gema de texto sobre una de secciones (las
  descarta) y conserva personaje, filtro y origen.
- **«Pegar gema nueva»** reemplaza al tocar el botón, por decisión del dueño: así lo pegado no se
  pierde si se cierra la app en el medio.
- **Límites:**
  - una gema pegada sin nombre se guarda como «Estilo sin nombre»;
  - si la app se cierra en el medio, la adaptación se retoma con `origin: 'migracion'`;
  - después de un `sin-estilo-visual`, corregir el texto en el editor viejo no reintenta solo en esa
    sesión.
- **El avance se ve en la tarjeta** (pedido del dueño, más tarde el mismo día): mientras la gema se
  adapta, su tarjeta en la galería se atenúa y muestra encima las tres fases (la gema guardada tal
  cual, la IA ordenando las secciones, el guardado) con la que está en curso, una barra y el
  porcentaje en número. El agente no informa avance, así que el porcentaje es una simulación por
  tiempo con la curva de los clips de animación (ADR-0047): en línea recta hasta el 85 % a los 30 s
  (lo medido con gemas reales), después frenando hacia el 95 %, y un 98 % fijo mientras se guardan
  las secciones (`gemAdaptationPercent`, `GEM_ADAPTATION_*`). El store guarda `startedAt` y `phase`
  en la migración en vuelo; `migrateStoredGem` avisa `saving` al recibir la respuesta. El aviso de
  «en vuelo» debajo de la grilla se quitó (lo reemplaza la tarjeta); en el modal sigue.
- **Se quitó el selector de filtro de color del modal** (pedido del dueño: no lo había pedido y no
  se entendía qué hacía). El preset (spec §5.5, F5) sigue en los datos y en el sidecar: una gema que
  lo trae lo conserva al guardar, y el catálogo de la Entrega 2 lo usará para Terror (blanco y negro)
  y Fantasía (colores vivos). Si «Pasar a mi estilo» copia una gema con filtro, habrá que decidir
  dónde se cambia (nota siguiente: la copia lo conserva y hoy no se cambia desde la UI).

## Nota posterior 2026-10-02 — el catálogo sobre el carril (Entrega 2)

La Entrega 2 del diseño (spec §8, [plan-e2.md](../handoff/2026-09-30-catalog-on-custom-style-lane/plan-e2.md))
hace que las gemas de la casa corran por este mismo carril, y con eso la
[ADR-0039](ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md) pasa a Aceptada. Lo que suma a esta ADR:

- **Contrato:** `pipeline/types/catalog.ts`. Una gema del catálogo (`CatalogGem`) es una gema de
  plantilla con `id` (uno de los 5 heredados o un id que cumple `STYLE_ID_PATTERN`), `name`,
  `description` y `tags` en tres idiomas dentro de la gema (`LocalizedText`), `sections`,
  `templateVersion`, `allowedModes`, `sampleMode` (el modo con el que salieron sus muestras y el
  modo por defecto en «Ver»), `colorFilter` y `sampleCount`. Vive en `pipeline/prompts/catalog-gems/`
  (un archivo por gema, `catalog.ts` con `CATALOG_GEMS` y `findCatalogGem`); la paleta de etiquetas en
  `tags.ts`.
- **Dónde viven las muestras:** en la app, `public/style-references/<id>_1..sampleCount.jpg` (P1 del
  plan): el sidecar no puede empaquetar imágenes. «Pasar a mi estilo» le manda los bytes al sidecar
  en el payload (`CatalogSampleUpload`, base64). Las de las 33 gemas de Imperio Pro las generó Vimo
  con su carril (`generate-style-samples`) y se guardan a 1280×720: las muestras del catálogo no se
  toman de terceros (regla del dueño).
- **El idioma del guion en las frases fijas (2026-10-03):** las frases fijas viajan tal cual, con
  una sola excepción. El marcador `[IDIOMA DEL GUION]` de las gemas de Imperio Pro («If any text
  appears in the image, it must be written in [IDIOMA DEL GUION]») lo completa el código con el
  idioma detectado del guion al pegar la frase (`fixedPhrasesInLanguage`): el modelo no ve las
  frases fijas, así que no puede completarlo él, y sin la frase el generador inventaba los carteles
  en inglés. Vale igual para una gema de Mi estilo que traiga el marcador.
- **Subcomandos:** `catalog-styles-list` (puro) y `catalog-style-copy` (crea `_styles/<st-id>/` con las
  muestras primero y `style.json` al final, con `origin`). `create-video-project` exige, con
  `catalogStyleId`, que `customStyle.styleId` sea el mismo id y que `options.styleId` sea el id heredado
  o `'normal'`. `generate-character-preview` acepta un id nuevo del catálogo con el marco; los 5
  heredados siguen con su plantilla fija hasta el retiro del carril viejo (P6).
- **App:** detrás de `features.newCatalog` y fuera del modo demo (P5), la pestaña Catálogo de Crear
  muestra tarjetas como las de Mi estilo con «Usar en este video», «Ver» y «Pasar a mi estilo»; «Ver»
  muestra muestras, etiquetas y el modo de personaje (sin el texto de la gema), recordado por estilo
  en `localStorage` (`vimo:catalog:character:v1`, con lectura tolerante). Sin tarjeta elegida no hay
  video (P4). Un proyecto del catálogo nuevo viaja como uno de Mi estilo (`options.customStyle` con
  `catalogStyleId`, sin `characterFrequency` ni cantidad de escenas).
- **Decisiones del plan que afectan a esta ADR:** P3 (modo por defecto = `sampleMode`: cinemático en
  los estilos sin personaje), P8 (textos dentro de la gema, no en i18n: en la Entrega 3 salen de la
  fila de Supabase), P9 (sin `sourcePrompt` en las gemas del catálogo ni en sus copias), P11 (las 5 de
  la casa pasaron por el agente y se ajustaron a mano; el dinamismo traduce el contrato del director),
  P12 (etiquetas del admin: «Dinamismo» si y solo si hay `dynamism`, «Personaje fijo» si y solo si hay
  `character`; lo fija `check-catalog-gems.mjs`).

## Nota posterior 2026-10-03 — ajustes de la QA del dueño sobre Mi estilo y el catálogo

Cambios de pantalla que pidió el dueño al probar la Entrega 2. No tocan el sidecar ni el contrato;
cada uno tiene su informe en `fixes/2026-10-03_*.md`.

- **«Personaje del estilo» también en Mi estilo.** Con la sección `character` escrita, el modo
  «genérico» teje ese personaje y no diseña otro (spec §5.2). La pantalla ya lo decía en «Ver» del
  catálogo y ahora lo dice igual en Mi estilo: la opción se llama «Personaje del estilo» en el modal
  de la gema (sobre el borrador de secciones, así cambia mientras se escribe) y en el chip de
  personaje de Crear (`gemBringsCharacter`). La spec decía que el bloque «¿Tu estilo lleva
  personaje?» no cambiaba. Una gema vieja, sin secciones, sigue diciendo «Personaje genérico».
- **«Pasar a mi estilo» abre la copia.** Al terminar la copia, el formulario pasa a la pestaña Mi
  estilo con el modal de la copia abierto, sin el aviso «quedó copiado» ni su botón «Ir a Mi
  estilo». Si la persona ya salió de la pestaña Catálogo mientras se copiaba, no se la lleva: la
  copia le aparece en Mi estilo.
