import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  generateFlowBatch,
  verifyFlowExecutionPlan,
} from '../../providers/flow/client.ts'
import {
  assertFlowPlanProvider,
  flowExecutionRevision,
} from '../../providers/flow/execution-plan.ts'
import type { FlowToolsExecutionPlan } from '../../types/flow-execution-plan.ts'
import { flowJpeg } from '../../providers/flow/import-image.ts'
import {
  flowHash,
  flowIntentDirectory,
  readPendingFlowBatch,
  writeFlowFile,
} from '../../providers/flow/storage.ts'
import { toDataUri } from '../../providers/image/download.ts'
import { generateEvolinkImage } from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import {
  CUSTOM_PORTRAIT_REQUEST,
  buildPreviewScene,
} from '../../prompts/character-preview.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import {
  applyFixedPhrases,
  fixedPhrasesInLanguage,
  stripFixedPhrases,
} from '../../prompts/template-frame.ts'
import {
  VISUAL_STYLES,
  assembleUserScenePrompt,
  isCharacterStyleId,
} from '../../prompts/visual-styles.ts'
import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { extractImagePrompt } from '../../stages/scene-prompts/prompt-extraction.ts'
import { weavePortraitSubject } from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  createSceneLlm,
  type SceneLlm,
  type SceneLlmRequest,
} from '../../stages/shared/llm.ts'
import type {
  CharacterPreviewPhase,
  GenerateCharacterPreviewPayload,
  GenerateCharacterPreviewResult,
} from '../../types/characters.ts'
import type { DecodedImage } from '../../types/images.ts'
import type { ImageProviderId } from '../../types/image-provider.ts'
import type { CustomStyleSummary, GemSections } from '../../types/styles.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import { resolveCatalogGem } from '../catalog/catalog-cache.ts'
import { wantsRemoteCatalog } from '../catalog/catalog-store.ts'
import { assertValidStyleId, readStyleEntry } from '../styles/style-store.ts'
import { isPreviewStyleKey } from './preview-style.ts'

const MIN_IDENTITY_LENGTH = 10
// Quién escribe la escena del retrato con estilo propio, en orden: el
// primero que devuelve una escena usable gana. No es el modelo del usuario
// ni el tier balanced: el 2026-10-04, con el mismo pedido y los estilos del
// dueño, Qwen3 235B (balanced) tardó de 40 a 57 s y 2 de 6 pedidos dieron
// `llm_rate_limited`, GPT o4-mini TURBO devolvió vacío o perdió la
// descripción y DeepSeek V4.1 Flash tardó de 1,6 a 4 s. Con el pedido
// nuevo, V4.1 Flash escribió las 10 escenas de prueba en 1 a 10 s.
const PORTRAIT_SCENE_MODELS = [
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'deepseek-ai/DeepSeek-V3.2',
] as const
// Tope por modelo: la escena de un retrato es corta y un modelo trabado no
// puede dejar la casilla quieta dos minutos (el tope general es de 120 s).
const PORTRAIT_SCENE_TIMEOUT_MS = 30_000
// Cuánto tarda la gema en escribir la escena del retrato en el caso típico:
// el LLM no informa avance, así que la fase «prompt» muestra un ramp simulado
// (mismo mecanismo que Fal con la imagen) para que la casilla no se quede
// quieta.
const PROMPT_EXPECTED_MS = 4_000

/** Lo que la gema aporta al retrato: su texto, o sus secciones y planos. */
type PreviewGem = Pick<
  CustomStyleSummary,
  'systemPrompt' | 'sections' | 'shots'
>

/**
 * Genera UNA imagen de cómo se vería el personaje en el estilo elegido. El
 * estilo se aplica ACÁ (solo para el preview); la identidad guardada queda
 * neutra y sirve para cualquier estilo.
 *
 * Con uno de los 5 estilos heredados el prompt sale de la plantilla fija. Con
 * un estilo propio o una gema nueva del catálogo la gema no es un sufijo de
 * imagen sino un system prompt, así que primero el LLM escribe la escena del
 * retrato, la descripción se teje como en una escena del video y recién
 * después se genera la imagen.
 */
