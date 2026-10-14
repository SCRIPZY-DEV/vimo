import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { readProjectMetadata } from '../../project/metadata.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { collectRenderScenes } from '../../stages/render/animated-scenes.ts'
import { renderSceneClips } from '../../stages/render/scene-clips.ts'
import { frameSizeFor, videoFormatOf } from '../../types/video-format.ts'
import type {
  ExportClipsPayload,
  ExportClipsResult,
} from '../../types/video-project.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'

// Export "para editar" (CapCut y afines): un mp4 mudo por escena + la
// narración (y la música si existe) en `clips/`. La carpeta se limpia en
// cada export — es un artefacto regenerable, no estado del proyecto. La UI
// la abre con el opener de Tauri; el sidecar jamás spawnea `open`.
export async function exportClips(
  context: PipelineContext,
): Promise<ExportClipsResult> {
  const payload = context.job.payload as ExportClipsPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)
  // Los clips salen con el frame del proyecto (16:9 sin campo, como siempre).
  const frame = frameSizeFor(videoFormatOf(metadata.options))
  const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)

  const scenes = await readScenes(paths)
  const timedScenes = (scenes ?? []).filter(
    (scene) =>
      scene.startSeconds !== undefined &&
      scene.endSeconds !== undefined &&
      scene.endSeconds > scene.startSeconds,
  )
  if (timedScenes.length === 0)
    throw new PipelineFailure(
      'clips_no_scenes',
      'the project has no scenes with timestamps',
    )

  // Las escenas animadas (ADR-0047) salen como su clip normalizado al tramo,
  // igual que en el render final: lo exportado coincide 1:1 con el video. Una
  // escena de avatar (ADR-0057) sale como su clip o, si no sirve, como la vista
  // previa del look; sin ninguno de los dos, el mismo código que el render.
  const { renderScenes, missingImages, missingAvatarLooks } =
    await collectRenderScenes(
      paths,
      ffmpegPath,
      timedScenes,
      metadata,
      (message) =>
        context.emitter.emit({ type: 'log', level: 'warn', message }),
    )
  if (missingImages.length > 0)
    throw new PipelineFailure(
      'clips_no_images',
      `scenes without a valid image: ${missingImages.join(', ')}`,
    )

  if (missingAvatarLooks.length > 0)
    throw new PipelineFailure(
      'avatar_render_look_unavailable',
      `avatar scenes without a usable clip or a look preview: ${missingAvatarLooks.join(', ')}`,
    )

  await rm(paths.clipsDirectory, { recursive: true, force: true })
  await mkdir(paths.clipsDirectory, { recursive: true })

  let lastPercent = -1
  const clipCount = await renderSceneClips(
    ffmpegPath,
    renderScenes,
    paths.clipsDirectory,
    frame,
    {
      signal: context.signal,
      onProgress(fraction) {
        const percent = Math.round(fraction * 100)
        if (percent <= lastPercent) return
        lastPercent = percent
        context.emitter.emit({ type: 'progress', percent })
      },
    },
  ).catch(async (error) => {
    // Cancelada (la persona tocó «Cancelar») o caída a mitad de camino: la
    // carpeta tiene solo una parte de los clips. Se borra para que nadie la
    // tome por una exportación entera; la próxima la arma de cero.
    await rm(paths.clipsDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    )
    throw error
  })

  await copyFile(
    paths.narrationFile,
    join(paths.clipsDirectory, 'narration.mp3'),
  ).catch(() => {
    // Proyecto sin narración (caso raro): los clips igual sirven.
  })
  if (await isValidFile(paths.musicFile))
    await copyFile(paths.musicFile, join(paths.clipsDirectory, 'music.mp3'))

  return { directory: paths.clipsDirectory, clipCount }
}
