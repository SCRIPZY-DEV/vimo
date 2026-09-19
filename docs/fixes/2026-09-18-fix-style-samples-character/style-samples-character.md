# Las muestras de la gema salen con su protagonista

Fecha: 2026-09-18. Queja del cliente: «en las gemas, si existe un personaje
definido, las previews también lo deben tener». Segunda ronda el mismo día, tras el
QA manual: (1) al cambiar el personaje propio y regenerar, las muestras no
cambiaban; (2) si la gema describe un personaje y está en genérico, las muestras
deben salir con ESE personaje.

## Causa

`generate-style-samples` cargaba la gema con `readStyleEntry` — que devuelve el
bloque `character` (ADR-0020) — y no lo volvía a mirar: el system prompt salía de
`buildCustomStyleSystemPrompt` (solo estilo + planos), el pedido hablaba de «el
protagonista» sin decir quién es, y los cuatro encargos de imagen iban sin
referencia. El video sí inyecta al personaje, así que las muestras no enseñaban lo
que el usuario iba a ver.

La primera corrección nombraba al personaje del usuario en una regla anexada al
system prompt. Medido contra el modelo real con una gema que trae su protagonista
ESCRITO (E47 del origen): el modelo ignoraba la regla y describía al personaje de la
gema en los cuatro prompts, aun con la foto del usuario adjunta — por eso cambiar el
personaje no cambiaba nada. Esa misma gema imponía además su formato de salida
(`{"prompts":[{"id":1,…}]}`, un objeto por escena, a veces sin cerrar), lo que
tumbaba el lote y forzaba cuatro pedidos individuales.

## Corrección

El contrato `GenerateStyleSamplesPayload` no cambia: el modal ya guarda la gema
antes de generar y al elegir el predeterminado, y el sidecar resuelve todo desde
`style.json` y la biblioteca en cada generación.

Quién es el protagonista (`resolveSampleCharacter`, mismo reparto que el video):

- «Mi personaje» con predeterminado → ese personaje de la biblioteca. Con la misma
  regla que el alta de un video: la foto si la tiene (ADR-0033); si no, el preview de
  ESTA gema (regla E20, ahora en `findLibraryPreviewFile`, compartida con
  `create-video-project`); sin imagen utilizable, su descripción.
- Genérico, «Mi personaje» sin predeterminado, gema sin bloque o predeterminado
  huérfano → lo define la gema: un pedido previo (`SAMPLE_PROTAGONIST_REQUEST`) le
  pide su protagonista — el que trae escrito o, si no describe ninguno, uno
  diseñado — y ese MISMO se usa en las cuatro muestras. Un solo intento: si no sale
  una descripción usable, las muestras se generan como siempre.
- «Sin personaje» → pedidos como siempre.

Cómo entra en los prompts (mismo mecanismo que el carril verbatim):

- `SAMPLE_PROTAGONIST_RULE` va AL FINAL del system prompt (después del formato del
  lote) y `SAMPLE_PROTAGONIST_REMINDER` junto a las escenas: el modelo escribe la
  etiqueta `[subject]` y no describe a nadie; la identidad la teje la plataforma.
- Texto: `weaveSubject` + `descriptionFromUserPrompt` — `[subject]` pasa a ser el rol
  y la descripción se pega al final con `DESCRIPTION_HEADER`, idéntica en las cuatro.
- Referencia: `pointSubjectToImage` ata el nombre a la imagen adjunta y
  `buildCustomStyleReferencePrompt` envuelve el prompt.
  `GenerateImageOptions.referenceImageUrls` es opcional: con Fal el pedido va a
  `openai/gpt-image-2/edit` con el data URI; con Evolink la referencia se sube UNA
  vez (`uploadEvolinkReference`) y va en `image_urls`.
- Degradados, como el carril de personaje del video: si la subida a Evolink falla,
  las cuatro muestras van por texto; un encargo con referencia que falla se rehace
  una vez por texto. Cancelación, saldo agotado y clave rechazada salen tal cual.
- Sin protagonista, una etiqueta `[subject]` que se cuele se degrada con
  `removeSubject`: nunca viaja pelada al generador.

El parser del lote (`batchEntries`) acepta además el formato propio de una gema
(`prompts` / `id`, y objetos sueltos en un texto que no es JSON válido): el lote se
resuelve en un pedido en vez de cuatro.

Las muestras no se regeneran solas al cambiar el personaje (gastan créditos): la
nota `create.customStyles.samplesNote` lo explica en es/en/pt.

## Tercera ronda: se elegía a Juan y salía Tomás (Evolink)

`uploadEvolinkReference` subía toda referencia con el nombre fijo
`character_reference.jpg`. Medido contra el servicio: la URL pública sale del nombre
(`…/<cuenta>/images/jpeg/<file_name>`) y el CDN la cachea, así que todos los
personajes de la cuenta compartían UNA URL. Subiendo Juan → Tomás → Juan, las tres
subidas devolvían la misma URL y servían (`cache=HIT`) los bytes de Tomás: el
generador recibía la foto del que se había subido primero. Con Fal no pasa (la
imagen viaja como data URI). El bug es anterior a este fix y afecta igual al carril
de personaje de los VIDEOS por Evolink, que usa la misma función.

Corrección: el nombre lleva el hash del contenido
(`character_reference_<sha256/16>.jpg`). Verificado contra el servicio: cada imagen
obtiene su URL, los bytes servidos coinciden con los subidos, y volver a subir la
misma imagen cae en la misma URL.

## Archivos

`pipeline/commands/styles/{generate-style-samples,sample-character}.ts`,
`pipeline/prompts/style-samples.ts`, `pipeline/providers/image/{fal,evolink}.ts`,
`pipeline/types/images.ts`, `pipeline/commands/characters/character-library.ts`,
`pipeline/commands/videos/create-video-project.ts`, `pipeline/project/characters.ts`,
`pipeline/stages/images/character-lane.ts` (reusa `FAL_EDIT_ENDPOINT`),
`public/locales/{es,en,pt}.json`, `scripts/test/check-preview-regressions.mjs`.

## QA

`node --test scripts/test/check-preview-regressions.mjs` (32 casos). Los 17 previos
quedan fijados a una gema «sin personaje» (prueban lote, rotación y concurrencia).
Los 14 del protagonista: solo texto, foto por Fal, preview de la gema por Evolink
con una sola subida, preview de otro estilo, subida fallida, encargo con referencia
rechazado, lote en el formato de la gema, genérico, gema sin bloque, `own` sin
predeterminado, personaje borrado, diseño fallido, «sin personaje», y cambio del
predeterminado entre dos generaciones. HTTP interceptado, sin gastar créditos.

Ensayo en seco contra el modelo real (LLM real, imágenes interceptadas, raíz
temporal) con una gema que trae su personaje escrito: con personaje propio los cuatro
prompts apuntan a la referencia y no describen al de la gema; en genérico los cuatro
llevan, idéntica, la descripción del personaje de la gema; una gema sin personaje
diseña uno y lo repite.

Pendiente de QA manual con claves reales, en ambos proveedores: los casos de arriba
con imágenes de verdad.

## Observación fuera de alcance

Con una gema muy corta (solo adjetivos de estilo, sin instrucciones) el modelo de
redacción rápida a veces escribe los prompts SIN las palabras del estilo, también en
el camino anterior a este fix. No se tocó acá.
