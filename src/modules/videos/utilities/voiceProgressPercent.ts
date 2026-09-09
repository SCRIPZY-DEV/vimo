import {
  VOICE_CURVE_CEILING,
  VOICE_CURVE_TIME_CONSTANT,
} from '@/modules/videos/constants'
import type { VoiceProgressView } from '@/modules/videos/types/create'

// Minimax y Edge no informan avance real: se dibuja la curva sintética sobre
// el tiempo transcurrido. Con % real se muestra el MAYOR de los dos (origen):
// ambos son monótonos, así que el máximo también — la barra nunca retrocede
// cuando el proveedor informa menos que la curva. El 100 lo pone la fase al
// completar. Con narración troceada el % es el agregado de las partes y va
// tal cual: la curva lo pisaría («parte 2 de 7» con la barra al 80 %).
export function voiceProgressPercent(voice: VoiceProgressView | null): number {
  if (!voice) return 0
  if (voice.partTotal !== null) return Math.min(100, voice.percent ?? 0)

  const synthetic =
    VOICE_CURVE_CEILING *
    (1 - Math.exp(-voice.elapsedSeconds / VOICE_CURVE_TIME_CONSTANT))
  return Math.min(100, Math.max(voice.percent ?? 0, synthetic))
}
