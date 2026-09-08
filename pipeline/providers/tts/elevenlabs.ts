import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import type {
  DubvoiceElevenLabsVoice,
  DubvoiceElevenLabsVoicesResponse,
  DubvoiceTtsTaskResponse,
  GenerateVoicePayload,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceSummary,
} from '../../types/voices.ts'
import {
  DUBVOICE_BASE_URL,
  LIST_TIMEOUT_MS,
  authHeaders,
  downloadAudioFromUrl,
  dubvoiceFetch,
  rethrowIfCancelled,
  requestSignal,
} from './dubvoice.ts'
import {
  ELEVENLABS_CHAR_LIMIT,
  ELEVENLABS_DEFAULT_MODEL,
  ELEVENLABS_PAGE_SIZE,
} from './elevenlabs-shared.ts'
import type { TtsProvider } from './provider.ts'

// Motor ElevenLabs vía DubVoice: el listado pagina server-side (~12k voces,
// bajarlas todas serían minutos) y la síntesis es ASÍNCRONA — submit → task_id
// → polling con progreso real, hasta 10 minutos.
const POLL_TIMEOUT_MS = 10 * 60 * 1000
const POLL_REQUEST_TIMEOUT_MS = 30_000

// Intervalo de polling escalado por largo del texto (recomendación DubVoice).
function pollIntervalMs(textLength: number): number {
  if (textLength < 1000) return 3000
  if (textLength < 10_000) return 7000
  return 20_000
}

function normalizeVoice(voice: DubvoiceElevenLabsVoice): VoiceSummary | null {
  if (!voice.voice_id) return null

  const summary: VoiceSummary = {
    provider: 'elevenlabs',
    voiceId: voice.voice_id,
    name: voice.name ?? voice.voice_id,
  }
  if (voice.language) summary.language = voice.language
  if (voice.gender) summary.gender = voice.gender
  if (voice.accent) summary.accent = voice.accent
  if (voice.category) summary.category = voice.category
  if (voice.preview_url) summary.previewUrl = voice.preview_url

  return summary
}

export async function listElevenLabsVoices(
  apiKey: string,
  filters: ListVoicesFilters,
  signal?: AbortSignal,
): Promise<ListVoicesResult> {
  const query = new URLSearchParams({
    provider: 'elevenlabs',
    page: String(filters.page ?? 1),
    page_size: String(ELEVENLABS_PAGE_SIZE),
  })
  if (filters.search) query.set('search', filters.search)
  if (filters.language) query.set('language', filters.language)
  if (filters.gender) query.set('gender', filters.gender)

  const response = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/v1/voices?${query.toString()}`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const data = (await response.json()) as DubvoiceElevenLabsVoicesResponse
  const voices: VoiceSummary[] = []
  for (const voice of data.voices ?? []) {
    const normalized = normalizeVoice(voice)
    if (normalized) voices.push(normalized)
  }

  // Si la API no expone has_more: página llena = "tal vez hay más".
  const hasMore =
    typeof data.has_more === 'boolean'
      ? data.has_more
      : (data.voices ?? []).length === ELEVENLABS_PAGE_SIZE

  const result: ListVoicesResult = { voices, hasMore }
  if (typeof data.total === 'number') result.total = data.total

  return result
}

export interface ElevenLabsProgress {
  percent: number
  status: string
  elapsedSeconds: number
}

export async function synthesizeElevenLabs(
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  signal: AbortSignal | undefined,
  onProgress: (progress: ElevenLabsProgress) => void,
): Promise<Buffer> {
  const settings = payload.settings ?? {}
  const submitResponse = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/v1/tts`,
    {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        text,
        voice_id: payload.voiceId,
        model_id: payload.model ?? ELEVENLABS_DEFAULT_MODEL,
        language: payload.language ?? 'auto',
        voice_settings: {
          speed: settings.speed ?? 1,
          stability: settings.stability ?? 0.5,
          similarity_boost: settings.similarityBoost ?? 0.75,
          style: settings.style ?? 0,
          use_speaker_boost: settings.useSpeakerBoost ?? true,
        },
      }),
    },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const submitData = (await submitResponse.json()) as DubvoiceTtsTaskResponse
  if (!submitData.task_id)
    throw new PipelineFailure(
      'voice_provider_error',
      'DubVoice returned no task_id for the ElevenLabs synthesis',
    )

  const intervalMs = pollIntervalMs(text.length)
  const startedAt = Date.now()

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await delay(intervalMs, undefined, { signal })

    let response: Response
    try {
      response = await fetch(
        `${DUBVOICE_BASE_URL}/api/v1/tts?task_id=${encodeURIComponent(submitData.task_id)}`,
        {
          headers: authHeaders(apiKey),
          signal: requestSignal(POLL_REQUEST_TIMEOUT_MS, signal),
        },
      )
    } catch (error) {
      rethrowIfCancelled(signal, error)
      // Error de red transitorio: se reintenta en el próximo poll.
      continue
    }

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'voice_invalid_api_key',
        `DubVoice rejected the API key (status=${response.status})`,
      )
    // Cualquier otro error del poll es transitorio: se sigue esperando.
    if (!response.ok) continue

    const data = (await response.json()) as DubvoiceTtsTaskResponse

    if (
      typeof data.progress === 'number' &&
      data.progress >= 0 &&
      data.progress <= 100
    )
      onProgress({
        percent: data.progress,
        status: data.status ?? 'processing',
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      })

    if (data.status === 'completed' && data.result)
      return downloadAudioFromUrl(data.result, signal)
    if (data.status === 'failed')
      throw new PipelineFailure(
        'voice_generation_failed',
        data.error ?? 'ElevenLabs task failed',
      )
  }

  throw new PipelineFailure(
    'voice_timeout',
    'ElevenLabs task did not complete within 10 minutes',
  )
}

export const elevenLabsProvider: TtsProvider = {
  id: 'elevenlabs',
  vendor: 'dubvoice',
  laneName: 'ElevenLabs via DubVoice',
  requestCharLimit: ELEVENLABS_CHAR_LIMIT,
  chunksLongText: false,
  reportsProgress: true,
  apiKeyOf(apiKeys) {
    return apiKeys.dubvoice
  },
  listVoices({ apiKey, filters, signal }) {
    return listElevenLabsVoices(apiKey, filters, signal)
  },
  probeRequest(apiKey) {
    return {
      url: `${DUBVOICE_BASE_URL}/api/v1/voices?page_size=1`,
      init: { headers: authHeaders(apiKey) },
    }
  },
  async synthesize({ payload, text, apiKey, signal, onProgress }) {
    const audio = await synthesizeElevenLabs(
      payload,
      text,
      apiKey,
      signal,
      (progress) => onProgress?.(progress),
    )
    return { audio }
  },
  // Si DubVoice está caído y el usuario tiene su propia clave, se sintetiza
  // contra api.elevenlabs.io con la MISMA voz (solo funciona con voces
  // premade públicas: las clonadas de una cuenta no existen en la otra).
  fallbackProviderIds: ['elevenlabs-direct'],
}
