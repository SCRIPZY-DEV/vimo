# ADR-0017 — Formato de video 16:9 y 9:16 de punta a punta

- **Estado:** Aceptada
- **Fecha:** 2026-09-01
- **Área:** pipeline / app
- **Parte de:** [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md)
  (rama 8 del roadmap)

## Problema

El pipeline renderizaba solo 1920×1080: dimensiones hardcodeadas en la stage de
render, `size: '16:9'` fijo en Evolink (con un TODO) y opciones de calidad de
Fal únicamente horizontales. El origen (vimo_dev v1.33+) ya genera shorts 9:16
de punta a punta. Restricciones que achicaron el campo:

- **Cero regresión en proyectos existentes**: un proyecto sin formato debe
  renderizar byte-idéntico (mismos args de FFmpeg) y sus chunks cacheados deben
  seguir siendo hit — sin migración ni re-render.
- El hash de una tarea de imagen pagada no puede cambiar (doctrina E26/E27 del
  origen: re-crearía trabajo ya facturado).
- ADR-0015 sigue vigente: un solo modelo (gpt-image-2), sin selector de modelo.

## Decisión

**`VideoProjectOptions.videoFormat?: '16:9' | '9:16'` viaja del formulario al
render; ausente = 16:9 por identidad.** Las dimensiones dependen del formato y
van SIEMPRE por parámetro (`FrameSize`), nunca en constantes de módulo.

- **Contrato:** `pipeline/types/video-format.ts` (browser-safe): `FRAME_SIZES`
  (1920×1080 / 1080×1920), `videoFormatOf()`, `frameSizeFor()`. Whitelist
  estricta en `create-video-project.ts` (otro valor → `invalid_payload`).
- **Render:** `render.ts` resuelve el frame una vez y lo enhebra a chunks, Ken
  Burns (solo cambia el `s=` del zoompan) y mezcla. El overlay usa el port de
  `filtroOverlay`: con 1920×1080 el string EXACTO de siempre; con otra
  dimensión, `force_original_aspect_ratio=increase + crop` (sin deformar).
  Export-clips hereda el frame por `renderChunk`.
- **Cache de chunks:** el manifest agrega `format: '9:16'` SOLO en vertical
  (spread condicional; verticalidad derivada de los píxeles). Los manifests
  16:9 quedan byte-idénticos → cache-hit garantizado sin bumpear
  `RENDER_CACHE_VERSION`.
- **Imágenes:** Evolink es agnóstico — manda `size: formato` y una sola lista
  de opciones; su `hashImageRequest` NO cambia. Fal gana la familia
  `1080x1920_{low,medium,high}` (mismo precio por tier) y la **corrección
  conservadora** `qualityOptionForFormat`: una opción horizontal colada en un
  proyecto 9:16 pasa a vertical conservando el tier, aplicada al armar el
  request (no se reescribe lo persistido). Los previews de personaje/estilo
  quedan 16:9 a propósito (como el origen); el carril de personaje usa
  `frameSizeFor` y la línea de identidad nombra el frame del proyecto.
- **UI:** selector de dos cards en Create (cambiar formato resetea la calidad
  a la default del formato); grilla de progreso con celdas `9/16` y más
  columnas; tarjeta de biblioteca con `object-contain`; player limitado por
  alto; editor con botón de render flotante en shorts y picker de calidad por
  formato. Helpers cliente en `src/modules/videos/utilities/videoFormat.ts`
  (el alias `@pipeline` es solo `import type`).

## Alternativas consideradas

- **Dimensiones como variable de módulo seteada por job** — descartada: un
  estado mutable compartido es exactamente lo que hace imposible garantizar la
  byte-identidad del camino 16:9.
- **Bumpear `RENDER_CACHE_VERSION` y meter el formato siempre al manifest** —
  descartada: invalidaría el cache de TODOS los proyectos existentes para un
  campo que en 16:9 no aporta información.
- **Formato dentro del hash de imagen** — descartada (E26/E27): re-pagaría
  tareas ya facturadas; una tarea vive en su escena de su proyecto, cuyo
  formato jamás cambia.
- **Lista vertical propia para Evolink** — descartada: el provider ignora el
  WxH del id (parsea solo el tier) y recibe la forma por `size`.

## Consecuencias

- ✅ Shorts 9:16 reales de punta a punta (imágenes nativas, sin bandas ni
  recortes), con el 16:9 intacto al byte.
- ✅ Un proyecto guarda su formato para siempre: regeneraciones y re-renders
  desde Library salen con la misma forma.
- ⚠️ El formato de un proyecto no se cambia después de creado (las imágenes ya
  generadas tienen esa forma); no hay UI para editarlo, a propósito.
- 🔒 Toda dimensión de frame nueva entra por `FRAME_SIZES` y viaja por
  parámetro; ninguna stage vuelve a hardcodear WxH.

## Verificación de cumplimiento

- **Harness (corridas reales con ffmpeg):** proyecto 9:16 sintético →
  `render-video` produce mp4 1080×1920 (también con overlay, ejercitando el
  crop); proyecto 16:9 → manifest con exactamente las claves previas
  (`v, globalStartIndex, scenes`) y re-render con **cache-hit probado por
  mtime**; `create-video-project` con `"4:3"` → `invalid_payload`.
- **Aserciones de providers** (script sobre los módulos): corrección de tier
  en ambos sentidos, body de Fal legacy byte-idéntico, default vertical, línea
  de identidad en ambos formatos.
- **Regresión típica:** un manifest 16:9 que gana un campo nuevo (cache miss
  masivo silencioso), o un `size` fijo reapareciendo en un provider.

## Referencias

- ADR-0016 (roadmap), ADR-0013 (render por chunks + manifest), ADR-0014
  (Library reusa `renderChunk`), ADR-0015 (un solo modelo de imagen).
- Origen: `renderer.ts`, `costos.ts`, `personaje_fal/evolink.ts` de vimo_dev.
