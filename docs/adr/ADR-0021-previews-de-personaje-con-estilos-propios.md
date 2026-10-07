# ADR-0021 — Previews de personaje con estilos propios y referencia opcional

- **Estado:** Aceptada; enmendada el 2026-10-02 (los personajes sin foto viajan
  siempre como texto, ver la enmienda al final de la decisión)
- **Fecha:** 2026-09-04
- **Área:** pipeline / app
- **Extiende:** [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md) (estilos
  propios) y [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md)
  (personaje de la gema, creación inline desde Create).

## Problema

La biblioteca de personajes guarda una identidad neutra de estilo más **un preview
por estilo del catálogo** (`characters/<id>/preview.<styleId>.<ext>`). Los estilos
propios («Mi estilo», `_styles/<id>/style.json`) no tenían concepto de preview de
personaje: el selector del modal estaba fijo a los 5 estilos del catálogo
(`PREVIEW_STYLES`) y el sidecar rechazaba cualquier otra clave
(`isCharacterStyleId`).

El puente entre ambos mundos era implícito y frágil: con estilo propio el formulario
manda `options.styleId: 'normal'` solo para cumplir el contrato
(`src/modules/videos/utilities/formPayload.ts`) y `create-video-project` copiaba el
preview de **ese** id. Consecuencia: cualquier personaje usado con una gema exigía
tener `preview.normal.*`; si solo tenía cartoon o terror —o ninguno— el proyecto se
rechazaba con `character_preview_missing`. El picker de Create sí dejaba elegirlo
(solo avisaba «sin ilustración en este estilo»), así que el error llegaba tarde y
con un mensaje que apuntaba a un estilo que el usuario nunca eligió.

Restricciones:

- La regla E20 del origen se conserva: la referencia visual es **siempre** el preview
  del estilo actual; jamás el de otro estilo (rompería la identidad entre escenas).
- Una gema es un system prompt para el LLM, no un sufijo de imagen: no se puede
  concatenar a la identidad como hace la plantilla del catálogo.
- El módulo `characters` no puede importar de las entrañas de `videos` (regla de
  dependencias de CLAUDE.md).

## Decisión

**La clave de un preview es un id del catálogo o el id de galería de un estilo
propio; sin preview del estilo actual, el personaje viaja sin referencia.**

1. **Clave de preview relajada a `string`.** `CharacterPreview.styleId`,
   `NewCharacterPreview.styleId` y `GenerateCharacterPreviewPayload.styleId`
   (`pipeline/types/characters.ts`) aceptan un `CharacterStyleId` **o** un id de
   galería. La validación única es `isPreviewStyleKey`
   (`pipeline/commands/characters/preview-style.ts`): catálogo o `STYLE_ID_PATTERN`
   de `style-store.ts`. Los ids de galería nacen como `st-<ts>-<rand>`
   (`newCustomStyleId`), así que no chocan con el catálogo, y el patrón garantiza un
   nombre de archivo seguro. El catálogo (`VISUAL_STYLES`, `VideoProjectOptions.styleId`)
   sigue cerrado.
2. **El preview con estilo propio pasa por el LLM.** En
   `generate-character-preview` la rama de catálogo es byte-idéntica; con un id de
   galería el handler lee la gema (`readStyleEntry`; ausente → `style_not_found`),
   exige ambas claves antes de gastar (`createSceneLlm` valida DeepInfra; la del
   proveedor de imágenes ya se validaba), le pide al LLM el prompt del retrato con
   `buildCustomStyleSystemPrompt(gema)` como system y `buildCustomPreviewRequest`
   (`pipeline/prompts/character-preview.ts`) como user —mismo mecanismo que
   `generate-style-samples`— y recién después genera la imagen. Emite `progress` con
   `detail.phase: 'prompt' | 'image'` para que la UI distinga las dos etapas.
3. **Referencia opcional en `create-video-project`.** La clave de búsqueda es
   `options.customStyle?.styleId ?? options.styleId`. Si el personaje no tiene preview
   para esa clave, el sidecar **no rechaza**: emite un `log` de nivel `warn` y deja el
   `ProjectCharacter` sin `referenceImageFile`; `loadPipelineCharacters` y
   `verbatimCharacterFor` ya contemplan ese caso (la identidad viaja como texto). El
   código `character_preview_missing` desaparece del sidecar, del mapa de errores y de
   los catálogos.
4. **UI de personajes.** `CharacterModal` lista catálogo + galería propia
   (`useCustomStyleCatalog` sobre `charactersApi.listCustomStyles`, que envuelve el
   mismo subcomando `styles-list` que videos — precedente: `videosApi.listCharacters`).
   El panel recibe la lista ya resuelta (`PreviewStyleOption { id, label, custom }`),
   marca los propios con un distintivo, explica el costo del LLM y, para un preview
   cuyo estilo propio fue borrado, muestra «Estilo eliminado» sin romper. Con estilo
   propio elegido, la clave de DeepInfra entra en los requisitos del botón Generar.
