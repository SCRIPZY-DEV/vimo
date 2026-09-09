import { PipelineFailure } from '../../runner/failure.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { sleep } from '../../utils/sleep.ts'
import type {
  AddLibraryVoicePayload,
  ElevenLabsAddVoiceResponse,
  ElevenLabsSharedVoice,
  ElevenLabsSharedVoicesResponse,
  ElevenLabsSubscriptionResponse,
  ElevenLabsVoice,
  ElevenLabsVoicesResponse,
  GenerateVoicePayload,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceCreditsResult,
  VoiceSummary,
} from '../../types/voices.ts'
import {
  LIST_TIMEOUT_MS,
  SYNTHESIS_TIMEOUT_MS,
  requestSignal,
  rethrowIfCancelled,
  type AudioDownload,
} from './dubvoice.ts'
import {
  ELEVENLABS_API_BASE_URL,
  ELEVENLABS_CHAR_LIMIT,
  ELEVENLABS_DEFAULT_MODEL,
  CATALOG_PAGE_SIZE,
} from './elevenlabs-shared.ts'
import type { TtsProvider } from './provider.ts'

// ElevenLabs DIRECTO (api.elevenlabs.io, la clave del propio usuario). Nació
// como fallback de la narración (port de sintetizarElevenLabsDirecto) y desde
// ADR-0024 es un motor completo: catálogo de la cuenta + biblioteca pública,
// cuota de caracteres y síntesis síncrona. Sigue siendo el fallback del motor
// ElevenLabs vía DubVoice, y viceversa.
const RATE_LIMIT_MAX_RETRIES = 6
// /v2/voices pagina por token; una cuenta tiene decenas de voces, no miles.
const ACCOUNT_PAGE_SIZE = 100
const ACCOUNT_MAX_PAGES = 20
const OUTPUT_FORMAT = 'mp3_44100_128'
// Solo estos modelos aceptan language_code; multilingual_v2 responde 400.
const LANGUAGE_CODE_MODELS = new Set(['eleven_turbo_v2_5', 'eleven_flash_v2_5'])
const CLONE_CATEGORIES = new Set(['cloned', 'professional', 'generated'])

function authHeaders(apiKey: string): Record<string, string> {
  return { 'xi-api-key': apiKey, 'Content-Type': 'application/json' }
}

// ElevenLabs responde los errores como { detail: { status, message } } (o
// detail como string). El `status` es el código estable; el HTTP no alcanza
// (400 puede ser cuota insuficiente y 401 tanto clave mala como cuota agotada).
interface ElevenLabsErrorDetail {
  status?: string
  message?: string
}

function parseErrorDetail(bodyText: string): ElevenLabsErrorDetail {
  try {
    const parsed = JSON.parse(bodyText) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return { message: parsed.detail }
    if (parsed.detail && typeof parsed.detail === 'object')
      return parsed.detail as ElevenLabsErrorDetail
  } catch {
    // Body no JSON (HTML de un proxy, texto plano): se usa crudo.
  }
  return { message: bodyText.slice(0, 200) }
}

const QUOTA_STATUSES = new Set(['quota_exceeded', 'insufficient_quota'])
// Cuenta que ElevenLabs bloqueó o limitó (free tier con actividad inusual,
// función solo para planes pagos): no es la clave ni la cuota.
const RESTRICTED_STATUSES = new Set([
  'detected_unusual_activity',
  'free_users_not_allowed',
  'only_for_creator+',
  'paid_plan_required',
])

function isQuotaExceeded(detail: ElevenLabsErrorDetail): boolean {
  if (detail.status && QUOTA_STATUSES.has(detail.status)) return true
  return /quota|character limit/i.test(detail.message ?? '')
}

interface FetchOptions {
  timeoutMs: number
  signal?: AbortSignal
}

