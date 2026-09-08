// Tiempo de un clip como mm:ss.cc («00:02.97»): el formato de los In/Out del
// panel de escena del editor de origen. Centésimas redondeadas.
export function formatClipTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00'

  const totalCentiseconds = Math.round(seconds * 100)
  const minutes = Math.floor(totalCentiseconds / 6000)
  const wholeSeconds = Math.floor((totalCentiseconds % 6000) / 100)
  const centiseconds = totalCentiseconds % 100

  return `${pad(minutes)}:${pad(wholeSeconds)}.${pad(centiseconds)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
