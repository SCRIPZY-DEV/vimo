import { rm } from 'node:fs/promises'

import { withAnimationCheckpointLease } from '../../animation/coordination.ts'
import { frameBoundary } from '../../animation/timing.ts'
import {
  avatarClipFile,
  avatarClipFileName,
  sceneAvatarClipFile,
  sceneAvatarRawClipFile,
} from '../../avatar/clip-path.ts'
import { avatarRenderHash } from '../../avatar/fingerprint.ts'
import { normalizeAvatarClip } from '../../avatar/normalization.ts'
import {
  applyAvatarResizePlan,
  AVATAR_RESIZE_ERROR_CODES,
  isAvatarAppearanceSeconds,
  sameSpanFrames,
  type AvatarResizePlan,
} from '../../avatar/resize-plan.ts'
import {
  avatarResizePlanOrFail,
  readAvatarResizeWords,
} from '../../avatar/resize-words.ts'
import {
  markVideoOutdated,
  readProjectMetadata,
} from '../../project/metadata.ts'
import { isValidFile, type ProjectPaths } from '../../project/paths.ts'
import {
  isAvatarClipStale,
  readScenes,
  writeScenes,
  type SceneViewProject,
} from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import {
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
  type AvatarTrimScenePayload,
  type AvatarTrimSceneResult,
  type SceneAvatar,
} from '../../types/avatar.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { frameSizeFor, videoFormatOf } from '../../types/video-format.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'

// «Recortar a N s» desde el editor (entrega 2g, diseño §23.3): una aparición
// lista se acorta gratis y al instante, sin hablar con el proveedor ni leer su
// clave. El inicio no se mueve; el fin nuevo lo pone el plan de la duración
// (resize-plan.ts, la regla de §23.2 con `seconds`) y tiene que quedar al menos
// un cuadro antes del de hoy. Vimo vuelve a ajustar al tramo nuevo el crudo
// del proveedor del clip actual (`scene_<id>.<hash8>.raw.mp4`, el mismo nombre
// que el clip con `.raw.mp4`; si no está, el clip normalizado) con
// `normalizeAvatarClip`, que corta el final sin cambiar la velocidad, en un
// archivo nuevo con la huella del tramo nuevo (`avatarRenderHash`). El clip
// anterior queda en disco. Una sola escritura de scenes.json, con el lease de
// los recibos de la animación y releído justo antes, guarda el tramo y el
// texto nuevos, el clip, la huella y `normalizedSeconds`, y la escena que sigue
// (empieza en el fin nuevo y suma las palabras que el avatar ya no dice); el
// video exportado queda desactualizado. `usdEstimated` no cambia: es lo que
// costó el clip, y recortarlo no cuesta.
// Corre con el lease exclusivo del proyecto (subcommands.ts): ningún
// generador puede estar tocando la escena ni su vecina mientras tanto. Si aun
// así la escena cambió bajo el lease de los recibos (otro clip, o un plan que
// ya no da el mismo tramo), se rechaza y el clip nuevo se borra: ninguna escena
// lo nombra (m-3 de la revisión final).
// Sin clip listo y al día, `avatar_trim_unavailable`. Con los segundos de hoy o
// más, o si el corte no cae antes del fin de hoy, `avatar_resize_out_of_range`,
// el código del render para un corte que no se mueve hacia lo pedido (m-1 de
// la revisión final): el clip está listo, y esa duración no se logra
// recortando en ese lugar. Un plan que dejaría la aparición por debajo del
// piso, también (R-2g-21). No importa la orquestación de los renders
// (render-scenes.ts): el plan y las palabras salen de resize-words.ts.

const TRIM_UNAVAILABLE = 'avatar_trim_unavailable'

