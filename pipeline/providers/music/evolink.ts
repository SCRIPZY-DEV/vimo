import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import type {
  EvolinkCredits,
  EvolinkCreditsResponse,
  EvolinkGenerationResponse,
  EvolinkTaskResponse,
  MusicGenerationOptions,
  MusicGenerationParams,
  MusicGenerationResult,
  MusicOption,
} from '../../types/music.ts'

// Port unificado de los dos flujos Evolink del origen (el provider axios del
// pipeline y el endpoint SSE del servidor): crear tarea → polling → normalizar
// resultados, con la normalización de aliases más amplia de las dos.
const EVOLINK_BASE_URL = 'https://api.evolink.ai'
const MUSIC_MODEL = 'suno-v5-beta'
const POLL_INTERVAL_MS = 5000
const MAX_POLL_ATTEMPTS = 120 // 120 × 5 s = 10 minutos
const SIMPLE_PROMPT_LIMIT = 500
const CREATE_TIMEOUT_MS = 60_000
const POLL_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 120_000

// Alias que Evolink usa según versión/modelo en los items del resultado.
const AUDIO_URL_KEYS = [
  'audio_url',
  'audioUrl',
  'url',
  'stream_audio_url',
  'streamAudioUrl',
  'song_url',
  'songUrl',
]
const COVER_URL_KEYS = [
  'image_url',
  'imageUrl',
  'image_large_url',
  'imageLargeUrl',
  'cover_url',
  'coverUrl',
  'cover',
  'image',
  'thumbnail',
  'thumb_url',
  'thumbUrl',
  'artwork_url',
  'artworkUrl',
]
const TITLE_KEYS = ['title', 'titulo']
const DURATION_KEYS = ['duration', 'duration_seconds']

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function requestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

// Una cancelación pedida debe salir como tal, no como error de red.
function rethrowIfCancelled(signal: AbortSignal | undefined, error: unknown) {
  if (signal?.aborted) throw error
}

function pickString(
  item: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return undefined
}

function pickNumber(
  item: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }

  return undefined
}

function normalizeResults(results: unknown[]): MusicOption[] {
  const options: MusicOption[] = []

  for (const item of results) {
    if (typeof item === 'string') {
      if (item.trim()) options.push({ audioUrl: item.trim() })
      continue
    }
    if (!item || typeof item !== 'object') continue

    const record = item as Record<string, unknown>
    const audioUrl = pickString(record, AUDIO_URL_KEYS)
    if (!audioUrl) continue

    options.push({
      audioUrl,
      coverUrl: pickString(record, COVER_URL_KEYS),
      title: pickString(record, TITLE_KEYS),
      durationSeconds: pickNumber(record, DURATION_KEYS),
    })
  }

  return options
}

async function createTask(
  params: MusicGenerationParams,
  options: MusicGenerationOptions,
): Promise<{ taskId: string; estimatedCredits: number }> {
  const body: Record<string, unknown> = {
    model: MUSIC_MODEL,
    custom_mode: false,
    instrumental: params.instrumental ?? true,
    prompt: params.prompt.slice(0, SIMPLE_PROMPT_LIMIT),
  }

  const response = await fetch(`${EVOLINK_BASE_URL}/v1/audios/generations`, {
    method: 'POST',
    headers: authHeaders(options.apiKey),
    body: JSON.stringify(body),
    signal: requestSignal(CREATE_TIMEOUT_MS, options.signal),
  }).catch((error: unknown) => {
    rethrowIfCancelled(options.signal, error)
    throw new PipelineFailure('music_network', 'Evolink create request failed')
  })

  if (response.status === 401 || response.status === 403)
    throw new PipelineFailure(
      'music_invalid_api_key',
      `Evolink rejected the API key (status=${response.status})`,
    )
  if (!response.ok)
    throw new PipelineFailure(
      'music_provider_error',
      `Evolink create failed (status=${response.status})`,
    )

  const data = (await response.json()) as EvolinkGenerationResponse
  if (!data.id)
    throw new PipelineFailure(
      'music_provider_error',
      'Evolink create returned no task id',
    )

  return {
    taskId: data.id,
    estimatedCredits: data.usage?.credits_reserved ?? 0,
  }
}

