import {
  failureDetails,
  PipelineFailure,
  toPipelineFailure,
} from '../../runner/failure.ts'
import { AVATAR_ENGINES, AVATAR_LOOK_TYPES } from '../../types/avatar.ts'
import type {
  AVATAR_EXPRESSIVE_LEVEL,
  AvatarAspectRatio,
  AvatarBalanceResult,
  AvatarEngine,
  AvatarGender,
  AvatarLibraryStatus,
  AvatarLookType,
  HeyGenAvatarGroup,
  HeyGenLook,
} from '../../types/avatar.ts'
import type { VideoFormat } from '../../types/video-format.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { sleep } from '../../utils/sleep.ts'
import {
  HEYGEN_PROVIDER,
  HeyGenFailure,
  heygenFailure,
} from './heygen-errors.ts'

// Cliente REST v3 de HeyGen (ADR-0057). Sin SDK oficial: `fetch` con la clave
// del usuario en `X-Api-Key`, timeout por pedido y reintento solo ante 429.
// Un 200 con un cuerpo que no es el esperado nunca sale como TypeError: es
// `avatar_provider_error`, con el proveedor y el status para el diagnóstico.
export const HEYGEN_BASE_URL = 'https://api.heygen.com'
export const HEYGEN_LOOKS_PAGE_LIMIT = 50
export const HEYGEN_GROUPS_PAGE_LIMIT = 50
const REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000
const RATE_LIMIT_MAX_RETRIES = 3
// La cuenta no tiene una billetera con saldo legible (un plan de suscripción, o
// un número que no sirve): la vista muestra «saldo no disponible». La clave,
// en cambio, sirvió: HeyGen respondió.
export const BALANCE_UNAVAILABLE_CODE = 'avatar_balance_unavailable'
// Sin moneda en la billetera, el saldo de la API es prepago en dólares (sonda
// del 2026-10-09: `billing_type: 'wallet'`, `currency: 'usd'`).
const DEFAULT_BALANCE_CURRENCY = 'usd'
const CURRENCY_PATTERN = /^[a-z]+$/i
// Render de una aparición del avatar (diseño §7.1): resolución y contenedor
// fijos; los dos entran en la huella del pedido (pipeline/avatar/fingerprint.ts).
export const HEYGEN_VIDEO_RESOLUTION = '1080p'
export const HEYGEN_VIDEO_OUTPUT_FORMAT = 'mp4'
// `GET /v3/videos` admite hasta 100 por página (OpenAPI v3).
export const HEYGEN_VIDEOS_PAGE_LIMIT = 100
// Un POST con la misma Idempotency-Key mientras el original sigue en vuelo
// recibe `409 request_in_progress`: se espera y se repite el MISMO pedido
// (diseño §14), tres veces, con 2, 4 y 8 s de espera.
const IN_PROGRESS_MAX_RETRIES = 3
const IN_PROGRESS_BASE_DELAY_MS = 2000
// `Idempotency-Key` que HeyGen acepta (OpenAPI v3): de 1 a 255 caracteres de
// este alfabeto.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{1,255}$/
// Estados de un render de HeyGen en los de Vimo. `waiting` es lo que devuelve
// el POST antes del primer `pending`: para Vimo es lo mismo. Un Map, no un
// objeto: un estado como `constructor` no puede colarse por el prototipo.
const VIDEO_STATUSES = new Map<string, HeyGenVideoStatus>([
  ['waiting', 'pending'],
  ['pending', 'pending'],
  ['processing', 'processing'],
  ['completed', 'completed'],
  ['failed', 'failed'],
])

export interface HeyGenListLooksParams {
  ownership?: 'public' | 'private'
  lookType?: AvatarLookType
  groupId?: string
  token?: string
}

export interface HeyGenLooksPage {
  looks: HeyGenLook[]
  nextToken: string | null
}

export interface HeyGenListGroupsParams {
  ownership?: 'public' | 'private'
  token?: string
}