/**
 * fetch contra ElevenLabs con reintentos ante 429 y clasificación a los
 * mismos codes `voice_*` que DubVoice, para que la UI no distinga vendors
 * al traducir errores. ElevenLabs devuelve 401 tanto con clave inválida
 * como con la cuota agotada: se separa por el body para no decirle al
 * usuario que su clave está mal cuando lo que se acabó son los caracteres.
 */
async function elevenLabsFetch(
  url: string,
  init: RequestInit,
  options: FetchOptions,
): Promise<Response> {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: requestSignal(options.timeoutMs, options.signal),
    }).catch((error: unknown) => {
      rethrowIfCancelled(options.signal, error)
      throw new PipelineFailure('voice_network', 'ElevenLabs request failed')
    })

    if (response.ok) return response

    const bodyText = await response.text().catch(() => '')
    const detail = parseErrorDetail(bodyText)
    const detailText = `${detail.status ?? ''} ${detail.message ?? ''}`.trim()

    if (isQuotaExceeded(detail))
      throw new PipelineFailure(
        'voice_quota_exceeded',
        `ElevenLabs character quota exceeded: ${detailText}`,
      )
    if (detail.status && RESTRICTED_STATUSES.has(detail.status))
      throw new PipelineFailure(
        'voice_account_restricted',
        `ElevenLabs restricted this account (status=${response.status}): ${detailText}`,
      )
    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'voice_invalid_api_key',
        `ElevenLabs rejected the API key (status=${response.status}): ${detailText}`,
      )

    if (response.status === 429) {
      if (attempt === RATE_LIMIT_MAX_RETRIES)
        throw new PipelineFailure(
          'voice_rate_limited',
          `ElevenLabs rate limit persisted after ${RATE_LIMIT_MAX_RETRIES} retries`,
        )
      await sleep(rateLimitDelayMs(response, bodyText, attempt), options.signal)
      options.signal?.throwIfAborted()
      continue
    }

    if (
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    )
      throw new PipelineFailure(
        'voice_maintenance',
        `ElevenLabs is unavailable (status=${response.status})`,
      )

    throw new PipelineFailure(
      'voice_provider_error',
      `ElevenLabs request failed (status=${response.status}): ${detailText}`,
    )
  }

  // Inalcanzable: el loop retorna o lanza; TypeScript no lo sabe.
  throw new PipelineFailure('voice_provider_error', 'unreachable retry loop')
}

// ─── Catálogo ───

function normalizeAccountVoice(voice: ElevenLabsVoice): VoiceSummary | null {
  if (!voice.voice_id) return null

  const summary: VoiceSummary = {
    provider: 'elevenlabs-direct',
    voiceId: voice.voice_id,
    name: voice.name ?? voice.voice_id,
  }
  const labels = voice.labels ?? {}
  if (labels.language) summary.language = labels.language
  if (labels.gender) summary.gender = labels.gender
  if (labels.accent) summary.accent = labels.accent
  if (voice.category) summary.category = voice.category
  if (voice.preview_url) summary.previewUrl = voice.preview_url
  if (voice.category && CLONE_CATEGORIES.has(voice.category))
    summary.isClone = true

  return summary
}

function normalizeSharedVoice(
  voice: ElevenLabsSharedVoice,
): VoiceSummary | null {
  if (!voice.voice_id || !voice.public_owner_id) return null

  const summary: VoiceSummary = {
    provider: 'elevenlabs-direct',
    voiceId: voice.voice_id,
    name: voice.name ?? voice.voice_id,
    libraryOwnerId: voice.public_owner_id,
  }
  if (voice.language) summary.language = voice.language
  if (voice.gender) summary.gender = voice.gender
  if (voice.accent) summary.accent = voice.accent
  if (voice.category) summary.category = voice.category
  if (voice.preview_url) summary.previewUrl = voice.preview_url

  return summary
}

