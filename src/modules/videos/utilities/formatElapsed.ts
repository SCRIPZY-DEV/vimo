// Tiempos de la pantalla de progreso (port de Cronometro.tsx y de
// formatearSegundos del origen). El reloj no rellena con ceros: el origen
// muestra «0m 19s» y «3m 36s», no «03:36».
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

// Tramos cortos de los paneles de voz y música: «12s», «1m 05s».
export function formatSecondsShort(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds)
  if (whole < 60) return `${whole}s`
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}
