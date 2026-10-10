import {
  failureDetails,
  PipelineFailure,
  toPipelineFailure,
} from '../../runner/failure.ts'
import { AVATAR_ENGINES, AVATAR_LOOK_TYPES } from '../../types/avatar.ts'
import type {
  AvatarAspectRatio,
  AvatarBalanceResult,
  AvatarEngine,
  AvatarGender,
  AvatarLibraryStatus,
  AvatarLookType,
  HeyGenAvatarGroup,
  HeyGenLook,
} from '../../types/avatar.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { sleep } from '../../utils/sleep.ts'
import { HEYGEN_PROVIDER, heygenFailure } from './heygen-errors.ts'

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
// un número que no sirve): la vista muestra «saldo no disponible».
const BALANCE_UNAVAILABLE_CODE = 'avatar_balance_unavailable'
// Sin moneda en la billetera, el saldo de la API es prepago en dólares (sonda
// del 2026-10-09: `billing_type: 'wallet'`, `currency: 'usd'`).
const DEFAULT_BALANCE_CURRENCY = 'usd'
const CURRENCY_PATTERN = /^[a-z]+$/i

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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// Un conteo de la API: entero ≥ 0, o 0 si falta o no es un número válido.
function toCount(value: unknown): number {
  if (typeof value !== 'number') return 0
  if (!Number.isInteger(value) || value < 0) return 0
  return value
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
// y un tipo conocido). Los motores desconocidos se descartan.
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

export function createHeyGenClient(
  apiKey: string,
  signal: AbortSignal,
): HeyGenClient {
  async function request(
    path: string,
    init: RequestInit,
    timeoutMs = REQUEST_TIMEOUT_MS,
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
          throw providerError(
            `HeyGen returned a non-JSON body for ${path}`,
            response.status,
          )
        }
      }

      const bodyText = (await response.text().catch(() => '')).slice(0, 2000)
      if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
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
  }
}
