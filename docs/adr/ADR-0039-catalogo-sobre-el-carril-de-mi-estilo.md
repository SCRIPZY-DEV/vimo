# ADR-0039 — Los estilos del Catálogo migrarán al carril de «Mi estilo»

- **Estado:** Aceptada (2026-10-02). Propuesta el 2026-09-18; implementada en la Entrega 2 del
  catálogo sobre el carril de Mi estilo ([ADR-0048](ADR-0048-gemas-por-secciones-y-agente-reconstructor.md),
  [plan-e2.md](../handoff/2026-09-30-catalog-on-custom-style-lane/plan-e2.md)), detrás del
  interruptor `features.newCatalog`. El carril viejo sigue vigente hasta su retiro (sección «Cómo
  se resolvió»).
- **Fecha:** 2026-09-18 (aceptada el 2026-10-02)
- **Área:** pipeline / Catálogo
- **Relacionada con:** [ADR-0019](ADR-0019-carril-verbatim-y-segundos-por-escena.md)
  (el carril al que se migra), [ADR-0036](ADR-0036-prompts-de-catalogo-sin-relleno.md)
  y [ADR-0033](ADR-0033-personajes-con-foto-la-imagen-subida-como-identidad.md).

## Problema

El pipeline tiene DOS formas de redactar los prompts de escena, que se bifurcan en
`pipeline/stages/scene-prompts/scene-prompts.ts` según `options.customStyle`:

- **Catálogo** (`normal`, `pov_stickman`, `cartoon`, `fantasia`, `terror`): biblia
  visual → reparto de presencia → director de escenas → **una llamada LLM por escena**
  con un bloque duro del personaje. El redactor REESCRIBE la identidad del personaje
  en cada escena.
- **Mi estilo** (carril verbatim, ADR-0019): la gema viaja entera como `system`, los
  prompts salen en lotes, el modelo escribe la etiqueta `[subject]` y **la plataforma
  teje la identidad por código** (`verbatim/subject-weaver.ts`): la misma descripción,
  palabra por palabra, en todas las escenas.

La diferencia no es cosmética. El 2026-09-18 el cliente reportó que en Catálogo +
Realista el personaje cambiaba entre escenas (un personaje moreno salía blanco). La
causa de fondo es estructural: cuando un LLM reescribe la identidad N veces, en
algunas la pierde. El arreglo
([realistic-character-identity](../fixes/2026-09-18-fix-realistic-character-identity/realistic-character-identity.md))
necesitó cuatro rondas y dejó una pila de redes sobre el carril de Catálogo: candado
de tez, validación de presencia, detección de suplentes del protagonista, sello «sin
gente», promoción de escenas. Todas compensan algo que en Mi estilo no puede pasar,
porque ahí la identidad no la escribe el modelo.

Restricciones que acotan la decisión:

- El fix del 2026-09-18 ya está hecho y resuelve el reporte: esto no es urgente.
- Mantener dos carriles duplica cada corrección de identidad, de content policy y de
  reanudación (ADR-0036 y E34 de ADR-0019 resuelven lo mismo dos veces).
- El Catálogo tiene capacidades que Mi estilo hoy no ofrece y el usuario usa: la
  **frecuencia del personaje** (`characterFrequency`), la biblia visual con candado de
  época y el director de escenas (variedad de tratamientos).

## Decisión

**A futuro, los estilos del Catálogo se ejecutarán por el carril de Mi estilo: cada
estilo de la casa pasa a ser una gema incorporada y deja de tener un redactor propio.**
Hasta que esta ADR pase a `Aceptada`, el carril de Catálogo sigue vigente y se
mantiene tal como quedó tras el fix del 2026-09-18.

Lo que la migración implica, a grandes rasgos:

- Cada entrada de `VISUAL_STYLES` (`pipeline/prompts/visual-styles.ts`) se reescribe
  como una gema: el `systemPrompt` por escena con contrato JSON deja de existir y el
  estilo se expresa en el formato que consume `verbatim/verbatim-messages.ts`.
