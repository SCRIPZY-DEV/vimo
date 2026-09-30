import { rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { normalizeClipToSlot } from '../../animation/normalization.ts'
import {
  ANIMATION_TRANSITION_FRAMES,
  slotFrames,
} from '../../animation/timing.ts'
import { transitionFramesFor } from '../../animation/transitions.ts'
import { isValidFile } from '../../project/paths.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  readTextWithRetry,
  renameAtomic,
  writeFileAtomic,
} from '../../utils/atomic-fs.ts'
import type { FrameSize } from '../../types/video-format.ts'
import {
  ANIMATION_CLIP_PAD_SECONDS,
  CHUNK_SIZE,
  FPS,
  RENDER_CACHE_VERSION,
} from './constants.ts'
import { cameraEffect } from './ken-burns.ts'
import { runRenderFfmpeg } from './render-ffmpeg.ts'

export interface RenderScene {
  id: number
  imagePath: string
  startSeconds: number
  endSeconds: number
  clipPath?: string
  clipSeconds?: number
  cameraIndex?: number
  staticTransitionIn?: boolean
}

interface ManifestAsset {
  path: string
  size: number
  mtimeMs: number
  start: number
  end: number
  frames: number
  cameraIndex?: number
  clipSeconds?: number
  staticTransitionIn: boolean
}

interface ChunkManifest {
  v: number
  globalStartIndex: number
  width: number
  height: number
  transitionFrames: number
  previous?: ManifestAsset
  scenes: ManifestAsset[]
}

async function manifestAsset(scene: RenderScene): Promise<ManifestAsset> {
  const assetPath = scene.clipPath ?? scene.imagePath
  let size = -1
  let mtimeMs = -1
  try {
    const info = await stat(assetPath)
    size = info.size
    mtimeMs = Math.round(info.mtimeMs)
  } catch {
    // Un archivo ausente jamás puede validar el cache.
  }
  return {
    path: assetPath,
    size,
    mtimeMs,
    start: scene.startSeconds,
    end: scene.endSeconds,
    frames: slotFrames(scene.startSeconds, scene.endSeconds),
    cameraIndex: scene.cameraIndex,
    clipSeconds: scene.clipSeconds,
    staticTransitionIn: scene.staticTransitionIn === true,
  }
}

export async function chunkManifestFor(
  scenes: RenderScene[],
  globalStartIndex: number,
  frame: FrameSize,
  previousScene?: RenderScene,
): Promise<ChunkManifest> {
  return {
    v: RENDER_CACHE_VERSION,
    globalStartIndex,
    width: frame.width,
    height: frame.height,
    transitionFrames: ANIMATION_TRANSITION_FRAMES,
    ...(previousScene ? { previous: await manifestAsset(previousScene) } : {}),
    scenes: await Promise.all(scenes.map(manifestAsset)),
  }
}

function manifestFileFor(chunkFile: string): string {
  return `${chunkFile}.manifest.json`
}

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
  return (
    scenes.reduce(
      (total, scene) =>
        total + slotFrames(scene.startSeconds, scene.endSeconds),
      0,
    ) / FPS
  )
}

function sceneTransitionFrames(
  previous: RenderScene | undefined,
  current: RenderScene,
): number {
  return transitionFramesFor(
    previous
      ? {
          ...previous,
          animated: Boolean(previous.clipPath && previous.clipSeconds),
        }
      : undefined,
    { ...current, animated: Boolean(current.clipPath && current.clipSeconds) },
  )
}

