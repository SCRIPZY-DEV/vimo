import {
  ANIMATION_PROGRESS_CAP_PERCENT,
  ANIMATION_RAMP_PERCENT,
  AVATAR_EXPECTED_RENDER_SECONDS,
} from '@/modules/videos/constants'

// Porcentaje que muestra el bloque de un avatar que se está generando: HeyGen
// no informa avance, así que sube por tiempo con la misma curva que un clip de
// Kie (recta hasta ANIMATION_RAMP_PERCENT y después frena) y nunca llega a
// 100: ese lo pone el clip listo.
export function avatarRenderPercent(startedAt: number, now: number): number {
  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000)
  if (elapsedSeconds <= AVATAR_EXPECTED_RENDER_SECONDS)
    return Math.round(
      (ANIMATION_RAMP_PERCENT * elapsedSeconds) /
        AVATAR_EXPECTED_RENDER_SECONDS,
    )

  const tail =
    1 -
    Math.exp(
      -(elapsedSeconds - AVATAR_EXPECTED_RENDER_SECONDS) /
        AVATAR_EXPECTED_RENDER_SECONDS,
    )
  return Math.min(
    ANIMATION_PROGRESS_CAP_PERCENT,
    Math.round(
      ANIMATION_RAMP_PERCENT +
        (ANIMATION_PROGRESS_CAP_PERCENT - ANIMATION_RAMP_PERCENT) * tail,
    ),
  )
}
