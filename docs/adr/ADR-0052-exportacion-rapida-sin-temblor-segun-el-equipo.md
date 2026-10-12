# ADR-0052 — Exportación rápida sin temblor, según el equipo del usuario

- **Estado:** Aceptada (2026-10-12). Falta QA en la app y en Windows/Intel.
- **Fecha:** 2026-10-12
- **Área:** pipeline (render)
- **Relacionada con:** [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)
  (el render por chunks y `-t` explícito), [ADR-0017](ADR-0017-formato-de-video-16-9-y-9-16.md)
  (el frame por formato) y [ADR-0042](ADR-0042-animacion-kie-por-intervalos-y-recibos.md)
  (los clips animados dentro de los chunks).

## Problema

Desde v0.9.0, usuarios reportan que un video de 10 minutos tarda hasta 2 horas en
exportarse. El PR #91 cambió el Ken Burns de `zoompan` a `perspective` para quitar
un temblor visible
([fix](../../fixes/2026-09-29_static-motion-without-jitter.md)). El cambio de filtro
era correcto, pero trajo dos costes que no aportan nada a la suavidad:

- **`-loop 1` en cada imagen**: el JPEG se decodificaba y reescalaba 25 veces por
  segundo. Era ~la mitad del coste del chunk.
- **`-filter_complex_threads 1`**: ataba el grafo a un hilo. El FFmpeg del chunk
  usaba 1,5 núcleos de media.

El coste se midió solo en un Mac Apple Silicon y se aceptó. En equipos modestos ese
mismo factor se convierte en horas.

Además, la mezcla final siempre recodificó todo el video, también antes de v0.9.0,
aunque no hubiera nada que dibujar encima.

Restricciones:

- **El temblor no puede volver**: el Ken Burns sigue siendo `perspective` subpíxel.
- **No se asume el hardware de quien desarrolla**: los usuarios tienen desde
  portátiles de gama baja hasta escritorios de muchos núcleos.
- **Cualquier atajo en la mezcla tiene que poder deshacerse en una línea**.

## Decisión

**El render no hace trabajo que no se ve, se adapta al equipo que exporta y no
recodifica lo que no cambia.**

1. **Imagen decodificada una vez** (`pipeline/stages/render/chunk-renderer.ts`). La
   imagen entra como un solo cuadro y, tras `scale,crop,setsar,format`, el filtro
   `loop` repite ese cuadro ya procesado antes de `perspective`. El grafo ya no lleva
   `-filter_complex_threads 1`. Los cuadros que salen son idénticos bit a bit a los
   anteriores, así que `RENDER_CACHE_VERSION` no cambia.
2. **Concurrencia según el equipo** (`render-concurrency.ts`, `chunk-queue.ts`). La
   cantidad de chunks a la vez sale de `availableParallelism()` y `totalmem()` del
   equipo que exporta:

   | Límite      | Regla                                                | Constante                                                |
   | ----------- | ---------------------------------------------------- | -------------------------------------------------------- |
   | Por núcleos | 1 proceso cada 6 núcleos lógicos (un chunk ocupa ~5) | `RENDER_CORES_PER_PROCESS`                               |
   | Por memoria | 2 GB por proceso, hasta el 50 % de la RAM total      | `RENDER_MEMORY_PER_PROCESS_BYTES`, `RENDER_MEMORY_SHARE` |
   | Tope        | 3, nunca más que chunks, nunca menos de 1            | `RENDER_MAX_PARALLEL_CHUNKS`                             |

   Gama baja y un M4 de 10 núcleos quedan en 1, el render secuencial de siempre. Se
   usa la RAM total y no la libre porque macOS cuenta como ocupada la caché que libera
   a demanda. Si un chunk falla se cancelan los demás y se propaga su propio error.
   El log del render registra la concurrencia elegida.

3. **Mezcla final sin recodificar el video** (`final-mix.ts`). Sin overlay, sin
   subtítulos, con un estilo sin filtro de color y con un video que no dure más que la
   voz, el video unido se copia (`-c:v copy`) y solo se codifica el audio, música
   incluida. Si la voz dura más, el último cuadro congelado se codifica aparte con
   `CHUNK_VIDEO_ENCODING_ARGS`, los mismos argumentos que los chunks, y se suma por el
   demuxer concat. **Interruptor `FINAL_MIX_VIDEO_COPY`** en `constants.ts`: en
   `false`, toda mezcla vuelve a recodificar exactamente como antes.

4. **La barra de progreso se reparte según la mezcla que va a correr**
   (`render.ts`, `mixCopiesVideo` en `final-mix.ts`). Lo que entra en la mezcla se
   resuelve antes de los chunks. Recodificando, los chunks ocupan el 70 % de la barra;
   copiando, el 93 %, porque la mezcla dura segundos. Con el reparto fijo anterior
   (chunks 45 %), la barra se quedaba en 45 % casi todo el render y saltaba al final.

### Forma

```
imágenes ─ decodificar 1 vez ─ loop ─ perspective ─┐
clips IA ─ normalizar ─────────────────────────────┤ chunks (N a la vez según el equipo)
                                                   ▼
                                     concat por copia (como siempre)
                                                   │
               ¿overlay, subtítulos, color o video > voz?
                    sí │                       │ no (y FINAL_MIX_VIDEO_COPY)
           recodificar todo (como antes)   copiar video + final congelado + audio
```

## Alternativas consideradas

