import { planPrefixSceneWindows } from '@pipeline/animation/prefix-scenes.ts'
import { animationRangeEnd } from '@pipeline/animation/scope.ts'
import { countScenesAroundSpans } from '@pipeline/stages/scene-cuts/pins.ts'
import { estimateSceneCount } from '@/modules/videos/utilities/estimateSceneCount'
import type { SceneConfirmationView } from '@/modules/videos/types/create'

// La cuenta instantánea de escenas del paso «segundos por escena», mientras
// llega la vista previa exacta del sidecar (preview-scene-cuts). Con avatar es
// la misma cuenta que hace el corte alrededor de sus tramos
// (countScenesAroundSpans, puro y browser-safe): los pines no se mueven, solo
// se reparte el tiempo libre y el prefijo animado llega hasta su segundo del
// video. Sin avatar, la cuenta de siempre.
export function secondsStepSceneEstimate(
  confirmation: Pick<
    SceneConfirmationView,
    'audioDurationSeconds' | 'animationMinutes' | 'avatarSpans'
  >,
  secondsPerScene: number,
): number {
  const audioDurationSeconds = confirmation.audioDurationSeconds
  const animationMinutes = confirmation.animationMinutes ?? 0
  const avatarSpans = confirmation.avatarSpans ?? []

  if (avatarSpans.length > 0) {
    return countScenesAroundSpans(audioDurationSeconds, avatarSpans, {
      secondsPerScene,
      prefixEndSeconds:
        animationMinutes > 0
          ? animationRangeEnd(animationMinutes, audioDurationSeconds)
          : 0,
    })
  }

  if (animationMinutes > 0) {
    return planPrefixSceneWindows({
      totalSeconds: audioDurationSeconds,
      minutes: animationMinutes,
      secondsPerScene,
    }).length
  }

  return estimateSceneCount(audioDurationSeconds, secondsPerScene)
}
