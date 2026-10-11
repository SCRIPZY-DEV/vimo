import { readProjectMetadata } from '../../project/metadata.ts'
import { avatarCoveredIntervals } from '../../animation/avatar-coverage.ts'
import { ensureLegacyAnimationsForView } from '../../animation/migrate-legacy.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
  type ProjectPaths,
} from '../../project/paths.ts'
import { readScenes, toSceneSummaries } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type { AvatarSpanWindow } from '../../runner/events.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  avatarSpanWindows,
  droppedAppearances,
  planAvatarPins,
} from '../../stages/scene-cuts/pins.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import type {
  VideoProjectMetadata,
  VideoProjectStatusPayload,
  VideoProjectStatusResult,
} from '../../types/video-project.ts'

// Lo que la pausa de confirmación cuenta del avatar, como lo rearma el estado.
interface AvatarPlanFromDisk {
  avatarSpans: AvatarSpanWindow[]
  avatarDropped: number
}

// Lee del disco el estado persistido del proyecto y el resumen de sus escenas.
export async function videoProjectStatus(
  context: PipelineContext,
): Promise<VideoProjectStatusResult> {
  const payload = context.job.payload as VideoProjectStatusPayload | undefined
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
  await ensureLegacyAnimationsForView(context)
  const metadata = await readProjectMetadata(paths)
  const scenes = await readScenes(paths)

  const result: VideoProjectStatusResult = {
    metadata,
    scenes: scenes ? await toSceneSummaries(paths, scenes, metadata) : [],
  }
  if (await isValidFile(paths.scriptFile))
    result.scriptCharCount = (await readTextWithRetry(paths.scriptFile)).length

  const avatar = await avatarPlanFromDisk(paths, metadata, scenes)
  if (avatar) {
    result.avatarSpans = avatar.avatarSpans
    result.avatarDropped = avatar.avatarDropped
  }

  return result
}

// Con avatar automático (ADR-0057), lo mismo que anunciaron
// `awaiting-scene-confirmation` y `avatar-planned`, rearmado desde el disco: la
// pausa no guarda el plan, pero el planificador es puro y sale igual de
// words.json, la duración medida y las opciones. Mientras el proyecto espera la
// confirmación (o todavía no tiene corte), los tramos y las descartadas del
// plan, con los tramos libres cortos ya absorbidos; con el corte hecho, los
// tramos de sus escenas de avatar y las pedidas que le faltan a ese corte,
// como el `avatar-planned` del job que corta. Sin avatar automático o sin una
// transcripción legible, nada: la UI no dice nada del avatar, y el estado
// nunca falla por esto (como las frases del render).
async function avatarPlanFromDisk(
  paths: ProjectPaths,
  metadata: VideoProjectMetadata,
  scenes: Scene[] | null,
): Promise<AvatarPlanFromDisk | null> {
  if (metadata.options.avatar?.placement !== 'auto') return null

  const words = await readWordsIfAny(paths)
  if (!words) return null

  try {
    const audioEndSeconds =
      metadata.audioDurationSeconds ?? words[words.length - 1].end
    const plan = planAvatarPins(metadata.options.avatar, words, audioEndSeconds)
    if (!plan) return null

    if (metadata.state === 'awaiting-confirmation' || !scenes)
      return {
        avatarSpans: avatarSpanWindows(plan.pins, audioEndSeconds),
        avatarDropped: plan.dropped,
      }

    return {
      avatarSpans: avatarCoveredIntervals(scenes),
      avatarDropped: droppedAppearances(
        plan,
        scenes.filter((scene) => scene.avatar).length,
      ),
    }
  } catch {
    return null
  }
}

// words.json si existe y cada palabra trae sus dos tiempos; null si falta o
// está roto ([null], [1, 2], palabras sin tiempos: un archivo editado a mano o
// dañado no puede impedir abrir el proyecto).
async function readWordsIfAny(
  paths: ProjectPaths,
): Promise<TranscriptWord[] | null> {
  if (!(await isValidFile(paths.wordsFile))) return null

  try {
    const words: unknown = JSON.parse(await readTextWithRetry(paths.wordsFile))
    if (!Array.isArray(words) || words.length === 0) return null

    if (!words.every(isTimedWord)) return null

    return words
  } catch {
    return null
  }
}

// Lo mínimo que el planificador lee de una palabra: un objeto con sus dos
// tiempos finitos.
function isTimedWord(word: unknown): word is TranscriptWord {
  if (typeof word !== 'object' || word === null) return false

  if (!('start' in word) || !('end' in word)) return false

  return Number.isFinite(word.start) && Number.isFinite(word.end)
}