export interface HeyGenGroupsPage {
  groups: HeyGenAvatarGroup[]
  nextToken: string | null
}

export interface HeyGenCreatePhotoAvatarInput {
  name: string
  assetId: string
  // Misma foto y nombre → misma clave: HeyGen responde lo mismo 24 h y no
  // cobra dos veces si la respuesta se perdió.
  idempotencyKey: string
}

export interface HeyGenCreatePromptLookInput {
  name: string
  prompt: string
  // El look de referencia visual (el principal del avatar) y el grupo donde
  // HeyGen guarda el look nuevo.
  avatarId: string
  groupId: string
  referenceAssetIds: string[]
  aspectRatio: AvatarAspectRatio
  // Mismo pedido → misma clave: HeyGen repite la respuesta 24 h y no cobra dos
  // veces si se perdió.
  idempotencyKey: string
}

export interface HeyGenCreatedAvatar {
  // HeyGen puede devolver el look ya creado o solo el grupo (look pendiente).
  look: HeyGenLook | null
  groupId: string | null
}

export type HeyGenVideoStatus =
  'pending' | 'processing' | 'completed' | 'failed'

// Un render de HeyGen en nuestra forma (`VideoDetail` de la OpenAPI v3).
export interface HeyGenVideo {
  videoId: string
  title?: string
  status: HeyGenVideoStatus
  // URL prefirmada del mp4: vence; se vuelve a pedir con `getVideo`.
  videoUrl?: string
  durationSeconds?: number
  // Solo en un render `failed`: el código y el texto de HeyGen, tal cual.
  failureCode?: string
  failureMessage?: string
}

// Un render de una aparición del avatar. Sin fondo: el clip ES la escena, con
// el fondo propio del look (decisión del dueño del 2026-10-10).
export interface HeyGenCreateVideoInput {
  // El look (`avatar_id` para HeyGen) y el motor con el que se renderiza.
  lookId: string
  engine: AvatarEngine
  // El WAV del tramo, ya subido con `uploadAsset`.
  audioAssetId: string
  // El formato del proyecto: HeyGen renderiza el look en ese cuadro.
  aspectRatio: VideoFormat
  // `<nombre del video> · <marca>` (la marca sola, sin nombre), con la marca
  // `vimo:<proyecto>:scene-<id>:<hash8>` siempre entera y al final: con ella se
  // recupera un pedido sin respuesta (diseño §7.1).
  title: string
  // Mismo pedido → misma clave: HeyGen repite la respuesta 24 h y no cobra dos veces.
  idempotencyKey: string
  // El movimiento (entrega 2e, §21.2): viajan solo cuando vienen, y solo vienen
  // si el motor y el look los admiten (`avatarRequestMotion`, lane.ts). Sin
  // ellos el cuerpo es el de antes de la 2e, byte a byte.
  motionPrompt?: string
  expressiveness?: typeof AVATAR_EXPRESSIVE_LEVEL
}

export interface HeyGenListVideosParams {
  // Quien busca pasa el título guardado (una página: sirve aunque HeyGen filtre
  // por igualdad o por prefijo) o la MARCA (según la OpenAPI el filtro es por
  // substring y devuelve también las copias y los renders con otro nombre
  // delante). La elección la hace quien busca (`findOwnVideo`, lane.ts):
  // primero el título exacto que salió y, sin él, el que termina en la marca y
  // no está `failed`.
  title?: string
  token?: string
}

// Un render de `GET /v3/videos`. Sin `status` si HeyGen mandó uno que Vimo no
// conoce: la recuperación por título solo necesita el id y el título, y
// descartarlo sería darlo por inexistente y repetir el pedido.
export interface HeyGenListedVideo extends Omit<HeyGenVideo, 'status'> {
  status?: HeyGenVideoStatus
}

export interface HeyGenVideosPage {
  videos: HeyGenListedVideo[]
  nextToken: string | null
}

