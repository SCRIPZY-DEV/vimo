import type { FrameSize } from '../../types/video-format.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
import {
  CHUNK_SIZE,
  chunkDurationSeconds,
  chunkFileFor,
  chunkManifestFor,
  isChunkCacheValid,
  renderChunk,
  type RenderScene,
} from './chunk-renderer.ts'

// Cada chunk lleva su escena previa (fundido de borde), así que se renderizan
// en cualquier orden; la lista sale igual en el orden del timeline. El
// progreso suma los segundos hechos de cada chunk: con varios en vuelo sigue
// siendo monotónico. Si un chunk falla se cancelan los demás y se propaga el
// PRIMER error, no las cancelaciones que provocó.
export async function renderAllChunks(
  ffmpegPath: string,
  renderScenes: RenderScene[],
  chunksDirectory: string,
  frame: FrameSize,
  options: {
    parallelChunks: number
    signal: AbortSignal
    onRenderedSeconds(renderedSeconds: number): void
  },
): Promise<string[]> {
  options.signal.throwIfAborted()

  const totalChunks = Math.ceil(renderScenes.length / CHUNK_SIZE)
  const renderedSecondsByChunk = new Array<number>(totalChunks).fill(0)
  const reportChunkProgress = (chunkIndex: number, seconds: number) => {
    renderedSecondsByChunk[chunkIndex] = seconds
    options.onRenderedSeconds(
      renderedSecondsByChunk.reduce((total, value) => total + value, 0),
    )
  }

  const siblingsController = new AbortController()
  const abortSiblings = () => siblingsController.abort()
  options.signal.addEventListener('abort', abortSiblings, { once: true })

  const limit = limitConcurrency(options.parallelChunks)
  let firstError: unknown
  const chunkFiles = Array.from({ length: totalChunks }, (_, chunkIndex) =>
    chunkFileFor(chunksDirectory, chunkIndex + 1),
  )

  async function renderChunkAt(chunkIndex: number): Promise<void> {
    siblingsController.signal.throwIfAborted()

    const start = chunkIndex * CHUNK_SIZE
    const chunkScenes = renderScenes.slice(start, start + CHUNK_SIZE)
    const chunkSeconds = chunkDurationSeconds(chunkScenes)
    const chunkFile = chunkFiles[chunkIndex]
    const previousScene = start > 0 ? renderScenes[start - 1] : undefined

    const expectedManifest = await chunkManifestFor(
      chunkScenes,
      start,
      frame,
      previousScene,
    )
    if (!(await isChunkCacheValid(chunkFile, expectedManifest)))
      await renderChunk(ffmpegPath, chunkScenes, start, chunkFile, frame, {
        previousScene,
        signal: siblingsController.signal,
        onProgress(fraction) {
          reportChunkProgress(chunkIndex, fraction * chunkSeconds)
        },
      })
    reportChunkProgress(chunkIndex, chunkSeconds)
  }

  try {
    await Promise.all(
      chunkFiles.map((_, chunkIndex) =>
        limit(() => renderChunkAt(chunkIndex)).catch((error: unknown) => {
          firstError ??= error
          siblingsController.abort()
        }),
      ),
    )
  } finally {
    options.signal.removeEventListener('abort', abortSiblings)
  }

  if (firstError !== undefined) throw firstError
  return chunkFiles
}
