import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  API_KEY_ERROR_MESSAGE_KEYS,
  UNKNOWN_ERROR_MESSAGE_KEY,
} from '../constants'
import type { ApiKeyStatus, ValidationResult } from '../types/apiKeys'
import type { ApiKeyProviderId } from '../types/provider'

/** El rechazo de un invoke de este dominio trae `{ code }` (ADR-0011). */
function isCommandError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  )
}

/**
 * Única capa del módulo que toca invoke() y el plugin opener, igual que una
 * llamada HTTP se envolvería acá. Las claves viajan una sola vez (al guardar)
 * y nunca vuelven al webview: el estado llega enmascarado desde Rust.
 * Futuro web: estos mismos métodos resuelven a fetch() (dual de ADR-0007).
 */
export const apiKeysApi = {
  isNative() {
    return isNative()
  },
  async getStatus(): Promise<ApiKeyStatus[]> {
    return invoke('get_api_keys_status')
  },
  async save(providerId: ApiKeyProviderId, key: string): Promise<void> {
    return invoke('save_api_key', { providerId, key })
  },
  async validate(
    providerId: ApiKeyProviderId,
    key?: string,
  ): Promise<ValidationResult> {
    return invoke('validate_api_key', { providerId, key: key ?? null })
  },
  async remove(providerId: ApiKeyProviderId): Promise<void> {
    return invoke('delete_api_key', { providerId })
  },
  async openProviderPage(url: string): Promise<void> {
    if (!isNative()) {
      window.open(url, '_blank', 'noreferrer')
      return
    }
    return openUrl(url)
  },
  errorMessageKey(error: unknown): string {
    if (!isCommandError(error)) return UNKNOWN_ERROR_MESSAGE_KEY
    const code = error.code as keyof typeof API_KEY_ERROR_MESSAGE_KEYS
    return API_KEY_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_ERROR_MESSAGE_KEY
  },
}
