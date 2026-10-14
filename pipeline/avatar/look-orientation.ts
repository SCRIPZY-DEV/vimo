import {
  AVATAR_LOOK_ORIENTATION_BY_FORMAT,
  type AvatarOrientation,
} from '../types/avatar.ts'
import type { VideoFormat } from '../types/video-format.ts'

// Si un look sirve para el formato del video (ADR-0057, diseño §6.2): HeyGen
// renderiza el look tal cual, con su propio fondo, así que un look vertical no
// llena un video 16:9 ni uno horizontal un 9:16 (y uno cuadrado no llena
// ninguno). Puro y browser-safe, sin `node:*`: lo leen Crear (qué looks ofrece
// y con qué aviso) y `create-video-project` (qué acepta), con la misma regla.
//
//   match     la orientación del look es la del formato
//   unknown   HeyGen no informó la orientación del look: se acepta, con un aviso
//   mismatch  el look tiene otra orientación: no sirve para este formato
export type LookOrientationFit = 'match' | 'unknown' | 'mismatch'

export function lookOrientationFit(
  look: { preferredOrientation?: AvatarOrientation },
  videoFormat: VideoFormat,
): LookOrientationFit {
  if (!look.preferredOrientation) return 'unknown'

  if (
    look.preferredOrientation === AVATAR_LOOK_ORIENTATION_BY_FORMAT[videoFormat]
  )
    return 'match'

  return 'mismatch'
}

// El formato que se muestra en la ficha de un look (entrega 2c, pedido del
// dueño del 2026-10-11: «debe decir el formato del look, 9:16, 16:9 o el que
// tenga»). Manda la orientación que informa HeyGen, que es la que decide en qué
// videos sirve el look (`lookOrientationFit`); sin ella, el formato más
// cercano a las medidas de la imagen; sin ninguna de las dos, null (la ficha
// no muestra formato).
export const AVATAR_LOOK_FORMATS = [
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '5:4',
] as const
export type AvatarLookFormat = (typeof AVATAR_LOOK_FORMATS)[number]

const FORMAT_BY_ORIENTATION: Record<AvatarOrientation, AvatarLookFormat> = {
  landscape: '16:9',
  portrait: '9:16',
  square: '1:1',
}

const FORMAT_RATIOS: Record<AvatarLookFormat, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
  '5:4': 5 / 4,
}

// Una medida de imagen con la que se puede calcular un formato: finita y
// mayor que cero (`Infinity` pasaba el `> 0` y daba 16:9 por cualquier cosa).
function isUsableSize(size: number): boolean {
  return Number.isFinite(size) && size > 0
}

export function lookFormatOf(look: {
  preferredOrientation?: AvatarOrientation
  imageWidth?: number
  imageHeight?: number
}): AvatarLookFormat | null {
  if (look.preferredOrientation)
    return FORMAT_BY_ORIENTATION[look.preferredOrientation]

  const { imageWidth, imageHeight } = look
  if (imageWidth === undefined || imageHeight === undefined) return null
  if (!isUsableSize(imageWidth) || !isUsableSize(imageHeight)) return null

  // El más cercano en escala logarítmica: 16:9 y 9:16 quedan a la misma
  // distancia de 1:1, como corresponde a dos formatos espejados.
  const ratio = Math.log(imageWidth / imageHeight)
  let best: AvatarLookFormat = AVATAR_LOOK_FORMATS[0]
  for (const format of AVATAR_LOOK_FORMATS) {
    const distance = Math.abs(ratio - Math.log(FORMAT_RATIOS[format]))
    const bestDistance = Math.abs(ratio - Math.log(FORMAT_RATIOS[best]))
    if (distance < bestDistance) best = format
  }

  return best
}
