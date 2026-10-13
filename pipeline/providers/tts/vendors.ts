import type { ApiKeys } from '../../config/api-keys.ts'
import type { VoiceCreditsResult, VoiceVendorId } from '../../types/voices.ts'
import { getAi33Credits } from './ai33.ts'
import { getDubvoiceAccount } from './dubvoice.ts'
import { getElevenLabsSubscription } from './elevenlabs-direct.ts'

// Lo que es del VENDOR y no del motor: la clave y el saldo. DubVoice comparte
// una cuenta entre sus motores; ElevenLabs directo y ai33 tienen la suya.
export interface TtsVendor {
  id: VoiceVendorId
  apiKeyOf(apiKeys: ApiKeys): string | undefined
  getCredits(apiKey: string, signal?: AbortSignal): Promise<VoiceCreditsResult>
}

export const TTS_VENDORS: Record<VoiceVendorId, TtsVendor> = {
  dubvoice: {
    id: 'dubvoice',
    apiKeyOf(apiKeys) {
      return apiKeys.dubvoice
    },
    getCredits(apiKey, signal) {
      return getDubvoiceAccount(apiKey, signal)
    },
  },
  elevenlabs: {
    id: 'elevenlabs',
    apiKeyOf(apiKeys) {
      return apiKeys.elevenlabs
    },
    getCredits(apiKey, signal) {
      return getElevenLabsSubscription(apiKey, signal)
    },
  },
  ai33: {
    id: 'ai33',
    apiKeyOf(apiKeys) {
      return apiKeys.ai33
    },
    getCredits(apiKey, signal) {
      return getAi33Credits(apiKey, signal)
    },
  },
}

export const TTS_VENDOR_IDS = Object.keys(TTS_VENDORS).join(', ')

export function resolveTtsVendor(
  vendorId: string | undefined,
): TtsVendor | null {
  if (!vendorId) return null
  if (!Object.hasOwn(TTS_VENDORS, vendorId)) return null

  return TTS_VENDORS[vendorId as VoiceVendorId]
}
