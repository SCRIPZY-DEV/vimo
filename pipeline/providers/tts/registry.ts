import type { VoiceProviderId } from '../../types/voices.ts'
import { edgeProvider } from './edge.ts'
import { elevenLabsProvider } from './elevenlabs.ts'
import { minimaxProvider } from './minimax.ts'
import type { TtsProvider } from './provider.ts'

// Registro de motores de voz (mismo patrón que CREATE_VIDEO_STAGES): agregar
// un motor es un archivo en providers/tts/ que exporta su TtsProvider más una
// línea acá. Ni los commands ni la stage de narración ramifican por proveedor.
export const TTS_PROVIDERS: Record<VoiceProviderId, TtsProvider> = {
  minimax: minimaxProvider,
  elevenlabs: elevenLabsProvider,
  edge: edgeProvider,
}

// Para los mensajes de payload inválido: la lista sale del registro, no de un
// literal que se olvida de actualizar.
export const TTS_PROVIDER_IDS = Object.keys(TTS_PROVIDERS).join(', ')

export function resolveTtsProvider(
  providerId: string | undefined,
): TtsProvider | null {
  if (!providerId) return null
  if (!Object.hasOwn(TTS_PROVIDERS, providerId)) return null

  return TTS_PROVIDERS[providerId as VoiceProviderId]
}