export async function generateCharacterPreview(
  context: PipelineContext,
): Promise<GenerateCharacterPreviewResult> {
  const payload = context.job.payload as
    GenerateCharacterPreviewPayload | undefined
  const executionPlan = assertFlowPlanProvider(
    payload?.executionPlan,
    payload?.provider,
  )

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

  const provider: ImageProviderId =
    payload?.provider === 'flow'
      ? 'flow'
      : payload?.provider === 'fal'
        ? 'fal'
        : 'evolink'
  if (provider === 'flow')
    return generateFlowCharacterPreview(
      context,
      styleId,
      identityPrompt,
      executionPlan,
    )
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

// Estilo propio o gema nueva del catálogo: la gema escribe la escena del
// retrato y la descripción guardada se teje palabra por palabra, como en cada
// escena del video (enmienda del 2026-10-04 a la ADR-0021): el retrato
// muestra al mismo personaje que el video. Ambas claves (LLM e imágenes) se
// exigen ANTES de gastar — la de imágenes ya se validó arriba.
async function writeCustomStylePrompt(
  context: PipelineContext,
  styleId: string,
  identityPrompt: string,
  resolvedStyle?: PreviewGem,
): Promise<string> {
  const style =
    resolvedStyle ??
    (await readPreviewGem(
      context,
      styleId,
      wantsRemoteCatalog(context.job.payload),
    ))
  const writers = PORTRAIT_SCENE_MODELS.map((model) => ({
    model,
    llm: portraitSceneLlm(context, model),
  }))

  emitPhase(context, 'prompt')
  const stopProgress = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    (percent) => emitProgress(context, 'prompt', percent),
  )
  const scene = await writePortraitScene(context, writers, {
    systemPrompt: buildCustomStyleSystemPrompt(style),
    userPrompt: CUSTOM_PORTRAIT_REQUEST,
    jsonOnly: true,
    tier: 'balanced',
  }).finally(stopProgress)

  if (!style.sections) return weavePortraitSubject(scene, identityPrompt)

  // Una gema de plantilla pega sus frases fijas también al retrato: van en
  // cada prompt de imagen (spec §4.1). El texto de la gema se las muestra al
  // modelo, así que si las copió se quita esa copia antes de pegarlas: cada
  // frase va una sola vez, y la descripción queda antes del final fijo, como
  // en el video.
  return applyFixedPhrases(
    weavePortraitSubject(
      stripFixedPhrases(scene, style.sections),
      identityPrompt,
    ),
    style.sections,
  )
}

// Un escritor de la escena del retrato: el mismo cliente de las escenas,
// fijado a un modelo y con el tope corto del retrato.
function portraitSceneLlm(context: PipelineContext, model: string): SceneLlm {
  return createSceneLlm({
    ...context,
    config: {
      ...context.config,
      llm: {
        ...context.config.llm,
        timeoutMs: Math.min(
          context.config.llm.timeoutMs,
          PORTRAIT_SCENE_TIMEOUT_MS,
        ),
        models: { economy: model, balanced: model, premium: model },
      },
    },
  })
}

