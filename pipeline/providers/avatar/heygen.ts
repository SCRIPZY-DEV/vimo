import { PipelineFailure } from '../../runner/failure.ts'
import { AVATAR_ENGINES, AVATAR_LOOK_TYPES } from '../../types/avatar.ts'
import type {
  AvatarEngine,
  AvatarLibraryStatus,
  AvatarLookType,
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
const REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000
const RATE_LIMIT_MAX_RETRIES = 3

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

export interface HeyGenCreatePhotoAvatarInput {
  name: string
  assetId: string
  // Misma foto y nombre → misma clave: HeyGen responde lo mismo 24 h y no
  // cobra dos veces si la respuesta se perdió.
  idempotencyKey: string
}

export interface HeyGenCreatedAvatar {
  // HeyGen puede devolver el look ya creado o solo el grupo (look pendiente).
  look: HeyGenLook | null
  groupId: string | null
}

export interface HeyGenClient {
  listLooks(params: HeyGenListLooksParams): Promise<HeyGenLooksPage>
  getLook(lookId: string): Promise<HeyGenLook>
  uploadAsset(bytes: Buffer, fileName: string, mime: string): Promise<string>
  createPhotoAvatar(
    input: HeyGenCreatePhotoAvatarInput,
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
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
  const gender = asString(look.gender)
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
    async listLooks(params) {
      const query = new URLSearchParams({
        limit: String(HEYGEN_LOOKS_PAGE_LIMIT),
      })
      if (params.ownership) query.set('ownership', params.ownership)
      if (params.lookType) query.set('avatar_type', params.lookType)
      if (params.groupId) query.set('group_id', params.groupId)
      if (params.token) query.set('token', params.token)
      const body = (await request(`/v3/avatars/looks?${query}`, {
        method: 'GET',
      })) as { data?: unknown; has_more?: unknown; next_token?: unknown } | null
      if (!Array.isArray(body?.data))
        throw providerError('HeyGen /v3/avatars/looks returned no data array')
      const looks = body.data
        .map(toHeyGenLook)
        .filter((look): look is HeyGenLook => look !== null)
      const nextToken =
        body.has_more === true && typeof body.next_token === 'string'
          ? body.next_token
          : null
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
    },
  }
}
