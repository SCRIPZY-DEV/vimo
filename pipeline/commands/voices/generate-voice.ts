import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AudioDownload } from '../../providers/tts/dubvoice.ts'
import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  GenerateVoicePayload,
  GenerateVoiceResult,
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

const METADATA_TEXT_LIMIT = 1000
const HEURISTIC_TICK_MS = 1000
const HEURISTIC_MIN_EXPECTED_MS = 5000
const HEURISTIC_MS_PER_CHAR = 25
const HEURISTIC_PERCENT_CAP = 95

function forcedNarrationLanguage(
  language?: string,
): NarrationLanguage | undefined {
  if (language === 'es' || language === 'en') return language
  return undefined
}

// Motores sin progreso real (reportsProgress false): el avance es un
// heurístico por largo del texto, cap 95% hasta que el proveedor responde
// (port del SSE del origen).
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

// Genera la narración con el motor elegido y la persiste DIRECTO en el
// historial (a diferencia de música no hay variaciones que elegir): la entry
// vuelve en el job-completed y la UI la reproduce vía convertFileSrc.
export async function generateVoiceCommand(
  context: PipelineContext,
): Promise<GenerateVoiceResult> {
  const payload = context.job.payload as GenerateVoicePayload | undefined
  const provider = resolveTtsProvider(payload?.provider)
  if (!provider || !payload?.voiceId || !payload.text?.trim())
    throw new PipelineFailure(
      'invalid_payload',
      `payload.provider (one of: ${TTS_PROVIDER_IDS}), payload.voiceId and payload.text are required`,
    )
  if (payload.text.length > provider.requestCharLimit)
    throw new PipelineFailure(
      'voice_text_too_long',
      `text exceeds the ${provider.requestCharLimit} character limit for ${provider.id}`,
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

  const stopHeuristicProgress = provider.reportsProgress
    ? null
    : startHeuristicProgress(context, text.length)

  let download: AudioDownload
  try {
    download = await provider.synthesize({
      payload,
      text,
      apiKey,
      signal: context.signal,
      onProgress: (progress) => {
        context.emitter.emit({
          type: 'progress',
          percent: progress.percent,
          detail: {
            status: progress.status,
            elapsedSeconds: progress.elapsedSeconds,
          },
        })
      },
    })
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
