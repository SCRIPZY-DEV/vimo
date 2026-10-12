import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { TRANSITION_POLICY_VERSION } from '../../animation/transitions.ts'

import { resolveProjectStyle } from '../shared/project-style.ts'
import { isValidFile } from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import type { RenderPhase } from '../../runner/events.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { frameSizeFor, videoFormatOf } from '../../types/video-format.ts'
import { ensureDirectory, readTextWithRetry } from '../../utils/atomic-fs.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'
import type { CreateVideoContext } from '../context.ts'
import { collectRenderScenes } from './animated-scenes.ts'
import { renderAllChunks } from './chunk-queue.ts'
import {
  CHUNK_SIZE,
  chunkDurationSeconds,
  type RenderScene,
} from './chunk-renderer.ts'
import { CHUNKS_PROGRESS_SHARE, CONCAT_PROGRESS_SHARE } from './constants.ts'
import { concatChunks, mixFinalVideo } from './final-mix.ts'
import { exportPromptsMarkdown } from './prompts-export.ts'
import { parallelChunksFor } from './render-concurrency.ts'
import { subtitlesFilter, writeSubtitlesFile } from './subtitles.ts'

// Fase 6: ensamblado final (port de ensamblarVideo + rendereoFinal).
// Etapas: chunks mudos con ken burns (cache por manifest) → concat sin
// re-encode → mezcla final (audio + overlay + color del estilo). El progreso
// global se reparte chunks 0-45% / concat 45-50% / final 50-100% (tiempos
// medidos del origen).

function globalFraction(phase: RenderPhase, localFraction: number): number {
  const local = Math.max(0, Math.min(1, localFraction))
  if (phase === 'chunks') return local * CHUNKS_PROGRESS_SHARE
  if (phase === 'concat')
    return CHUNKS_PROGRESS_SHARE + local * CONCAT_PROGRESS_SHARE
  return (
    CHUNKS_PROGRESS_SHARE +
    CONCAT_PROGRESS_SHARE +
    local * (1 - CHUNKS_PROGRESS_SHARE - CONCAT_PROGRESS_SHARE)
  )
}

export const renderStage: Stage<CreateVideoContext> = {
  id: 'render',

  async skip(context) {
    // El video final vale como cache solo si ESTA corrida ya lo completó
    // (completedStages): el flag de "video desactualizado" fino llega con
    // Library — en Create, un video válido + fase completada no se rehace.
    if (!context.metadata.completedStages.includes('render')) return false
    return isValidFile(context.paths.videoFile)
  },

  async run(context) {
    const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
    const scenes = await readScenes(context.paths)
    if (!scenes)
      throw new PipelineFailure('scenes_missing', 'render needs scenes.json')

    const renderScenes = await collectRenderableScenes(context, scenes)

    // El formato se resuelve UNA vez y viaja por parámetro a chunks, Ken
    // Burns y mezcla (sin campo = 16:9, byte-idéntico a siempre).
    const frame = frameSizeFor(videoFormatOf(context.options))

    const chunksDirectory = context.paths.chunksCacheDirectory
    await ensureDirectory(chunksDirectory)

    // Duración de referencia para el %: el último timestamp de words.json si
    // existe; fallback a la suma de duraciones de las escenas.
    const totalSeconds = await referenceDurationSeconds(context, renderScenes)

    // Throttle de eventos: emitir solo si el % entero sube o cambia la fase.
    let lastPercent = -1
    let lastPhase: RenderPhase | null = null
    const emitProgress = (phase: RenderPhase, localFraction: number) => {
      const percent = Math.round(globalFraction(phase, localFraction) * 100)
      if (phase === lastPhase && percent <= lastPercent) return
      lastPercent = percent
      lastPhase = phase
      context.emitter.emit({ type: 'render-progress', percent, phase })
    }

    // 1. Chunks mudos (con cache por manifest), tantos a la vez como aguante
    // el equipo del usuario (1 en equipos modestos: el render de siempre).
    const totalChunks = Math.ceil(renderScenes.length / CHUNK_SIZE)
    const parallelChunks = parallelChunksFor(totalChunks)
    context.emitter.emit({
      type: 'log',
      level: 'info',
      message: `render: ${totalChunks} chunks, ${parallelChunks} at a time`,
    })
    const chunkFiles = await renderAllChunks(
      ffmpegPath,
      renderScenes,
      chunksDirectory,
      frame,
      {
        parallelChunks,
        signal: context.signal,
        onRenderedSeconds(renderedSeconds) {
          if (totalSeconds <= 0) return
          emitProgress('chunks', renderedSeconds / totalSeconds)
        },
      },
    )

    // Limpieza best-effort de chunks huérfanos de corridas con más escenas.
    await cleanupOrphanChunks(chunksDirectory, totalChunks)

    // 2. Concat sin re-encode.
    const silentVideoFile = join(chunksDirectory, 'video_concat_silent.mp4')
    await concatChunks(ffmpegPath, chunkFiles, silentVideoFile, {
      totalSeconds,
      signal: context.signal,
      onProgress: (fraction) => emitProgress('concat', fraction),
    })

    // 3. Mezcla final: audio + (overlay) + color del estilo.
    const options = context.options
    const style = resolveProjectStyle(options)
    const musicFile =
      options.useBgm && (await isValidFile(context.paths.musicFile))
        ? context.paths.musicFile
        : undefined
    const overlayFile =
      options.useOverlay && (await isValidFile(context.paths.overlayFile))
        ? context.paths.overlayFile
        : undefined

    // El .ass se rearma en cada render: así un texto de escena editado en el
    // editor viaja al video sin pasos extra.
    const subtitlesFile = options.subtitles
      ? await writeSubtitlesFile(context.paths, scenes, frame)
      : undefined

    await mixFinalVideo(
      ffmpegPath,
      {
        silentVideoFile,
        narrationFile: context.paths.narrationFile,
        frame,
        musicFile,
        overlayFile,
        colorFilter: style.filterFinal,
        subtitlesFilter: subtitlesFile
          ? subtitlesFilter(subtitlesFile)
          : undefined,
        voiceVolume: options.voiceVolume,
        musicVolume: options.musicVolume,
        musicOffsetSeconds: options.bgmOffsetSeconds,
      },
      context.paths.videoFile,
      {
        totalSeconds,
        signal: context.signal,
        onProgress: (fraction) => emitProgress('final', fraction),
      },
    )

    emitProgress('final', 1)
    await exportPromptsMarkdown(context.paths, scenes, options.styleId)
    context.metadata.renderTransitionVersion = TRANSITION_POLICY_VERSION

    return undefined
  },
}

