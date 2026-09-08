import type {
  ApiKeyCategory,
  ApiKeyProviderId,
  ApiKeyRequirement,
} from './types/provider'
import type { ApiKeyErrorCode } from './types/apiKeys'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

export const ApiKeysRoutes = {
  apiKeys: '/api-keys',
} as const

// Query param con los proveedores a enfocar al entrar a Claves API.
export const API_KEYS_FOCUS_PARAM = 'focus'

// Ruta a Claves API que abre en edición las tarjetas de esos proveedores.
export function apiKeysFocusPath(providers: ApiKeyProviderId[]) {
  if (providers.length === 0) return ApiKeysRoutes.apiKeys

  return `${ApiKeysRoutes.apiKeys}?${API_KEYS_FOCUS_PARAM}=${providers.join(',')}`
}

export const apiKeysQueryKeys = {
  status: ['apiKeys', 'status'],
} as const

/** Toda categoría necesita al menos un proveedor configurado para generar. */
export const REQUIRED_CATEGORIES: ApiKeyCategory[] = [
  'llm',
  'image',
  'voice',
  'transcription',
]

// Claves que exige cada módulo. Cada requisito es una lista de alternativas:
// basta con una configurada (Fal o Evolink). Registrar acá el módulo nuevo y
// montar `MissingApiKeysNotice` en su vista (ARCHITECTURE §4).
export const MODULE_API_KEY_REQUIREMENTS = {
  videos: [
    ['deepinfra'],
    ['fal', 'evolink'],
    ['dubvoice', 'elevenlabs'],
    ['deepgram'],
  ],
  music: [['evolink']],
  voices: [['dubvoice', 'elevenlabs']],
  characters: [['fal', 'evolink'], ['deepinfra']],
} satisfies Record<string, ApiKeyRequirement[]>

// Con el proveedor de voces ya elegido (ADR-0024), el aviso apunta a la
// clave de ESE vendor, no a «una de las dos».
export const VOICE_VENDOR_API_KEY_REQUIREMENTS: Record<
  VoiceVendorId,
  ApiKeyRequirement[]
> = {
  dubvoice: [['dubvoice']],
  elevenlabs: [['elevenlabs']],
}

/** Código de error de Rust → clave i18n del mensaje. */
export const API_KEY_ERROR_MESSAGE_KEYS: Record<ApiKeyErrorCode, string> = {
  keychain_unavailable: 'apiKeys.errores.keychainUnavailable',
  not_found: 'apiKeys.errores.notFound',
  empty_key: 'apiKeys.errores.emptyKey',
  invalid_key: 'apiKeys.errores.invalidKey',
  not_admin: 'apiKeys.errores.notAdmin',
  network: 'apiKeys.errores.network',
  provider_error: 'apiKeys.errores.providerError',
  unknown_provider: 'apiKeys.errores.unknownProvider',
  metadata_store: 'apiKeys.errores.metadataStore',
}

export const UNKNOWN_ERROR_MESSAGE_KEY = 'apiKeys.errores.desconocido'