export interface HeyGenClient {
  listGroups(params: HeyGenListGroupsParams): Promise<HeyGenGroupsPage>
  getGroup(groupId: string): Promise<HeyGenAvatarGroup>
  listLooks(params: HeyGenListLooksParams): Promise<HeyGenLooksPage>
  getLook(lookId: string): Promise<HeyGenLook>
  getBalance(): Promise<AvatarBalanceResult>
  uploadAsset(bytes: Buffer, fileName: string, mime: string): Promise<string>
  createPhotoAvatar(
    input: HeyGenCreatePhotoAvatarInput,
  ): Promise<HeyGenCreatedAvatar>
  createPromptLook(
    input: HeyGenCreatePromptLookInput,
  ): Promise<HeyGenCreatedAvatar>
  createVideo(input: HeyGenCreateVideoInput): Promise<string>
  getVideo(videoId: string): Promise<HeyGenVideo>
  listVideos(params: HeyGenListVideosParams): Promise<HeyGenVideosPage>
  // Borra para siempre un avatar propio (el grupo con todos sus looks). Un
  // grupo que HeyGen ya no tiene cuenta como borrado.
  deleteGroup(groupId: string): Promise<void>
}

interface RawLook {
  id?: unknown
  name?: unknown
  avatar_type?: unknown
  group_id?: unknown
  preview_image_url?: unknown
  preview_video_url?: unknown
  gender?: unknown
  supported_api_engines?: unknown
  preferred_orientation?: unknown
  image_width?: unknown
  image_height?: unknown
  status?: unknown
}

interface RawGroup {
  id?: unknown
  name?: unknown
  preview_image_url?: unknown
  preview_video_url?: unknown
  gender?: unknown
  looks_count?: unknown
  status?: unknown
}

interface RawPage {
  data?: unknown
  has_more?: unknown
  next_token?: unknown
}

interface RawWallet {
  currency?: unknown
  remaining_balance?: unknown
}

interface RawVideo {
  id?: unknown
  title?: unknown
  status?: unknown
  video_url?: unknown
  duration?: unknown
  failure_code?: unknown
  failure_message?: unknown
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// Un conteo de la API: entero ≥ 0, o 0 si falta o no es un número válido.
function toCount(value: unknown): number {
  if (typeof value !== 'number') return 0
  if (!Number.isInteger(value) || value < 0) return 0
  return value
}

// Una medida de imagen de la API: un entero mayor que cero.
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

// Un status de una respuesta que HeyGen aceptó (2xx).
function isSuccessStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 300
}

// Género de HeyGen → género de Vimo. El stock público lo manda como `male` /
// `female` y los avatares propios como `Man` / `Woman` (sin distinguir
// mayúsculas); cualquier otra cosa, o su ausencia, queda sin género.
export function toAvatarGender(raw: unknown): AvatarGender | undefined {
  if (typeof raw !== 'string') return undefined
  const value = raw.toLowerCase()
  if (value === 'male' || value === 'man') return 'male'
  if (value === 'female' || value === 'woman') return 'female'
  return undefined
}

// Estado de entrenamiento de HeyGen → estado de la biblioteca. `pending_consent`
// cuenta como «procesando»: no es un fallo, es HeyGen esperando al usuario.
function toLibraryStatus(value: unknown): AvatarLibraryStatus | undefined {
  if (value === 'completed') return 'ready'
  if (value === 'failed') return 'failed'
  if (value === 'processing' || value === 'pending_consent') return 'processing'
  return undefined
}