5. **Create.** `previewStyleKeyOf(form)` (`src/modules/videos/utilities/`) resuelve la
   clave con la misma regla que el sidecar; el picker y la sección la usan para mostrar
   el preview correcto. `CharacterStyleContext` gana `styleId` para que el modal
   inline arranque con la gema en uso preseleccionada. El aviso del picker pasa a
   decir la consecuencia («irá sin imagen de referencia») y la lista de elegidos repite
   el aviso corto.

> **Adenda 2026-09-11.** Todo lo anterior describe al personaje **sin foto**. Desde
> [ADR-0033](ADR-0033-personajes-con-foto-la-imagen-subida-como-identidad.md) existe
> el personaje **con foto**: la imagen subida es su identidad y viaja como referencia
> en cualquier estilo, sin previews y sin el aviso del punto 5. La regla E20 sigue
> intacta para el sin foto. El mismo día, por decisión del dueño, el aviso del
> punto 5 («irá sin imagen de referencia» y su versión corta en la lista) se quitó
> también para el sin foto: sugería un personaje incompleto cuando su identidad
> viaja en el prompt. El sidecar sigue copiando el preview del estilo cuando existe
> y avisando en el log cuando no; solo cambia lo que la UI dice.

> **Adenda 2026-09-19.** La regla E20 no cambia: sin preview del estilo actual el
> personaje sigue viajando como texto. Lo nuevo es que Crear lo DICE: con «Mi
> estilo» y un personaje sin foto que no tiene preview de ese estilo, un aviso no
> bloqueante (`create.characters.noStylePreviewHint`) explica que la identidad irá
> solo como texto y sugiere generar la ilustración en ese estilo desde Personajes.
> Y si la descripción de biblioteca queda vacía tras los recortes, viaja apenas
> limpia en vez de no viajar.
> Ver [causa, implementación y QA](../fixes/2026-09-19-fix-custom-style-library-identity/custom-style-library-identity.md).

> **Enmienda 2026-10-02 — un personaje sin foto viaja siempre como texto.** Por
> decisión del dueño, el preview de un personaje sin foto (de identidad de prompt)
> deja de ser su referencia visual: viaja **siempre como texto**, en todos los estilos
> (catálogo y Mi estilo), tenga o no preview del estilo del video. Su preview queda
> para verlo en la app. **Solo un personaje con foto (ADR-0033) viaja como imagen de
> referencia.** Reemplaza:
>
> - El punto 3: `create-video-project` ya no copia el preview del estilo para un
>   personaje de texto ni avisa en el log cuando falta (falte o no, no viaja).
> - La regla E20 como regla de **referencia**: queda solo como regla de qué preview se
>   **muestra** (el del estilo actual, si existe).
> - El aviso de la adenda del 2026-09-19 (`create.characters.noStylePreviewHint`), que
>   se quita de la UI y de los tres catálogos.
> - La primera consecuencia («el carril de personaje recibe una referencia en ese
>   estilo»): con texto no hay referencia.
>
> Los proyectos ya creados también cambian: `loadPipelineCharacters` carga la
> referencia solo si el personaje es `photo`, así que el preview que un proyecto viejo
> tenga copiado para un personaje de texto no viaja en las regeneraciones. Las muestras
> de Mi estilo siguen la misma regla (`resolveSampleCharacter`): el personaje de texto
> sale dibujado desde su descripción. Efectos aceptados: en los estilos donde el
> personaje tenía preview puede variar más entre escenas, y sus escenas pasan del
> carril con referencia (siempre en calidad baja) a la calidad elegida para el video.
> Ver [causa, corrección y QA](../../fixes/2026-10-02_prompt-identity-travels-as-text.md).

