import { animationRangeEnd } from '@pipeline/animation/scope.ts'
import { countScenesAroundSpans } from '@pipeline/stages/scene-cuts/pins.ts'
import type {
  CountStepEstimate,
  SceneConfirmationView,
} from '@/modules/videos/types/create'

// Lo que deja el corte por CANTIDAD con avatar (spec §6.1), para el diálogo de
// la pausa: la misma cuenta que hace el corte alrededor de los tramos
// (countScenesAroundSpans, puro y browser-safe), con la cantidad tecleada como
// total del video —las apariciones incluidas— y el prefijo animado hasta su
// segundo del video. Las apariciones no llevan imagen. Por debajo de la mínima
// (una escena por tramo libre más las apariciones) el corte la acota, y la
// cuenta sale acotada. null sin tramos (sin avatar, o ninguno entró): el
// diálogo queda como siempre.
export function countStepSceneEstimate(
  confirmation: Pick<
    SceneConfirmationView,
    'audioDurationSeconds' | 'animationMinutes' | 'avatarSpans'
  >,
  sceneCount: number,
): CountStepEstimate | null {
  const spans = confirmation.avatarSpans ?? []
  if (spans.length === 0) return null

  const audioDurationSeconds = confirmation.audioDurationSeconds
  const animationMinutes = confirmation.animationMinutes ?? 0
  const prefixEndSeconds =
    animationMinutes > 0
      ? animationRangeEnd(animationMinutes, audioDurationSeconds)
      : 0
  const total = countScenesAroundSpans(audioDurationSeconds, spans, {
    sceneCount,
    prefixEndSeconds,
  })
  const minimum = countScenesAroundSpans(audioDurationSeconds, spans, {
    sceneCount: 1,
    prefixEndSeconds,
  })

  return { total, images: total - spans.length, minimum }
}