export async function avatarTrimScene(
  context: PipelineContext,
): Promise<AvatarTrimSceneResult> {
  const payload = context.job.payload as
    Partial<AvatarTrimScenePayload> | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const { sceneId, seconds } = payload
  if (typeof sceneId !== 'number' || !Number.isSafeInteger(sceneId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.sceneId must be a scene id',
    )

  if (!isAvatarAppearanceSeconds(seconds))
    throw new PipelineFailure(
      'invalid_payload',
      `payload.seconds must be a whole number of seconds from ${AVATAR_MIN_APPEARANCE_SECONDS} to ${AVATAR_MAX_APPEARANCE_SECONDS}`,
    )

  const { paths, metadata, options, signal } = await buildCreateVideoContext(
    context,
    payload.projectId,
  )
  signal.throwIfAborted()
  const scenes = await readScenes(paths)
  if (!scenes)
    throw new PipelineFailure('scenes_missing', 'The project has no scenes')

  const scene = scenes.find((candidate) => candidate.id === sceneId)
  if (!scene?.avatar)
    throw new PipelineFailure(
      'invalid_payload',
      `scene ${sceneId} is not an avatar scene`,
    )

  const avatar = scene.avatar
  const clip = await readyClipOf(paths, scene, avatar, metadata)
  if (!clip)
    throw new PipelineFailure(
      TRIM_UNAVAILABLE,
      `avatar scene ${sceneId} has no ready, up-to-date clip to trim`,
    )

  // Recortar es pedir menos segundos que los de hoy (`AvatarTrimScenePayload`).
  // Con los mismos o más, aunque una palabra larga hiciera caer el corte antes,
  // el pedido no es un recorte: lo que se pidió es otro render (que D4, en
  // `avatar-render-scenes`, tampoco paga). El clip está listo, así que el
  // código es el del render para ese caso, no `avatar_trim_unavailable` (m-1
  // de la revisión final).
  const currentSeconds = (scene.endSeconds ?? 0) - (scene.startSeconds ?? 0)
  if (seconds >= Math.round(currentSeconds))
    throw new PipelineFailure(
      AVATAR_RESIZE_ERROR_CODES.outOfRange,
      `avatar scene ${sceneId} lasts ${currentSeconds.toFixed(2)} s: ${seconds} s is not shorter`,
    )

  const words = await readAvatarResizeWords(paths)
  const plan = avatarResizePlanOrFail(scenes, words, sceneId, seconds)
  if (frameBoundary(plan.endSeconds) >= frameBoundary(scene.endSeconds ?? 0))
    throw new PipelineFailure(
      AVATAR_RESIZE_ERROR_CODES.outOfRange,
      `avatar scene ${sceneId} would not end earlier with ${seconds} s`,
    )

  const renderHash = avatarRenderHash({
    lookId: avatar.lookId,
    engine: avatar.engine,
    startFrame: frameBoundary(plan.startSeconds),
    endFrame: frameBoundary(plan.endSeconds),
    narrationVersion: metadata.narrationVersion ?? 0,
  })
  const trimmedFile = avatarClipFile(paths, sceneId, renderHash)
  const normalized = await normalizeAvatarClip(
    requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    await trimSourceOf(paths, avatar, clip),
    trimmedFile,
    {
      startSeconds: plan.startSeconds,
      endSeconds: plan.endSeconds,
      frame: frameSizeFor(videoFormatOf(options)),
      signal,
    },
  )

  await withAnimationCheckpointLease(paths.root, signal, async () => {
    const current = (await readScenes(paths)) ?? []
    // Si la escena cambió mientras se ajustaba el clip, ninguna escena va a
    // nombrar el clip nuevo: se borra antes de rechazar, así no queda basura
    // en `avatar/` (m-3 de la revisión final).
    const next = await discardingOnRefusal(trimmedFile, () =>
      trimmedScenes(current, {
        sceneId,
        seconds,
        words,
        plan,
        avatar,
        renderHash,
        normalizedSeconds: normalized.normalizedSeconds,
      }),
    )
    await writeScenes(paths, next)
    await markVideoOutdated(paths, await readProjectMetadata(paths))
  })

  return {
    sceneId,
    startSeconds: plan.startSeconds,
    endSeconds: plan.endSeconds,
  }
}

// Lo que se recortó antes de tomar el lease: la escena y sus segundos, las
// palabras y el plan con que se ajustó el clip, el avatar que se leyó (con el
// clip de origen) y la huella y la duración del clip nuevo.
interface TrimmedClip {
  sceneId: number
  seconds: number
  words: readonly TranscriptWord[]
  plan: AvatarResizePlan
  avatar: SceneAvatar
  renderHash: string
  normalizedSeconds: number
}

// scenes.json con el recorte aplicado sobre `current` (lo que hay en disco bajo
// el lease): la escena tiene que seguir con el clip que se ajustó y el plan,
// releído, tiene que dar el mismo tramo. Si no, lanza con su código y no
// devuelve nada que escribir.
function trimmedScenes(current: readonly Scene[], trim: TrimmedClip): Scene[] {
  const { sceneId, seconds, avatar, renderHash } = trim
  const onDisk = current.find((candidate) => candidate.id === sceneId)?.avatar
  if (
    !onDisk ||
    onDisk.clipFile !== avatar.clipFile ||
    onDisk.renderHash !== avatar.renderHash
  )
    throw new PipelineFailure(
      TRIM_UNAVAILABLE,
      `avatar scene ${sceneId} changed while its clip was being trimmed`,
    )

  const replanned = avatarResizePlanOrFail(
    current,
    trim.words,
    sceneId,
    seconds,
  )
  if (!sameSpanFrames(replanned, trim.plan))
    throw new PipelineFailure(
      AVATAR_RESIZE_ERROR_CODES.outOfRange,
      `avatar scene ${sceneId} cannot last ${seconds} s in its place any more`,
    )

  return applyAvatarResizePlan(current, sceneId, replanned, {
    ...onDisk,
    clipFile: avatarClipFileName(sceneId, renderHash),
    renderHash,
    normalizedSeconds: trim.normalizedSeconds,
  })
}

// Lo que devuelve `build` o, si lanza, el mismo fallo después de borrar el
// archivo `path` (`force`: si ya no está, no importa).
async function discardingOnRefusal<T>(
  path: string,
  build: () => T,
): Promise<T> {
  try {
    return build()
  } catch (error) {
    await rm(path, { force: true })
    throw error
  }
}

// La ruta del clip de una escena lista, al día y con su archivo en disco, o
// undefined: solo ese clip se puede recortar.
async function readyClipOf(
  paths: ProjectPaths,
  scene: Scene,
  avatar: SceneAvatar,
  project: SceneViewProject,
): Promise<string | undefined> {
  if (avatar.status !== 'ready') return undefined

  if (isAvatarClipStale(scene, avatar, project)) return undefined

  const clip = sceneAvatarClipFile(paths, avatar)
  if (!clip || !(await isValidFile(clip))) return undefined

  return clip
}

// Lo que se vuelve a ajustar: el crudo del proveedor del clip actual (el mismo
// nombre con `.raw.mp4`, `sceneAvatarRawClipFile`) o, si ya no está, el clip
// normalizado, que ya tiene el cuadro del render y empieza en el mismo
// instante.
async function trimSourceOf(
  paths: ProjectPaths,
  avatar: SceneAvatar,
  clip: string,
): Promise<string> {
  const raw = sceneAvatarRawClipFile(paths, avatar)
  if (raw && (await isValidFile(raw))) return raw

  return clip
}
