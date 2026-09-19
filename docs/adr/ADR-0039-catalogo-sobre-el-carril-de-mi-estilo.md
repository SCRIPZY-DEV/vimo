# ADR-0039 — Los estilos del Catálogo migrarán al carril de «Mi estilo»

- **Estado:** Propuesta (dirección a futuro; hoy NO se implementa)
- **Fecha:** 2026-09-18
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

Hoy (Propuesta), lo que protege el estado vigente:

- **Tests:** `scripts/test/check-character-identity-lock.mjs` (identidad del personaje
  en Catálogo) y `scripts/test/check-catalog-prompts.mjs` (ADR-0036). Locales, con
  `node --test`.
- **Cómo se vería una regresión:** un personaje que cambia de look entre escenas de un
  mismo video de Catálogo; la detectan los casos de tez, presencia y suplentes.

Para pasar a Aceptada, la migración debe demostrar:

- Los mismos guiones de QA del fix (12 escenas «always» y 4 escenas «balanced», con
  personaje por prompt y por foto) dan identidad consistente en los cinco estilos, por
  el carril único y con ambos proveedores de imagen.
- `check-editor-character-selection.mjs` y `check-preview-regressions.mjs` siguen en
  verde, y existe un caso que abre un proyecto creado con el carril viejo.
- Costo y tiempo de la fase de prompts medidos contra el Catálogo actual.

## Fuera de alcance

- No cambia nada del comportamiento actual: ni el redactor de Catálogo, ni la UI, ni
  los proyectos existentes.
- No decide el destino de la frecuencia del personaje ni del director de escenas: son
  las preguntas abiertas de la tabla, a resolver cuando se retome.

## Referencias

- Informe del fix que motivó esta ADR:
  [realistic-character-identity](../fixes/2026-09-18-fix-realistic-character-identity/realistic-character-identity.md).
- Bifurcación actual: `pipeline/stages/scene-prompts/scene-prompts.ts`,
  `pipeline/stages/images/images.ts`.
- Carril destino: `pipeline/stages/scene-prompts/verbatim/` (ADR-0019).
- Redes que la migración volvería innecesarias:
  `pipeline/stages/scene-prompts/identity-lock.ts`,
  `pipeline/utils/character-complexion.ts`.
