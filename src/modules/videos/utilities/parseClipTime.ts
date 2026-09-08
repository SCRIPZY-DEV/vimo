import { CLIP_TIME_INPUT_REGEX } from '@/modules/videos/constants'

// Lee un tiempo tipeado por la persona en los In/Out del panel de escena:
// «mm:ss.cc» (lo que muestra `formatClipTime`), «m:ss», «ss.c» o «ss».
// Devuelve segundos redondeados a milésimas, o null si el texto no es un
// tiempo (con minutos, los segundos van de 0 a 59).
export function parseClipTime(input: string): number | null {
  const match = CLIP_TIME_INPUT_REGEX.exec(input.trim())
  if (!match) return null

  const [, minutesText, secondsText, fractionText] = match
  const minutes = minutesText === undefined ? 0 : Number(minutesText)
  const seconds = Number(secondsText)
  if (minutesText !== undefined && seconds >= 60) return null

  const fraction = fractionText === undefined ? 0 : Number(`0.${fractionText}`)
  return Math.round((minutes * 60 + seconds + fraction) * 1000) / 1000
}