// Toda escena que ocupa un tramo del timeline (tiene timestamps) DEBE tener
// imagen válida —o formar parte de un clip de animación listo (ADR-0047)—:
// descartarla en silencio dejaría el video más corto que el audio (voz
// cortada) y desincronizaría todo lo posterior.
async function collectRenderableScenes(
  context: CreateVideoContext,
  scenes: Scene[],
): Promise<RenderScene[]> {
  const timed = scenes.filter(
    (scene) =>
      scene.startSeconds !== undefined && scene.endSeconds !== undefined,
  )
  if (timed.length === 0)
    throw new PipelineFailure(
      'scenes_missing',
      'no scenes with timestamps to render',
    )

  const { renderScenes, missingImages } = await collectRenderScenes(
    context.paths,
    requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    timed,
    (message) => context.emitter.emit({ type: 'log', level: 'warn', message }),
  )

  if (missingImages.length > 0)
    throw new PipelineFailure(
      'render_missing_images',
      `scenes without a valid image: ${missingImages.sort((a, b) => a - b).join(', ')}`,
    )

  return renderScenes
}

async function referenceDurationSeconds(
  context: CreateVideoContext,
  renderScenes: RenderScene[],
): Promise<number> {
  if (context.metadata.audioDurationSeconds !== undefined)
    return context.metadata.audioDurationSeconds
  try {
    if (await isValidFile(context.paths.wordsFile)) {
      const words = JSON.parse(
        await readTextWithRetry(context.paths.wordsFile),
      ) as TranscriptWord[]
      if (words.length > 0) return words[words.length - 1].end
    }
  } catch {
    // Fallback abajo.
  }
  return chunkDurationSeconds(renderScenes)
}

async function cleanupOrphanChunks(
  chunksDirectory: string,
  totalChunks: number,
): Promise<void> {
  try {
    for (const name of await readdir(chunksDirectory)) {
      const match = name.match(/^chunk_(\d{3})\.mp4(\.manifest\.json)?$/)
      if (match && parseInt(match[1], 10) > totalChunks)
        await rm(join(chunksDirectory, name), { force: true })
    }
  } catch {
    // Higiene opcional.
  }
}