- La identidad del personaje deja de redactarse por escena: viaja por `[subject]` y la
  teje `subject-weaver.ts`. Con foto, por `buildCustomStyleReferencePrompt`
  (`pipeline/prompts/character-reference.ts`).
- `scenePromptsStage` y `imagesStage` pierden la bifurcación por `customStyle`.

### Qué hay que resolver antes de aceptarla

| Tema                     | Hoy en Catálogo                                      | Pendiente de definir en el carril único                             |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Frecuencia del personaje | `distributePresenceByFrequency` (sorteo por nivel)   | Mi estilo informa la presencia desde el motor (`scenesWithSubject`) |
| Escenas sin el personaje | Bloque propio + reintento + promoción (fix 09-18)    | Cómo se le pide a una gema una escena sin `[subject]`               |
| Época y contexto visual  | Biblia visual + `neutralizeEraInBible`               | Mi estilo no genera biblia: el guion completo es el contexto        |
| Variedad de planos       | Director de escenas (`scene-director.ts`)            | El ritmo lo trae la gema                                            |
| Stickman                 | Muñeco, molde CONCEPTO, sin rasgos humanos           | Si el muñeco se expresa bien como gema                              |
| Costo y latencia del LLM | Una llamada por escena                               | Lotes de 20 con escalera [20, 5, 1]: medir antes de migrar          |
| Proyectos ya creados     | `scenes.json` con prompts y `direction` del Catálogo | Reanudar y «Regenerar imagen» sin reescribirlos ni recobrarlos      |

### Cómo se resolvió (2026-10-02)

La Entrega 2 del catálogo (spec §8 de `design.md`, `plan-e2.md`) cierra la tabla así:

| Tema                     | Resolución en el carril único                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frecuencia del personaje | Lo decide el **dinamismo de la gema** (sección `dynamism`, spec §5.3): el menú de tratamientos, al menos 1 de cada 3 escenas explicativa o alusiva, nunca 3 tratamientos ni 3 lugares iguales seguidos y el protagonista en alrededor del 50 % de las escenas. El selector de frecuencia desaparece del catálogo nuevo.                         |
| Escenas sin el personaje | La **etiqueta de tratamiento** (`TREATMENT_TAG_RULE`) libera `[subject]` en las escenas cuyo tratamiento no muestra al protagonista, y el **modo cinemático** del marco (`PROMPT_ARCHITECTURE_RULE_NO_SUBJECT`, `DYNAMISM_WITHOUT_PROTAGONIST_RULE`) hace videos sin protagonista recurrente. No hay reintento ni promoción por código.         |
| Época y contexto visual  | No hay biblia: el **guion completo** es el contexto de la Fase 1 (`buildScriptMessage`) y la gema describe el estilo; una gema de época lo dice en `visualStyle` o `rules`.                                                                                                                                                                     |
| Variedad de planos       | Las secciones **`camera` y `dynamism`** de cada gema; el reparto real se informa en el log al cerrar la fase (spec §5.3). Sin verificación por código (F5 del diseño): se suma solo si la QA muestra monotonía.                                                                                                                                 |
| Stickman                 | Su gema lleva el muñeco en **`character`** (identidad tejida por código, igual en todas las escenas), las reglas del muñeco (otros muñecos iguales, ropa según la historia) en `rules`, y el prólogo y el bloque STYLE como frases fijas (`promptStart`, `promptEnd`). `allowedModes` ofrece los tres modos; la QA de la Ola 3 confirma cuáles. |
| Costo y latencia del LLM | Se mide en la **QA de la Ola 3** (E2-7 del plan) contra el catálogo viejo, con claves reales, antes de encender `features.newCatalog` para todos.                                                                                                                                                                                               |
| Proyectos ya creados     | Un proyecto **sin `customStyle` sigue por el carril viejo, intacto**, hasta el retiro: reanudar y «Regenerar imagen» no cambian. El catálogo nuevo crea proyectos con `options.customStyle.catalogStyleId`, que son proyectos de Mi estilo a todos los efectos.                                                                                 |

