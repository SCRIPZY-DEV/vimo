import { VOICE_PROVIDERS_BY_VENDOR } from '@/modules/voices/constants'
import type { VoiceProviderId, VoiceVendorId } from '@pipeline/types/voices.ts'

export function vendorOfProvider(provider: VoiceProviderId): VoiceVendorId {
  if (VOICE_PROVIDERS_BY_VENDOR.elevenlabs.includes(provider))
    return 'elevenlabs'
  return 'dubvoice'
}
