import { useEffect, useState } from 'react'
import { SAMPLE_CAROUSEL_INTERVAL_MS } from '@/modules/videos/constants'

// Carrusel de muestras de una tarjeta de estilo: rota mientras está activo
// (hover/foco) y vuelve a la #1 al salir. El reset vive en el handler de
// salida — la regla react-hooks/set-state-in-effect prohíbe el patrón del
// origen (setState síncrono dentro del efecto).
export function useSampleCarousel(count: number) {
  const [index, setIndex] = useState(0)
  const [active, setActive] = useState(false)

  const activate = () => setActive(true)
  const deactivate = () => {
    setActive(false)
    setIndex(0)
  }

  useEffect(() => {
    if (!active || count <= 1) return
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % count),
      SAMPLE_CAROUSEL_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [active, count])

  return { index, activate, deactivate }
}
