import { stat } from 'node:fs/promises'

import type { SceneAnimation, SceneAnimationView } from '../types/animation.ts'
import { sceneAnimationBlocks } from '../animation/scene-blocks.ts'
import { sceneAnimationClipFile } from '../animation/clip-path.ts'
import { frameBoundary } from '../animation/timing.ts'
import {
  findAvatarLookPreview,
  sceneAvatarClipFile,
} from '../avatar/clip-path.ts'
import { avatarRenderHash } from '../avatar/fingerprint.ts'
import type { SceneAvatar, SceneAvatarView } from '../types/avatar.ts'
import type { Scene, SceneSummary } from '../types/scenes.ts'
import type { VideoProjectMetadata } from '../types/video-project.ts'
import { readTextWithRetry, writeFileAtomicStrict } from '../utils/atomic-fs.ts'
import { isValidFile, sceneImageFile, type ProjectPaths } from './paths.ts'

// Lo que la vista necesita del proyecto para derivar lo que no se persiste
// (ADR-0057, diseño §3.3): la versión vigente de la narración (ausente = 0).
export type SceneViewProject = Pick<VideoProjectMetadata, 'narrationVersion'>

// Un `ready` cuyo clip no está en disco (o con un nombre que no es de Vimo):
// para la persona es reintentar la descarga, que reusa el video ya pagado
// (diseño §7.2, paso 5).
const AVATAR_CLIP_MISSING_CODE = 'avatar_download_failed'

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

