# El personaje escrito en el estilo sale, y es el mismo, en todo el video

Fecha: 2026-09-19. Queja de los usuarios: «pongo la descripción de un personaje
dentro del estilo, genero el video y ese personaje no sale». En las muestras del
estilo ya salía desde el
[fix del 2026-09-18](../2026-09-18-fix-style-samples-character/style-samples-character.md);
en las imágenes de las escenas, no.

La precedencia no cambia: un personaje elegido de la biblioteca le gana al que
describe el estilo (`USER_PROTAGONIST_RULE`, modos `text` y `reference`); sin
personaje elegido y con el estilo en genérico, manda el que el estilo describe; con
«Sin personaje», el video sigue sin protagonista.

## Causa

Con estilo propio el video va por el carril verbatim. Sin personaje del usuario, la
Fase 1 (`designCharacter`) diseña al protagonista con una sola llamada. Cuatro
fallas, de la más a la menos determinante:

1. **La consigna mandaba al modelo al guion.** `CHARACTER_DESIGN_INSTRUCTION` pide
   «el protagonista de este guion: la lectura más obvia y directa» y solo contempla
   que el estilo tenga una _fase de diseño de personaje_. Un estilo que simplemente
   DESCRIBE a su personaje («una chica pelirroja con buzo verde») no estaba cubierto.
   Las muestras sí traían la cláusula «si tu estilo ya describe a su personaje,
   devolvé ESE»; al video nunca se le copió. El reintento con
   `PLATFORM_CHARACTER_PHASE` rediseñaba desde cero.
2. **El protagonista no se guardaba.** `VerbatimResult.characterDescription` no tenía
   consumidores y `project.json` no tenía dónde guardarlo. Cada corrida con escenas
   pendientes volvía a correr la Fase 1 y podía tejer OTRO personaje en las escenas
   nuevas. Eso pasaba en una reanudación parcial, en la reescritura por política de
   contenido y en «Regenerar imagen» con reescritura de prompt. Solo había un
   `cacheKey` de DeepInfra, que es una pista de caché y no una garantía.
3. **El recorte final borraba la identidad primero.** El cuerpo de un prompt verbatim
   es escena → cola de estilo → identidad. `appendReservingSpace` recortaba por el
   final para reservar las cláusulas de texto-en-imagen y anonimato. El cuerpo
   dispone de 2.106 caracteres; con una cola de estilo larga, la identidad
   desaparecía sin ningún aviso.
4. **Si la Fase 1 no dejaba ninguna ficha, el video salía sin identidad.** `[subject]`
   se degradaba a «the main character» y quedaba un warn en el log.

## Corrección

**La consigna** (`pipeline/prompts/verbatim-messages.ts`). Los textos portados del
origen quedan byte-idénticos; lo nuevo son dos reglas propias, declaradas y sumadas:

- `STYLE_CHARACTER_PRECEDENCE_RULE` viaja en el turno de usuario de la Fase 1, ANTES
  de la consigna portada: si el estilo ya describe a su personaje, narrador o sujeto,
  el protagonista ES ese y se devuelve su ficha tal como el estilo la define; solo si
  no describe ninguno se diseña con la consigna que sigue.
- `PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE` va después de la fase de la plataforma
  en los reintentos, para que tampoco ahí se rediseñe.

**El protagonista se guarda en el proyecto.** Campo nuevo
`VideoProjectMetadata.styleProtagonist` (`portrait`, `description`, `source`):

- El escritor lo informa por `onProtagonistDesigned`, que se espera ANTES de pedir el
  primer lote: un job que muere en plena Fase 2 reanuda con el mismo personaje.
- `runVerbatimLane` lo resuelve UNA vez (`resolveStyleProtagonist`) y lo inyecta en los
  grupos `generic` como `{ mode: 'generic', designed }`; con `designed`,
  `resolveCharacter` no llama a la Fase 1.
- Proyectos anteriores al campo: `recoverProtagonistFromScenes` lee la identidad que
  sus prompts guardados ya vienen tejiendo. Los prompts guardados ya pasaron por el
  scrub final, así que se les cortan las cláusulas (`bodyWithoutFinalClauses`), se
  descartan los candidatos truncados por el recorte viejo (no cierran en puntuación)
  y gana el más repetido. Queda guardado con `source: 'recovered'`. Solo aplica sin
  personajes del usuario en el proyecto.
- En el editor los grupos corren en paralelo. Si hay más de un grupo `generic` sin
  protagonista resuelto, uno va adelante y los demás tejen lo que dejó guardado.
- Se eliminó `VerbatimResult.characterDescription`, que era código muerto.