// Un look de la API en nuestra forma; null si le falta lo mínimo (id, nombre
// y un tipo conocido). Los motores desconocidos se descartan. Las medidas de
// la imagen van de a par: las dos enteras y positivas, o ninguna (una sola no
// dice el formato del look, `lookFormatOf`).
export function toHeyGenLook(raw: unknown): HeyGenLook | null {
  if (!raw || typeof raw !== 'object') return null
  const look = raw as RawLook
  const lookId = asString(look.id)
  const name = asString(look.name)
  const lookType = AVATAR_LOOK_TYPES.find((type) => type === look.avatar_type)
  if (!lookId || !name || !lookType) return null

  const supportedEngines = Array.isArray(look.supported_api_engines)
    ? look.supported_api_engines.filter((engine): engine is AvatarEngine =>
        AVATAR_ENGINES.includes(engine as AvatarEngine),
      )
    : []
  const result: HeyGenLook = { lookId, name, lookType, supportedEngines }
  const groupId = asString(look.group_id)
  if (groupId) result.groupId = groupId
  const previewImageUrl = asString(look.preview_image_url)
  if (previewImageUrl) result.previewImageUrl = previewImageUrl
  const previewVideoUrl = asString(look.preview_video_url)
  if (previewVideoUrl) result.previewVideoUrl = previewVideoUrl
  const gender = toAvatarGender(look.gender)
  if (gender) result.gender = gender
  const orientation = look.preferred_orientation
  if (
    orientation === 'portrait' ||
    orientation === 'landscape' ||
    orientation === 'square'
  )
    result.preferredOrientation = orientation
  if (
    isPositiveInteger(look.image_width) &&
    isPositiveInteger(look.image_height)
  ) {
    result.imageWidth = look.image_width
    result.imageHeight = look.image_height
  }
  const status = toLibraryStatus(look.status)
  if (status) result.status = status

  return result
}

// Un avatar (grupo de looks) de la API en nuestra forma; null si le falta lo
// mínimo (id y nombre). Un `looks_count` que no es un entero ≥ 0 cuenta como 0;
// las vistas previas, el género y el estado se omiten si no tienen forma
// conocida.
export function toHeyGenAvatarGroup(raw: unknown): HeyGenAvatarGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const group = raw as RawGroup
  const groupId = asString(group.id)
  const name = asString(group.name)
  if (!groupId || !name) return null

  const result: HeyGenAvatarGroup = {
    groupId,
    name,
    looksCount: toCount(group.looks_count),
  }
  const previewImageUrl = asString(group.preview_image_url)
  if (previewImageUrl) result.previewImageUrl = previewImageUrl
  const previewVideoUrl = asString(group.preview_video_url)
  if (previewVideoUrl) result.previewVideoUrl = previewVideoUrl
  const gender = toAvatarGender(group.gender)
  if (gender) result.gender = gender
  const status = toLibraryStatus(group.status)
  if (status) result.status = status

  return result
}

// Un render de la API en nuestra forma; null sin id o con un estado que Vimo
// no conoce. La duración solo si es un número finito y positivo.
export function toHeyGenVideo(raw: unknown): HeyGenVideo | null {
  if (!raw || typeof raw !== 'object') return null
  const video = raw as RawVideo
  const videoId = asString(video.id)
  const status =
    typeof video.status === 'string'
      ? VIDEO_STATUSES.get(video.status)
      : undefined
  if (!videoId || !status) return null

  const result: HeyGenVideo = { videoId, status }
  const title = asString(video.title)
  if (title) result.title = title
  const videoUrl = asString(video.video_url)
  if (videoUrl) result.videoUrl = videoUrl
  if (
    typeof video.duration === 'number' &&
    Number.isFinite(video.duration) &&
    video.duration > 0
  )
    result.durationSeconds = video.duration
  const failureCode = asString(video.failure_code)
  if (failureCode) result.failureCode = failureCode
  const failureMessage = asString(video.failure_message)
  if (failureMessage) result.failureMessage = failureMessage

  return result
}

// Un render de un listado en nuestra forma: el de `toHeyGenVideo` o, si su
// estado no es uno que Vimo conoce (los listados de HeyGen usan otros, como
// `queued`), solo su id y su título, sin estado. Sin id, o sin estado conocido
// y sin título, no hay render.
export function toListedVideo(raw: unknown): HeyGenListedVideo | null {
  const known = toHeyGenVideo(raw)
  if (known) return known

  if (!raw || typeof raw !== 'object') return null

  const video = raw as RawVideo
  const videoId = asString(video.id)
  const title = asString(video.title)
  if (!videoId || !title) return null

  return { videoId, title }
}

