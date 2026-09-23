import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
  type ProjectPaths,
} from '../project/paths.ts'
import { readProjectMetadata, markVideoOutdated } from '../project/metadata.ts'
import { readScenes, writeScenes } from '../project/scenes-file.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { PipelineContext } from '../runner/context.ts'
import type { Scene } from '../types/scenes.ts'
import { videoFormatOf, type FrameSize } from '../types/video-format.ts'
import { sceneAnimationClipFile } from './clip-path.ts'
import { withProjectWriteLease } from './coordination.ts'
import { normalizeAnimationFile } from './normalize-file.ts'
import { sceneAnimationBlocks } from './scene-blocks.ts'

export function needsLegacyAnimationNormalization(scenes: Scene[]): boolean {
  return scenes.some((scene) =>
    sceneAnimationBlocks(scene).some(
      (animation) =>
        animation.status === 'ready' &&
        !(
          Number.isFinite(animation.normalizedSeconds) &&
          (animation.normalizedSeconds ?? 0) > 0
        ),
    ),
  )
}

// Migración oportunista al abrir el editor: una consulta no compite con un
// escritor activo ni muestra el archivo remoto con sonido mientras espera.
export async function ensureLegacyAnimationsForView(
  context: PipelineContext,
): Promise<void> {
  const payload = context.job.payload as { projectId?: string } | undefined
  if (!payload?.projectId) return
  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const scenes = await readScenes(paths)
  if (!scenes || !needsLegacyAnimationNormalization(scenes)) return
  const ffmpegPath = context.job.binaryPaths.ffmpeg
  if (!ffmpegPath) return
  try {
    await withProjectWriteLease(projectDir, context.signal, async () => {
      const metadata = await readProjectMetadata(paths)
      const frame =
        videoFormatOf(metadata.options) === '9:16'
          ? { width: 480, height: 854 }
          : { width: 854, height: 480 }
      const count = await normalizeLegacyAnimationBlocks(
        paths,
        ffmpegPath,
        frame,
        context.signal,
      )
      if (count > 0) await markVideoOutdated(paths, metadata)
    })
  } catch (error) {
    context.signal.throwIfAborted()
    if (
      error instanceof PipelineFailure &&
      error.code === 'animation_project_busy'
    )
      return
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `Legacy animation normalization deferred: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

// El caller posee la lease de escritura del proyecto. Es una migración de
// medios local y recuperable: jamás crea tareas remotas ni sobreescribe el
// archivo antiguo; el recibo y su ruta quedan en history antes de sustituir
// la proyección activa. Una consulta ocupada omite ese clip hasta migrarlo.
export async function normalizeLegacyAnimationBlocks(
  paths: ProjectPaths,
  ffmpegPath: string,
  frame: FrameSize,
  signal: AbortSignal,
): Promise<number> {
  const scenes = await readScenes(paths)
  if (!scenes || !needsLegacyAnimationNormalization(scenes)) return 0
  const positions = new Map(scenes.map((scene, index) => [scene.id, index]))
  const byId = new Map(scenes.map((scene) => [scene.id, scene]))
  let normalizedCount = 0
  for (const scene of scenes) {
    const blocks = [...sceneAnimationBlocks(scene)]
    for (const [index, animation] of blocks.entries()) {
      signal.throwIfAborted()
      if (
        animation.status !== 'ready' ||
        (animation.normalizedSeconds ?? 0) > 0
      )
        continue
      const inputPath = sceneAnimationClipFile(paths, scene.id, animation)
      if (!(await isValidFile(inputPath))) continue
      const group = animation.sceneIds.map((id) => byId.get(id))
      const firstPosition = positions.get(scene.id)
      if (
        animation.sceneIds[0] !== scene.id ||
        group.some(
          (member, offset) =>
            !member ||
            positions.get(member.id) !== (firstPosition ?? -1) + offset ||
            (offset > 0 &&
              Math.abs(
                (group[offset - 1]?.endSeconds ?? 0) -
                  (member.startSeconds ?? 0),
              ) > 0.001),
        )
      )
        throw new PipelineFailure(
          'animation_media_invalid',
          'Legacy animation does not match scene coverage',
        )
      const startSeconds = animation.startSeconds ?? scene.startSeconds
      const endSeconds = animation.endSeconds ?? group.at(-1)?.endSeconds
      if (
        startSeconds === undefined ||
        endSeconds === undefined ||
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds <= startSeconds ||
        startSeconds < (scene.startSeconds ?? 0) ||
        endSeconds > (group.at(-1)?.endSeconds ?? 0)
      )
        throw new PipelineFailure(
          'animation_media_invalid',
          'Legacy animation has invalid timeline bounds',
        )
      const id = randomUUID()
      const clipFile = `normalized_${id}.mp4`
      const outputPath = sceneAnimationClipFile(paths, scene.id, { clipFile })
      const result = await normalizeAnimationFile(
        ffmpegPath,
        inputPath,
        outputPath,
        { startSeconds, endSeconds, frame, signal },
      )
      blocks[index] = {
        ...animation,
        id,
        clipFile,
        startSeconds,
        endSeconds,
        slotSeconds: endSeconds - startSeconds,
        normalizedSeconds: result.normalizedSeconds,
      }
      scene.animationHistory = [
        ...(scene.animationHistory ?? []),
        {
          ...animation,
          id: animation.id ?? `legacy-${scene.id}`,
          clipFile: animation.clipFile ?? basename(inputPath),
        },
      ]
      scene.animations = [...blocks]
      delete scene.animation
      await writeScenes(paths, scenes)
      normalizedCount++
    }
  }
  return normalizedCount
}
