import { stat } from 'node:fs/promises'

import { readProjectMetadata } from '../../project/metadata.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
  sceneImageFile,
  type ProjectPaths,
} from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import { hasPendingUserPrompt } from '../../project/user-prompt.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import type {
  SceneDetail,
  VideoProjectDetailPayload,
  VideoProjectDetailResult,
} from '../../types/video-project.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'

// El payload completo del editor en UNA lectura (espejo de escenas-detalladas
// del origen): metadata + escenas con sus campos editables + transcripción +
// guion + rutas de media con mtime (cache-buster de convertFileSrc). Todas
// las rutas se derivan al vuelo — nada absoluto se persiste.
export async function videoProjectDetail(
  context: PipelineContext,
): Promise<VideoProjectDetailResult> {
  const payload = context.job.payload as VideoProjectDetailPayload | undefined
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

  const scenes = await readScenes(paths)
  const result: VideoProjectDetailResult = {
    metadata,
    scenes: scenes ? await toSceneDetails(paths, scenes) : [],
    words: await readWords(paths),
    script: await readScript(paths),
  }

  const narration = await statMedia(paths.narrationFile)
  if (narration) {
    result.narrationPath = narration.path
    result.narrationMtimeMs = narration.mtimeMs
  }
  const music = await statMedia(paths.musicFile)
  if (music) {
    result.musicPath = music.path
    result.musicMtimeMs = music.mtimeMs
  }
  if (await isValidFile(paths.overlayFile))
    result.overlayPath = paths.overlayFile
  const video = await statMedia(paths.videoFile)
  if (video) {
    result.videoPath = video.path
    result.videoMtimeMs = video.mtimeMs
  }

  return result
}

// Proyección de Scene para el editor: el resumen de la UI más los campos
// editables persistidos, con el estado de la imagen derivado del disco.
async function toSceneDetails(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<SceneDetail[]> {
  const details: SceneDetail[] = []
  for (const scene of scenes) {
    const detail: SceneDetail = {
      id: scene.id,
      text: scene.text,
      imageStatus: 'pending',
    }
    if (scene.imagePrompt) detail.imagePrompt = scene.imagePrompt
    if (scene.userPrompt) detail.userPrompt = scene.userPrompt
    if (hasPendingUserPrompt(scene)) detail.userPromptPending = true
    if (scene.startSeconds !== undefined)
      detail.startSeconds = scene.startSeconds
    if (scene.endSeconds !== undefined) detail.endSeconds = scene.endSeconds
    if (scene.imageModel) detail.imageModel = scene.imageModel
    if (scene.imageQuality) detail.imageQuality = scene.imageQuality
    if (scene.charactersPresent)
      detail.charactersPresent = scene.charactersPresent

    const image = await statMedia(sceneImageFile(paths, scene.id))
    if (image) {
      detail.imagePath = image.path
      detail.imageMtimeMs = image.mtimeMs
      detail.imageStatus = 'ok'
    }

    details.push(detail)
  }
  return details
}

// Transcripción tolerante: sin words.json (proyecto a medias) no hay error,
// el editor trabaja sin pista de palabras.
async function readWords(paths: ProjectPaths): Promise<TranscriptWord[]> {
  if (!(await isValidFile(paths.wordsFile))) return []

  try {
    const parsed = JSON.parse(await readTextWithRetry(paths.wordsFile))
    return Array.isArray(parsed) ? (parsed as TranscriptWord[]) : []
  } catch {
    return []
  }
}

async function readScript(paths: ProjectPaths): Promise<string> {
  if (!(await isValidFile(paths.scriptFile))) return ''

  try {
    return await readTextWithRetry(paths.scriptFile)
  } catch {
    return ''
  }
}

// «Media presente» = archivo válido; devuelve su ruta con el mtime redondeado
// que la UI usa como query param de cache-busting.
async function statMedia(
  path: string,
): Promise<{ path: string; mtimeMs: number } | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size === 0) return null
    return { path, mtimeMs: Math.round(info.mtimeMs) }
  } catch {
    return null
  }
}
