import { Ban, UserCheck, UserX } from 'lucide-react'
import type { AvatarEngine } from '@pipeline/types/avatar.ts'

export const AvatarsRoutes = {
  avatars: '/avatars',
} as const

export const avatarsQueryKeys = {
  list: ['avatars', 'list'],
  stockLooks: ['avatars', 'stockLooks'],
} as const

// Espejo de los límites del sidecar (pipeline/commands/avatars).
export const AVATAR_NAME_LIMIT = 80

// Espejo de AVATAR_PHOTO_CREATION_USD (pipeline/types/avatar.ts): lo único
// de precios que esta pantalla muestra.
export const AVATAR_PHOTO_CREATION_USD = 1.32

// El único motor de HeyGen con el que Vimo genera por ahora: espejo de la
// decisión del dueño del 2026-10-09 (la entrega 2 la lleva al sidecar). Las
// tarjetas muestran solo esta etiqueta, o «No compatible con Vimo» si falta.
export const VIMO_AVATAR_ENGINE = 'avatar_iii' satisfies AvatarEngine

// Los tres puntos de la tarjeta «Antes de crear tu avatar» del diálogo de la
// foto (lo que el proveedor no permite), en el orden en que se leen.
export const PHOTO_CONSENT_POINTS = [
  { labelKey: 'avatars.foto.permisos.propia', Icon: UserCheck },
  { labelKey: 'avatars.foto.permisos.famosos', Icon: UserX },
  { labelKey: 'avatars.foto.permisos.contenido', Icon: Ban },
] as const

// Formatos que ofrece el dialog de la foto; el sidecar valida por magic bytes.
// Sin WEBP a propósito: la subida de assets de HeyGen (`POST /v3/assets`) solo
// acepta JPEG y PNG entre las imágenes.
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png']

// Cada cuántos ms se vuelve a leer la biblioteca mientras HeyGen entrena un
// avatar desde foto (la ficha pasa de «processing» a lista sola).
export const PROCESSING_REFRESH_INTERVAL_MS = 15_000

// Cuánto recuerda el diálogo de stock una página de looks ya leída: cada
// página es un proceso del sidecar contra HeyGen.
export const STOCK_LOOKS_STALE_TIME_MS = 5 * 60_000

// Filtro de tipo del diálogo de stock: todos o uno de los tipos de HeyGen.
export const STOCK_LOOK_TYPE_FILTERS = [
  'all',
  'studio_avatar',
  'digital_twin',
  'photo_avatar',
] as const
export type StockLookTypeFilter = (typeof STOCK_LOOK_TYPE_FILTERS)[number]

// Código de error del sidecar/Rust → clave i18n del mensaje.
export const AVATARS_ERROR_MESSAGE_KEYS: Record<string, string> = {
  avatar_invalid_key: 'avatars.errors.invalidKey',
  avatar_insufficient_credits: 'avatars.errors.insufficientCredits',
  avatar_rate_limited: 'avatars.errors.rateLimited',
  avatar_moderation_rejected: 'avatars.errors.moderationRejected',
  avatar_look_unsupported: 'avatars.errors.lookUnsupported',
  avatar_invalid_request: 'avatars.errors.providerError',
  avatar_provider_error: 'avatars.errors.providerError',
  avatar_network: 'avatars.errors.network',
  avatar_photo_invalid: 'avatars.errors.photoInvalid',
  avatar_not_found: 'avatars.errors.notFound',
  avatar_training_failed: 'avatars.errors.trainingFailed',
  image_download_failed: 'avatars.errors.providerError',
  invalid_payload: 'avatars.errors.invalid',
  missing_api_key: 'avatars.errors.missingApiKey',
  missing_projects_root: 'avatars.errors.missingProjectsRoot',
  cancelled: 'avatars.errors.cancelled',
  sidecar_missing: 'avatars.errors.sidecar',
  sidecar_spawn: 'avatars.errors.sidecar',
  sidecar_write: 'avatars.errors.sidecar',
}

export const UNKNOWN_AVATARS_ERROR_KEY = 'avatars.errors.unknown'
