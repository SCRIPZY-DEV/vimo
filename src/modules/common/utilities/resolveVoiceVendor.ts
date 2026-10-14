import { VOICE_VENDOR_DEFAULT } from '@/modules/common/constants'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

export interface VoiceVendorKeys {
  ai33: boolean
  dubvoice: boolean
  elevenlabs: boolean
}

// Qué proveedor de voces usar (ADR-0024, ADR-0053). Una preferencia
// explícita manda aunque falte su clave (la vista avisa qué clave falta); sin
// preferencia, ai33 si tiene clave (DubVoice queda de respaldo), y si no
// DubVoice salvo que ElevenLabs sea la única clave de voz guardada.
export function resolveVoiceVendor(
  preference: VoiceVendorId | null,
  configured: VoiceVendorKeys,
): VoiceVendorId {
  if (preference) return preference
  if (configured.ai33) return 'ai33'
  if (!configured.dubvoice && configured.elevenlabs) return 'elevenlabs'
  return VOICE_VENDOR_DEFAULT
}
