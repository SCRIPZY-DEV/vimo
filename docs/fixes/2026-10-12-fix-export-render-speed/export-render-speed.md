# Fix: exportación lenta sin volver al temblor

- **Fecha:** 2026-10-12
- **Rama:** fix/time-to-export
- **ADR:** [ADR-0052](../../adr/ADR-0052-exportacion-rapida-sin-temblor-segun-el-equipo.md)

## Síntoma

Desde v0.9.0, usuarios reportan que un video de 10 minutos tarda hasta 2 horas en
exportarse. Antes tardaba pocos minutos.

## Causa

El fix de temblor del PR #91
([static-motion-without-jitter](../../../fixes/2026-09-29_static-motion-without-jitter.md))
cambió el Ken Burns de `zoompan` (recorte entero, con temblor) a `perspective`
(subpíxel, interpolación cúbica). El cambio de filtro era correcto, pero trajo dos
costes que no aportan nada a la suavidad:

1. **`-loop 1` en cada imagen.** `zoompan` generaba todos los cuadros de una escena
   a partir de UN cuadro de entrada; `perspective` necesita uno por cuadro de salida,
   así que el JPEG pasó a decodificarse, reescalarse y recortarse 25 veces por
   segundo. Era ~la mitad del coste del chunk.
2. **`-filter_complex_threads 1`.** Ataba todo el grafo a un hilo y anulaba el
   multihilo por franjas de `perspective`: el FFmpeg del chunk usaba 1,5 núcleos de
   media. No hay registro de por qué se agregó.

El coste de `perspective` en sí se midió en un Mac Apple Silicon (9 s → 54 s en la
prueba sintética) y se aceptó; el QA en Windows/Intel quedó pendiente. En equipos
más modestos ese mismo factor se convierte en horas.

## Corrección

- **Imagen decodificada una vez** (`chunk-renderer.ts`): la imagen entra como un
  solo cuadro y, tras `scale,crop,setsar,format`, el filtro `loop` repite ese cuadro
  ya procesado. Los cuadros que llegan a `perspective` son los mismos bit a bit, así
  que el Ken Burns subpíxel no cambia y el temblor no vuelve.
- **Sin `-filter_complex_threads 1`**: FFmpeg reparte `perspective` entre núcleos.
- **Chunks en paralelo según el equipo del usuario** (`render-concurrency.ts`,
  `chunk-queue.ts`): la cantidad de procesos sale de los núcleos lógicos
  (`availableParallelism`) y de la RAM total del equipo que exporta, nunca de la
  máquina en la que se midió:
  - un proceso por cada 6 núcleos lógicos (un FFmpeg de chunk ya ocupa ~5);
  - como máximo la mitad de la RAM, a 2 GB por proceso (pico medido: ~1,6 GB);
  - tope de 3, nunca más que chunks y nunca menos de 1.

  Gama baja (2–8 núcleos), portátiles comunes y el M4 de 10 núcleos quedan en 1: el
  render secuencial de siempre. Solo paralelizan los equipos con hilos y RAM de
  sobra. Medido en el M4: con 2 o 3 chunks a la vez cada chunk tarda más (35,5 y
  40,6 s contra 32,6 s), porque un solo FFmpeg ya llena sus núcleos de rendimiento.
  El log del render registra cuántos chunks fueron a la vez.

- La cola renderiza en cualquier orden (cada chunk lleva su escena previa para el
  fundido de borde) y devuelve la lista en el orden del timeline. Si un chunk falla
  se cancelan los demás y se propaga el primer error, no las cancelaciones que
  provocó. El progreso suma los segundos hechos de cada chunk.

`RENDER_CACHE_VERSION` no cambia: los chunks salen idénticos y los caches de los
proyectos existentes siguen valiendo.

## Mediciones

`renderChunk` real, chunk de producción de 30 escenas (130,9 s de video) con
duraciones variadas, fundidos, un clip animado, escena previa e imágenes JPEG/PNG de
tamaños distintos. FFmpeg 6.0 empaquetado, Apple M4 de 10 núcleos:

| Formato | Antes  | Ahora  | Cuadros distintos | Pico de RAM por FFmpeg |
| ------- | ------ | ------ | ----------------- | ---------------------- |
| 16:9    | 79,6 s | 32,6 s | 0 de 3271         | 1255 → 1567 MB         |
| 9:16    | 84,3 s | 43,3 s | 0 de 3271         | 1739 → 1575 MB         |

Núcleos ocupados en promedio por el FFmpeg del chunk: 1,5 antes, ~5 ahora.

Video de 10 minutos (120 escenas × 5 s, 1080p, 4 chunks) por la cola real en el
mismo M4: la fase de chunks pasa de **7,20 min a 3,02 min** (2,4×). La cola eligió
1 chunk a la vez para este equipo.

## Mezcla final sin recodificar el video

