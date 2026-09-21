import { toDataUri } from '../../providers/image/download.ts'
import { generateEvolinkImage } from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import {
  buildCustomPreviewRequest,
  buildPreviewScene,
} from '../../prompts/character-preview.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import {
  VISUAL_STYLES,
  assembleUserScenePrompt,
  isCharacterStyleId,
} from '../../prompts/visual-styles.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { extractImagePrompt } from '../../stages/scene-prompts/prompt-extraction.ts'
import { createSceneLlm } from '../../stages/shared/llm.ts'
import type {
  CharacterPreviewPhase,
  GenerateCharacterPreviewPayload,
  GenerateCharacterPreviewResult,
} from '../../types/characters.ts'
import type { DecodedImage } from '../../types/images.ts'
import type { ImageProviderId } from '../../types/image-provider.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import { assertValidStyleId, readStyleEntry } from '../styles/style-store.ts'
import { isPreviewStyleKey } from './preview-style.ts'

const MIN_IDENTITY_LENGTH = 10
// Cuánto tarda la gema en escribir el prompt del retrato en el caso típico:
// el LLM no informa avance, así que la fase «prompt» muestra un ramp simulado
// (mismo mecanismo que Fal con la imagen) para que la casilla no se quede
// quieta.
const PROMPT_EXPECTED_MS = 15_000

/**
 * Genera UNA imagen de cómo se vería el personaje en el estilo elegido. El
 * estilo se aplica ACÁ (solo para el preview); la identidad guardada queda
 * neutra y sirve para cualquier estilo.
 *
 * Con un estilo del catálogo el prompt sale de la plantilla fija. Con un
 * estilo propio la gema no es un sufijo de imagen sino un system prompt, así
 * que primero el LLM escribe el prompt del retrato (mismo mecanismo que las
 * muestras del estilo) y recién después se genera la imagen.
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
  const styleId = payload?.styleId
  if (!isPreviewStyleKey(styleId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.styleId is not a known visual style',
    )

  // Fail-safe del origen: solo un 'fal' explícito usa Fal; cualquier otro
  // valor cae a Evolink.
  const provider: ImageProviderId =
    payload?.provider === 'fal' ? 'fal' : 'evolink'
  const apiKey = context.job.apiKeys[provider]
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )

  const finalPrompt = isCharacterStyleId(styleId)
    ? assembleUserScenePrompt(
        VISUAL_STYLES[styleId],
        buildPreviewScene(identityPrompt, styleId),
      )
    : await writeCustomStylePrompt(context, styleId, identityPrompt)

  const image = await generateImage(context, provider, apiKey, finalPrompt)

  // El preview no se persiste acá: viaja como data URI y se guarda recién
  // cuando el usuario confirma el personaje.
  return { dataUri: toDataUri(image), finalPrompt }
}

// Estilo propio: la gema escribe el prompt del retrato. Ambas claves (LLM e
// imágenes) se exigen ANTES de gastar — la de imágenes ya se validó arriba.
async function writeCustomStylePrompt(
  context: PipelineContext,
  styleId: string,
  identityPrompt: string,
): Promise<string> {
  assertValidStyleId(styleId)
  const style = await readStyleEntry(context, styleId)
  if (!style)
    throw new PipelineFailure(
      'style_not_found',
      `style "${styleId}" does not exist`,
    )
  const llm = createSceneLlm(context)

  emitPhase(context, 'prompt')
  const stopProgress = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    (percent) => emitProgress(context, 'prompt', percent),
  )
  const response = await llm
    .generate({
      systemPrompt: buildCustomStyleSystemPrompt(style),
      userPrompt: buildCustomPreviewRequest(identityPrompt),
      jsonOnly: true,
      tier: 'balanced',
    })
    .finally(stopProgress)
  const imagePrompt = extractImagePrompt(response)
  if (!imagePrompt)
    throw new PipelineFailure(
      'llm_empty_response',
      'the style did not write a usable preview prompt',
    )

  return imagePrompt
}

async function generateImage(
  context: PipelineContext,
  provider: ImageProviderId,
  apiKey: string,
  prompt: string,
): Promise<DecodedImage> {
  emitPhase(context, 'image')
  const options = {
    apiKey,
    signal: context.signal,
    onFailure: createProviderFailureReporter(context.emitter),
    onProgress(progress: {
      percent: number
      status: string
      elapsedSeconds: number
    }) {
      context.emitter.emit({
        type: 'progress',
        percent: progress.percent,
        detail: {
          phase: 'image',
          status: progress.status,
          elapsedSeconds: progress.elapsedSeconds,
        },
      })
    },
  }

  if (provider === 'fal') return generateFalImage(prompt, options)
  return generateEvolinkImage(prompt, options)
}

function emitPhase(context: PipelineContext, phase: CharacterPreviewPhase) {
  emitProgress(context, phase, 0)
}

function emitProgress(
  context: PipelineContext,
  phase: CharacterPreviewPhase,
  percent: number,
) {
  context.emitter.emit({ type: 'progress', percent, detail: { phase } })
}
