import { toDataUri } from '../../providers/image/download.ts'
import { generateEvolinkImage } from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import { buildPreviewScene } from '../../prompts/character-preview.ts'
import {
  VISUAL_STYLES,
  assembleUserScenePrompt,
  isCharacterStyleId,
} from '../../prompts/visual-styles.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  GenerateCharacterPreviewPayload,
  GenerateCharacterPreviewResult,
} from '../../types/characters.ts'
import type { FalImageModelId } from '../../types/image-provider.ts'
import type { DecodedImage } from '../../types/images.ts'

const MIN_IDENTITY_LENGTH = 10
const FAL_MODELS: FalImageModelId[] = ['gpt-image-2', 'flux-schnell']
const DEFAULT_FAL_MODEL: FalImageModelId = 'gpt-image-2'

/**
 * Genera UNA imagen de cómo se vería el personaje en el estilo elegido. El
 * estilo se aplica ACÁ (solo para el preview); la identidad guardada queda
 * neutra y sirve para los 5 estilos.
 */
export async function generateCharacterPreview(
  context: PipelineContext,
): Promise<GenerateCharacterPreviewResult> {
  const payload = context.job.payload as
    GenerateCharacterPreviewPayload | undefined

  const identityPrompt = payload?.identityPrompt?.trim() ?? ''
  if (identityPrompt.length < MIN_IDENTITY_LENGTH)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.identityPrompt must be at least ${MIN_IDENTITY_LENGTH} characters`,
    )
  if (!isCharacterStyleId(payload?.styleId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.styleId is not a known visual style',
    )

  // Fail-safe del origen: solo un 'fal' explícito usa Fal. Con cualquier otro
  // valor el preview salía en FLUX y no se parecía al video.
  const provider = payload?.provider === 'fal' ? 'fal' : 'evolink'
  const apiKey = context.job.apiKeys[provider]
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )

  const finalPrompt = assembleUserScenePrompt(
    VISUAL_STYLES[payload.styleId],
    buildPreviewScene(identityPrompt, payload.styleId),
  )

  const options = {
    apiKey,
    signal: context.signal,
    onProgress(progress: {
      percent: number
      status: string
      elapsedSeconds: number
    }) {
      context.emitter.emit({
        type: 'progress',
        percent: progress.percent,
        detail: {
          status: progress.status,
          elapsedSeconds: progress.elapsedSeconds,
        },
      })
    },
  }

  let image: DecodedImage
  if (provider === 'fal') {
    const falModel =
      payload?.falModel && FAL_MODELS.includes(payload.falModel)
        ? payload.falModel
        : DEFAULT_FAL_MODEL
    image = await generateFalImage(finalPrompt, falModel, options)
  } else {
    image = await generateEvolinkImage(finalPrompt, options)
  }

  // El preview no se persiste acá: viaja como data URI y se guarda recién
  // cuando el usuario confirma el personaje.
  return { dataUri: toDataUri(image), finalPrompt }
}
