import { PipelineFailure } from '../../runner/failure.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { isInsufficientCreditsResponse } from '../../utils/insufficient-credits.ts'
import { sleep } from '../../utils/sleep.ts'
import type {
  DubvoiceAccountResponse,
  VoiceCreditsResult,
} from '../../types/voices.ts'

// Núcleo compartido del cliente DubVoice (agregador único de TTS del origen:
// Minimax + ElevenLabs + Edge detrás de una sola API key). Port de la
// plomería de `app/servidor-local/rutas/voces.ts` + `util/limitadorTasa.ts`,
// adaptado al patrón evolink: el rate-limit cross-job del server viejo no
// aplica (un proceso por job); los reintentos 429 viven DENTRO del job.
export const DUBVOICE_BASE_URL = 'https://www.dubvoice.ai'

export const LIST_TIMEOUT_MS = 30_000
export const SYNTHESIS_TIMEOUT_MS = 300_000
export const DOWNLOAD_TIMEOUT_MS = 120_000

const RATE_LIMIT_MAX_RETRIES = 6

export function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export function requestSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

// Una cancelación pedida debe salir como tal, no como error de red.
export function rethrowIfCancelled(
  signal: AbortSignal | undefined,
  error: unknown,
) {
  if (signal?.aborted) throw error
}

function isMaintenance(status: number, bodyText: string): boolean {
  if (status === 502 || status === 503 || status === 504) return true
  return /FEATURE_MAINTENANCE|maintenance|bad gateway/i.test(bodyText)
}

export interface DubvoiceFetchOptions {
  timeoutMs: number
  signal?: AbortSignal
}

/**
 * fetch contra DubVoice con reintentos ante 429 y clasificación de errores a
 * codes `voice_*` estables. Devuelve la Response solo si vino ok; el caller
 * decide cómo leer el cuerpo (audio binario, JSON, etc.).
 */
export async function dubvoiceFetch(
  url: string,
  init: RequestInit,
  options: DubvoiceFetchOptions,
): Promise<Response> {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: requestSignal(options.timeoutMs, options.signal),
    }).catch((error: unknown) => {
      rethrowIfCancelled(options.signal, error)
      throw new PipelineFailure('voice_network', 'DubVoice request failed')
    })

    if (response.ok) return response

    const bodyText = await response.text().catch(() => '')

    // Saldo agotado antes que la clave: DubVoice puede responder 402 o 403
    // con detalle de créditos, y reintentar solo repite el rechazo (ADR-0031).
    if (isInsufficientCreditsResponse(response.status, bodyText))
      throw new PipelineFailure(
        'voice_insufficient_credits',
        `DubVoice rejected the request for insufficient credits (status=${response.status}): ${bodyText.slice(0, 200)}`,
      )

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'voice_invalid_api_key',
        `DubVoice rejected the API key (status=${response.status})`,
      )

    if (response.status === 429) {
      if (attempt === RATE_LIMIT_MAX_RETRIES)
        throw new PipelineFailure(
          'voice_rate_limited',
          `DubVoice rate limit persisted after ${RATE_LIMIT_MAX_RETRIES} retries`,
        )
      await sleep(rateLimitDelayMs(response, bodyText, attempt), options.signal)
      options.signal?.throwIfAborted()
      continue
    }

    if (isMaintenance(response.status, bodyText))
      throw new PipelineFailure(
        'voice_maintenance',
        `DubVoice is under maintenance (status=${response.status})`,
      )

    throw new PipelineFailure(
      'voice_provider_error',
      `DubVoice request failed (status=${response.status}): ${bodyText.slice(0, 200)}`,
    )
  }

  // Inalcanzable: el loop retorna o lanza; TypeScript no lo sabe.
  throw new PipelineFailure('voice_provider_error', 'unreachable retry loop')
}

export interface AudioDownload {
  audio: Buffer
  creditsUsed?: number
  creditsRemaining?: number
}

function creditsHeader(response: Response, name: string): number | undefined {
  const value = Number(response.headers.get(name))
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * Lee el cuerpo de una respuesta que DEBE ser audio. DubVoice a veces devuelve
 * 200 con JSON de error o HTML de mantenimiento: validar el content-type antes
 * de aceptar evita guardar un mp3 corrupto (port de DescargaAudioError).
 */
export async function readAudioResponse(
  response: Response,
): Promise<AudioDownload> {
  const contentType = response.headers.get('content-type') ?? ''
  if (
    contentType.startsWith('application/json') ||
    contentType.startsWith('text/')
  )
    throw new PipelineFailure(
      'voice_empty_audio',
      `DubVoice returned non-audio content (content-type=${contentType})`,
    )

  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length)
    throw new PipelineFailure(
      'voice_empty_audio',
      'DubVoice returned 0 bytes of audio',
    )

  return {
    audio,
    creditsUsed: creditsHeader(response, 'x-credits-used'),
    creditsRemaining: creditsHeader(response, 'x-credits-remaining'),
  }
}

// Descarga desde el CDN externo (sin auth ni rate limit de DubVoice).
export async function downloadAudioFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const response = await fetch(url, {
    signal: requestSignal(DOWNLOAD_TIMEOUT_MS, signal),
  }).catch((error: unknown) => {
    rethrowIfCancelled(signal, error)
    throw new PipelineFailure(
      'voice_download_failed',
      'Voice audio download request failed',
    )
  })

  if (!response.ok)
    throw new PipelineFailure(
      'voice_download_failed',
      `Voice audio download failed (status=${response.status})`,
    )

  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length)
    throw new PipelineFailure(
      'voice_download_failed',
      'Voice audio download returned 0 bytes',
    )

  return audio
}

// Cuenta y saldo de DubVoice (GET /api/v1/me).
export async function getDubvoiceAccount(
  apiKey: string,
  signal?: AbortSignal,
): Promise<VoiceCreditsResult> {
  const response = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/v1/me`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const data = (await response.json()) as DubvoiceAccountResponse
  const result: VoiceCreditsResult = {
    vendor: 'dubvoice',
    unit: 'credits',
    credits: data.credits ?? 0,
  }
  if (data.email) result.email = data.email
  if (data.plan) result.plan = data.plan

  return result
}