function providerError(message: string, httpStatus?: number): PipelineFailure {
  return new PipelineFailure('avatar_provider_error', message, {
    provider: HEYGEN_PROVIDER,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  })
}

// `data` del sobre de HeyGen, o avatar_provider_error si no es un objeto.
function dataOf(body: unknown, path: string): Record<string, unknown> {
  const data = (body as { data?: unknown } | null)?.data
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw providerError(`HeyGen ${path} returned no data object`)
  return data as Record<string, unknown>
}

// Una página de un listado de HeyGen: los ítems crudos de `data` y el cursor de
// la siguiente página, solo si `has_more` es true y llega un token de texto no
// vacío (uno vacío no se puede volver a mandar: los handlers lo descartan y se
// pediría otra vez la primera página). Un cuerpo cuyo `data` no es una lista es
// avatar_provider_error.
function pageOf(
  body: unknown,
  path: string,
): { items: unknown[]; nextToken: string | null } {
  const page = body as RawPage | null
  if (!Array.isArray(page?.data))
    throw providerError(`HeyGen ${path} returned no data array`)
  const nextToken =
    page.has_more === true ? (asString(page.next_token) ?? null) : null
  return { items: page.data, nextToken }
}

// El saldo de la billetera de `GET /v3/users/me` en nuestra forma: disponible
// solo con un `remaining_balance` numérico, finito y ≥ 0. La moneda pasa tal
// cual (en minúsculas) si es una palabra; sin ella, `usd`.
function toAvatarBalance(rawWallet: unknown): AvatarBalanceResult {
  if (!rawWallet || typeof rawWallet !== 'object')
    return { available: false, errorCode: BALANCE_UNAVAILABLE_CODE }
  const wallet = rawWallet as RawWallet
  const remaining = wallet.remaining_balance
  if (
    typeof remaining !== 'number' ||
    !Number.isFinite(remaining) ||
    remaining < 0
  )
    return { available: false, errorCode: BALANCE_UNAVAILABLE_CODE }

  const currency =
    typeof wallet.currency === 'string' &&
    CURRENCY_PATTERN.test(wallet.currency)
      ? wallet.currency.toLowerCase()
      : DEFAULT_BALANCE_CURRENCY
  return { available: true, remaining, currency }
}

// La respuesta de `POST /v3/avatars` (foto o prompt): el look creado, el grupo
// o ambos. Sin ninguno de los dos no hay cómo seguir lo que se pagó.
function createdAvatarOf(body: unknown): HeyGenCreatedAvatar {
  const data = dataOf(body, '/v3/avatars')
  const look = toHeyGenLook(data.avatar_item)
  const group = data.avatar_group
  const groupId =
    group && typeof group === 'object'
      ? (asString((group as { id?: unknown }).id) ?? null)
      : null
  if (!look && !groupId)
    throw providerError(
      'HeyGen avatar creation returned neither a look nor a group',
    )
  return { look, groupId }
}

// `409 request_in_progress`: otro pedido con la misma Idempotency-Key sigue en
// vuelo (heygen-errors.ts lo clasifica como avatar_rate_limited).
function isRequestInProgress(error: unknown): boolean {
  return (
    error instanceof PipelineFailure &&
    error.httpStatus === 409 &&
    error.code === 'avatar_rate_limited'
  )
}

// El rechazo con que terminó un pedido que antes recibió `409
// request_in_progress`: el mismo fallo, marcado, porque el original estaba en
// vuelo y este «no» no dice nada de él. Lo que no es un rechazo de HeyGen (una
// cancelación, la red caída) sale tal cual.
function afterRequestInProgress(error: unknown): unknown {
  if (!(error instanceof HeyGenFailure)) return error

  return new HeyGenFailure(
    error.code,
    error.message,
    failureDetails(error),
    error.param,
    true,
  )
}

