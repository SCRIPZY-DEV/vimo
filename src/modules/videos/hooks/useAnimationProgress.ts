import { useEffect, useState } from 'react'
import { ANIMATION_PROGRESS_TICK_MS } from '@/modules/videos/constants'
import { animationProgressPercent } from '@/modules/videos/utilities/animationProgressPercent'
import type { SceneAnimationProgress } from '@/modules/videos/types/library'

// Porcentaje vivo de un clip en curso. El reloj es el único sistema externo:
// un tick por segundo desde el inicio del trabajo, incluida la redacción del
// prompt. Ocultarlo durante esa fase hacía aparecer de golpe el avance acumulado.
export function useAnimationProgress(
  progress: SceneAnimationProgress | undefined,
): number | undefined {
  const [now, setNow] = useState(() => Date.now())
  const active =
    progress !== undefined &&
    progress.phase !== 'queued' &&
    progress.phase !== 'rate-limited'

  useEffect(() => {
    if (!active) return
    const timer = setInterval(
      () => setNow(Date.now()),
      ANIMATION_PROGRESS_TICK_MS,
    )
    return () => clearInterval(timer)
  }, [active])

  if (!progress || !active) return undefined
  return animationProgressPercent(progress, now)
}
