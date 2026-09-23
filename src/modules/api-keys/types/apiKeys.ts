import type { ApiKeyProviderId } from './provider'

/** 'manual' = la pegó el usuario; 'managed' llegará con la membresía (ADR-0011). */
export type ApiKeySource = 'manual' | 'managed'

/** Códigos que emite Rust (`api_keys/error.rs`); la UI los traduce a i18n. */
export type ApiKeyErrorCode =
  | 'keychain_unavailable'
  | 'not_found'
  | 'empty_key'
  | 'invalid_key'
  | 'not_admin'
  | 'network'
  | 'provider_error'
  | 'unknown_provider'
  | 'metadata_store'

export interface ApiKeyStatus {
  providerId: ApiKeyProviderId
  configured: boolean
  source: ApiKeySource
  maskedKey: string | null
  savedAt: number | null
  lastValidatedAt: number | null
}

export interface ValidationResult {
  ok: boolean
  code: ApiKeyErrorCode | null
  /** Saldo leído al validar (Kie.ai y PoYo); null si el proveedor no lo da. */
  credits: number | null
}

/** Intento local: una respuesta anterior no puede validar otra edición. */
export interface ApiKeyValidationAttempt {
  key: string
  revision: number
}

/** Forma del rechazo de un invoke() de este dominio. */
export interface ApiKeyCommandError {
  code: ApiKeyErrorCode
}