// Voces de la cuenta, completas: la UI filtra client-side como con Minimax.
async function listAccountVoicesRaw(
  apiKey: string,
  signal?: AbortSignal,
): Promise<ElevenLabsVoice[]> {
  const voices: ElevenLabsVoice[] = []
  let nextPageToken: string | undefined

  for (let page = 0; page < ACCOUNT_MAX_PAGES; page++) {
    const query = new URLSearchParams({ page_size: String(ACCOUNT_PAGE_SIZE) })
    if (nextPageToken) query.set('next_page_token', nextPageToken)

    const response = await elevenLabsFetch(
      `${ELEVENLABS_API_BASE_URL}/v2/voices?${query.toString()}`,
      { headers: authHeaders(apiKey) },
      { timeoutMs: LIST_TIMEOUT_MS, signal },
    )
    const data = (await response.json()) as ElevenLabsVoicesResponse
    voices.push(...(data.voices ?? []))

    if (!data.has_more || !data.next_page_token) break
    nextPageToken = data.next_page_token
  }

  return voices
}

export async function listAccountVoices(
  apiKey: string,
  signal?: AbortSignal,
): Promise<ListVoicesResult> {
  const voices: VoiceSummary[] = []
  for (const voice of await listAccountVoicesRaw(apiKey, signal)) {
    const normalized = normalizeAccountVoice(voice)
    if (normalized) voices.push(normalized)
  }

  return { voices, hasMore: false, total: voices.length }
}

// Biblioteca pública, paginada server-side (miles de voces). ElevenLabs
// pagina 0-indexado y no informa total.
export async function listLibraryVoices(
  apiKey: string,
  filters: ListVoicesFilters,
  signal?: AbortSignal,
): Promise<ListVoicesResult> {
  const query = new URLSearchParams({
    page: String(Math.max(0, (filters.page ?? 1) - 1)),
    page_size: String(CATALOG_PAGE_SIZE),
  })
  if (filters.search) query.set('search', filters.search)
  if (filters.language) query.set('language', filters.language)
  if (filters.gender) query.set('gender', filters.gender)
  if (filters.category) query.set('category', filters.category)

  const response = await elevenLabsFetch(
    `${ELEVENLABS_API_BASE_URL}/v1/shared-voices?${query.toString()}`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )
  const data = (await response.json()) as ElevenLabsSharedVoicesResponse

  const voices: VoiceSummary[] = []
  for (const voice of data.voices ?? []) {
    const normalized = normalizeSharedVoice(voice)
    if (normalized) voices.push(normalized)
  }

  const hasMore =
    typeof data.has_more === 'boolean'
      ? data.has_more
      : (data.voices ?? []).length === CATALOG_PAGE_SIZE

  return { voices, hasMore }
}

