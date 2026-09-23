// Regla exacta compartida por render y preview, sin APIs de Node. Se utiliza
// el clip completo cambiando velocidad:4s en3s exige4/3, nunca1,25. Solo un
// fragmento menor de3s (borde de minuto o proyecto muy corto) usa su inicio
// a velocidad normal: acelerar4s en0,2s produciría un salto de movimiento20×.
// Los activos nuevos llegan físicamente normalizados y su rate es1.

import { MIN_ANIMATION_SLOT_SECONDS } from '../types/video-provider.ts'

export type ClipFit = 'speed' | 'cut'

export interface ClipNormalization {
  fit: ClipFit
  rate: number
  usedSeconds: number
}

export function normalizeClipToSlot(
  clipSeconds: number,
  slotSeconds: number,
): ClipNormalization {
  if (
    !Number.isFinite(clipSeconds) ||
    !Number.isFinite(slotSeconds) ||
    clipSeconds <= 0 ||
    slotSeconds <= 0
  )
    return { fit: 'speed', rate: 1, usedSeconds: clipSeconds }

  const rate = clipSeconds / slotSeconds
  if (slotSeconds < MIN_ANIMATION_SLOT_SECONDS && rate > 1)
    return { fit: 'cut', rate: 1, usedSeconds: slotSeconds }
  return { fit: 'speed', rate, usedSeconds: clipSeconds }
}
