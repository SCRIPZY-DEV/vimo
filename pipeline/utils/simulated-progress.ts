// Avance simulado para lo que no informa progreso: Fal no expone el estado de
// una generación en vuelo y el LLM que escribe un prompt tampoco. Estimación
// honesta elapsed/expected con techo (el 100 lo pone quien termina de verdad),
// para que ninguna casilla se quede quieta. Un solo reloj para las lanes del
// pipeline, las muestras de estilo y el preview de personaje: todas las
// grillas suben al mismo ritmo.
const SIMULATED_PROGRESS_TICK_MS = 500
const SIMULATED_PROGRESS_CAP_PERCENT = 95

export function simulatedPercent(
  startedAt: number,
  expectedMs: number,
): number {
  return Math.min(
    SIMULATED_PROGRESS_CAP_PERCENT,
    Math.floor(((Date.now() - startedAt) / expectedMs) * 100),
  )
}

// Avisa cada tick con el porcentaje estimado desde `startedAt` (un reintento
// que conserva el reloj sigue subiendo en vez de volver a 0). Devuelve la
// función que detiene el reloj: llamarla siempre, en un `finally`.
export function startSimulatedProgress(
  startedAt: number,
  expectedMs: number,
  onTick: (percent: number) => void,
): () => void {
  const timer = setInterval(
    () => onTick(simulatedPercent(startedAt, expectedMs)),
    SIMULATED_PROGRESS_TICK_MS,
  )
  return () => clearInterval(timer)
}
