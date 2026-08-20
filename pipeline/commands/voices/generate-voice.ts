import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AudioDownload } from '../../providers/tts/dubvoice.ts'
import { synthesizeEdge } from '../../providers/tts/edge.ts'
import { synthesizeElevenLabs } from '../../providers/tts/elevenlabs.ts'
import { synthesizeMinimax } from '../../providers/tts/minimax.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  GenerateVoicePayload,
  GenerateVoiceResult,
  VoiceProviderId,
} from '../../types/voices.ts'
import {
  prepareNarrationText,
  type NarrationLanguage,
} from '../../utils/narration-text.ts'
import {
  HISTORY_AUDIO_FILE,
  newHistoryId,
  voiceHistoryRoot,
  writeHistoryMetadata,
  type StoredVoiceMetadata,
} from './voice-history.ts'

// Cap de texto por proveedor, espejado en la UI (constants del módulo voices).
// Minimax topa ~5000 chars por llamada; 4500 deja margen. El troceo + concat
// con FFmpeg se difiere a la stage voice de Create (ADR-0010).
export const VOICE_TEXT_LIMITS: Record<VoiceProviderId, number> = {
  minimax: 4500,
  elevenlabs: 4500,
  edge: 4500,
}

const METADATA_TEXT_LIMIT = 1000
const HEURISTIC_TICK_MS = 1000
const HEURISTIC_MIN_EXPECTED_MS = 5000
const HEURISTIC_MS_PER_CHAR = 25
const HEURISTIC_PERCENT_CAP = 95

const VOICE_PROVIDERS = new Set(['minimax', 'elevenlabs', 'edge'])

function forcedNarrationLanguage(
  language?: string,
): NarrationLanguage | undefined {
  if (language === 'es' || language === 'en') return language
  return undefined
}

// Minimax y Edge son sincrónicos: el progreso es un heurístico por largo del
// texto, cap 95% hasta que el proveedor responde (port del SSE del origen).
function startHeuristicProgress(context: PipelineContext, textLength: number) {
  const expectedMs = Math.max(
    HEURISTIC_MIN_EXPECTED_MS,
    textLength * HEURISTIC_MS_PER_CHAR,
  )
  const startedAt = Date.now()
  const timer = setInterval(() => {
    const elapsedMs = Date.now() - startedAt
    context.emitter.emit({
      type: 'progress',
      percent: Math.min(
        HEURISTIC_PERCENT_CAP,
        Math.floor((elapsedMs / expectedMs) * 100),
      ),
      detail: {
        status: 'processing',
        elapsedSeconds: Math.round(elapsedMs / 1000),
      },
    })
  }, HEURISTIC_TICK_MS)

  return () => clearInterval(timer)
}

function synthesize(
  context: PipelineContext,
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
): Promise<AudioDownload> {
  if (payload.provider === 'elevenlabs')
    return synthesizeElevenLabs(
      payload,
      text,
      apiKey,
      context.signal,
      (progress) => {
        context.emitter.emit({
          type: 'progress',
          percent: progress.percent,
          detail: {
            status: progress.status,
            elapsedSeconds: progress.elapsedSeconds,
          },
        })
      },
    ).then((audio) => ({ audio }))

  if (payload.provider === 'edge')
    return synthesizeEdge(payload, text, apiKey, context.signal)

  return synthesizeMinimax(payload, text, apiKey, context.signal)
}

// Genera la narración con el motor elegido y la persiste DIRECTO en el
// historial (a diferencia de música no hay variaciones que elegir): la entry
// vuelve en el job-completed y la UI la reproduce vía convertFileSrc.
export async function generateVoiceCommand(
  context: PipelineContext,
): Promise<GenerateVoiceResult> {
  const payload = context.job.payload as GenerateVoicePayload | undefined
  if (
    !payload?.provider ||
    !VOICE_PROVIDERS.has(payload.provider) ||
    !payload.voiceId ||
    !payload.text?.trim()
  )
    throw new PipelineFailure(
      'invalid_payload',
      'payload.provider, payload.voiceId and payload.text are required',
    )
  if (payload.text.length > VOICE_TEXT_LIMITS[payload.provider])
    throw new PipelineFailure(
      'voice_text_too_long',
      `text exceeds the ${VOICE_TEXT_LIMITS[payload.provider]} character limit for ${payload.provider}`,
    )

  const apiKey = context.job.apiKeys.dubvoice
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'dubvoice API key is missing')

  // El historial debe existir ANTES de sintetizar: fallar por projectsRoot
  // después de gastar créditos sería tirar la generación a la basura.
  const historyRoot = voiceHistoryRoot(context)

  // Números a palabras antes de sintetizar ("41" → "cuarenta y uno").
  const { text } = prepareNarrationText(
    payload.text,
    forcedNarrationLanguage(payload.language),
  )

  const usesHeuristicProgress = payload.provider !== 'elevenlabs'
  const stopHeuristicProgress = usesHeuristicProgress
    ? startHeuristicProgress(context, text.length)
    : null

  let download: AudioDownload
  try {
    download = await synthesize(context, payload, text, apiKey)
  } finally {
    stopHeuristicProgress?.()
  }

  const id = newHistoryId()
  const entryDirectory = join(historyRoot, id)
  await mkdir(entryDirectory, { recursive: true })
  const audioPath = join(entryDirectory, HISTORY_AUDIO_FILE)
  await writeFile(audioPath, download.audio)

  const metadata: StoredVoiceMetadata = {
    id,
    createdAt: new Date().toISOString(),
    provider: payload.provider,
    voiceId: payload.voiceId,
    text: text.slice(0, METADATA_TEXT_LIMIT),
    charsCount: text.length,
  }
  if (payload.voiceName) metadata.voiceName = payload.voiceName
  if (payload.model) metadata.model = payload.model
  if (download.creditsUsed !== undefined)
    metadata.creditsUsed = download.creditsUsed

  await writeHistoryMetadata(entryDirectory, metadata)

  const result: GenerateVoiceResult = { entry: { ...metadata, audioPath } }
  if (download.creditsRemaining !== undefined)
    result.creditsRemaining = download.creditsRemaining

  return result
}
