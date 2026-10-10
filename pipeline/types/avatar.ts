// Contrato del avatar presentador (ADR-0057). Browser-safe: la UI importa
// estos tipos con `import type`, como characters.ts. Las constantes son datos
// del dominio (precios y límites), no configuración.

export const AVATAR_ENGINES = ['avatar_iv', 'avatar_iii', 'avatar_v'] as const
export type AvatarEngine = (typeof AVATAR_ENGINES)[number]

// El único motor con el que Vimo usa los avatares por ahora (decisión del
// dueño del 2026-10-09): el look principal de un avatar tiene que soportarlo.
export const AVATAR_DEFAULT_ENGINE: AvatarEngine = 'avatar_iii'

export const AVATAR_LOOK_TYPES = [
  'studio_avatar',
  'digital_twin',
  'photo_avatar',
] as const
export type AvatarLookType = (typeof AVATAR_LOOK_TYPES)[number]

export type AvatarOrientation = 'portrait' | 'landscape' | 'square'

// Género normalizado de un avatar. HeyGen lo manda como `male` / `female` en el
// stock público y como `Man` / `Woman` en los avatares propios (o no lo manda):
// `toAvatarGender` (providers/avatar/heygen.ts) lo lleva a estos dos valores y
// descarta el resto.
export const AVATAR_GENDERS = ['male', 'female'] as const
export type AvatarGender = (typeof AVATAR_GENDERS)[number]

// stock = avatar público de HeyGen; own = creado desde Vimo (foto) o propio de
// la cuenta de HeyGen del usuario.
export const AVATAR_OWNERSHIPS = ['stock', 'own'] as const
export type AvatarOwnership = (typeof AVATAR_OWNERSHIPS)[number]

// Estado de un avatar (o de uno de sus looks) en la biblioteca: los de stock
// nacen listos; uno creado desde foto, o un look generado con un prompt, queda
// «processing» hasta que HeyGen termina.
export const AVATAR_LIBRARY_STATUSES = [
  'ready',
  'processing',
  'failed',
] as const
export type AvatarLibraryStatus = (typeof AVATAR_LIBRARY_STATUSES)[number]

// Crear un avatar desde una foto (página de precios de HeyGen del 2026-09-16).
export const AVATAR_PHOTO_CREATION_USD = 1.32
export const AVATAR_NAME_LIMIT = 80

// Formatos con los que HeyGen genera un look desde un prompt
// (`PromptAvatarAspectRatio` de la OpenAPI v3): `auto` deja que lo elija, igual
// al de la imagen de referencia si la hay.
export const AVATAR_ASPECT_RATIOS = [
  'auto',
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '5:4',
] as const
export type AvatarAspectRatio = (typeof AVATAR_ASPECT_RATIOS)[number]

// Topes de un look generado desde un prompt (`maxLength` del prompt y
// `maxItems` de las imágenes de referencia en la OpenAPI v3).
export const AVATAR_PROMPT_LIMIT = 1000
export const AVATAR_REFERENCE_IMAGES_MAX = 3

// Previews de looks que se bajan a disco por avatar (principal + los de la tarjeta).
export const AVATAR_CARD_LOOK_PREVIEWS = 3

// HeyGen no publica el precio por look generado (2026-10-09): null = la UI no promete cifra.
export const AVATAR_LOOK_GENERATION_USD: number | null = null

// De dónde salió un look de la biblioteca: `vimo` = generado desde Vimo con un
// prompt; `heygen` = venía del grupo (el stock, la foto o la app de HeyGen).
export const AVATAR_LOOK_ORIGINS = ['heygen', 'vimo'] as const
export type AvatarLookOrigin = (typeof AVATAR_LOOK_ORIGINS)[number]

// Un look de HeyGen en nuestra forma. `lookId` es el `avatar_id` que se manda
// al pedir un video.
export interface HeyGenLook {
  lookId: string
  name: string
  lookType: AvatarLookType
  groupId?: string
  previewImageUrl?: string
  previewVideoUrl?: string
  gender?: AvatarGender
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  // Solo en looks privados: cómo va el entrenamiento.
  status?: AvatarLibraryStatus
}

