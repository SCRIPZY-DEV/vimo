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
} as const

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
