import {
  VOICE_CURVE_CEILING,
  VOICE_CURVE_TIME_CONSTANT,
} from '@/modules/videos/constants'
import type { VoiceProgressView } from '@/modules/videos/types/create'

// Minimax y Edge no informan avance real: se dibuja la curva sintética sobre
// el tiempo transcurrido.
export function voiceProgressPercent(voice: VoiceProgressView | null): number {
  if (!voice) return 0
  if (voice.percent !== null) return voice.percent

  return (
    VOICE_CURVE_CEILING *
    (1 - Math.exp(-voice.elapsedSeconds / VOICE_CURVE_TIME_CONSTANT))
  )
}