// Un avatar de HeyGen como grupo de looks (`GET /v3/avatars`). `looksCount` es
// cuántas variaciones tiene; los looks se piden aparte por `groupId`.
export interface HeyGenAvatarGroup {
  groupId: string
  name: string
  previewImageUrl?: string
  previewVideoUrl?: string
  gender?: AvatarGender
  looksCount: number
  // Solo en grupos privados: cómo va el entrenamiento (mismo mapeo que los looks).
  status?: AvatarLibraryStatus
}

// Un look dentro de un avatar de la biblioteca.
export interface AvatarLookSummary {
  lookId: string
  name: string
  lookType: AvatarLookType
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  status: AvatarLibraryStatus
  // vimo = generado desde Vimo con un prompt; heygen = venía del grupo.
  origin: AvatarLookOrigin
  // Ruta absoluta de la vista previa en disco; se deriva al listar, no se persiste.
  previewPath?: string
  createdAt: string
}

// Un avatar de la biblioteca = un grupo de HeyGen con sus looks. El look
// principal es `looks.find((look) => look.lookId === mainLookId)`.
export interface AvatarSummary {
  id: string
  name: string
  groupId: string
  ownership: AvatarOwnership
  gender?: AvatarGender
  // ready = hay un look principal listo; processing = entrena (foto) o ningún look listo
  // todavía; failed = la creación falló (errorCode).
  status: AvatarLibraryStatus
  errorCode?: string
  mainLookId: string | null
  looks: AvatarLookSummary[]
  // Vista previa del avatar: la del look principal, o la foto subida mientras entrena.
  previewPath?: string
  createdAt: string
  syncedAt?: string
}

// ─── Contratos de los subcomandos ───

export interface AvatarsListResult {
  entries: AvatarSummary[]
}

export interface AvatarStockGroupsPayload {
  ownership?: 'public' | 'private'
  token?: string
}

export interface AvatarStockGroupsResult {
  groups: HeyGenAvatarGroup[]
  nextToken: string | null
}

export interface AvatarStockLooksPayload {
  ownership?: 'public' | 'private'
  lookType?: AvatarLookType
  // Solo los looks de ese avatar (grupo); sin él, los de todo el listado.
  groupId?: string
  token?: string
}

export interface AvatarStockLooksResult {
  looks: HeyGenLook[]
  nextToken: string | null
}

export interface AvatarAddPayload {
  groupId: string
  // stock → HeyGen ownership public; own → private.
  ownership: AvatarOwnership
  // Si falta (o no sirve): el primer look listo compatible con AVATAR_DEFAULT_ENGINE.
  mainLookId?: string
  // Del listado de grupos: `GET /v3/avatars/{id}` de un grupo público no trae gender.
  gender?: AvatarGender
  // Nombre del avatar en el listado, solo para la fila del log de soporte
  // (`diagnostics/subject.rs` lee `name`): el sidecar no lo usa, el nombre que
  // guarda es el que da HeyGen al leer el grupo.
  name?: string
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

export interface AvatarSetMainLookPayload {
  id: string
  lookId: string
}

export interface AvatarSetMainLookResult {
  entry: AvatarSummary
}

export interface AvatarGenerateLookPayload {
  id: string
  // 1..AVATAR_PROMPT_LIMIT caracteres tras quitar los espacios de las puntas.
  prompt: string
  aspectRatio: AvatarAspectRatio
  // Rutas absolutas de hasta AVATAR_REFERENCE_IMAGES_MAX fotos (JPEG/PNG ≤ MAX_PHOTO_BYTES).
  referenceImagePaths?: string[]
  // Nombre del look; si falta: `<avatar.name> · <n>`.
  name?: string
}

export interface AvatarGenerateLookResult {
  entry: AvatarSummary
  lookId: string
}

// Saldo de HeyGen para la vista Avatares. Mismo molde que ProviderCreditsStatus
// (pipeline/types/video-project.ts) sin `unlimited`, que HeyGen no tiene. Lo
// muestra la píldora `AvatarBalanceBadge` del módulo de avatares, que formatea
// por moneda (`usd` en dólares; otra, como créditos).
export interface AvatarBalanceResult {
  available: boolean
  remaining?: number
  // `usd` en la billetera verificada (2026-10-09); la OpenAPI admite también
  // `credits`, que no es una moneda.
  currency?: string
  // Con available false, por qué: missing_api_key, avatar_invalid_key,
  // avatar_balance_unavailable (cuenta sin billetera legible)…
  errorCode?: string
}

export interface AvatarDeletePayload {
  id: string
}
