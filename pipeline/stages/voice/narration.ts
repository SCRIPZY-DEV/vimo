import {
  synthesizeInParts,
  type PartsProgress,
} from '../../providers/tts/chunked-synthesis.ts'
import type { TtsProvider } from '../../providers/tts/provider.ts'
import { isUnsettledVoiceRequest } from '../../providers/tts/request-checkpoint.ts'
import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import type { VoiceProgressEvent } from '../../runner/events.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { GenerateVoicePayload } from '../../types/voices.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { prepareNarrationText } from '../../utils/narration-text.ts'
import type { CreateVideoContext } from '../context.ts'

// Síntesis de la narración maestra (port de generarVozMaestra): recorre los
// carriles que declara el motor elegido (TtsProvider), trocea al tope de cada
// motor (chunked-synthesis, ADR-0025) y emite progreso cada 1s hacia la UI.
const PROGRESS_TICK_MS = 1000
// Solo rechazos confirmados permiten otro encargo. Un error de disco o de
// transporte posterior al cobro debe conservar las partes y el recibo.
const FALLBACK_REJECTION_CODES = new Set([
  'voice_generation_failed',
  'voice_invalid_api_key',
  'voice_insufficient_credits',
  'voice_quota_exceeded',
  'voice_rate_limited',
  'voice_account_restricted',
])

interface NarrationAttempt {
  name: string
  execute(): Promise<void>
}

export async function synthesizeNarration(
  context: CreateVideoContext,
  script: string,
): Promise<void> {
  const options = context.options
  const provider = resolveTtsProvider(options.voiceProvider)
  if (!provider || !options.voiceId)
    throw new PipelineFailure(
      'voice_not_configured',
      `narrationMode is tts but the project has no voiceId or its voiceProvider is not one of: ${TTS_PROVIDER_IDS}`,
    )

  const apiKey = provider.apiKeyOf(context.job.apiKeys)
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider.vendor} API key is missing`,
    )

  // Números a palabras ANTES de mandar al proveedor (si no, «41» se
  // pronuncia «cuatro uno»); el idioma detectado también viaja al proveedor.
  const { text, language } = prepareNarrationText(script)
  const payload: GenerateVoicePayload = {
    provider: provider.id,
    voiceId: options.voiceId,
    text: '',
    language,
    settings: options.voiceSettings,
  }

  // Timer de progreso: `percent` viaja cuando es real (motor con polling) o
  // cuando hay varias partes (agregado); con una sola parte de Minimax/Edge
  // queda vacío y la UI dibuja su curva sintética.
  let lastProgress: PartsProgress | undefined
  const startedAt = Date.now()
  const progressTimer = setInterval(() => {
    context.emitter.emit({
      type: 'voice-progress',
      provider: provider.id,
      totalChars: text.length,
      elapsedSeconds: Math.max(
        lastProgress?.elapsedSeconds ?? 0,
        Math.floor((Date.now() - startedAt) / 1000),
      ),
      ...progressFields(provider, lastProgress),
    })
  }, PROGRESS_TICK_MS)

  const attempts = buildAttempts(
    context,
    provider,
    payload,
    text,
    apiKey,
    (progress) => {
      lastProgress = progress
    },
  )

  try {
    const failures: string[] = []
    // El primer carril rechazado por saldo: si ningún otro carril pudo, el
    // job cae con ESE código (pausa retomable) y no con el genérico.
    let creditsFailure: PipelineFailure | null = null
    for (const [index, attempt] of attempts.entries()) {
      if (index > 0)
        context.emitter.emit({
          type: 'log',
          level: 'warn',
          message: `voice lane "${attempts[index - 1].name}" failed; falling back to "${attempt.name}"`,
        })

      try {
        await attempt.execute()
        return
      } catch (error) {
        // Cancelación pedida: se propaga tal cual, no es un fallo del carril.
        context.signal.throwIfAborted()
        if (isUnsettledVoiceRequest(error)) throw error
        if (
          !(error instanceof PipelineFailure) ||
          !FALLBACK_REJECTION_CODES.has(error.code)
        )
          throw error
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`${attempt.name}: ${message}`)
        if (!creditsFailure && isInsufficientCreditsFailure(error))
          creditsFailure = error
      }
    }

    if (creditsFailure)
      throw new PipelineFailure(
        creditsFailure.code,
        `no voice lane could synthesize the narration (insufficient credits):\n${failures.join('\n')}`,
      )

    throw new PipelineFailure(
      'voice_all_lanes_failed',
      `no voice lane could synthesize the narration:\n${failures.join('\n')}`,
    )
  } finally {
    clearInterval(progressTimer)
  }
}

function progressFields(
  provider: TtsProvider,
  progress: PartsProgress | undefined,
): Pick<VoiceProgressEvent, 'percent' | 'partIndex' | 'partTotal'> {
  if (!progress) return {}

  const multipart = progress.partTotal > 1
  const parts = multipart
    ? { partIndex: progress.partIndex, partTotal: progress.partTotal }
    : {}
  if (!provider.reportsProgress && !multipart) return parts
  return { percent: progress.percent, ...parts }
}

// Carriles en orden de preferencia: el motor elegido y después los fallbacks
// que declara por id (ElevenLabs vía DubVoice ↔ ElevenLabs directo, con la
// MISMA voz), solo los que el usuario puede pagar con sus claves. Todos pasan
// por synthesizeToNarrationFile: el troceo y el reuso de partes ya pagadas
// aplican en cualquier carril, no solo en el principal. Ojo: cada carril
// trocea a su tamaño, así que las partes de un carril no se reusan en otro.
function buildAttempts(
  context: CreateVideoContext,
  provider: TtsProvider,
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  onProgress: (progress: PartsProgress) => void,
): NarrationAttempt[] {
  const lanes: { provider: TtsProvider; apiKey: string }[] = [
    { provider, apiKey },
  ]
  for (const fallbackId of provider.fallbackProviderIds ?? []) {
    const fallback = resolveTtsProvider(fallbackId)
    const fallbackApiKey = fallback?.apiKeyOf(context.job.apiKeys)
    if (!fallback || !fallbackApiKey) continue
    lanes.push({ provider: fallback, apiKey: fallbackApiKey })
  }

  return lanes.map((lane) => ({
    name: lane.provider.laneName,
    execute: () =>
      synthesizeToNarrationFile(
        context,
        lane.provider,
        { ...payload, provider: lane.provider.id },
        text,
        lane.apiKey,
        onProgress,
      ),
  }))
}

async function synthesizeToNarrationFile(
  context: CreateVideoContext,
  provider: TtsProvider,
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  onProgress: (progress: PartsProgress) => void,
): Promise<void> {
  await synthesizeInParts({
    provider,
    payload,
    text,
    apiKey,
    signal: context.signal,
    outputFile: context.paths.narrationFile,
    ffmpegPath: context.job.binaryPaths.ffmpeg,
    emitter: context.emitter,
    onProgress,
  })
}
