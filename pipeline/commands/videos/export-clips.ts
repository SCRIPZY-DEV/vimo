import { copyFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { readProjectMetadata } from '../../project/metadata.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
  sceneImageFile,
} from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { RenderScene } from '../../stages/render/chunk-renderer.ts'
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

  const renderScenes: RenderScene[] = []
  const missingImages: number[] = []
  for (const scene of timedScenes) {
    const imagePath = sceneImageFile(paths, scene.id)
    if (!(await isValidFile(imagePath))) {
      missingImages.push(scene.id)
      continue
    }
    renderScenes.push({
      id: scene.id,
      imagePath,
      startSeconds: scene.startSeconds!,
      endSeconds: scene.endSeconds!,
    })
  }
  if (missingImages.length > 0)
    throw new PipelineFailure(
      'clips_no_images',
      `scenes without a valid image: ${missingImages.join(', ')}`,
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
  )

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
