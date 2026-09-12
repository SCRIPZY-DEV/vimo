# ADR-0033 — Personajes con foto: la imagen subida como identidad

- **Estado:** Aceptada
- **Fecha:** 2026-09-11
- **Área:** pipeline / app
- **Extiende:** [ADR-0021](ADR-0021-previews-de-personaje-con-estilos-propios.md)
  (previews por estilo y referencia opcional) y
  [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md) (personaje de
  la gema).

## Problema

La biblioteca solo conocía personajes **sin foto**: nombre + descripción neutra de
estilo + un preview por estilo, y la referencia visual de un video era el preview
del estilo actual o ninguna (ADR-0021). El origen ofrece desde v0.41.0 dos maneras
de fijar quién es un personaje: **con foto** («cara idéntica»: la imagen que sube la
persona viaja como referencia al generador en todos los estilos, ~2× por imagen) y
**sin foto** («más barato»: la identidad es la descripción y la contextura puede
variar entre escenas). El sidecar ya aceptaba `mode: 'photo'` + `photoDataUri` en
`create-video-project` y el carril de imagen con referencia existía completo
(gpt-image-2 edit en Fal y Evolink, línea de identidad, modo `reference` del carril
verbatim), pero **ninguna capa de la app lo usaba**: la biblioteca no guardaba fotos
y el formulario mandaba siempre `mode: 'text'`. `ARCHITECTURE.md` lo tenía anotado
como pendiente del módulo `characters`.

Restricciones:

- El modo lo decide el **archivo**, no un flag: la verdad vive en disco (criterio del
  origen, `personajeParaElMotor`).
- La foto viaja como **ruta** del dialog nativo, no como base64 por el IPC (12 MB por
  guardado sería un abuso del canal; precedente: `upload-narration`).
- Los dos carteles del modal se portan **tal cual** (pedido del dueño, 2026-09-11).

## Decisión

**Un personaje puede crearse con foto; esa foto es su identidad y su referencia en
cualquier estilo. Sin foto, nada cambia respecto de ADR-0021.**

1. **Biblioteca.** `characters/<id>/photo.<ext>` más `photoFile` en `metadata.json`
   (`character-library.ts`). Al listar, `CharacterSummary.photoPath` (ruta absoluta
   para `convertFileSrc`, derivada, no persistida). Un «con foto» cuyo archivo
   desapareció **no se lista**: sin la imagen no tiene identidad que ofrecer.
   `character-create` acepta `photoPath` (`readPhotoFile`: lee, exige entre 1 byte y
   `MAX_PHOTO_BYTES` = 12 MB y valida JPEG/PNG/WEBP por magic bytes, nunca por
   extensión; falla con `character_photo_invalid` ANTES de crear la carpeta). Con
   foto la descripción es opcional en create y update (sin foto sigue exigiendo
   `MIN_DESCRIPTION_LENGTH`). La foto **no se cambia** al editar: para otra foto se
   crea otro personaje (como el origen). Borrar sigue siendo el `rm` de la carpeta.
2. **Proyecto.** `NewVideoProjectCharacter.mode: 'photo'` con `characterId` →
   `create-video-project` copia la foto de la biblioteca como `reference_N.<ext>`
   (`storeReferenceImage`); sin foto en la biblioteca es `invalid_payload` (el
   listado ya la esconde, así que es un payload inconsistente, no un caso a
   degradar). `photoDataUri` sigue valiendo (harness y compat). Con `mode: 'text'` la
   regla de ADR-0021 queda intacta: preview del estilo actual o texto. El pipeline
   **no distingue** de dónde salió la referencia: existe → carril de personaje
   (`character-lane.ts`, calidad `low`, línea de identidad); con gema, modo
   `reference` (`verbatimCharacterFor`: `[subject]` → nombre + ancla a la imagen, sin
   descripción pegada).
3. **Doble ancla en el catálogo.** La descripción, si la hay, se sigue anexando a la
   biblia (`buildCharacterBibleBlock` ya tolera la vacía): la referencia fija la
   cara y el texto el resto. Con gema la descripción no viaja (modo `reference`).
4. **App — Create.** `SelectedCharacter.mode` viaja en el payload
   (`formPayload.ts`); `toSelectedCharacter` fija `previewPath` (lo que viajaría: la
   foto o el preview estricto) y `portraitPath` (la carita). `hasStyleReference`
   decide el aviso «sin ilustración en este estilo» (con foto nunca aplica) y
   `characterPortraitPath` unifica la carita en picker, sección, chip y editor de la
   gema: foto → preview del estilo → cualquiera de los suyos.