function invalidVideoRequest(reason: string): PipelineFailure {
  return new PipelineFailure(
    'invalid_payload',
    `HeyGen video request ${reason}`,
  )
}

// Un render se paga: sin look, sin audio o con una clave que HeyGen no acepta
// (un encabezado inválido podría tomarse como «sin clave» y dejar los
// reintentos sin deduplicar), el pedido no sale. Es un error local: sin
// proveedor ni status, porque HeyGen no llegó a ver nada.
function assertVideoInput(input: HeyGenCreateVideoInput) {
  if (!asString(input.lookId)) throw invalidVideoRequest('without a look id')

  if (!asString(input.audioAssetId))
    throw invalidVideoRequest('without an audio asset id')

  // El tipo primero: RegExp.test convertiría un arreglo en texto.
  if (
    typeof input.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)
  )
    throw invalidVideoRequest('with an invalid Idempotency-Key')
}

// Cuerpo de `POST /v3/videos` (diseño §7.1 con el cambio del dueño del
// 2026-10-10): el clip del avatar ES la escena, con el fondo propio del look,
// así que no viajan `background`, `remove_background` ni `fit`: HeyGen
// renderiza el look tal cual en el formato del proyecto. `engine` va siempre y
// solo con `type` (sin `engine` HeyGen usaría Avatar IV, y Avatar III no acepta
// nada más, R-2e-1). Desde la entrega 2e, al final y solo cuando vienen,
// `motion_prompt` y `expressiveness`: sin ellos, el cuerpo de antes.
function createVideoBody(input: HeyGenCreateVideoInput) {
  return {
    type: 'avatar',
    title: input.title,
    avatar_id: input.lookId,
    audio_asset_id: input.audioAssetId,
    engine: { type: input.engine },
    aspect_ratio: input.aspectRatio,
    resolution: HEYGEN_VIDEO_RESOLUTION,
    output_format: HEYGEN_VIDEO_OUTPUT_FORMAT,
    ...(input.motionPrompt ? { motion_prompt: input.motionPrompt } : {}),
    ...(input.expressiveness ? { expressiveness: input.expressiveness } : {}),
  }
}

// Ajustes de un cliente para una consulta que no puede demorar (el pre-vuelo
// de la cuenta al crear un proyecto): el plazo de cada pedido y cuántas veces
// se repite un 429. Sin ellos, 30 s y tres reintentos.
export interface HeyGenClientOptions {
  requestTimeoutMs?: number
  rateLimitRetries?: number
}