- **Volver a `zoompan`**: 7,4× más rápido que `perspective`, pero trae de vuelta el
  temblor que se corrigió a pedido de usuarios. Descartada.
- **`zoompan` sobre la imagen ampliada 2× o 3×**: 14,7 / 20,5 s por minuto de video,
  contra 7,1 s antes, y reduce el temblor sin eliminarlo. El fix original ya lo había
  descartado por memoria y temblor residual.
- **Interpolación lineal en `perspective`**: −14 % sobre un chunk real (SSIM 0,992).
  Descartada por ahora; puede volver si una revisión a ojo confirma que no aparece
  temblor.
- **Codificar los chunks en `ultrafast`** (la mezcla final los recodifica igual): fue
  más lento (25,8 s contra 23,4 s) y 8× más pesado por escribir en disco.
- **Concurrencia fija (2 o 3)**: en el M4, con 2 o 3 a la vez cada chunk tardó más
  (35,5 / 40,6 s contra 32,6 s), y en gama baja sumaría 1,6 GB de RAM por proceso.
- **Copiar el video siempre, dibujando overlay, subtítulos y color dentro de cada
  chunk**: daría el ahorro a todos los proyectos, pero toca el cache de chunks y la
  línea de tiempo de los subtítulos. Podría volver si los proyectos con efectos pasan
  a ser mayoría.
- **Bajar la calidad de los chunks (crf 23) para que la copia pese lo mismo**:
  empeora la imagen de los proyectos que recodifican e invalida todos los caches. El
  peso no es una limitación.

## Consecuencias

- ✅ Chunks 2,4× más rápidos: 7,20 → 3,02 min para un video de 10 min en un M4. En
  la app, un video real de 15 min se exportó en 6 min 46 s.
- ✅ Sin overlay, subtítulos ni color, la mezcla final pasa de 67 s a 12,4 s (video
  real de 15 min).
- ✅ Los equipos modestos no reciben más procesos de los que aguantan.
- ⚠️ `perspective` sigue siendo más caro que el `zoompan` de antes: volver a esa
  velocidad sin temblor no es posible con los filtros de este FFmpeg.
- ⚠️ Con la copia, el video final pesa ~20 % más (crf 20 de los chunks contra crf 23).
- ⚠️ Los umbrales de concurrencia se calibraron en un M4. Para equipos de 12 o más
  hilos son una extrapolación.
- ⚠️ Hay dos caminos de mezcla: todo cambio en la mezcla se prueba en ambos.
- 🔒 La imagen estática no vuelve a entrar con `-loop 1`, ni el grafo del chunk con
  `-filter_complex_threads 1`.
- 🔒 El final congelado y los chunks comparten `CHUNK_VIDEO_ENCODING_ARGS`: no se
  cambia la codificación de uno sin la del otro, o el concat por copia une archivos
  incompatibles.
- 🔒 La concurrencia no se fija a mano ni se calcula con la RAM libre.

## Verificación de cumplimiento

- **`scripts/test/check-render-chunks.mjs`** (local, FFmpeg real, ~3 s):
  - concurrencia por equipo: gama baja y M4 en 1, escritorios en 2 o 3, la memoria
    manda;
  - argumentos de FFmpeg: sin `-loop` ni hilo único, con `perspective` cúbico;
  - en paralelo salen los mismos cuadros que en secuencia, en orden y sin pasar el
    tope;
  - caché, fallo de un chunk y cancelación.
- **`scripts/test/check-final-mix-copy.mjs`** (local, FFmpeg real, ~6 s):
  - el video se copia cuadro a cuadro, con un clip animado en los chunks;
  - el final congelado repite el último cuadro y la duración sale de la voz medida;
  - con música también se copia;
  - subtítulos, color o un video más largo que la voz recodifican;
  - no quedan temporales;
  - el interruptor sale encendido.
- **Cómo se vería una regresión:**
  - Exportaciones lentas de nuevo: el guard de argumentos falla si vuelven `-loop`
    o el hilo único.
  - Saltos o cuadros repetidos en las uniones, o un final cortado: el guard de copia
    compara cuadro a cuadro y cuenta los cuadros.
  - El temblor de vuelta: el guard exige `perspective` cúbico.

## Modos de falla

- **La copia sale mal en algún equipo o reproductor**: `FINAL_MIX_VIDEO_COPY = false`
  devuelve la mezcla anterior sin tocar nada más; el commit también se puede revertir
  solo.
- **Un chunk falla con varios en vuelo**: se matan los demás, se borran sus
  temporales y se reporta el primer error. Los chunks ya terminados quedan en caché
  para el reintento.

## Fuera de alcance

- La mezcla de proyectos con overlay, subtítulos o color: sigue recodificando.
- «Exportar para editar» (`scene-clips.ts`): hereda la decodificación única y los
  hilos, pero sigue renderizando un clip a la vez.
- Codificación por hardware (VideoToolbox, NVENC): el FFmpeg empaquetado no la trae.

## Referencias

- Informe: [docs/fixes/2026-10-12-fix-export-render-speed](../fixes/2026-10-12-fix-export-render-speed/export-render-speed.md).
- Fix de temblor que originó el coste: [fixes/2026-09-29_static-motion-without-jitter.md](../../fixes/2026-09-29_static-motion-without-jitter.md) (PR #91, `c007e00`).
- Commits de la rama `fix/time-to-export`: `be3a665`, `88d284c`, `ab967d2`, `18d71c4`.
