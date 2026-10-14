import { useApiKeys } from '@/modules/api-keys/hooks/useApiKeys'
import { resolveVoiceVendor } from '@/modules/common/utilities/resolveVoiceVendor'
import { useVoiceVendorPreference } from '@/modules/settings/hooks/useVoiceVendorPreference'

/**
 * Proveedor de voces EFECTIVO (ADR-0024): la preferencia de Ajustes, o —si no
 * hay— ai33 si tiene clave; si no, DubVoice salvo que ElevenLabs sea la única
 * clave de voz guardada.
 * Es el proveedor POR DEFECTO: Voces y el picker de Crear lo pueden cambiar
 * localmente sin persistir; la preferencia solo se escribe desde Ajustes.
 */
export function useVoiceVendor() {
  const {
    isNative,
    preference,
    isLoading: preferenceLoading,
  } = useVoiceVendorPreference()
  const { statuses, isLoading: keysLoading } = useApiKeys()

  const configured = {
    ai33: statuses.some(
      (status) => status.providerId === 'ai33' && status.configured,
    ),
    dubvoice: statuses.some(
      (status) => status.providerId === 'dubvoice' && status.configured,
    ),
    elevenlabs: statuses.some(
      (status) => status.providerId === 'elevenlabs' && status.configured,
    ),
  }
  const vendor = resolveVoiceVendor(preference, configured)

  return {
    isNative,
    vendor,
    preference,
    isAutomatic: preference === null,
    isLoading: preferenceLoading || keysLoading,
  }
}
