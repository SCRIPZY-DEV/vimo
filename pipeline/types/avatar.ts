// Contrato del avatar presentador (ADR-0057). Browser-safe: la UI importa
// estos tipos con `import type`, como characters.ts. Las constantes son datos
// del dominio (precios y límites), no configuración.

export const AVATAR_ENGINES = ['avatar_iv', 'avatar_iii', 'avatar_v'] as const
export type AvatarEngine = (typeof AVATAR_ENGINES)[number]

export const AVATAR_LOOK_TYPES = [
  'studio_avatar',
  'digital_twin',
  'photo_avatar',
] as const
export type AvatarLookType = (typeof AVATAR_LOOK_TYPES)[number]

export type AvatarOrientation = 'portrait' | 'landscape' | 'square'

// stock = look público de HeyGen; own = creado desde Vimo (foto) o propio de
// la cuenta de HeyGen del usuario.
export const AVATAR_OWNERSHIPS = ['stock', 'own'] as const
export type AvatarOwnership = (typeof AVATAR_OWNERSHIPS)[number]

// Estado de un avatar en la biblioteca: los de stock nacen listos; uno creado
// desde foto queda «processing» hasta que HeyGen termina de entrenarlo.
export const AVATAR_LIBRARY_STATUSES = [
  'ready',
  'processing',
  'failed',
] as const
export type AvatarLibraryStatus = (typeof AVATAR_LIBRARY_STATUSES)[number]

// Crear un avatar desde una foto (página de precios de HeyGen del 2026-09-16).
export const AVATAR_PHOTO_CREATION_USD = 1.32
export const AVATAR_NAME_LIMIT = 80

// Un look de HeyGen en nuestra forma. `lookId` es el `avatar_id` que se manda
// al pedir un video.
export interface HeyGenLook {
  lookId: string
  name: string
  lookType: AvatarLookType
  groupId?: string
  previewImageUrl?: string
  previewVideoUrl?: string
  gender?: string
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  // Solo en looks privados: cómo va el entrenamiento.
  status?: AvatarLibraryStatus
}

// Un avatar de la biblioteca, como lo ve la UI.
export interface AvatarSummary {
  id: string
  name: string
  // null mientras HeyGen entrena un avatar desde foto y todavía no hay look.
  lookId: string | null
  lookType: AvatarLookType
  ownership: AvatarOwnership
  groupId?: string
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  gender?: string
  status: AvatarLibraryStatus
  errorCode?: string
  // Ruta absoluta para convertFileSrc(); se deriva al listar, no se persiste.
  previewPath?: string
  createdAt: string
}

// ─── Contratos de los subcomandos ───

export interface AvatarsListResult {
  entries: AvatarSummary[]
}

export interface AvatarStockLooksPayload {
  ownership?: 'public' | 'private'
  lookType?: AvatarLookType
  token?: string
}

export interface AvatarStockLooksResult {
  looks: HeyGenLook[]
  nextToken: string | null
}

export interface AvatarAddPayload {
  look: HeyGenLook
  ownership: AvatarOwnership
}

export interface AvatarAddResult {
  entry: AvatarSummary
}

export interface AvatarCreatePhotoPayload {
  name: string
  // Ruta absoluta de la foto elegida con el dialog nativo (JPEG o PNG, hasta
  // MAX_PHOTO_BYTES; HeyGen no acepta WEBP); el sidecar la valida, la copia y
  // la sube.
  photoPath: string
}

export interface AvatarCreatePhotoResult {
  entry: AvatarSummary
}

export interface AvatarRefreshPayload {
  id: string
}

export interface AvatarRefreshResult {
  entry: AvatarSummary
}

export interface AvatarDeletePayload {
  id: string
}
