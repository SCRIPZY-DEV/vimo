import { stat } from 'node:fs/promises'
import { withAnimationCheckpointLease } from '../animation/coordination.ts'

import type { SceneAnimation, SceneAnimationView } from '../types/animation.ts'
import { sceneAnimationBlocks } from '../animation/scene-blocks.ts'
import { sceneAnimationClipFile } from '../animation/clip-path.ts'
import type { Scene, SceneSummary } from '../types/scenes.ts'
import { readTextWithRetry, writeFileAtomicStrict } from '../utils/atomic-fs.ts'
import { isValidFile, sceneImageFile, type ProjectPaths } from './paths.ts'

// Lectura/escritura de scenes.json (port de leerEscenasNormalizadas +
// persistencia incremental del origen). El pipeline completo escribe el
// archivo ENTERO tras cada escena procesada — es dueño de todas. La
// regeneración selectiva de Library es dueña SOLO de sus escenas: persiste
// con merge por id sobre lo que haya en disco (ADR-0014), así una edición
// del usuario hecha durante el job no se pisa.

// null = no hay escenas todavía (o el archivo no es utilizable): las fases
// que dependen de él lo regeneran.
export async function readScenes(paths: ProjectPaths): Promise<Scene[] | null> {
  if (!(await isValidFile(paths.scenesFile))) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(await readTextWithRetry(paths.scenesFile))
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  // Normalización defensiva: solo entradas con id numérico y texto string;
  // una corrupción parcial no debe tumbar el pipeline.
  const scenes: Scene[] = []
  for (const item of parsed as Scene[]) {
    if (typeof item?.id !== 'number' || typeof item.text !== 'string') continue
    scenes.push(item)
  }

  return scenes.length > 0 ? scenes : null
}