// Un bloque saliente guarda su último cuadro durante el fundido. El entrante
// empieza EN su borde nominal: xfade consume exclusivamente ese margen visual.
// Así3+3 siguen6; tampoco cambia el reloj al atravesar fronteras de chunks.
export async function renderChunk(
  ffmpegPath: string,
  scenes: RenderScene[],
  globalStartIndex: number,
  chunkFile: string,
  frame: FrameSize,
  options: {
    onProgress?(fraction: number): void
    signal?: AbortSignal
    previousScene?: RenderScene
  } = {},
): Promise<void> {
  const activeScenes = scenes.filter(
    (scene) => slotFrames(scene.startSeconds, scene.endSeconds) > 0,
  )
  if (activeScenes.length === 0)
    throw new PipelineFailure(
      'scenes_missing',
      'render chunk has no video frames',
    )
  const inputs: string[] = []
  const filters: string[] = []
  const previous =
    sceneTransitionFrames(options.previousScene, activeScenes[0]) > 0
      ? options.previousScene
      : undefined
  const sourceScenes = previous ? [previous, ...activeScenes] : activeScenes
  const offset = previous ? 1 : 0

  for (const [index, scene] of sourceScenes.entries()) {
    const frames = slotFrames(scene.startSeconds, scene.endSeconds)
    const duration = frames / FPS
    const isPrevious = previous !== undefined && index === 0
    const cameraIndex = scene.cameraIndex ?? globalStartIndex + index - offset
    let effect: string
    if (scene.clipPath && scene.clipSeconds) {
      inputs.push('-i', scene.clipPath)
      const fit = normalizeClipToSlot(scene.clipSeconds, duration)
      effect = `setpts=${1 / fit.rate}*(PTS-STARTPTS),fps=${FPS},tpad=stop_mode=clone:stop_duration=${ANIMATION_CLIP_PAD_SECONDS}`
    } else {
      inputs.push('-loop', '1', '-i', scene.imagePath)
      effect = cameraEffect(cameraIndex, Math.max(frames, 1), frame)
    }
    let filter =
      `[${index}:v:0]scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase,` +
      `crop=${frame.width}:${frame.height},setsar=1,${effect},trim=end_frame=${frames},` +
      `settb=1/${FPS},setpts=N,format=yuv420p`
    if (isPrevious) {
      const transitionFrames = sceneTransitionFrames(previous, activeScenes[0])
      filter +=
        `,trim=start_frame=${Math.max(0, frames - 1)},setpts=PTS-STARTPTS,` +
        `tpad=stop_mode=clone:stop=${transitionFrames},trim=end_frame=${transitionFrames}`
    } else if (index < sourceScenes.length - 1) {
      const next = sourceScenes[index + 1]
      const transitionFrames = sceneTransitionFrames(scene, next)
      if (transitionFrames > 0)
        filter += `,tpad=stop_mode=clone:stop=${transitionFrames}`
    }
    filters.push(`${filter}[v${index}]`)
  }

  let combined = 'v0'
  let elapsedFrames = previous
    ? 0
    : slotFrames(activeScenes[0].startSeconds, activeScenes[0].endSeconds)
  for (let index = 1; index < sourceScenes.length; index++) {
    const scene = sourceScenes[index]
    const frames = slotFrames(scene.startSeconds, scene.endSeconds)
    const transitionFrames = sceneTransitionFrames(
      sourceScenes[index - 1],
      scene,
    )
    const output = `x${index}`
    if (transitionFrames > 0) {
      filters.push(
        `[${combined}][v${index}]xfade=transition=fade:duration=${transitionFrames / FPS}:offset=${elapsedFrames / FPS}[${output}]`,
      )
    } else {
      filters.push(
        `[${combined}][v${index}]concat=n=2:v=1:a=0,settb=1/${FPS},setpts=N[${output}]`,
      )
    }
    combined = output
    elapsedFrames += frames
  }
  const totalFrames = activeScenes.reduce(
    (sum, scene) => sum + slotFrames(scene.startSeconds, scene.endSeconds),
    0,
  )
  filters.push(
    `[${combined}]trim=end_frame=${totalFrames},settb=1/${FPS},setpts=N[out]`,
  )
  const temporaryFile = join(
    dirname(chunkFile),
    `.${basename(chunkFile)}.render-tmp.mp4`,
  )
  try {
    await runRenderFfmpeg(
      ffmpegPath,
      [
        ...inputs,
        '-filter_complex_threads',
        '1',
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[out]',
        '-an',
        '-frames:v',
        String(totalFrames),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-y',
        temporaryFile,
      ],
      `chunk ${basename(chunkFile)} (${scenes.length} scenes)`,
      {
        totalSeconds: totalFrames / FPS,
        onProgress: options.onProgress,
        signal: options.signal,
      },
    )
    await renameAtomic(temporaryFile, chunkFile)
    await writeFileAtomic(
      manifestFileFor(chunkFile),
      JSON.stringify(
        await chunkManifestFor(
          scenes,
          globalStartIndex,
          frame,
          options.previousScene,
        ),
      ),
    )
  } catch (error) {
    await rm(temporaryFile, { force: true })
    throw error
  }
}

export { CHUNK_SIZE }