export async function generateMusic(
  params: MusicGenerationParams,
  options: MusicGenerationOptions,
): Promise<MusicGenerationResult> {
  const { taskId, estimatedCredits } = await createTask(params, options)
  await options.callbacks?.onEstimatedCredits?.(estimatedCredits)

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await delay(POLL_INTERVAL_MS, undefined, { signal: options.signal })

    let response: Response
    try {
      response = await fetch(`${EVOLINK_BASE_URL}/v1/tasks/${taskId}`, {
        headers: authHeaders(options.apiKey),
        signal: requestSignal(POLL_TIMEOUT_MS, options.signal),
      })
    } catch (error) {
      rethrowIfCancelled(options.signal, error)
      // Error de red transitorio: se reintenta en el próximo poll.
      continue
    }

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'music_invalid_api_key',
        `Evolink rejected the API key (status=${response.status})`,
      )
    if (response.status === 404)
      throw new PipelineFailure(
        'music_task_expired',
        `Evolink task ${taskId} expired`,
      )
    // 5xx es transitorio del lado de Evolink: se sigue esperando.
    if (response.status >= 500) continue
    if (!response.ok)
      throw new PipelineFailure(
        'music_provider_error',
        `Evolink poll failed (status=${response.status})`,
      )

    const data = (await response.json()) as EvolinkTaskResponse

    if (data.status === 'completed') {
      const musicOptions = normalizeResults(data.results ?? [])
      if (!musicOptions.length)
        throw new PipelineFailure(
          'music_provider_error',
          'Evolink completed without audio results',
        )

      return { options: musicOptions, estimatedCredits }
    }
    if (data.status === 'failed')
      throw new PipelineFailure(
        'music_generation_failed',
        data.error?.message ?? 'Evolink task failed',
      )

    await options.callbacks?.onProgress?.({
      percent: data.progress ?? 0,
      status: data.status ?? 'processing',
      elapsedSeconds: Math.round(((attempt + 1) * POLL_INTERVAL_MS) / 1000),
    })
  }

  throw new PipelineFailure(
    'music_timeout',
    'Evolink task did not complete within 10 minutes',
  )
}

export async function downloadMusicAudio(
  audioUrl: string,
  destinationPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(audioUrl, {
    signal: requestSignal(DOWNLOAD_TIMEOUT_MS, signal),
  }).catch((error: unknown) => {
    rethrowIfCancelled(signal, error)
    throw new PipelineFailure(
      'music_download_failed',
      'Music download request failed',
    )
  })

  if (!response.ok)
    throw new PipelineFailure(
      'music_download_failed',
      `Music download failed (status=${response.status})`,
    )

  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length)
    throw new PipelineFailure(
      'music_download_failed',
      'Music download returned 0 bytes',
    )

  await mkdir(dirname(destinationPath), { recursive: true })
  await writeFile(destinationPath, audio)
}

export async function getEvolinkCredits(
  apiKey: string,
  signal?: AbortSignal,
): Promise<EvolinkCredits> {
  const response = await fetch(`${EVOLINK_BASE_URL}/v1/credits`, {
    headers: authHeaders(apiKey),
    signal: requestSignal(POLL_TIMEOUT_MS, signal),
  }).catch((error: unknown) => {
    rethrowIfCancelled(signal, error)
    throw new PipelineFailure('music_network', 'Evolink credits request failed')
  })

  if (response.status === 401 || response.status === 403)
    throw new PipelineFailure(
      'music_invalid_api_key',
      `Evolink rejected the API key (status=${response.status})`,
    )
  if (!response.ok)
    throw new PipelineFailure(
      'music_provider_error',
      `Evolink credits failed (status=${response.status})`,
    )

  const data = (await response.json()) as EvolinkCreditsResponse
  const token = data.data?.token
  const user = data.data?.user

  return {
    // El token puede reportar créditos "infinitos" en planes enterprise: el
    // saldo real es el del usuario cuando existe (bug histórico del origen).
    // Por lo mismo, "ilimitado" solo aplica si no hay saldo de usuario.
    remaining: user?.remaining_credits ?? token?.remaining_credits ?? 0,
    used: user?.used_credits ?? token?.used_credits ?? 0,
    unlimited:
      user?.remaining_credits === undefined &&
      (token?.unlimited_credits ?? false),
    userRemaining: user?.remaining_credits ?? 0,
    userUsed: user?.used_credits ?? 0,
    tokenRemaining: token?.remaining_credits ?? 0,
    tokenUsed: token?.used_credits ?? 0,
  }
}
