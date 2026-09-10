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
} as const

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
