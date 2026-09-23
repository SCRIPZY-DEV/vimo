import type { VoiceVendorId } from '@pipeline/types/voices.ts'

export const CommonRoutesPaths = {
  notFound: '*',
} as const

export const TOAST_LIMIT = 1
export const TOAST_REMOVE_DELAY = 1000000

// Espera antes de mostrar un tooltip: los 700 ms de Radix se sentían lentos.
export const TOOLTIP_DELAY_MS = 300

export const commonQueryKeys = {
  promptModels: ['common', 'promptModels'],
  imageCredits: ['common', 'imageCredits'],
  videoCredits: ['common', 'videoCredits'],
} as const

// Bloqueo temporal de un proveedor de animación que el sidecar dio por caído
// (evento animation-provider-trouble, ADR-0040). Mismo criterio que los
// modelos de prompts: estado transitorio con vencimiento en localStorage,
// no una preferencia. Más corto que el de los modelos porque ningún
// proveedor publica cuándo vuelve y probar de nuevo cuesta un solo encargo.
export const ANIMATION_PROVIDER_BLOCKS_STORAGE_KEY =
  'vimo:animationProviderBlocks:v1'
export const ANIMATION_PROVIDER_BLOCK_DURATION_MS = 30 * 60 * 1000

// Bloqueo temporal de un modelo de prompts que se trabó o falló (carril
// verbatim). Vive en localStorage y no en settings.json: es estado transitorio
// con vencimiento, no una preferencia (ADR-0028).
export const PROMPT_MODEL_BLOCKS_STORAGE_KEY = 'vimo:promptModelBlocks:v1'
export const PROMPT_MODEL_BLOCK_DURATION_MS = 60 * 60 * 1000
// Cada cuánto se refresca el «vuelve en N min» de las tarjetas bloqueadas.
export const PROMPT_MODEL_BLOCK_TICK_MS = 60 * 1000

// El proveedor de imágenes tarda unos segundos en reflejar el gasto: el
// refetch de saldos tras una generación se difiere (mismo criterio que el
// origen).
export const CREDITS_REFRESH_DELAY_MS = 4000

// Códigos del saldo (get-image-credits) que para la persona significan una
// sola cosa: falta configurar la clave — no hay clave, o el proveedor la
// rechazó (Fal responde 401/403 también cuando la clave no es de admin;
// Evolink, cuando es inválida). Cualquier otro código es un error de red o
// del proveedor y se muestra como tal.
export const NOT_CONFIGURED_CREDITS_CODES: ReadonlySet<string> = new Set([
  'missing_api_key',
  'fal_admin_key_required',
  'music_invalid_api_key',
  'animation_invalid_api_key',
])

// Proveedores de voces (ADR-0024). Etiquetas de marca: no se traducen.
export const VOICE_VENDOR_IDS = ['dubvoice', 'elevenlabs'] as const
export const VOICE_VENDOR_LABELS: Record<VoiceVendorId, string> = {
  dubvoice: 'DubVoice',
  elevenlabs: 'ElevenLabs',
}
export const VOICE_VENDOR_DEFAULT: VoiceVendorId = 'dubvoice'

// Desde cuántos caracteres un texto a narrar merece el aviso de «puede
// tardar» (Voces y Crear): a partir de acá el sidecar lo sintetiza en varias
// partes o en un job largo.
export const LONG_TEXT_WARNING_THRESHOLD = 10_000