Cómo quedó:

- Las 5 gemas de la casa viven en `pipeline/prompts/catalog-gems/` como gemas de plantilla
  (`CatalogGem`: nombre y etiquetas en tres idiomas —la descripción se retiró el 2026-10-05, ver la
  enmienda—, secciones, modos permitidos, modo de las muestras, preset de color y cantidad de
  muestras), junto con las 33 de Imperio Pro. `VISUAL_STYLES` no cambia: el carril viejo sigue byte
  por byte hasta el retiro.
- El sidecar expone `catalog-styles-list` y `catalog-style-copy` («Pasar a mi estilo» crea una copia
  independiente en `_styles/st-…` con `origin`). `create-video-project` exige coherencia entre
  `options.styleId`, `customStyle.styleId` y `catalogStyleId`; `generate-character-preview` acepta los
  ids nuevos del catálogo con el marco (los 5 heredados siguen con su plantilla fija hasta el retiro).
- La app muestra la pestaña Catálogo nueva solo con `features.newCatalog` encendido y fuera del modo
  demo: tarjetas como las de Mi estilo, «Ver» (muestras y modo de personaje, recordado por estilo en
  `localStorage`) y «Pasar a mi estilo». Con el interruptor apagado, Crear es el de hoy.
- El retiro del carril viejo (redactor por escena, `identity-lock.ts`, frecuencia, cantidad de escenas,
  pack de la demo) arranca 7 días después de encender el interruptor para todos (E2-8 del plan).

### Enmienda 2026-10-05 — sin descripción y «Personaje fijo» en amarillo

Pedidos del dueño en la QA del 2026-10-05:

- **Sin descripción.** Las gemas del catálogo ya no traen `description` («Personaje 3D estilizado con
  acabado CGI…»): el dueño no la ve necesaria, ni en la tarjeta ni en «Ver». Se borró del tipo
  `CatalogGem`, de las 38 gemas y de las gemas de ejemplo de los guards, y `check-catalog-gems.mjs`
  fija que ninguna la traiga. «Ver» queda con el nombre, las etiquetas, el modo de personaje y las
  muestras. La Entrega 3 tiene un campo menos que escribir y traducir.
- **«Personaje fijo» en amarillo.** En la tarjeta y en «Ver», esa etiqueta va en el amarillo de la
  app (`bg-saffron`) para que se note que conviene usar el personaje del estilo o uno propio en ese
  estilo; las demás siguen grises. Como `src/` solo importa tipos de `pipeline/` (ADR-0010), la app
  la reconoce con un espejo de la paleta (`src/modules/videos/utilities/catalogTags.ts`), y
  `check-app-catalog-style.mjs` fija que coincidan.

## Alternativas consideradas

- **Seguir con dos carriles y endurecer el de Catálogo** — es lo que se hizo el
  2026-09-18 y queda vigente. Funciona, pero cada defecto de identidad se paga dos
  veces y las redes crecen. Es la opción por defecto mientras esta ADR sea Propuesta.
- **Llevar solo el tejido `[subject]` al Catálogo, sin migrar el resto** — atacaría la
  causa de fondo con menos cambio. Se descartó _por ahora_: el contrato JSON por
  escena y el bloque duro del personaje están pensados para que el redactor escriba la
  identidad; injertar el tejido deja dos mecanismos de identidad conviviendo en el
  mismo carril. Es el paso intermedio natural si la migración completa resulta cara.
- **Migrar ya, junto con el fix** — descartado: el reporte tenía arreglo acotado y la
  migración toca las seis fases, la UI de creación y los proyectos existentes.

## Consecuencias

- ✅ Un solo mecanismo de identidad, determinístico: el defecto del 2026-09-18 deja de
  ser posible por construcción, no por validación.
