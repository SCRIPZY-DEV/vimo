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
