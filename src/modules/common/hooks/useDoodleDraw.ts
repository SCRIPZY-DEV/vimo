import { useEffect, useRef, useState } from 'react'

/**
 * Hook compartido por todos los doodles para animar el "dibujo a mano".
 *
 * Modo single-shot (default): tras un delay opcional, marca drawn=true UNA
 * vez y queda fijo. Es el comportamiento clásico para iconos de navegación
 * (sidebar, etc.).
 *
 * Modo loop: dibuja → espera → desdibuja → espera → repite. Útil para
 * estados de carga (splash, generación de video, etc.). Comunica "estoy
 * trabajando" sin recurrir a spinners aburridos.
 *
 * Cuando `loop` cambia de true a false, el último frame queda como drawn=true
 * (estable visual al "terminar la carga").
 */
export interface UseDoodleDrawOptions {
  /** Demora antes del primer dibujo (ms). Default 0. */
  delayMs?: number
  /** Si true, repite indefinidamente. Default false. */
  loop?: boolean
  /** Tiempo "completamente dibujado" antes de borrar en cada ciclo (ms). */
  drawnHoldMs?: number
  /** Tiempo "borrado" antes de redibujar en cada ciclo (ms). */
  erasedHoldMs?: number
  /**
   * Duración total del trazo CSS (transition + stagger). El hook no puede
   * medirla: cada doodle la conoce y la pasa junto con `onDrawComplete`.
   */
  drawDurationMs?: number
  /** Avisa cuando el dibujo terminó (solo modo single-shot, requiere drawDurationMs). */
  onDrawComplete?: () => void
}

export function useDoodleDraw({
  delayMs = 0,
  loop = false,
  drawnHoldMs = 1800,
  erasedHoldMs = 600,
  drawDurationMs,
  onDrawComplete,
}: UseDoodleDrawOptions = {}): boolean {
  const [drawn, setDrawn] = useState(false)
  // Ref para que un callback inline no reinicie la animación en cada render.
  const onDrawCompleteRef = useRef(onDrawComplete)

  useEffect(() => {
    onDrawCompleteRef.current = onDrawComplete
  }, [onDrawComplete])

  useEffect(() => {
    let cancelled = false
    const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

    if (!loop) {
      let completeTimer: ReturnType<typeof setTimeout> | undefined
      const t = setTimeout(() => {
        if (cancelled) return
        setDrawn(true)
        if (drawDurationMs === undefined) return
        completeTimer = setTimeout(() => {
          if (!cancelled) onDrawCompleteRef.current?.()
        }, drawDurationMs)
      }, delayMs)
      return () => {
        cancelled = true
        clearTimeout(t)
        if (completeTimer) clearTimeout(completeTimer)
      }
    }

    ;(async () => {
      let primero = true
      while (!cancelled) {
        if (primero) {
          await wait(delayMs)
          primero = false
        }
        if (cancelled) return
        setDrawn(true)
        await wait(drawnHoldMs)
        if (cancelled) return
        setDrawn(false)
        await wait(erasedHoldMs)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [delayMs, loop, drawnHoldMs, erasedHoldMs, drawDurationMs])

  return drawn
}