- ✅ Una sola implementación de content policy, reanudación y rotación de modelos.
- ⚠️ Hasta la migración se mantiene la pila de redes de `identity-lock.ts`; todo
  arreglo de identidad en Catálogo es deuda que la migración va a borrar.
- ⚠️ Reescribir cinco estilos como gemas exige QA visual estilo por estilo: el texto
  actual es un port verbatim del origen, medido en producción.
- 🔒 Mientras esta ADR esté en Propuesta, **no se agregan capacidades nuevas solo al
  redactor de Catálogo**: lo que haga falta se diseña pensando en el carril único, o
  se resuelve como red acotada y documentada (como el fix del 2026-09-18).

## Verificación de cumplimiento

Desde la aceptación (2026-10-02), con `node --test`:

- `scripts/test/check-catalog-gems.mjs`: las 38 gemas del catálogo cumplen el contrato (ids, límites
  de las secciones, `Outfit:` en `character`, modos, etiquetas coherentes con las secciones, muestras
  presentes, sin descripción).
- `scripts/test/check-catalog-list.mjs` y `scripts/test/check-catalog-copy.mjs`: el listado y la copia
  de «Pasar a mi estilo» (muestras antes que `style.json`, escritura atómica, validaciones).
- `scripts/test/check-gem-project-snapshot.mjs`: la coherencia del proyecto de una gema del catálogo.
- `scripts/test/check-app-catalog-style.mjs` y `scripts/test/check-app-custom-style-payload.mjs`: la
  memoria del modo, el snapshot del formulario, el cambio de pestaña y que una copia nunca viaja como
  gema del catálogo.
- `scripts/test/check-app-catalog-payload.mjs`: el payload de Crear por carril con el formulario real
  empaquetado; el del catálogo viejo queda fijado byte por byte (interruptor apagado o demo).
- Los guards del carril viejo (`check-character-identity-lock.mjs`, `check-catalog-prompts.mjs`,
  `check-packaged-catalog.mjs`) siguen en verde hasta el retiro.

Hasta la aceptación (Propuesta), lo que protegía el estado vigente:

- **Tests:** `scripts/test/check-character-identity-lock.mjs` (identidad del personaje
  en Catálogo) y `scripts/test/check-catalog-prompts.mjs` (ADR-0036). Locales, con
  `node --test`.
- **Cómo se vería una regresión:** un personaje que cambia de look entre escenas de un
  mismo video de Catálogo; la detectan los casos de tez, presencia y suplentes.

Lo que la QA de la Ola 3 (E2-7 del plan, pendiente del dueño con claves reales) debe demostrar antes
de encender el interruptor para todos:

- Los mismos guiones de QA del fix (12 escenas «always» y 4 escenas «balanced», con
  personaje por prompt y por foto) dan identidad consistente en los cinco estilos, por
  el carril único y con ambos proveedores de imagen.
- `check-editor-character-selection.mjs` y `check-preview-regressions.mjs` siguen en
  verde, y existe un caso que abre un proyecto creado con el carril viejo.
- Costo y tiempo de la fase de prompts medidos contra el Catálogo actual.

## Fuera de alcance

- Con el interruptor apagado no cambia nada del comportamiento actual: ni el redactor de
  Catálogo, ni la UI, ni los proyectos existentes.
- El retiro del carril viejo y la regeneración del pack de la demo (ADR-0029) son trabajo
  posterior, con fecha a partir de E2-8.
- El catálogo remoto administrado desde Supabase es la Entrega 3 del mismo diseño.

## Referencias

- Informe del fix que motivó esta ADR:
  [realistic-character-identity](../fixes/2026-09-18-fix-realistic-character-identity/realistic-character-identity.md).
- Bifurcación actual: `pipeline/stages/scene-prompts/scene-prompts.ts`,
  `pipeline/stages/images/images.ts`.
- Carril destino: `pipeline/stages/scene-prompts/verbatim/` (ADR-0019).
- Redes que la migración volvería innecesarias:
  `pipeline/stages/scene-prompts/identity-lock.ts`,
  `pipeline/utils/character-complexion.ts`.