export function createHeyGenClient(
  apiKey: string,
  signal: AbortSignal,
  options: HeyGenClientOptions = {},
): HeyGenClient {
  const rateLimitRetries = options.rateLimitRetries ?? RATE_LIMIT_MAX_RETRIES

  async function request(
    path: string,
    init: RequestInit,
    timeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(timeoutMs)
      let response: Response
      try {
        response = await fetch(`${HEYGEN_BASE_URL}${path}`, {
          ...init,
          headers: { 'X-Api-Key': apiKey, ...(init.headers ?? {}) },
          signal: AbortSignal.any([signal, timeout]),
        })
      } catch (error) {
        // Cancelación pedida ≠ error de red.
        if (signal.aborted) throw error
        throw new PipelineFailure(
          'avatar_network',
          `HeyGen request failed: ${error instanceof Error ? error.message : String(error)}`,
          { provider: HEYGEN_PROVIDER },
        )
      }

      if (response.ok) {
        try {
          return await response.json()
        } catch {
          // La cancelación corta también la lectura del cuerpo (fetch lo lee
          // con el mismo signal): es una cancelación, no un cuerpo raro.
          signal.throwIfAborted()
          throw providerError(
            `HeyGen returned a non-JSON body for ${path}`,
            response.status,
          )
        }
      }

      const bodyText = (await response.text().catch(() => '')).slice(0, 2000)
      // Ídem: con el cuerpo cortado por la cancelación, un 409
      // `request_in_progress` se leería como un rechazo cualquiera.
      signal.throwIfAborted()
      if (response.status === 429 && attempt < rateLimitRetries) {
        await sleep(rateLimitDelayMs(response, bodyText, attempt), signal)
        signal.throwIfAborted()
        continue
      }
      throw heygenFailure(response.status, bodyText)
    }
  }

  return {
    async listGroups(params) {
      const query = new URLSearchParams({
        limit: String(HEYGEN_GROUPS_PAGE_LIMIT),
      })
      if (params.ownership) query.set('ownership', params.ownership)
      if (params.token) query.set('token', params.token)
      const body = await request(`/v3/avatars?${query}`, { method: 'GET' })
      const { items, nextToken } = pageOf(body, '/v3/avatars')
      const groups = items
        .map(toHeyGenAvatarGroup)
        .filter((group): group is HeyGenAvatarGroup => group !== null)
      return { groups, nextToken }
    },
    async getGroup(groupId) {
      let body: unknown
      try {
        body = await request(`/v3/avatars/${encodeURIComponent(groupId)}`, {
          method: 'GET',
        })
      } catch (error) {
        // Un 404 es un avatar que HeyGen ya no tiene (borrado, o de otra
        // cuenta): para la biblioteca, un avatar que no existe.
        if (error instanceof PipelineFailure && error.httpStatus === 404)
          throw new PipelineFailure(
            'avatar_not_found',
            `HeyGen has no avatar group ${groupId}`,
            failureDetails(error),
          )
        throw error
      }
      const group = toHeyGenAvatarGroup(dataOf(body, '/v3/avatars/{group_id}'))
      if (!group)
        throw providerError(
          `HeyGen avatar group ${groupId} came back malformed`,
        )
      return group
    },
    async listLooks(params) {
      const query = new URLSearchParams({
        limit: String(HEYGEN_LOOKS_PAGE_LIMIT),
      })
      if (params.ownership) query.set('ownership', params.ownership)
      if (params.lookType) query.set('avatar_type', params.lookType)
      if (params.groupId) query.set('group_id', params.groupId)
      if (params.token) query.set('token', params.token)
      const body = await request(`/v3/avatars/looks?${query}`, {
        method: 'GET',
      })
      const { items, nextToken } = pageOf(body, '/v3/avatars/looks')
      const looks = items
        .map(toHeyGenLook)
        .filter((look): look is HeyGenLook => look !== null)
      return { looks, nextToken }
    },
    async getLook(lookId) {
      const body = await request(
        `/v3/avatars/looks/${encodeURIComponent(lookId)}`,
        { method: 'GET' },
      )
      const look = toHeyGenLook(dataOf(body, '/v3/avatars/looks/{look_id}'))
      if (!look)
        throw providerError(`HeyGen look ${lookId} came back malformed`)
      return look
    },
    async getBalance() {
      // El saldo nunca tumba la vista: cualquier fallo (clave rechazada, red,
      // un cuerpo raro) vuelve como «no disponible» con su código. Solo una
      // cancelación pedida por la persona sale tal cual.
      try {
        const body = await request('/v3/users/me', { method: 'GET' })
        return toAvatarBalance(dataOf(body, '/v3/users/me').wallet)
      } catch (error) {
        if (signal.aborted) throw error
        return { available: false, errorCode: toPipelineFailure(error).code }
      }
    },
    async uploadAsset(bytes, fileName, mime) {
      // Multipart con FormData/Blob globales de Node 22; fetch pone el
      // Content-Type con el boundary, por eso no se fija a mano.
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: mime }), fileName)
      const body = await request(
        '/v3/assets',
        { method: 'POST', body: form },
        UPLOAD_TIMEOUT_MS,
      )
      const assetId = asString(dataOf(body, '/v3/assets').asset_id)
      if (!assetId)
        throw providerError('HeyGen asset upload returned no asset_id')
      return assetId
    },
    async createPhotoAvatar({ name, assetId, idempotencyKey }) {
      const body = await request('/v3/avatars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          type: 'photo',
          name,
          file: { type: 'asset_id', asset_id: assetId },
        }),
      })
      return createdAvatarOf(body)
    },
    async createPromptLook({
      name,
      prompt,
      avatarId,
      groupId,
      referenceAssetIds,
      aspectRatio,
      idempotencyKey,
    }) {
      // Sin referencias el campo no viaja (la OpenAPI lo admite nulo u
      // omitido); `aspect_ratio: 'auto'` va tal cual, que equivale a omitirlo.
      const references =
        referenceAssetIds.length > 0
          ? {
              reference_images: referenceAssetIds.map((assetId) => ({
                type: 'asset_id',
                asset_id: assetId,
              })),
            }
          : {}
      const body = await request('/v3/avatars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          type: 'prompt',
          name,
          prompt,
          avatar_id: avatarId,
          avatar_group_id: groupId,
          ...references,
          aspect_ratio: aspectRatio,
        }),
      })
      return createdAvatarOf(body)
    },
    async createVideo(input) {
      assertVideoInput(input)
      const init = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(createVideoBody(input)),
      }
      let sawRequestInProgress = false
      for (let attempt = 0; ; attempt++) {
        let body: unknown
        try {
          body = await request('/v3/videos', init)
        } catch (error) {
          // El mismo pedido, con la misma clave, sigue en vuelo: se espera y se
          // repite sin cambiar nada. Agotado, sale como avatar_rate_limited
          // (409) y el carril deja el intento sin resolver. Cualquier rechazo
          // que llegue después de un 409 así sale marcado
          // (`sawRequestInProgress`): el carril tampoco lo da por definitivo.
          const inProgress = isRequestInProgress(error)
          if (!inProgress || attempt >= IN_PROGRESS_MAX_RETRIES)
            throw sawRequestInProgress || inProgress
              ? afterRequestInProgress(error)
              : error

          sawRequestInProgress = true
          await sleep(IN_PROGRESS_BASE_DELAY_MS * 2 ** attempt, signal)
          signal.throwIfAborted()
          continue
        }
        const videoId = asString(dataOf(body, '/v3/videos').video_id)
        if (!videoId)
          throw providerError('HeyGen video creation returned no video_id')
        return videoId
      }
    },
    async getVideo(videoId) {
      const body = await request(`/v3/videos/${encodeURIComponent(videoId)}`, {
        method: 'GET',
      })
      const video = toHeyGenVideo(dataOf(body, '/v3/videos/{video_id}'))
      if (!video)
        throw providerError(`HeyGen video ${videoId} came back malformed`)
      return video
    },
    async listVideos(params) {
      const query = new URLSearchParams({
        limit: String(HEYGEN_VIDEOS_PAGE_LIMIT),
      })
      if (params.title) query.set('title', params.title)
      if (params.token) query.set('token', params.token)
      const body = await request(`/v3/videos?${query}`, { method: 'GET' })
      const { items, nextToken } = pageOf(body, '/v3/videos')
      const videos = items
        .map(toListedVideo)
        .filter((video): video is HeyGenListedVideo => video !== null)
      return { videos, nextToken }
    },
    async deleteGroup(groupId) {
      // `DELETE /v3/avatars/{group_id}` (OpenAPI v3): 200 con `{ data: { id } }`.
      // El cuerpo no se usa: una respuesta 2xx que no es JSON (un 204 sin
      // cuerpo) también es un borrado. Un 404 es un grupo que HeyGen ya no
      // tiene (se borró antes, desde HeyGen o desde otra ventana): para quien
      // lo borra, el resultado es el mismo. El resto de los rechazos sale como
      // en todo el cliente (`heygenFailure`).
      try {
        await request(`/v3/avatars/${encodeURIComponent(groupId)}`, {
          method: 'DELETE',
        })
      } catch (error) {
        if (!(error instanceof PipelineFailure)) throw error
        if (error.httpStatus === 404) return
        if (isSuccessStatus(error.httpStatus)) return

        throw error
      }
    },
  }
}
