import { rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { isValidFile } from '../../project/paths.ts'
import {
  readTextWithRetry,
  renameAtomic,
  writeFileAtomic,
} from '../../utils/atomic-fs.ts'
import {
  CHUNK_SIZE,
  FPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  RENDER_CACHE_VERSION,
} from './constants.ts'
import { cameraEffect } from './ken-burns.ts'
import { runRenderFfmpeg } from './render-ffmpeg.ts'

// Render de chunks mudos (port de renderizarChunk + el cache por manifest).
// Cada chunk agrupa hasta CHUNK_SIZE escenas en UN filter_complex; se escribe
// a un tmp y se renombra atómico SOLO al terminar bien (un render
// interrumpido jamás deja un chunk truncado que envenene el cache), y junto
// al mp4 se persiste un manifest con la huella de TODO lo que determina su
// contenido. Cache-hit ⟺ manifest byte-idéntico.

// Escena lista para renderizar: imagen válida + timestamps.
export interface RenderScene {
  id: number
  imagePath: string
  startSeconds: number
  endSeconds: number
}

interface ChunkManifest {
  v: number
  globalStartIndex: number
  scenes: {
    img: string
    size: number
    mtimeMs: number
    dur: number
  }[]
}

export async function chunkManifestFor(
  scenes: RenderScene[],
  globalStartIndex: number,
): Promise<ChunkManifest> {
  const manifestScenes = []
  for (const scene of scenes) {
    let size = -1
    let mtimeMs = -1
    try {
      const info = await stat(scene.imagePath)
      size = info.size
      mtimeMs = Math.round(info.mtimeMs)
    } catch {
      // La imagen no existe: el manifest nunca va a matchear (correcto).
    }
    manifestScenes.push({
      img: basename(scene.imagePath),
      size,
      mtimeMs,
      dur: Math.round((scene.endSeconds - scene.startSeconds) * 1000) / 1000,
    })
  }

  return {
    v: RENDER_CACHE_VERSION,
    globalStartIndex,
    scenes: manifestScenes,
  }
}

function manifestFileFor(chunkFile: string): string {
  return `${chunkFile}.manifest.json`
}

// ¿El chunk cacheado sigue válido? Exige mp4 con contenido Y manifest
// EXACTAMENTE igual al esperado. Un chunk sin manifest (render interrumpido)
// es inválido y se re-renderiza.
export async function isChunkCacheValid(
  chunkFile: string,
  expected: ChunkManifest,
): Promise<boolean> {
  try {
    if (!(await isValidFile(chunkFile))) return false
    const stored = JSON.parse(
      await readTextWithRetry(manifestFileFor(chunkFile)),
    ) as ChunkManifest
    return JSON.stringify(stored) === JSON.stringify(expected)
  } catch {
    return false
  }
}

export function chunkFileFor(
  chunksDirectory: string,
  chunkNumber: number,
): string {
  return join(
    chunksDirectory,
    `chunk_${String(chunkNumber).padStart(3, '0')}.mp4`,
  )
}

export function chunkDurationSeconds(scenes: RenderScene[]): number {
  return scenes.reduce(
    (total, scene) => total + (scene.endSeconds - scene.startSeconds),
    0,
  )
}

export async function renderChunk(
  ffmpegPath: string,
  scenes: RenderScene[],
  globalStartIndex: number,
  chunkFile: string,
  options: {
    onProgress?(fraction: number): void
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const inputs: string[] = []
  const filterParts: string[] = []
  const concatInputs: string[] = []

  for (const [index, scene] of scenes.entries()) {
    const duration = scene.endSeconds - scene.startSeconds
    const frames = Math.max(Math.ceil(duration * FPS), 1)

    inputs.push('-loop', '1', '-i', scene.imagePath)

    // scale + crop centrado fuerzan 16:9 sin bandas negras: una imagen 16:9
    // nativa pasa intacta; otras proporciones se escalan y recortan.
    filterParts.push(
      `[${index}:v]scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${FRAME_WIDTH}:${FRAME_HEIGHT},` +
        `setsar=1,` +
        `${cameraEffect(globalStartIndex + index, frames)},` +
        `trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`,
    )
    concatInputs.push(`[v${index}]`)
  }

  const filterComplex =
    `${filterParts.join(';')};` +
    `${concatInputs.join('')}concat=n=${scenes.length}:v=1:a=0[out]`

  const temporaryFile = join(
    dirname(chunkFile),
    `.${basename(chunkFile)}.render-tmp.mp4`,
  )

  try {
    await runRenderFfmpeg(
      ffmpegPath,
      [
        ...inputs,
        '-filter_complex',
        filterComplex,
        '-map',
        '[out]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-y',
        temporaryFile,
      ],
      `chunk ${basename(chunkFile)} (${scenes.length} scenes)`,
      {
        totalSeconds: chunkDurationSeconds(scenes),
        onProgress: options.onProgress,
        signal: options.signal,
      },
    )
    await renameAtomic(temporaryFile, chunkFile)
    await writeFileAtomic(
      manifestFileFor(chunkFile),
      JSON.stringify(await chunkManifestFor(scenes, globalStartIndex)),
    )
  } catch (error) {
    // El tmp parcial se descarta: nunca queda un chunk truncado con nombre
    // final que envenene el cache de los renders siguientes.
    await rm(temporaryFile, { force: true })
    throw error
  }
}

export { CHUNK_SIZE }
