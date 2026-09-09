import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { synthesizeInParts } from '../../providers/tts/chunked-synthesis.ts'
import type { AudioDownload } from '../../providers/tts/dubvoice.ts'
import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import { TTS_TEXT_CHAR_LIMIT } from '../../providers/tts/text-limits.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { JsonValue } from '../../types/json.ts'
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

function forcedNarrationLanguage(
  language?: string,
): NarrationLanguage | undefined {
  if (language === 'es' || language === 'en') return language
  return undefined
}

// Genera la narración con el motor elegido y la persiste DIRECTO en el
// historial (a diferencia de música no hay variaciones que elegir): la entry
// vuelve en el job-completed y la UI la reproduce vía convertFileSrc. El
// texto se trocea al tope del motor (chunked-synthesis), hasta
// TTS_TEXT_CHAR_LIMIT en total.
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
  if (payload.text.length > TTS_TEXT_CHAR_LIMIT)
    throw new PipelineFailure(
      'voice_text_too_long',
      `text exceeds the ${TTS_TEXT_CHAR_LIMIT} character limit`,
    )

  const apiKey = provider.apiKeyOf(context.job.apiKeys)
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider.vendor} API key is missing`,
    )

  // El historial debe existir ANTES de sintetizar: fallar por projectsRoot
  // después de gastar créditos sería tirar la generación a la basura.
  const historyRoot = voiceHistoryRoot(context)

  // Números a palabras antes de sintetizar ("41" → "cuarenta y uno").
  const { text } = prepareNarrationText(
    payload.text,
    forcedNarrationLanguage(payload.language),
  )

  // La carpeta de la entry se crea antes: las partes y el manifest del troceo
  // viven ahí. Si la síntesis falla, se borra para no dejar una entry huérfana.
  const id = newHistoryId()
  const entryDirectory = join(historyRoot, id)
  await mkdir(entryDirectory, { recursive: true })
  const audioPath = join(entryDirectory, HISTORY_AUDIO_FILE)

  let download: AudioDownload
  try {
    download = await synthesizeInParts({
      provider,
      payload,
      text,
      apiKey,
      signal: context.signal,
      outputFile: audioPath,
      ffmpegPath: context.job.binaryPaths.ffmpeg,
      emitter: context.emitter,
      onProgress: (progress) => {
        // Shape de VoiceProgressDetail (tipado como JSON por el contrato del
        // evento); con una sola parte no viajan los campos de troceo.
        const detail: Record<string, JsonValue> = {
          status: progress.status,
          elapsedSeconds: progress.elapsedSeconds,
        }
        if (progress.partTotal > 1) {
          detail.partIndex = progress.partIndex
          detail.partTotal = progress.partTotal
        }
        context.emitter.emit({
          type: 'progress',
          percent: progress.percent,
          detail,
        })
      },
    })
  } catch (error) {
    await rm(entryDirectory, { recursive: true, force: true })
    throw error
  }

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
