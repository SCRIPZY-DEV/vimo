import { useEffect, useState } from 'react'
import { GEM_ADAPTATION_TICK_MS } from '@/modules/videos/constants'
import { gemAdaptationPercent } from '@/modules/videos/utilities/gemAdaptationPercent'
import type { GemAdaptationPhase } from '@/modules/videos/types/styles'

interface GemAdaptationInFlight {
  startedAt: number
  phase: GemAdaptationPhase
}

// Porcentaje vivo de la adaptación de una gema en su tarjeta (el patrón de
// useAnimationProgress): el reloj es el único sistema externo, un tick cada
// medio segundo mientras hay una en vuelo. null = ninguna en vuelo.
export function useGemAdaptationProgress(
  adaptation: GemAdaptationInFlight | null,
): number | null {
  const [now, setNow] = useState(() => Date.now())
  const active = adaptation !== null

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), GEM_ADAPTATION_TICK_MS)
    return () => clearInterval(timer)
  }, [active])

  if (!adaptation) return null
  return gemAdaptationPercent(adaptation, now)
}