export async function writeScenes(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<void> {
  const ordered = [...scenes].sort((a, b) => a.id - b.id)
  await writeFileAtomicStrict(
    paths.scenesFile,
    `${JSON.stringify(ordered, null, 2)}\n`,
  )
}

// Merge por id: re-lee el disco y reemplaza SOLO las escenas de `ownedIds`
// por su versión de `changes`. El mutex corto cubre toda la lectura y el
// rename: los sidecars de escenas disjuntas no pierden cambios entre sí.
export async function mergeScenesById(
  paths: ProjectPaths,
  ownedIds: Set<number>,
  changes: Scene[],
): Promise<Scene[]> {
  const changesById = new Map<number, Scene>()
  for (const scene of changes) {
    if (ownedIds.has(scene.id)) changesById.set(scene.id, scene)
  }

  return withAnimationCheckpointLease(
    paths.root,
    new AbortController().signal,
    async () => {
      const onDisk = (await readScenes(paths)) ?? []
      const merged = onDisk.map((scene) => changesById.get(scene.id) ?? scene)
      await writeScenes(paths, merged)
      return merged
    },
  )
}

// La escritura de las stages: sin `ownedIds` (pipeline completo) escribe el
// archivo entero como siempre; con ellos (regeneración selectiva) persiste
// solo lo propio vía merge.
export async function writeScenesOwned(
  paths: ProjectPaths,
  scenes: Scene[],
  ownedIds?: Set<number>,
): Promise<void> {
  if (!ownedIds || ownedIds.size === 0) {
    await writeScenes(paths, scenes)
    return
  }
  await mergeScenesById(paths, ownedIds, scenes)
}

// Una imagen propia gana sobre el alias histórico de una pausa. Los cortes
// nuevos generan su visual; el alias solo recupera proyectos anteriores.
export async function resolveSceneImageSourceId(
  paths: ProjectPaths,
  scene: Scene,
): Promise<number> {
  if (await isValidFile(sceneImageFile(paths, scene.id))) return scene.id
  return scene.visualSourceSceneId ?? scene.id
}

// Vista para la UI: deriva el estado de la imagen de la EXISTENCIA del
// archivo (la ruta no se persiste en scenes.json, ver types/scenes.ts).
export async function toSceneSummary(
  paths: ProjectPaths,
  scene: Scene,
): Promise<SceneSummary> {
  const summary: SceneSummary = {
    id: scene.id,
    text: scene.text,
    imageStatus: 'pending',
  }
  if (scene.imagePrompt) summary.imagePrompt = scene.imagePrompt
  if (scene.startSeconds !== undefined)
    summary.startSeconds = scene.startSeconds
  if (scene.endSeconds !== undefined) summary.endSeconds = scene.endSeconds
  if (scene.animationRequestedSeconds !== undefined)
    summary.animationRequestedSeconds = scene.animationRequestedSeconds
  if (scene.staticTransitionIn !== undefined)
    summary.staticTransitionIn = scene.staticTransitionIn

  const imageSourceId = await resolveSceneImageSourceId(paths, scene)
  const imagePath = sceneImageFile(paths, imageSourceId)
  if (await isValidFile(imagePath)) {
    summary.imagePath = imagePath
    summary.imageStatus = 'ok'
  }

  const animation = await toSceneAnimationView(paths, scene)
  if (animation) summary.animation = animation
  if (scene.animations !== undefined)
    summary.animations = await Promise.all(
      sceneAnimationBlocks(scene).map((block) =>
        animationView(paths, scene.id, block),
      ),
    )
  if (scene.animationPending?.length)
    summary.animationPending = await Promise.all(
      scene.animationPending.map((block) =>
        animationView(paths, scene.id, block),
      ),
    )
  if (imageSourceId !== scene.id) summary.visualSourceSceneId = imageSourceId
  if (scene.animations === undefined && scene.absorbedBy !== undefined)
    summary.absorbedBy = scene.absorbedBy

  return summary
}

// Vista de la animación de una escena (ADR-0047): el clip se deriva de la
// EXISTENCIA del archivo, como la imagen. Un `ready` persistido sin archivo
// sale como error, así la UI nunca promete un clip que el render no va a usar.
export async function toSceneAnimationView(
  paths: ProjectPaths,
  scene: Scene,
): Promise<SceneAnimationView | undefined> {
  const animation = scene.animation
  if (!animation) return undefined
  return animationView(paths, scene.id, animation)
}

export async function animationView(
  paths: ProjectPaths,
  sceneId: number,
  animation: SceneAnimation,
): Promise<SceneAnimationView> {
  const view: SceneAnimationView = {
    canResumeTask:
      animation.attempts?.some(
        (attempt) =>
          attempt.state === 'pending' || attempt.state === 'succeeded',
      ) ||
      (!animation.attempts?.length && animation.task !== undefined),
    canRecoverLocally: animation.attempts?.some(
      (attempt) =>
        attempt.state === 'succeeded' && attempt.videoUrl !== undefined,
    ),
    submissionUnknown: animation.attempts?.some(
      (attempt) =>
        attempt.state === 'creating' || attempt.state === 'ambiguous',
    ),
    id: animation.id,
    startSeconds: animation.startSeconds,
    endSeconds: animation.endSeconds,
    normalizedSeconds: animation.normalizedSeconds,
    requestedSeconds: animation.requestedSeconds,
    provider: animation.provider,
    status: animation.status,
    sceneIds: animation.sceneIds,
    slotSeconds: animation.slotSeconds,
  }
  if (animation.strategy) view.strategy = animation.strategy
  if (animation.creditsConsumed !== undefined)
    view.creditsConsumed = animation.creditsConsumed
  if (animation.errorCode) view.errorCode = animation.errorCode
  if (animation.status !== 'ready') return view
  if (
    !Number.isFinite(animation.normalizedSeconds) ||
    (animation.normalizedSeconds ?? 0) <= 0
  ) {
    view.status = 'error'
    view.errorCode = 'animation_media_invalid'
    return view
  }
  try {
    const clipPath = sceneAnimationClipFile(paths, sceneId, animation)
    const info = await stat(clipPath)
    if (!info.isFile() || info.size === 0) throw new Error('empty clip')
    view.clipPath = clipPath
    view.clipMtimeMs = Math.round(info.mtimeMs)
  } catch {
    view.status = 'error'
    view.errorCode = 'animation_clip_missing'
  }

  return view
}

export async function toSceneSummaries(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<SceneSummary[]> {
  const summaries: SceneSummary[] = []
  for (const scene of scenes) {
    summaries.push(await toSceneSummary(paths, scene))
  }
  return summaries
}
