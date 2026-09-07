import { useEffect, useState } from 'react'
import { SAMPLE_CAROUSEL_INTERVAL_MS } from '@/modules/videos/constants'

interface SampleCarouselOptions {
  // Frena la rotación sin salir del estado activo: con el mouse sobre un
  // control de la tarjeta (los tres puntos) debajo no tiene que moverse nada,
  // o el navegador se queda con la forma vieja del cursor (origen, 2026-08-08).
  paused?: boolean
}

// Carrusel de muestras de una tarjeta de estilo: rota mientras está activo
// (hover/foco) y vuelve a la #1 al salir. El reset vive en el handler de
// salida — la regla react-hooks/set-state-in-effect prohíbe el patrón del
// origen (setState síncrono dentro del efecto). `active` también se expone:
// un solo estado maneja el carrusel y el resaltado de la tarjeta.
export function useSampleCarousel(
  count: number,
  options: SampleCarouselOptions = {},
) {
  const { paused = false } = options
  const [index, setIndex] = useState(0)
  const [active, setActive] = useState(false)

  const activate = () => setActive(true)
  const deactivate = () => {
    setActive(false)
    setIndex(0)
  }

  useEffect(() => {
    if (!active || paused || count <= 1) return
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % count),
      SAMPLE_CAROUSEL_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [active, paused, count])

  return { index, active, activate, deactivate }
}
