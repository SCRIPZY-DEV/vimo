import {
  ANIMATION_EXPECTED_SECONDS,
  ANIMATION_PROGRESS_CAP_PERCENT,
  ANIMATION_RAMP_PERCENT,
} from '@/modules/videos/constants'
import type { SceneAnimationProgress } from '@/modules/videos/types/library'

// Porcentaje que muestra la UI para un clip en curso: el mayor entre lo que
// informó el proveedor y una simulación por tiempo transcurrido, para que la
// barra suba también con Kie (que no informa avance) y nunca retroceda.
export function animationProgressPercent(
  progress: SceneAnimationProgress,
  now: number,
): number {
  const elapsedSeconds = Math.max(0, (now - progress.startedAt) / 1000)
  const simulated =
    elapsedSeconds <= ANIMATION_EXPECTED_SECONDS
      ? (ANIMATION_RAMP_PERCENT * elapsedSeconds) / ANIMATION_EXPECTED_SECONDS
      : ANIMATION_RAMP_PERCENT +
        (ANIMATION_PROGRESS_CAP_PERCENT - ANIMATION_RAMP_PERCENT) *
          (1 -
            Math.exp(
              -(elapsedSeconds - ANIMATION_EXPECTED_SECONDS) /
                ANIMATION_EXPECTED_SECONDS,
            ))
  const reported = progress.reportedPercent ?? 0

  return Math.min(
    ANIMATION_PROGRESS_CAP_PERCENT,
    Math.round(Math.max(reported, simulated)),
  )
}