// Reescribe el archivo ENTERO. Con recibos pagados en juego (Kie o HeyGen), se
// llama releyendo antes bajo `withAnimationCheckpointLease`, o bajo el lease
// exclusivo del proyecto (el pipeline completo, el reemplazo de narración).
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
// por su versión de `changes`. El read-modify-write pegado al write achica
// la ventana de carrera con otras escrituras (la UI garantiza un solo job
// de regen por proyecto; esto cubre las ediciones del usuario en paralelo).
export async function mergeScenesById(
  paths: ProjectPaths,
  ownedIds: Set<number>,
  changes: Scene[],
): Promise<Scene[]> {
  const changesById = new Map<number, Scene>()
  for (const scene of changes) {
    if (ownedIds.has(scene.id)) changesById.set(scene.id, scene)
  }

  const onDisk = (await readScenes(paths)) ?? []
  const merged = onDisk.map((scene) => changesById.get(scene.id) ?? scene)
  await writeScenes(paths, merged)
  return merged
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
  project: SceneViewProject,
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

  // Una escena de avatar no tiene imagen generada (su clip ES la escena, con
  // el fondo del look): su imagen fija es la vista previa del look, copiada en
  // `avatar/look.<ext>` al crear el proyecto. Así nada la muestra pendiente.
  const lookPreview = scene.avatar
    ? await findAvatarLookPreview(paths)
    : undefined
  if (lookPreview) {
    summary.imagePath = lookPreview
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
  const avatar = await toSceneAvatarView(paths, scene, project)
  if (avatar) summary.avatar = avatar

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

// Vista de la escena de avatar (ADR-0057, diseño §3.3): sin recibos, sin el
// nombre local del clip y sin la huella. El clip se deriva de la EXISTENCIA del
// archivo, como el de Kie: un `ready` sin archivo (o con un nombre que no arma
// Vimo) sale `failed`. `stale` se deriva acá y nunca se persiste: un clip
// renderizado con otra versión de la narración está desactualizado. La otra
// causa es la huella `renderHash` del carril de HeyGen: un clip de otro tramo,
// otro look u otro motor (isAvatarClipStale). Desde la entrega 2d se marca en
// TODA escena lista, también en la que perdió su archivo (que se sigue
// mostrando fallida): la fase no la paga sola (isAvatarScenePending) y el
// costo de reanudar la deja afuera por esta marca.
export async function toSceneAvatarView(
  paths: ProjectPaths,
  scene: Scene,
  project: SceneViewProject,
): Promise<SceneAvatarView | undefined> {
  const avatar = scene.avatar
  if (!avatar) return undefined

  const view: SceneAvatarView = {
    lookId: avatar.lookId,
    lookName: avatar.lookName,
    lookType: avatar.lookType,
    engine: avatar.engine,
    origin: avatar.origin,
    status: avatar.status,
  }
  if (avatar.normalizedSeconds !== undefined)
    view.normalizedSeconds = avatar.normalizedSeconds
  if (avatar.narrationVersion !== undefined)
    view.narrationVersion = avatar.narrationVersion
  if (avatar.usdEstimated !== undefined) view.usdEstimated = avatar.usdEstimated
  if (avatar.errorCode) view.errorCode = avatar.errorCode
  copyMotionView(avatar, view)

  if (avatar.status !== 'ready') return view

  if (isAvatarClipStale(scene, avatar, project)) view.stale = true

  const clipPath = sceneAvatarClipFile(paths, avatar)
  const clipMtimeMs = clipPath ? await validFileMtime(clipPath) : undefined
  if (!clipPath || clipMtimeMs === undefined) {
    view.status = 'failed'
    view.errorCode = AVATAR_CLIP_MISSING_CODE
    return view
  }

  view.clipPath = clipPath
  view.clipMtimeMs = clipMtimeMs
  return view
}

// El movimiento de la escena para el editor (entrega 2e, §21.4): el prompt,
// el último automático y quién lo escribió, «más expresivo» y si HeyGen
// rechazó el movimiento con este look. Cada uno solo si está y con su tipo (un
// scenes.json editado no le pasa a la UI un prompt que no es texto). La huella
// del texto y la toma son del sidecar: no viajan.
function copyMotionView(avatar: SceneAvatar, view: SceneAvatarView): void {
  if (typeof avatar.motionPrompt === 'string')
    view.motionPrompt = avatar.motionPrompt
  if (avatar.motionSource === 'auto' || avatar.motionSource === 'user')
    view.motionSource = avatar.motionSource
  if (typeof avatar.autoMotionPrompt === 'string')
    view.autoMotionPrompt = avatar.autoMotionPrompt
  if (avatar.expressive === true) view.expressive = true
  if (avatar.motionUnsupported === true) view.motionUnsupported = true
}

// Un clip listo está desactualizado si se renderizó con otra versión de la
// narración o si ya no corresponde al tramo, al look o al motor de la escena:
// su `renderHash` (la huella del carril de HeyGen,
// pipeline/avatar/fingerprint.ts) no es la de la escena de hoy. Un clip sin
// huella también: no se sabe para qué tramo se hizo. La misma regla decide si
// la fase `avatar` paga sola una escena lista (isAvatarScenePending,
// pipeline/avatar/render-scenes.ts): una desactualizada, nunca.
export function isAvatarClipStale(
  scene: Scene,
  avatar: SceneAvatar,
  project: SceneViewProject,
): boolean {
  const narrationVersion = project.narrationVersion ?? 0
  if ((avatar.narrationVersion ?? 0) !== narrationVersion) return true

  return (
    avatar.renderHash !==
    avatarRenderHash({
      lookId: avatar.lookId,
      engine: avatar.engine,
      startFrame: frameBoundary(scene.startSeconds ?? 0),
      endFrame: frameBoundary(scene.endSeconds ?? 0),
      narrationVersion,
    })
  )
}

// El mtime (redondeado) de un archivo que existe y no está vacío, o undefined.
async function validFileMtime(path: string): Promise<number | undefined> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size === 0) return undefined
    return Math.round(info.mtimeMs)
  } catch {
    return undefined
  }
}

export async function toSceneSummaries(
  paths: ProjectPaths,
  scenes: Scene[],
  project: SceneViewProject,
): Promise<SceneSummary[]> {
  const summaries: SceneSummary[] = []
  for (const scene of scenes) {
    summaries.push(await toSceneSummary(paths, scene, project))
  }
  return summaries
}