// Añade una voz de la biblioteca a la cuenta. Idempotente: si ya está (mismo
// voice_id o la cuenta la tiene como copia de ese original), devuelve la
// existente sin gastar un slot de voz.
export async function addLibraryVoice(
  apiKey: string,
  payload: AddLibraryVoicePayload,
  signal?: AbortSignal,
): Promise<string> {
  const existing = (await listAccountVoicesRaw(apiKey, signal)).find(
    (voice) =>
      voice.voice_id === payload.voiceId ||
      voice.sharing?.original_voice_id === payload.voiceId,
  )
  if (existing?.voice_id) return existing.voice_id

  let response: Response
  try {
    response = await elevenLabsFetch(
      `${ELEVENLABS_API_BASE_URL}/v1/voices/add/${encodeURIComponent(payload.libraryOwnerId)}/${encodeURIComponent(payload.voiceId)}`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ new_name: payload.name }),
      },
      { timeoutMs: LIST_TIMEOUT_MS, signal },
    )
  } catch (error) {
    rethrowIfCancelled(signal, error)
    // Auth y cuota conservan su code; el resto (slots agotados, voz
    // retirada de la biblioteca) es «no se pudo añadir».
    if (
      error instanceof PipelineFailure &&
      (error.code === 'voice_invalid_api_key' ||
        error.code === 'voice_quota_exceeded')
    )
      throw error
    throw new PipelineFailure(
      'voice_library_add_failed',
      `could not add library voice ${payload.voiceId}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const data = (await response.json()) as ElevenLabsAddVoiceResponse
  if (!data.voice_id)
    throw new PipelineFailure(
      'voice_library_add_failed',
      'ElevenLabs returned no voice_id after adding the library voice',
    )

  return data.voice_id
}

// ─── Cuota ───

export async function getElevenLabsSubscription(
  apiKey: string,
  signal?: AbortSignal,
): Promise<VoiceCreditsResult> {
  const response = await elevenLabsFetch(
    `${ELEVENLABS_API_BASE_URL}/v1/user/subscription`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )
  const data = (await response.json()) as ElevenLabsSubscriptionResponse

  const used = data.character_count ?? 0
  const limit = data.character_limit ?? 0
  const result: VoiceCreditsResult = {
    vendor: 'elevenlabs',
    unit: 'characters',
    credits: Math.max(0, limit - used),
    quota: { used, limit },
  }
  if (data.tier) result.plan = data.tier
  if (data.next_character_count_reset_unix && result.quota)
    result.quota.resetsAt = new Date(
      data.next_character_count_reset_unix * 1000,
    ).toISOString()

  return result
}

// ─── Síntesis ───

export async function synthesizeElevenLabsDirect(
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AudioDownload> {
  const settings = payload.settings ?? {}
  const model = payload.model ?? ELEVENLABS_DEFAULT_MODEL
  const body: Record<string, unknown> = {
    text,
    model_id: model,
    voice_settings: {
      stability: settings.stability ?? 0.5,
      similarity_boost: settings.similarityBoost ?? 0.75,
      style: settings.style ?? 0,
      use_speaker_boost: settings.useSpeakerBoost ?? true,
      speed: settings.speed ?? 1,
    },
  }
  if (
    payload.language &&
    payload.language !== 'auto' &&
    LANGUAGE_CODE_MODELS.has(model)
  )
    body.language_code = payload.language

  const response = await elevenLabsFetch(
    `${ELEVENLABS_API_BASE_URL}/v1/text-to-speech/${encodeURIComponent(payload.voiceId)}?output_format=${OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: { ...authHeaders(apiKey), Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    },
    { timeoutMs: SYNTHESIS_TIMEOUT_MS, signal },
  )

  const contentType = response.headers.get('content-type') ?? ''
  if (
    contentType.startsWith('application/json') ||
    contentType.startsWith('text/')
  )
    throw new PipelineFailure(
      'voice_empty_audio',
      `ElevenLabs returned non-audio content (content-type=${contentType})`,
    )

  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length)
    throw new PipelineFailure(
      'voice_empty_audio',
      'ElevenLabs returned 0 bytes of audio',
    )

  return { audio, creditsUsed: text.length }
}

export const elevenLabsDirectProvider: TtsProvider = {
  id: 'elevenlabs-direct',
  vendor: 'elevenlabs',
  laneName: 'ElevenLabs direct',
  requestCharLimit: ELEVENLABS_CHAR_LIMIT,
  chunksLongText: true,
  reportsProgress: false,
  apiKeyOf(apiKeys) {
    return apiKeys.elevenlabs
  },
  listVoices({ apiKey, filters, signal }) {
    if (filters.source === 'library')
      return listLibraryVoices(apiKey, filters, signal)
    return listAccountVoices(apiKey, signal)
  },
  probeRequest(apiKey) {
    return {
      url: `${ELEVENLABS_API_BASE_URL}/v2/voices?page_size=1`,
      init: { headers: authHeaders(apiKey) },
    }
  },
  synthesize({ payload, text, apiKey, signal }) {
    return synthesizeElevenLabsDirect(payload, text, apiKey, signal)
  },
  // Si ElevenLabs falla y el usuario también tiene DubVoice, se sintetiza la
  // MISMA voz vía DubVoice (solo voces premade públicas).
  fallbackProviderIds: ['elevenlabs'],
}
