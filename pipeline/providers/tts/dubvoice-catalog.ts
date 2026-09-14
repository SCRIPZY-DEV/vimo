import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import type { VoiceRequestCheckpoint } from './request-checkpoint.ts'
import type {
  DubvoiceCatalogVoice,
  DubvoiceCatalogVoicesResponse,
  DubvoiceTtsTaskResponse,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
  VoiceSummary,
} from '../../types/voices.ts'
import {
  DUBVOICE_BASE_URL,
  LIST_TIMEOUT_MS,
  SYNTHESIS_TIMEOUT_MS,
  authHeaders,
  downloadAudioFromUrl,
  dubvoiceFetch,
  rethrowIfCancelled,
  requestSignal,
} from './dubvoice.ts'
import { CATALOG_PAGE_SIZE } from './elevenlabs-shared.ts'

// Transporte común de los motores que DubVoice sirve por su API v1:
// ElevenLabs, Vbee y Fish Audio. El catálogo pagina server-side en
// GET /api/v1/voices?provider=<motor> y la síntesis es ASÍNCRONA — submit a
// POST /api/v1/tts → task_id → polling con progreso real, hasta 20 minutos
// por parte. Cada motor arma su propio body (sus voice_settings) y delega acá.
export type DubvoiceCatalogProviderId = Extract<
  VoiceProviderId,
  'elevenlabs' | 'vbee' | 'fishaudio'
>

// Tope por llamada de los tres motores (ADR-0025): el job admite 100 000
// chars, pero partes de ~25 000 (según el dueño, 2026-09-09) acotan lo que se
// pierde si un job falla y permiten reusar las partes ya pagadas al reintentar.
export const DUBVOICE_CATALOG_CHUNK_CHARS = 25_000

const POLL_TIMEOUT_MS = 20 * 60 * 1000
const POLL_REQUEST_TIMEOUT_MS = 30_000

// Intervalo de polling escalado por largo del texto (recomendación DubVoice).
function pollIntervalMs(textLength: number): number {
  if (textLength < 1000) return 3000
  if (textLength < 10_000) return 7000
  return 20_000
}

function normalizeVoice(
  provider: DubvoiceCatalogProviderId,
  voice: DubvoiceCatalogVoice,
): VoiceSummary | null {
  if (!voice.voice_id) return null

  const summary: VoiceSummary = {
    provider,
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

export interface ListDubvoiceCatalogOptions {
  // Cómo viaja el filtro de idioma al server. Por defecto el código ISO tal
  // cual (ElevenLabs y Fish Audio); Vbee etiqueta por nombre completo.
  languageParam?(code: string): string
}

export async function listDubvoiceCatalogVoices(
  provider: DubvoiceCatalogProviderId,
  apiKey: string,
  filters: ListVoicesFilters,
  signal: AbortSignal | undefined,
  options: ListDubvoiceCatalogOptions = {},
): Promise<ListVoicesResult> {
  const query = new URLSearchParams({
    provider,
    page: String(filters.page ?? 1),
    page_size: String(CATALOG_PAGE_SIZE),
  })
  if (filters.search) query.set('search', filters.search)
  if (filters.language)
    query.set(
      'language',
      options.languageParam
        ? options.languageParam(filters.language)
        : filters.language,
    )
  if (filters.gender) query.set('gender', filters.gender)

  const response = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/v1/voices?${query.toString()}`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const data = (await response.json()) as DubvoiceCatalogVoicesResponse
  const voices: VoiceSummary[] = []
  for (const voice of data.voices ?? []) {
    const normalized = normalizeVoice(provider, voice)
    if (normalized) voices.push(normalized)
  }

  // Si la API no expone has_more: página llena = "tal vez hay más".
  const hasMore =
    typeof data.has_more === 'boolean'
      ? data.has_more
      : (data.voices ?? []).length === CATALOG_PAGE_SIZE

  const result: ListVoicesResult = { voices, hasMore }
  if (typeof data.total === 'number') result.total = data.total

  return result
}

// Pre-flight sin facturar: una página de un solo item del catálogo del motor.
export function dubvoiceCatalogProbeRequest(
  provider: DubvoiceCatalogProviderId,
  apiKey: string,
): { url: string; init: RequestInit } {
  return {
    url: `${DUBVOICE_BASE_URL}/api/v1/voices?provider=${provider}&page_size=1`,
    init: { headers: authHeaders(apiKey) },
  }
}

export interface DubvoiceTaskProgress {
  percent: number
  status: string
  elapsedSeconds: number
}

export interface SynthesizeDubvoiceTaskInput {
  checkpoint?: VoiceRequestCheckpoint
  // Body completo de POST /api/v1/tts (text, voice_id, voice_settings…).
  body: Record<string, unknown>
  textLength: number
  apiKey: string
  // Nombre del motor para los mensajes de error.
  laneName: string
  signal?: AbortSignal
  onProgress(progress: DubvoiceTaskProgress): void
}

export async function synthesizeDubvoiceTask({
  body,
  textLength,
  apiKey,
  laneName,
  signal,
  onProgress,
  checkpoint,
}: SynthesizeDubvoiceTaskInput): Promise<Buffer> {
  let taskId = checkpoint?.receipt.taskId
  if (!taskId) {
    signal?.throwIfAborted()
    const submitResponse = await dubvoiceFetch(
      `${DUBVOICE_BASE_URL}/api/v1/tts`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(body),
      },
      // Una vez enviado, esperar el recibo incluso si se canceló la UI. El
      // próximo job podrá consultar ese id en vez de pagar otra generación.
      { timeoutMs: SYNTHESIS_TIMEOUT_MS },
    )

    const submitData = (await submitResponse.json()) as DubvoiceTtsTaskResponse
    if (!submitData.task_id)
      throw new PipelineFailure(
        'voice_provider_error',
        `DubVoice returned no task_id for the ${laneName} synthesis`,
      )
    taskId = submitData.task_id
    await checkpoint?.update({ taskId, state: 'pending' })
  }

  const intervalMs = pollIntervalMs(textLength)
  const startedAt = checkpoint?.receipt.startedAt ?? Date.now()
  const pollStartedAt = Date.now()
  onProgress({
    percent: checkpoint?.receipt.percent ?? 0,
    status: 'processing',
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
  let firstPoll = true

  while (Date.now() - pollStartedAt < POLL_TIMEOUT_MS) {
    signal?.throwIfAborted()
    if (!firstPoll) await delay(intervalMs, undefined, { signal })
    firstPoll = false

    let response: Response
    try {
      response = await fetch(
        `${DUBVOICE_BASE_URL}/api/v1/tts?task_id=${encodeURIComponent(taskId)}`,
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
    ) {
      await checkpoint?.update({ percent: data.progress })
      onProgress({
        percent: data.progress,
        status: data.status ?? 'processing',
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      })
    }

    if (data.status === 'completed' && data.result) {
      await checkpoint?.update({ resultUrl: data.result, percent: 100 })
      return downloadAudioFromUrl(data.result, signal)
    }
    if (data.status === 'failed') {
      await checkpoint?.update({ state: 'failed' })
      throw new PipelineFailure(
        'voice_generation_failed',
        data.error ?? `${laneName} task failed`,
      )
    }
  }

  throw new PipelineFailure(
    'voice_timeout',
    `${laneName} task did not complete within 20 minutes`,
  )
}