La mezcla final recodificaba SIEMPRE todo el video, también antes de v0.9.0, aunque
no hubiera nada que dibujar encima. Ahora, sin overlay, sin subtítulos y con un
estilo sin filtro de color, el video unido de los chunks se copia tal cual y solo se
codifica el audio (voz y música, igual que antes).

- La música no cambia nada: es audio y se mezcla como siempre; el video se copia.
- Las escenas animadas ya viven dentro de los chunks: se copian igual.
- Subtítulos, overlay, un estilo con color o un video más largo que la voz (recortar
  una copia no es exacto al cuadro) siguen por la mezcla de siempre.
- Si la voz dura más que las imágenes, el último cuadro congelado (lo que hacía
  `tpad`) se codifica aparte con los mismos argumentos que los chunks
  (`CHUNK_VIDEO_ENCODING_ARGS`) y se suma por el demuxer concat.
- **Interruptor `FINAL_MIX_VIDEO_COPY`** en `constants.ts`: en `false` toda mezcla
  vuelve a recodificar, exactamente como antes. Verificado: con el interruptor
  apagado, los tests de copia fallan y el resto sigue en verde.

Verificado sobre un proyecto real de 15:17 (306 escenas, 11 chunks), que necesitaba
4 cuadros de relleno: mezcla de **67 s a 12,4 s**, 0 cuadros distintos frente a los
11 chunks decodificados por separado, tiempo parejo en las 10 uniones, sin avisos
del decodificador, misma duración que la mezcla anterior (22.943 cuadros) y relleno
igual al último cuadro (PSNR 50 dB). El archivo pesa ~20 % más (166 contra 139 MB):
los chunks van en crf 20 y la mezcla recodificada en crf 23.

En la app, ese mismo video tardó 6 min 46 s en total con los cambios anteriores
(chunks 4 min 45 s, mezcla 2 min 01 s). Con la copia, la mezcla debería quedar en
unos 15–20 s, falta medirlo en la app.

## Barra de progreso

El reparto fijo de la barra (chunks 0–45 %, concat 45–50 %, mezcla 50–100 %) se
calibró cuando la mezcla tardaba casi lo mismo que los chunks. Con la mezcla copiando
(14 s), la barra se quedaba en 45 % durante 3 min 23 s y saltaba al 100 %. Ahora el
reparto depende de la mezcla que va a correr, con los tiempos medidos en la app:
recodificando, chunks 70 % / concat 1 % / mezcla 29 %; copiando, 93 % / 1 % / 6 %.

## Límites

- `perspective` sigue siendo más caro que el `zoompan` de antes de v0.9.0. Volver a
  esa velocidad sin temblor no es posible con los filtros de este FFmpeg.
- La mezcla final solo deja de recodificar sin overlay, subtítulos ni color; con
  ellos sigue igual que antes.
- Los umbrales de paralelismo se calibraron en un M4. En equipos de 12 o más hilos
  es una extrapolación: falta medir en un escritorio Windows/Intel o AMD.
- «Exportar para editar» (`scene-clips.ts`) hereda la decodificación única y los
  hilos, pero sigue renderizando un clip a la vez.

## Archivos

- `pipeline/stages/render/chunk-renderer.ts`: imagen decodificada una vez, sin
  `-filter_complex_threads 1`.
- `pipeline/stages/render/chunk-queue.ts` (nuevo): cola de chunks con concurrencia,
  progreso y cancelación.
- `pipeline/stages/render/render-concurrency.ts` (nuevo): concurrencia según el
  equipo.
- `pipeline/stages/render/constants.ts`: umbrales de núcleos, RAM y tope.
- `pipeline/stages/render/render.ts`: usa la cola y registra la concurrencia.
- `pipeline/stages/render/final-mix.ts`: camino sin recodificar y tramo final
  congelado; `chunk-renderer.ts` exporta `CHUNK_VIDEO_ENCODING_ARGS`.
- `scripts/test/check-render-chunks.mjs` y `scripts/test/check-final-mix-copy.mjs`
  (nuevos) y sus filas en `scripts/test/README.md`.

## Validación

```sh
pnpm exec prettier --write <archivos tocados>
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json
node scripts/test/check-render-chunks.mjs
node scripts/test/check-final-mix-copy.mjs
```

El guard (5 casos, FFmpeg real, ~3 s) cubre la concurrencia por equipo, los
argumentos de FFmpeg (sin `-loop`, sin hilo único, `perspective` cúbico intacto),
cuadros idénticos entre paralelo y secuencial, el orden, el tope de procesos, el
cache, el fallo de un chunk y la cancelación.

## QA manual pendiente

- Exportar un proyecto real de ~10 min en la app y comparar tiempo y video con
  v0.10.0. Revisar a ojo zooms y paneos de las escenas 17 y 18 de `video-rural-4`.
- Medir en un equipo Windows/Intel de gama baja (debería elegir 1 chunk a la vez) y,
  si hay uno, en un escritorio de 16 o más hilos (2 o 3 a la vez).
