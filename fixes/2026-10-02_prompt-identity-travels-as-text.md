# Fix: un personaje de identidad de prompt viaja siempre como texto

- **Fecha:** 2026-10-02
- **Rama:** fix/prompt-identity-travels-as-text
- **PR:** pendiente (sin push hasta que el dueño lo apruebe).

## Causa

Un personaje creado sin foto («identidad de prompt») viajaba como **imagen** cuando
tenía retrato hecho en el estilo del video. Por la regla E20 de la
[ADR-0021](../docs/adr/ADR-0021-previews-de-personaje-con-estilos-propios.md),
`create-video-project` copiaba ese retrato al proyecto como `reference_<n>`;
`loadPipelineCharacters` lo cargaba como `imageDataUri` sin mirar el modo del
personaje; y con imagen cargada el carril verbatim pasaba a modo `reference` y la
fase de imágenes lo mandaba al generador por el carril de personaje (Fal `edit` o
Evolink con `image_urls`). Las muestras de Mi estilo hacían lo mismo con el retrato
de la gema (`resolveSampleCharacter`). Solo sin retrato en ese estilo la identidad
viajaba como texto.

El dueño esperaba lo contrario: si eligió crear el personaje sin foto, su identidad
viaja como prompt (gasta menos) y el retrato es solo para verlo. Solo un personaje
«con foto» debe viajar como imagen de referencia.

## Corrección

- `pipeline/project/characters.ts`: `loadPipelineCharacters` carga la referencia
  solo si el personaje es `photo`. Cubre de una vez los tres carriles que la leen
  (catálogo, Mi estilo e imágenes), las regeneraciones del editor y los proyectos
  creados antes de este cambio, que ya traen el retrato copiado.
- `pipeline/commands/videos/create-video-project.ts`: `storeReferenceImage`
  devuelve sin referencia para un personaje de texto. Deja de copiar el retrato del
  estilo y de avisar en el log cuando falta. Sale el parámetro `previewStyleKey`,
  que solo servía para eso. La validación del id de biblioteca pasa a
  `validateCharacter` y corre para todo personaje que lo traiga: antes la hacía la
  búsqueda del retrato, y sin ella un id inválido de un personaje de texto habría
  quedado guardado en `project.json`.
- `pipeline/commands/styles/sample-character.ts`: las muestras de Mi estilo usan
  imagen solo con foto; un personaje de texto sale dibujado desde su descripción en
  las cuatro muestras, igual que en el video.
- `pipeline/commands/characters/character-library.ts`: se borra
  `findLibraryPreviewFile`, que quedó sin usos.
- `src/modules/videos/components/CharacterSection.tsx` y
  `public/locales/{es,en,pt}.json`: se quita el aviso
  `create.characters.noStylePreviewHint` («su identidad viajará solo como texto…
  generá su ilustración en este estilo»), que ya no describe nada: el retrato no
  cambia cómo viaja el personaje.
- Comentarios alineados a la regla nueva en `pipeline/types/video-project.ts`,
  `pipeline/types/characters.ts`, `src/modules/videos/utilities/formPayload.ts`,
  `toSelectedCharacter.ts` y `findStylePreview.ts`.
- Documentación: enmienda del 2026-10-02 en la ADR-0021 (y su fila, que faltaba,
  en los índices `docs/adr/README.es.md` y `README.md`), el párrafo de personajes
  de la sección 5 de `docs/ARCHITECTURE.md` y la fila del guard nuevo en
  `scripts/test/README.md`.

## Límites deliberados

- Los **retratos se siguen generando y mostrando** igual: en la biblioteca, en el
  selector y en el chip del personaje fijo (`characterPortraitPath`). Solo dejan de
  viajar.
- Los proyectos ya creados conservan en disco el retrato que se les copió; no se
  borra. Simplemente no se carga.
- Las escenas con un personaje de texto pasan del carril con referencia (siempre en
  calidad baja, `CHARACTER_QUALITY`) a la calidad elegida para el video. Con calidad
  media o alta cuestan más que antes, y quedan parejas con el resto.
- Un personaje de texto puede variar más entre escenas en los estilos donde antes
  tenía retrato: era el motivo de la regla E20 y el dueño acepta el cambio.
- El modo lo sigue decidiendo el archivo: un personaje `photo` cuya foto se perdió
  viaja como texto, como antes.

## Validación reproducible

Desde la raíz del repo:

```sh
node --test scripts/test/check-prompt-identity-travels-as-text.mjs
node --test scripts/test/check-preview-regressions.mjs
node --test --test-reporter=tap 'scripts/test/*.mjs'
pnpm format && pnpm lint && pnpm build && pnpm check:locales
```

- `check-prompt-identity-travels-as-text.mjs` (nuevo, 6 casos): un personaje de
  texto con retrato del estilo no recibe `referenceImageFile` ni archivo en
  `characters/`; un proyecto viejo con el retrato ya copiado no lo carga; un
  personaje con foto sigue copiando y cargando su foto; uno con la foto perdida
  viaja como texto; un personaje de texto con un id de biblioteca inválido se
  rechaza con `invalid_payload`. Los dos casos de texto se vieron en rojo antes del
  cambio, y el del id inválido, antes de mover la validación.
- `check-preview-regressions.mjs`: el escenario «own, text with a portrait of this
  style» (antes «own, preview of this style») espera ahora `text`. Se vio en rojo
  antes del cambio.
- Batería completa de `scripts/test`: 242 pruebas, 202 en verde y 40 en rojo. Son
  las mismas 40 que falla `dev` limpio, medidas antes del cambio: los 3 guards que
  no simulan la revisión narrativa del PR #91 (`check-editor-character-selection`,
  `check-style-character-video` y `check-silent-scene-images`) y 7 scripts que
  necesitan la app empaquetada o Chrome. Ninguna falla nueva.

## Pruebas manuales

Pendientes: las hace el dueño en la app (`tauri dev`), sin gastar de más:

1. Un personaje **sin foto** con retrato hecho en un estilo de Mi estilo, elegido
   como predeterminado de esa gema: «Generar muestras» saca las cuatro con el
   personaje dibujado desde su descripción, en el estilo de la gema.
2. Un video corto con ese estilo y ese personaje: en la carpeta del proyecto,
   `characters/` no tiene `reference_1.*` y en `project.json` el personaje no trae
   `referenceImageFile`. Las escenas lo muestran dibujado desde el texto.
3. El mismo video con un personaje **con foto**: `characters/reference_1.*` existe y
   las escenas lo muestran con su foto.
4. En Crear, con Mi estilo y un personaje sin foto sin retrato en ese estilo, ya no
   aparece el aviso «Este estilo todavía no tiene una ilustración de…».
