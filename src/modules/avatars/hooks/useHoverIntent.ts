import { useEffect, useRef, useState } from 'react'
import { HOVER_FETCH_DELAY_MS } from '@/modules/avatars/constants'

// Si la persona se detuvo sobre una tarjeta: el mouse quieto encima durante
// HOVER_FETCH_DELAY_MS (entrar o moverse vuelve a contar; salir cancela) o el
// foco visible del teclado, que cuenta al instante. Recién entonces la tarjeta
// pide lo que muestra al pasar el mouse: cruzar tarjetas sin detenerse no
// lanza un proceso del sidecar (y una llamada a HeyGen) por cada una.
// `hoveredOnce` no vuelve a apagarse.
export function useHoverIntent() {
  const [hoveredOnce, setHoveredOnce] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    if (timerRef.current === null) return

    clearTimeout(timerRef.current)
    timerRef.current = null
  }

  // Sin timers sueltos al desmontar la tarjeta.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const restart = () => {
    if (hoveredOnce) return

    cancel()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setHoveredOnce(true)
    }, HOVER_FETCH_DELAY_MS)
  }

  return {
    hoveredOnce,
    // El mouse entra o se mueve encima (`onMouseEnter`, `onMouseMove`).
    pointerMoved: restart,
    // El mouse sale (`onMouseLeave`).
    pointerLeft: cancel,
    // El foco visible del teclado llegó a la tarjeta.
    focusedWithKeyboard: () => {
      cancel()
      setHoveredOnce(true)
    },
  }
}
