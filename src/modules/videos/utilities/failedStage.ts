import {
  AVATAR_DEFINITIVE_REJECTION_CODES,
  PIPELINE_STAGES,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { avatarRowStatus } from '@/modules/videos/utilities/avatarTaskEvents'
import type {
  CreateTask,
  FailureMessage,
  SceneView,
} from '@/modules/videos/types/create'
import type { StageId } from '@pipeline/runner/stage-id.ts'

// Qué fases opcionales tiene esta corrida (por datos, no por `completedStages`).
export interface OptionalStages {
  hasAnimation: boolean
  hasAvatar: boolean
}

// La fase en la que se cayó el job: la primera sin completar entre las que
// aplican. La animación y el avatar solo cuentan si la corrida los tiene: una
// fase saltada nunca queda en `completedStages` en disco.
export function failedStageOf(
  completedStages: StageId[],
  { hasAnimation, hasAvatar }: OptionalStages,
): StageId | null {
  const stage = PIPELINE_STAGES.find((candidate) => {
    if (candidate.id === 'animation' && !hasAnimation) return false

    if (candidate.id === 'avatar' && !hasAvatar) return false

    return !completedStages.includes(candidate.id)
  })

  return stage?.id ?? null
}

// Una escena tal como la mira el mensaje del fallo: la del store de Crear
// (con lo que pasó en esta corrida) o la del disco (sin actividad).
type FailedAvatarScene = Pick<SceneView, 'avatar' | 'avatarActivity'>

// Por qué falló cada aparición que no quedó lista: lo que pasó en esta
// corrida manda y, si no, lo que dice el disco.
function avatarFailureCodes(scenes: FailedAvatarScene[]): string[] {
  return scenes.flatMap((scene) => {
    if (!scene.avatar || avatarRowStatus(scene) !== 'failed') return []

    const code = scene.avatarActivity?.code ?? scene.avatar.errorCode
    return code ? [code] : []
  })
}

// El código que más se repite entre las apariciones que fallaron, como el
// dominante con que la fase arma `avatar_incomplete` (con empate, el de la
// primera escena). undefined si ninguna falló con código.
export function dominantAvatarFailure(
  scenes: FailedAvatarScene[],
): string | undefined {
  const counts = new Map<string, number>()
  for (const code of avatarFailureCodes(scenes))
    counts.set(code, (counts.get(code) ?? 0) + 1)

  let dominant: string | undefined
  let dominantCount = 0
  for (const [code, count] of counts) {
    if (count <= dominantCount) continue

    dominant = code
    dominantCount = count
  }

  return dominant
}

// El mensaje de la cabecera de un fallo: el del código del job, salvo cuando
// la fase del avatar terminó incompleta por un rechazo definitivo de HeyGen
// (moderación, look no soportado, pedido inválido; spec §14). Ahí reanudar no
// lo arregla —HeyGen rechaza igual el mismo look y la misma narración—, así
// que el mensaje dice la salida: el video sale con la imagen fija del look,
// renderizado desde el editor, o con otro look. Cuenta las apariciones con
// ese rechazo.
export function failureMessageOf(
  task: Pick<CreateTask, 'errorCode' | 'errorKey'> & {
    scenes: FailedAvatarScene[]
  },
): FailureMessage {
  const fallback = { key: task.errorKey ?? UNKNOWN_CREATE_ERROR_KEY }
  if (task.errorCode !== 'avatar_incomplete') return fallback

  const dominant = dominantAvatarFailure(task.scenes)
  if (!dominant || !isDefinitiveRejection(dominant)) return fallback

  return {
    key: 'create.errors.avatarRejected',
    count: avatarFailureCodes(task.scenes).filter(isDefinitiveRejection).length,
  }
}

function isDefinitiveRejection(code: string): boolean {
  return AVATAR_DEFINITIVE_REJECTION_CODES.has(code)
}