**El recorte cede en orden de valor** (`pipeline/stages/shared/prompt-safety.ts`,
`fitBody`). Sin identidad tejida, que es todo el carril del catálogo, el corte es el
de siempre, byte por byte. Con identidad tejida se recorta primero el núcleo de la
escena en un límite de oración, hasta un piso de 300 caracteres; después la cola de
estilo; la identidad recién al final. La identidad tiene un tope único de 700
caracteres (`capWovenIdentity`), aplicado antes de tejer y de guardar, así que es
idéntica en todas las escenas. Cuando un prompt excede el presupuesto
(`FINAL_PROMPT_BODY_BUDGET`), el escritor lo avisa con los ids de las escenas.
`DESCRIPTION_HEADER` se mudó a `pipeline/prompts/verbatim-identity.ts`, porque ahora
lo leen el tejedor y el scrub final; la detección usa `DESCRIPTION_HEADER_PREFIX`.

**Último recurso.** Si la Fase 1 no deja ninguna ficha, se hace un pedido más en
formato formulario: el mismo de las muestras, movido a
`pipeline/prompts/protagonist-request.ts` como `PROTAGONIST_DESIGN_REQUEST`, con su
parser en `pipeline/stages/shared/protagonist-description.ts`. El protagonista queda
con `source: 'fallback-request'`. Clave rechazada y saldo agotado cortan el job.

## Archivos

- `pipeline/prompts/verbatim-messages.ts`, `verbatim-identity.ts` (nuevo),
  `protagonist-request.ts` (nuevo), `style-samples.ts`
- `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`, `verbatim-lane.ts`,
  `subject-weaver.ts`
- `pipeline/stages/shared/prompt-safety.ts`, `protagonist-description.ts` (nuevo)
- `pipeline/commands/styles/generate-style-samples.ts`, `sample-character.ts`
- `pipeline/types/video-project.ts`
- `scripts/test/check-style-character-video.mjs` (nuevo)

Sin cambios en `src/` ni en los catálogos: el frontend no replica
`VideoProjectMetadata`.

## QA

`node --test scripts/test/check-style-character-video.mjs` cubre 12 casos con HTTP
simulado:

- la regla nueva precede a la consigna portada, que sigue byte-idéntica;
- el reintento con la fase de la plataforma lleva la precedencia;
- el protagonista se guarda antes del primer lote y es idéntico en todas las escenas;
- una reanudación parcial y una reescritura por política de contenido hacen cero
  pedidos de Fase 1 y tejen la misma identidad, aunque el modelo ofrezca otra ficha;
- «Regenerar imagen» con reescritura conserva al protagonista;
- el personaje de biblioteca sigue ganando (`USER_PROTAGONIST_RULE`, sin Fase 1, nada
  guardado);
- «Sin personaje» queda intacto;
- el último recurso da identidad cuando la Fase 1 no deja nada;
- un proyecto anterior recupera el protagonista de sus prompts saneados, con un
  candidato truncado que no gana;
- una cola de estilo de más de 1.500 caracteres conserva identidad, cola y escena
  bajo `MAX_PROMPT_CHARS`;
- un prompt sin identidad se recorta igual que antes;
- el tope de identidad corta en límite de oración.

Regresiones vecinas en verde: `check-preview-regressions` (32),
`check-editor-character-selection` (23), `check-character-identity-lock` (24),
`check-catalog-prompts` (35) y `check-character-profile` (24). También pasan
`pnpm format`, `pnpm lint` y `pnpm build`.

**Pendiente con claves reales.** Las reglas nuevas no están medidas contra estilos
reales. Hay que probarlas en el harness
(`pnpm pipeline:harness run-video-pipeline --payload '{"projectId":…,"untilStage":"scene-prompts"}'`)
con un estilo que describe a su personaje y con uno de personaje escueto, tipo
muñeco de palitos. En el segundo caso hay que mirar que el chequeo de «ficha flaca»
(E42) no dispare el reintento y que el reintento no le invente rasgos. En la app:
crear el video, pausarlo en medio de los prompts, reanudarlo, regenerar una escena
con reescritura, y comprobar en `scenes.json` que el texto que sigue a «must look
exactly like this:» es uno solo y que es el personaje de las muestras del estilo.

## Límites conocidos

- No hay interfaz para rediseñar el protagonista guardado. Para cambiarlo hay que
  crear otro proyecto o editar el estilo y crear el video de nuevo.
- Un estilo que ordena «repetí la descripción completa en cada prompt» puede
  duplicar la identidad dentro de la escena. Eso lo sigue cubriendo
  `trimEmbeddedCharacterSheet`.
- Una identidad recuperada trae aplicados los reemplazos de seguridad del scrub
  final. No afecta al resultado.