5. **App — Personajes.** Sub-pestañas «Con foto · cara idéntica» / «Sin foto · más
   barato» solo al crear (`CharacterIdentityTabs`, Radix Tabs con la activa en
   saffron); `CharacterPhotoFields` (nombre, descripción opcional, cartel amarillo
   «Importante», «Subir foto»/«Cambiar foto» con miniatura por el asset protocol; al
   editar, la foto actual y la nota de que no se cambia); cartel turquesa «Sin foto:
   más barato…» arriba del formulario sin foto; con foto no viajan edad, rol ni
   previews. La tarjeta muestra la foto y «Con foto · cara idéntica». El botón
   «Nuevo personaje» deja de exigir claves: con foto no hay IA; en el modal, la IA y
   los previews ya se apagan solos si faltan.
6. **Copy, con nota honesta.** Los dos carteles se portan palabra por palabra. El
   «no suma costo extra por imagen» del cartel sin foto **no es exacto** cuando el
   personaje sí tiene preview del estilo del video: esa escena pasa por el mismo
   carril edit que una foto (decisión E15/E20 del origen, vigente en las dos apps).
   Se conserva por pedido del dueño y queda registrado acá.

## Qué NO cambia

- Personajes sin foto: byte por byte ADR-0021 (E20 estricta, preview del estilo o
  texto, `character_preview_missing` no vuelve).
- El estimador de costos no cuenta el carril edit (tampoco en el origen).
- Con gema, el carril de imagen usa la **misma** línea de identidad que el catálogo:
  la variante del origen para estilo propio (`promptReferenciaEstiloPropio`, con el
  «APPEARANCE LOCK») no se portó porque no está en el material disponible. Es una
  brecha previa a esta ADR (ya afectaba al sin-foto con preview de gema).

## Alternativas consideradas

- **Mandar la foto como data URI por el IPC** (`photoDataUri` ya existía) —
  rechazada: hasta 12 MB en base64 por cada guardado y por cada proyecto; la ruta +
  copia en el sidecar sigue el precedente de `upload-narration`.
- **Flag `sinFoto` en la metadata** (como el origen) — rechazada: un flag puede
  desincronizarse del disco; con `photoFile` el archivo ES el modo.
- **Permitir cambiar la foto al editar** — pospuesta: el origen tampoco lo permite y
  los videos hechos ya tienen su copia; se reconsidera si el uso lo pide.
- **Quitar fondo o recortar la foto** — rechazada: el origen la guarda tal cual; «solo
  el personaje, sin fondo» es una instrucción a la persona.

## Consecuencias

- ✅ Cara idéntica en cualquier estilo con una sola foto, sin generar previews.
- ✅ Se puede crear un personaje sin ninguna clave de API.
- ✅ Con gema, el personaje con foto entra al carril `reference` que ya existía.
- ⚠️ Cada escena con el personaje pasa por el carril edit a calidad `low`: el costo
  cambia según proveedor y no lo refleja el estimador.
- ⚠️ La foto viaja sin procesar a Fal/Evolink (data URI o file-API).
- 🔒 Un personaje con foto no se convierte en sin foto ni al revés.

## Verificación de cumplimiento

- `pnpm format && pnpm lint && pnpm build && pnpm check:locales` en verde;
  `tsc -p tsconfig.pipeline.json` limpio; `pnpm build:sidecar`.
- Harness sin claves (`pnpm pipeline:harness`): `character-create` con `photoPath` de
  un PNG → `entry.photoPath` en la respuesta y `photo.png` + `photoFile` en disco;
  con un archivo que no es imagen → `character_photo_invalid` y ninguna carpeta
  creada; `characters-list` lo lista con `photoPath`; `create-video-project` con
  `mode: 'photo'` + ese `characterId` → `reference_1.png` copiado y
  `ProjectCharacter.referenceImageFile`; `mode: 'text'` sin descripción →
  `invalid_payload`.
- **Cómo se vería una regresión:** el modal deja de mostrar las sub-pestañas al
  crear; un personaje con foto muestra «sin ilustración en este estilo» en el
  picker; o `formPayload` vuelve a mandar `mode: 'text'` para todos.
- Con claves reales (pendiente conocido del proyecto): video con personaje con foto
  por catálogo (carril edit con la foto) y por gema (modo `reference`).

## Referencias

- `pipeline/commands/characters/character-library.ts`, `character-create.ts`,
  `character-update.ts`, `pipeline/commands/videos/create-video-project.ts`,
  `pipeline/types/characters.ts`, `pipeline/types/video-project.ts`.
- `src/modules/characters/components/CharacterModal.tsx`,
  `CharacterIdentityTabs.tsx`, `CharacterPhotoFields.tsx`,
  `src/modules/videos/utilities/findStylePreview.ts`, `toSelectedCharacter.ts`.
- Origen (`vimo_dev`): `PaginaPersonajes.tsx` (ModalPersonaje),
  `SelectorPersonajeCreacion.tsx` v0.41.0, `biblioteca.ts`,
  `personaje_fal.ts` / `personaje_evolink.ts`; doctrinas E14, E15, E20.
