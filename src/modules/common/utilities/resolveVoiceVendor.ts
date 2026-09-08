import { VOICE_VENDOR_DEFAULT } from '@/modules/common/constants'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

export interface VoiceVendorKeys {
  dubvoice: boolean
  elevenlabs: boolean
}

// Qué proveedor de voces usar (ADR-0024). Una preferencia explícita manda
// aunque falte su clave (la vista avisa qué clave falta); sin preferencia,
// DubVoice salvo que ElevenLabs sea la única clave de voz guardada.
export function resolveVoiceVendor(
  preference: VoiceVendorId | null,
  configured: VoiceVendorKeys,
): VoiceVendorId {
  if (preference) return preference
  if (!configured.dubvoice && configured.elevenlabs) return 'elevenlabs'
  return VOICE_VENDOR_DEFAULT
}
