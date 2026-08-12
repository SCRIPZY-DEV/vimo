import { useEffect, useState } from 'react'

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
}

export function useDoodleDraw({
  delayMs = 0,
  loop = false,
  drawnHoldMs = 1800,
  erasedHoldMs = 600,
}: UseDoodleDrawOptions = {}): boolean {
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    let cancelled = false
    const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms))

    if (!loop) {
      const t = setTimeout(() => {
        if (!cancelled) setDrawn(true)
      }, delayMs)
      return () => {
        cancelled = true
        clearTimeout(t)
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
  }, [delayMs, loop, drawnHoldMs, erasedHoldMs])

  return drawn
}