// Pide la escena a cada escritor en orden. Un fallo del proveedor o una
// respuesta sin escena pasa al siguiente; la clave rechazada, el saldo
// agotado y la cancelación cortan en el acto (con la misma clave, el
// respaldo fallaría igual). Sin escena de nadie, sale el último error.
async function writePortraitScene(
  context: PipelineContext,
  writers: { model: string; llm: SceneLlm }[],
  request: SceneLlmRequest,
): Promise<string> {
  let lastFailure: unknown
  for (const [index, writer] of writers.entries()) {
    try {
      const scene = extractImagePrompt(await writer.llm.generate(request))
      if (scene) return scene
      lastFailure = new PipelineFailure(
        'llm_empty_response',
        `${writer.model} did not write a usable portrait scene`,
      )
    } catch (error) {
      context.signal.throwIfAborted()
      if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
        throw error
      lastFailure = error
    }

    const next = writers[index + 1]
    if (next)
      context.emitter.emit({
        type: 'log',
        level: 'warn',
        message: `portrait scene writer ${writer.model} failed (${failureMessage(lastFailure)}); asking ${next.model}`,
      })
  }
  throw lastFailure
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// La gema del retrato. Una gema nueva del catálogo es una gema de plantilla y
// entra por sus secciones, sin leer la galería (decisión P6 del plan E2: los
// 5 ids heredados no llegan acá, van por la plantilla fija): la del catálogo
// sincronizado si está ahí y, si no, la empaquetada (ADR-0049). Si no está en
// el catálogo, es un estilo propio de la galería.
async function readPreviewGem(
  context: PipelineContext,
  styleId: string,
  remote: boolean,
): Promise<PreviewGem> {
  const catalogGem = await resolveCatalogGem(context, styleId, remote)
  if (catalogGem)
    return { sections: withoutLanguageMarker(catalogGem.sections), shots: [] }

  assertValidStyleId(styleId)
  const style = await readStyleEntry(context, styleId)
  if (!style)
    throw new PipelineFailure(
      'style_not_found',
      `style "${styleId}" does not exist`,
    )
  if (!style.sections) return style
  return { ...style, sections: withoutLanguageMarker(style.sections) }
}

// Un retrato no tiene guion: el marcador de idioma de las frases fijas queda
// con el texto neutro. Se cambia en la gema entera, también en lo que lee el
// modelo, así la copia que escriba coincide con la que después se quita.
function withoutLanguageMarker(sections: GemSections): GemSections {
  return { ...sections, ...fixedPhrasesInLanguage(sections, '') }
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

async function generateFlowCharacterPreview(
  context: PipelineContext,
  styleId: string,
  identityPrompt: string,
  executionPlan: FlowToolsExecutionPlan | undefined,
): Promise<GenerateCharacterPreviewResult> {
  const style = isCharacterStyleId(styleId)
    ? null
    : await readPreviewGem(
        context,
        styleId,
        wantsRemoteCatalog(context.job.payload),
      )
  const scope = `character-preview:${context.job.projectsRoot}:${styleId}:${flowHash(identityPrompt)}`
  // Sólo contenido que escribe el retrato: samples, mtime, título y demás
  // metadata de galería no cambian la imagen encargada.
  const revisionOf = (gem: PreviewGem | null) => {
    const legacyRevision = flowHash(
      JSON.stringify([
        identityPrompt,
        styleId,
        gem?.systemPrompt,
        gem?.sections,
        gem?.shots,
      ]),
    )
    return flowExecutionRevision(legacyRevision, executionPlan)
  }
  const revision = revisionOf(style)
  const pending = await readPendingFlowBatch(
    context,
    scope,
    revision,
    executionPlan,
  )
  if (!pending) await verifyFlowExecutionPlan(context, executionPlan)
  const finalPrompt =
    pending?.requests[0]?.prompt ??
    (isCharacterStyleId(styleId)
      ? assembleUserScenePrompt(
          VISUAL_STYLES[styleId],
          buildPreviewScene(identityPrompt, styleId),
        )
      : await writeCustomStylePrompt(
          context,
          styleId,
          identityPrompt,
          style ?? undefined,
        ))
  const directory = flowIntentDirectory(context, scope)
  const destination = join(directory, 'preview.jpg')
  emitPhase(context, 'image')
  await generateFlowBatch(context, {
    scope,
    revision,
    ...(executionPlan ? { executionPlan } : {}),
    requests: [{ key: 'preview', prompt: finalPrompt, aspectRatio: '16:9' }],
    onState(_request, status) {
      context.emitter.emit({
        type: 'progress',
        percent: status === 'downloading' || status === 'ready' ? 95 : 0,
        detail: { phase: 'image', status },
      })
    },
    async onReady(_request, bytes) {
      if (!isCharacterStyleId(styleId)) {
        const latest = await readPreviewGem(
          context,
          styleId,
          wantsRemoteCatalog(context.job.payload),
        )
        if (revisionOf(latest) !== revision)
          throw new PipelineFailure(
            'flow_result_obsolete',
            'The preview style changed during generation',
          )
      }
      const jpeg = await flowJpeg(context, bytes)
      await writeFlowFile(destination, jpeg)
      emitProgress(context, 'image', 100)
    },
  })
  return {
    dataUri: toDataUri({
      bytes: await readFile(destination),
      ext: 'jpg',
      mime: 'image/jpeg',
    }),
    finalPrompt,
  }
}