> **Enmienda 2026-10-04 — el retrato con estilo propio se arma como una escena del
> video.** Por decisión del dueño. Reemplaza, del punto 2, el pedido y el modelo:
>
> - **Quién escribe.** La escena del retrato la escribe DeepSeek V4.1 Flash y, si
>   falla o no devuelve escena, DeepSeek V3.2 (`PORTRAIT_SCENE_MODELS`, 30 s por
>   modelo). Antes era el tier `balanced` (Qwen3 235B). En producción, del
>   2026-09-21 al 2026-10-04, la fase de prompt tardó 16,7 s de mediana y hasta
>   124,7 s. El 2026-10-04, con los estilos del dueño, Qwen3 235B tardó de 40 a
>   57 s y 2 de 6 pedidos dieron `llm_rate_limited`; V4.1 Flash tardó de 1,6 a
>   4 s. Tampoco se usa el modelo de Ajustes: GPT o4-mini TURBO devolvió vacío o
>   perdió la descripción. La clave rechazada, el saldo agotado y la
>   cancelación cortan sin pedir el respaldo.
> - **Qué escribe.** `CUSTOM_PORTRAIT_REQUEST` reemplaza a
>   `buildCustomPreviewRequest`: pide solo la escena (cuerpo entero, de frente,
>   fondo neutro, sin otras personas, objetos ni carteles) con `[subject]` en el
>   lugar del personaje, y no lleva la descripción.
> - **Cómo viaja la descripción.** `weavePortraitSubject` la pega palabra por
>   palabra al final, con el mismo encabezado que `weaveSubject` usa en cada
>   escena del video. Si el modelo no escribió `[subject]`, se pega igual. En una
>   gema de plantilla queda antes del final fijo. El sujeto se nombra «the
>   character» y no con el rol que `roleFromDescription` saca de la primera
>   frase: el retrato tiene una sola figura, y una descripción que abre con un
>   rasgo daba un rol falso («Long», de «Long, dark brown hair…»). Antes el modelo
>   reescribía la descripción: podía perderla, dejar un `[subject]` pelado o
>   sumar carteles, y el retrato no mostraba al personaje como sale en el video.
>
> Los 5 estilos heredados siguen con su plantilla fija y sin LLM.
> Ver [causa, corrección y QA](../../fixes/2026-10-04_custom-style-portrait-fast-and-verbatim.md).

## Alternativas consideradas

- **Usar cualquier otro preview del personaje como referencia** — rechazada: viola E20;
  una referencia en otro estilo arrastra ese estilo a las escenas del personaje.
- **Generar el preview del estilo desde el picker de Create** — pospuesta: el modal de
  personaje ya se abre inline desde el picker con la gema preseleccionada, que cubre el
  caso sin un tercer flujo de generación. Se reconsidera si el uso real lo pide.
- **Prefijo `custom:` en la clave de preview** — innecesaria: el formato `st-…` de los
  ids de galería ya evita colisiones con el catálogo, y un prefijo obligaría a migrar
  los `metadata.json` existentes.
- **Concatenar la gema cruda al prompt de imagen (sin LLM)** — rechazada por el
  usuario: una gema es un system prompt de hasta 30 000 caracteres; el resultado
  sería peor y se truncaría.
- **Mover `useCustomStyles` de videos a `common`** — rechazada: el hook arrastra
  mutaciones e invalidaciones propias de la galería; envolver `styles-list` en el
  `api/` de characters es más chico y sigue el precedente de `listCharacters`.

## Consecuencias

- ✅ Un personaje se ilustra con cualquier estilo propio y el carril de personaje recibe
  una referencia en ese estilo.
- ✅ Elegir un personaje sin ilustración ya no rompe la creación: avisa y sigue.
- ⚠️ Un preview con estilo propio cuesta una llamada al LLM además de la imagen.
- ⚠️ Borrar una gema deja previews huérfanos en los personajes (`preview.st-….jpg`);
  la UI los muestra como «Estilo eliminado» y no los borra.
- 🔒 `character_preview_missing` no vuelve: la falta de referencia es un warn, no un
  fallo. Ninguna capa puede elegir el preview de otro estilo como fallback.

## Verificación de cumplimiento

- `pnpm format && pnpm lint && pnpm build && pnpm check:locales` en verde.
- Harness sin claves reales (`pnpm pipeline:harness`): `generate-character-preview`
  con id inválido → `invalid_payload`; con id de galería inexistente →
  `style_not_found`; con gema existente y sin DeepInfra → `missing_api_key` tras el
  `progress` de fase `prompt`, sin gastar. `create-video-project` con gema y personaje
  que solo tiene preview cartoon → `job-completed`, `log warn` y `ProjectCharacter`
  sin `referenceImageFile`; con estilo cartoon del catálogo → copia `reference_1.jpg`.
- **Cómo se vería una regresión:** un proyecto con gema vuelve a fallar al crearse con
  un personaje sin preview normal, o el modal de personaje deja de listar la galería.
- Con claves reales (pendiente conocido del proyecto): preview con gema desde
  Personajes y desde Create inline; video con gema cuyo personaje trae ese preview
  adjunta la referencia en el carril de personaje.

## Referencias

- `pipeline/commands/characters/generate-character-preview.ts`,
  `pipeline/commands/characters/preview-style.ts`,
  `pipeline/commands/videos/create-video-project.ts`,
  `src/modules/characters/components/CharacterPreviewPanel.tsx`,
  `src/modules/videos/utilities/previewStyleKeyOf.ts`.
- Doctrina E20 del origen (referencia siempre en el estilo actual).
