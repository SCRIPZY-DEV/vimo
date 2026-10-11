// Qué hace el visor con un clip que se desvió del reloj mientras avanza:
// adelantarlo si quedó atrás más que la tolerancia, esperarlo si quedó
// adelante (corregirlo hacia atrás repetiría el movimiento) o seguir.
export type ClipDriftAction = 'seek' | 'hold' | 'keep'

export function clipDriftAction(
  differenceSeconds: number,
  toleranceSeconds: number,
): ClipDriftAction {
  if (differenceSeconds > toleranceSeconds) return 'seek'
  if (differenceSeconds < -toleranceSeconds) return 'hold'

  return 'keep'
}
