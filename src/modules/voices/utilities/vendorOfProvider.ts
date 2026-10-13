import { VOICE_PROVIDERS_BY_VENDOR } from '@/modules/voices/constants'
import type { VoiceProviderId, VoiceVendorId } from '@pipeline/types/voices.ts'

// DubVoice si el motor no figura en ningún vendor: es el de los ids que ya
// estaban guardados antes de ADR-0024.
export function vendorOfProvider(provider: VoiceProviderId): VoiceVendorId {
  if (VOICE_PROVIDERS_BY_VENDOR.elevenlabs.includes(provider))
    return 'elevenlabs'
  if (VOICE_PROVIDERS_BY_VENDOR.ai33.includes(provider)) return 'ai33'
  return 'dubvoice'
}
