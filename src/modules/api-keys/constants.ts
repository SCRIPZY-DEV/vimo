import type { ApiKeyCategory } from './types/provider'
import type { ApiKeyErrorCode } from './types/apiKeys'

export const ApiKeysRoutes = {
  apiKeys: '/api-keys',
} as const

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
  voices: [['dubvoice']],
  characters: [['fal', 'evolink'], ['deepinfra']],
} satisfies Record<string, ApiKeyRequirement[]>

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
