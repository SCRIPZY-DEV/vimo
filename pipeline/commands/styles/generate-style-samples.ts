import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  flowReference,
  generateFlowBatch,
  savedFlowRequests,
  verifyFlowExecutionPlan,
} from '../../providers/flow/client.ts'
import {
  imageFileHash,
  importFlowImage,
} from '../../providers/flow/import-image.ts'
import { flowHash, readPendingFlowBatch } from '../../providers/flow/storage.ts'
import type { FlowImageRequest } from '../../providers/flow/types.ts'
import {
  assertFlowPlanProvider,
  flowExecutionRevision,
} from '../../providers/flow/execution-plan.ts'
import type { FlowToolsExecutionPlan } from '../../types/flow-execution-plan.ts'
import type {
  ImageProviderId,
  PaidImageProviderId,
} from '../../types/image-provider.ts'

import {
  generateEvolinkImage,
  uploadEvolinkReference,
} from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import { createInteractiveLlm } from '../../providers/llm/interactive.ts'
import { buildCustomStyleReferencePrompt } from '../../prompts/character-reference.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import {
  SAMPLE_FRAGMENTS,
  SAMPLE_PROTAGONIST_REMINDER,
  SAMPLE_PROTAGONIST_RULE,
  SAMPLE_SCRIPT,
} from '../../prompts/style-samples.ts'
import {
  applyFixedPhrases,
  composeGemText,
  fixedPhrasesInLanguage,
  stripFixedPhrases,
} from '../../prompts/template-frame.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { detectScriptLanguage } from '../../utils/script-language.ts'
import { extractImagePrompt } from '../../stages/scene-prompts/prompt-extraction.ts'
import {
  protagonistFromSection,
  rescueReferencePrompt,
} from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  designStyleProtagonist,
  generateVerbatimPrompts,
  type VerbatimCharacterInput,
} from '../../stages/scene-prompts/verbatim/verbatim-writer.ts'
import { createVerbatimClient } from '../../providers/llm/verbatim-client.ts'
import type { DecodedImage } from '../../types/images.ts'
import {
  GEM_TEMPLATE_VERSION,
  type CustomStyleSummary,
  type GemSections,
  type GenerateStyleSamplesPayload,
  type GenerateStyleSamplesResult,
} from '../../types/styles.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import { catalogDraftDirectory } from '../catalog/catalog-cache.ts'
import { assertCatalogDraftSource } from '../catalog/catalog-store.ts'
import { PROMPT_MODEL_ID_LIMIT } from '../videos/create-video-project.ts'
import {
  neutralizeSampleSubject,
  pointSampleToReference,
  resolveSampleCharacter,
  weaveSampleIdentity,
  type ResolvedSampleCharacter,
  type SampleCharacter,
} from './sample-character.ts'
import {
  assertValidStyleId,
  readStyleEntry,
  readStyleSamples,
  styleDirectory,
} from './style-store.ts'

const PROMPT_EXPECTED_MS = 15_000
const PREVIEW_POLL_INTERVAL_MS = 1000
const PREVIEW_BATCH_TOKENS_BUDGET = 3600

type ImageProvider = PaidImageProviderId

// Un encargo de imagen, con o sin referencias adjuntas.
type SampleImageRequest = (
  imagePrompt: string,
  references?: string[],
) => Promise<DecodedImage>

// Un pedido redacta los cuatro prompts; si el lote no sirve, se completan
// solo los faltantes en paralelo. Después arrancan los cuatro encargos. Cada imagen se guarda y se
// anuncia en cuanto llega, sin esperar al encargo más lento.
//
// Las cuatro muestras salen con el MISMO protagonista, el que tendrá el video:
// el personaje predeterminado de la gema («Mi personaje» + fijado) o, si no
// hay, el que la gema describe / uno diseñado para ella. Con imagen viaja como
// referencia adjunta; sin imagen, como descripción tejida al prompt; y un
// encargo con referencia que falla se reintenta una vez como texto. Una gema
// «sin personaje» genera sus pedidos como siempre.
//
// Una gema de PLANTILLA (ADR-0048, spec §5.6) no usa este camino: sus cuatro
// momentos salen del mismo carril que el video (`generateTemplateSamples`).
// Un borrador del catálogo (`catalogDraft`, ADR-0049) es siempre una gema de
// plantilla: `generateCatalogDraftSamples`.
export async function generateStyleSamples(
  context: PipelineContext,
): Promise<GenerateStyleSamplesResult> {
  const payload = context.job.payload as GenerateStyleSamplesPayload | undefined
  const executionPlan = assertFlowPlanProvider(
    payload?.executionPlan,
    payload?.imageProvider,
  )
  if (payload?.catalogDraft !== undefined)
    return generateCatalogDraftSamples(context, payload, executionPlan)
  if (!payload?.styleId)
    throw new PipelineFailure('invalid_payload', 'payload.styleId is required')
  assertValidStyleId(payload.styleId)

  const style = await readStyleEntry(context, payload.styleId)
  if (!style)
    throw new PipelineFailure(
      'style_not_found',
      `style "${payload.styleId}" does not exist`,
    )

  const { provider, apiKey } = sampleImageProvider(
    context,
    payload.imageProvider,
  )
  if (style.sections)
    return generateTemplateSamples(context, {
      style,
      sections: style.sections,
      promptModel: payload.promptModel,
      provider,
      apiKey,
      directory: styleDirectory(context, style.id),
      executionPlan,
    })
  return generateLegacySamples(context, style, provider, apiKey, executionPlan)
}

// Las muestras del borrador de un estilo del catálogo que edita el admin
// (ADR-0049, P4 del plan E3): el mismo carril, eventos y resultado que una
// gema de plantilla de Mi estilo, con el marco y el modo `sampleMode` del
// borrador, pero en `_catalog/_drafts/<id>/` y nunca en `_styles/`. La carpeta
// se vacía antes de generar, después de validar el payload y las claves: lo
// que queda ahí es siempre de una sola generación, y es lo que sube
// `catalog-style-samples-upload`.
async function generateCatalogDraftSamples(
  context: PipelineContext,
  payload: GenerateStyleSamplesPayload,
  executionPlan: FlowToolsExecutionPlan | undefined,
): Promise<GenerateStyleSamplesResult> {
  if (payload.styleId !== undefined)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.styleId and payload.catalogDraft are exclusive',
    )
  const draft = assertCatalogDraftSource(
    payload.catalogDraft,
    'payload.catalogDraft',
  )
  const { provider, apiKey } = sampleImageProvider(
    context,
    payload.imageProvider,
  )
  // Validar claves antes de vaciar el borrador pagado. Flow conserva sus
  // recibos y muestras para recuperar la misma intención sin reescribir.
  if (provider !== 'flow') templateWriterKey(context, payload.promptModel)

  const directory = catalogDraftDirectory(context, draft.id)
  if (provider !== 'flow') await rm(directory, { recursive: true, force: true })
  await ensureDirectory(directory)

  // El borrador como un estilo de plantilla de Mi estilo con el modo de sus
  // muestras: genérico (su sección `character` o la Fase 1) o cinemático.
  const style: CustomStyleSummary = {
    id: draft.id,
    name: draft.name,
    sections: draft.sections,
    templateVersion: GEM_TEMPLATE_VERSION,
    shots: [],
    character: { mode: draft.sampleMode },
    createdAt: '',
    samples: [],
  }
  return generateTemplateSamples(context, {
    style,
    sections: draft.sections,
    promptModel: payload.promptModel,
    provider,
    apiKey,
    directory,
    executionPlan,
  })
}

// Flow no exige clave de imagen pagada. Se conserva el fail-safe histórico
// para los proveedores pagos: Fal explícito o Evolink por defecto.
function sampleImageProvider(
  context: PipelineContext,
  imageProvider: string | undefined,
): { provider: ImageProviderId; apiKey: string } {
  if (imageProvider === 'flow') return { provider: 'flow', apiKey: '' }
  const provider = imageProvider === 'fal' ? 'fal' : 'evolink'
  const apiKey = context.job.apiKeys[provider]
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )
  return { provider, apiKey }
}

// Lo que el carril verbatim exige antes de gastar: el modelo de Ajustes bien
// formado (si viene) y la clave de DeepInfra, que devuelve.
function templateWriterKey(
  context: PipelineContext,
  promptModel: string | undefined,
): string {
  if (
    promptModel !== undefined &&
    (typeof promptModel !== 'string' ||
      promptModel.length > PROMPT_MODEL_ID_LIMIT)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `payload.promptModel must be a string of at most ${PROMPT_MODEL_ID_LIMIT} characters`,
    )
  const deepinfraKey = context.job.apiKeys.deepinfra
  if (!deepinfraKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')
  return deepinfraKey
}

// El camino de siempre para una gema vieja: el lote JSON de previews con la
// gema como system, `GLOBAL_RULES` y los planos. Escribe con los modelos
// internos de las muestras: el modelo de Ajustes ni se lee (ADR-0044).
async function generateLegacySamples(
  context: PipelineContext,
  style: CustomStyleSummary,
  provider: ImageProviderId,
  apiKey: string,
  executionPlan: FlowToolsExecutionPlan | undefined,
): Promise<GenerateStyleSamplesResult> {
  const resolved = await resolveSampleCharacter(context, style)
  const flowSource = {
    style,
    character: resolved,
    directory: styleDirectory(context, style.id),
    executionPlan,
  }
  if (provider === 'flow') {
    const pending = await pendingFlowSamples(context, flowSource)
    if (pending)
      return generateFlowStyleSamples(
        context,
        flowSource,
        await savedFlowRequests(context, pending),
      )
    await verifyFlowExecutionPlan(context, executionPlan)
  }
  const llm = createInteractiveLlm(context)
  const systemPrompt = buildCustomStyleSystemPrompt(style)

  let batchPercent = 0
  const reportBatch = (percent: number) => {
    batchPercent = Math.max(batchPercent, percent)
    for (const fragment of SAMPLE_FRAGMENTS)
      reportSample(context, fragment.id, 'prompts', batchPercent, 'processing')
  }
  reportBatch(0)
  const stopBatch = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    reportBatch,
  )
  let batch: PreviewPrompt[] = []
  // `none` hasta que se sepa con quién salen: si el diseño falla, las
  // muestras se generan como siempre en vez de perderse.
  let character: SampleCharacter = { mode: 'none' }
  let protagonistRule = ''
  let protagonistReminder = ''
  try {
    character =
      resolved.mode === 'design'
        ? await designSampleProtagonist(context, style.systemPrompt ?? '')
        : resolved
    context.emitter.emit({
      type: 'log',
      level: 'info',
      message: `style samples character mode: ${resolved.mode === 'design' ? `design → ${character.mode}` : character.mode}`,
    })
    // La regla va AL FINAL del system prompt (después del formato del lote) y
    // se repite junto a las escenas: más arriba, la gema con personaje propio
    // la ignoraba. Sin protagonista los pedidos quedan byte-idénticos.
    if (character.mode !== 'none') {
      protagonistRule = `\n\n${SAMPLE_PROTAGONIST_RULE}`
      protagonistReminder = `\n\n${SAMPLE_PROTAGONIST_REMINDER}`
    }
    batch = await llm.generate({
      maxAttempts: 1,
      contentTokensBudget: PREVIEW_BATCH_TOKENS_BUDGET,
      messages: [
        {
          role: 'system',
          content:
            systemPrompt +
            '\n\n# PREVIEW BATCH OUTPUT FORMAT\nFor this request, replace the single-scene output format above with {"samples":[{"sampleId":1,"prompt":"..."}]}. Return exactly one independent image prompt for EACH supplied scene ID, preserving IDs. Apply the style and allowed shots to every prompt. Do not merge scenes or return a collage. Return JSON only.' +
            protagonistRule,
        },
        {
          role: 'user',
          content: `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\nSCENES TO ILLUSTRATE: ${JSON.stringify(SAMPLE_FRAGMENTS)}${protagonistReminder}`,
        },
      ],
      // Un lote parcial/incompatible no condena el modelo: todavía puede
      // redactar bien escenas individuales. Los errores HTTP sí lo descartan.
      parse: parsePreviewBatch,
      onProgress(content) {
        reportBatch(Math.min(95, Math.round(content.length / 80)))
      },
    })
  } catch (error) {
    context.signal.throwIfAborted()
    if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
      throw error
    if (!(error instanceof PipelineFailure)) throw error
  } finally {
    stopBatch()
  }
  context.signal.throwIfAborted()
  for (const prompt of batch)
    reportSample(context, prompt.sampleId, 'prompts', 100, 'completed')
  const missing = SAMPLE_FRAGMENTS.filter(
    (fragment) => !batch.some((prompt) => prompt.sampleId === fragment.id),
  )
  const promptResults = await Promise.allSettled(
    missing.map(async (fragment) => {
      let percent = batchPercent
      const progress = (next: number) => {
        percent = Math.max(percent, next)
        reportSample(context, fragment.id, 'prompts', percent, 'processing')
      }
      const stop = startSimulatedProgress(
        Date.now(),
        PROMPT_EXPECTED_MS,
        progress,
      )
      try {
        const imagePrompt = await llm.generate({
          messages: [
            { role: 'system', content: systemPrompt + protagonistRule },
            {
              role: 'user',
              content: `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\nSCENE TO ILLUSTRATE: ${fragment.text}\n\nWrite the image prompt for this scene.${protagonistReminder}`,
            },
          ],
          parse(content) {
            const prompt = extractImagePrompt(content)
            return prompt || null
          },
          onProgress(content) {
            progress(Math.min(95, Math.round(content.length / 20)))
          },
        })
        reportSample(context, fragment.id, 'prompts', 100, 'completed')
        return { sampleId: fragment.id, imagePrompt }
      } finally {
        stop()
      }
    }),
  )
  context.signal.throwIfAborted()
  // Ningún prompt de relleno ni pago de imágenes con una fase incompleta.
  const promptFailure = promptResults.find(
    (result) => result.status === 'rejected',
  )
  if (promptFailure?.status === 'rejected') throw promptFailure.reason
  const prompts = [
    ...batch,
    ...promptResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
  ].sort((left, right) => left.sampleId - right.sampleId)
  if (provider === 'flow')
    return generateFlowStyleSamples(
      context,
      flowSource,
      prompts.map((prompt) => legacyFlowSample(prompt, character)),
    )
  const referenceImageUrls = await sampleReferenceUrls(
    context,
    character,
    provider,
    apiKey,
  )
  return generateSampleImages(
    context,
    styleDirectory(context, style.id),
    prompts,
    provider,
    apiKey,
    (prompt, generate) =>
      generateSampleImage(
        context,
        character,
        prompt,
        referenceImageUrls,
        generate,
      ),
  )
}

// Una gema de PLANTILLA (spec §5.6): los cuatro momentos fijos salen como UN
// lote del carril verbatim, con el mismo marco y el mismo modo de personaje
// que el video, el modelo de Ajustes (`promptModel`) y las frases fijas
// pegadas por código. Los prompts llegan ya tejidos.
//
// El modelo lo resuelve el escritor del carril igual que en el video
// (`resolveVerbatimModel`, ADR-0044): ausente o vacío = el de la casa; uno
// oculto, retirado o desconocido escribe con el de la casa y lo avisa. La
// Fase 1 y la ronda de rescate también salen de esa oferta validada.
//
// Las muestras se escriben en `directory`: la carpeta del estilo en la
// galería o la del borrador del catálogo (ADR-0049).
interface TemplateSamplesRequest {
  style: CustomStyleSummary
  sections: GemSections
  promptModel: string | undefined
  provider: ImageProviderId
  apiKey: string
  directory: string
  executionPlan?: FlowToolsExecutionPlan
}

async function generateTemplateSamples(
  context: PipelineContext,
  request: TemplateSamplesRequest,
): Promise<GenerateStyleSamplesResult> {
  const {
    style,
    sections,
    promptModel,
    provider,
    apiKey,
    directory,
    executionPlan,
  } = request
  const resolved = await resolveSampleCharacter(context, style)
  const flowSource = {
    style,
    character: resolved,
    directory,
    promptModel,
    executionPlan,
  }
  if (provider === 'flow') {
    const pending = await pendingFlowSamples(context, flowSource)
    if (pending)
      return generateFlowStyleSamples(
        context,
        flowSource,
        await savedFlowRequests(context, pending),
      )
    await verifyFlowExecutionPlan(context, executionPlan)
  }
  const writerKey = templateWriterKey(context, promptModel)
  const input = templateCharacterInput(resolved, style, sections)
  const log = (level: 'info' | 'warn') => (message: string) => {
    context.emitter.emit({ type: 'log', level, message })
  }
  log('info')(
    `style samples with the template frame · character mode: ${input.mode}`,
  )

  let batchPercent = 0
  const reportBatch = (percent: number) => {
    batchPercent = Math.max(batchPercent, percent)
    for (const fragment of SAMPLE_FRAGMENTS)
      reportSample(context, fragment.id, 'prompts', batchPercent, 'processing')
  }
  reportBatch(0)
  const stopBatch = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    reportBatch,
  )
  const written = await generateVerbatimPrompts(
    SAMPLE_FRAGMENTS.map((fragment) => ({
      n: fragment.id,
      text: fragment.text,
    })),
    SAMPLE_SCRIPT,
    {
      // Como en el carril del video: la Fase 1 (y su último recurso) recibe
      // la gema como texto SIN las frases fijas, que pega el código y no son
      // parte de la ficha del retrato (ADR-0048).
      gem: composeGemText(sections, { fixedPhrases: false }),
      sections,
      modelId: promptModel,
      character: input,
      client: createVerbatimClient({
        apiKey: writerKey,
        baseUrl: context.config.llm.baseUrl,
      }),
      signal: context.signal,
      onLog: log('info'),
      onWarn: log('warn'),
      onProgress: (ready, total) =>
        reportBatch(Math.min(95, Math.round((ready / total) * 100))),
    },
  ).finally(stopBatch)
  context.signal.throwIfAborted()
  // Ningún pago de imágenes con una fase incompleta.
  if (written.missing.length > 0)
    throw new PipelineFailure(
      'llm_empty_response',
      `the style did not write the sample prompts of moments ${written.missing.join(', ')}`,
    )

  const prompts = [...written.prompts]
    .map(([sampleId, imagePrompt]) => ({ sampleId, imagePrompt }))
    .sort((left, right) => left.sampleId - right.sampleId)
  for (const prompt of prompts)
    reportSample(context, prompt.sampleId, 'prompts', 100, 'completed')
  // Como en el video, la foto viaja solo con los momentos que nombran al
  // protagonista (`scenesWithSubject`, el dato que reparte la referencia): sin
  // la regla que lo obligaba en las cuatro muestras, un momento de objeto o de
  // lugar no lo lleva. Si ninguno lo nombra, la foto ni se sube, y el log lo
  // dice: sin él, cuatro muestras sin el personaje parecen una foto ignorada.
  const withSubject = new Set(written.scenesWithSubject)
  if (resolved.mode === 'reference' && withSubject.size === 0)
    log('info')(
      'no sample moment shows the protagonist: the character photo was not used',
    )
  if (provider === 'flow')
    return generateFlowStyleSamples(
      context,
      flowSource,
      prompts.map((prompt) => {
        const request: FlowImageRequest = {
          key: String(prompt.sampleId),
          prompt: prompt.imagePrompt,
          aspectRatio: '16:9',
        }
        if (resolved.mode !== 'reference' || !withSubject.has(prompt.sampleId))
          return request
        return {
          ...request,
          prompt: buildCustomStyleReferencePrompt(
            resolved.name,
            prompt.imagePrompt,
          ),
          references: [
            flowReference('character', resolved.name, resolved.imageDataUri),
          ],
        }
      }),
    )
  const referenceImageUrls = await sampleReferenceUrls(
    context,
    resolved.mode === 'reference' && withSubject.size > 0
      ? resolved
      : { mode: 'none' },
    provider,
    apiKey,
  )
  return generateSampleImages(
    context,
    directory,
    prompts,
    provider,
    apiKey,
    (prompt, generate) =>
      generateTemplateSampleImage(
        context,
        resolved,
        sections,
        prompt,
        withSubject,
        referenceImageUrls,
        generate,
      ),
  )
}

// El modo del carril para las muestras de una gema de plantilla: el mismo
// que tendría el video. Sin personaje del usuario, el de la sección
// `character` (salvo «Mi personaje»: ahí la sección no viaja) o el que diseña
// la Fase 1 con la gema como texto.
function templateCharacterInput(
  resolved: ResolvedSampleCharacter,
  style: CustomStyleSummary,
  sections: GemSections,
): VerbatimCharacterInput {
  if (resolved.mode === 'none') return { mode: 'none' }
  if (resolved.mode === 'text')
    return {
      mode: 'text',
      prompt: resolved.description,
      name: resolved.name,
    }
  if (resolved.mode === 'reference')
    return { mode: 'reference', name: resolved.name }

  const section =
    style.character?.mode === 'own' ? undefined : sections.character?.trim()
  if (section)
    return { mode: 'generic', designed: protagonistFromSection(section) }
  return { mode: 'generic' }
}

// Una muestra de gema de plantilla: el prompt ya viene tejido. Con foto, la
// referencia viaja solo si el momento nombra al protagonista (`withSubject`);
// el resto va por el carril normal, sin foto, candado ni identidad, como en el
// video. Sin referencia usable, o si el encargo con referencia falla, va como
// texto con la descripción de la biblioteca (el mismo rescate que el video).
// Cancelación, saldo agotado y clave rechazada salen tal cual.
async function generateTemplateSampleImage(
  context: PipelineContext,
  character: ResolvedSampleCharacter,
  sections: GemSections,
  prompt: PreviewPrompt,
  withSubject: ReadonlySet<number>,
  referenceImageUrls: string[],
  generate: SampleImageRequest,
): Promise<DecodedImage> {
  if (character.mode !== 'reference' || !withSubject.has(prompt.sampleId))
    return generate(prompt.imagePrompt)

  const asText = () =>
    rescuedSamplePrompt(prompt.imagePrompt, sections, {
      name: character.name,
      description: character.description,
    })
  if (referenceImageUrls.length === 0) return generate(asText())

  try {
    return await generate(
      buildCustomStyleReferencePrompt(character.name, prompt.imagePrompt),
      referenceImageUrls,
    )
  } catch (error) {
    context.signal.throwIfAborted()
    if (isInsufficientCreditsFailure(error) || isImageAuthFailure(error))
      throw error

    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `sample ${prompt.sampleId} failed with the character reference: retrying with the character as text`,
    })
    return generate(asText())
  }
}

// El rescate como texto de una muestra de plantilla, igual que el del video
// (spec §5.4): la identidad de biblioteca va DENTRO de la escena, antes del
// final fijo. Se quitan las frases que pegó el escritor, se teje la identidad
// y se vuelven a pegar: inicio → escena → identidad → final. Pegada después
// del final, la identidad cerraba el prompt en lugar del final fijo.
function rescuedSamplePrompt(
  imagePrompt: string,
  sections: GemSections,
  identity: { name: string; description: string },
): string {
  // Como las pegó el escritor: con el idioma del guion de las muestras.
  const phrases = fixedPhrasesInLanguage(
    sections,
    detectScriptLanguage(SAMPLE_SCRIPT),
  )
  const scene = stripFixedPhrases(imagePrompt, phrases)
  return applyFixedPhrases(rescueReferencePrompt(scene, [identity]), phrases)
}

function reportSample(
  context: PipelineContext,
  sampleId: number,
  phase: 'prompts' | 'images',
  percent: number,
  status: string,
): void {
  context.emitter.emit({
    type: 'progress',
    percent,
    detail: { phase, sampleId, status },
  })
}

// Las cuatro imágenes a la vez. Cada una se guarda y se anuncia en cuanto
// llega; `render` decide el encargo de cada muestra (con o sin referencia).
async function generateSampleImages(
  context: PipelineContext,
  directory: string,
  prompts: PreviewPrompt[],
  provider: ImageProvider,
  apiKey: string,
  render: (
    prompt: PreviewPrompt,
    generate: SampleImageRequest,
  ) => Promise<DecodedImage>,
): Promise<GenerateStyleSamplesResult> {
  // Publicar TODAS las tarjetas antes del primer POST.
  for (const prompt of prompts)
    reportSample(context, prompt.sampleId, 'images', 0, 'processing')
  const imageResults = await Promise.allSettled(
    prompts.map(async (prompt) => {
      const options = {
        apiKey,
        signal: context.signal,
        pollIntervalMs: PREVIEW_POLL_INTERVAL_MS,
        onFailure: createProviderFailureReporter(context.emitter),
        onProgress(progress: { percent: number; status: string }) {
          // 100 se reserva para el archivo escrito, no para el CDN listo.
          reportSample(
            context,
            prompt.sampleId,
            'images',
            Math.min(99, progress.percent),
            progress.status,
          )
        },
      }
      const generate: SampleImageRequest = (imagePrompt, references) => {
        const imageOptions = references
          ? { ...options, referenceImageUrls: references }
          : options
        if (provider === 'fal')
          return generateFalImage(imagePrompt, imageOptions)
        return generateEvolinkImage(imagePrompt, imageOptions)
      }
      try {
        const image = await render(prompt, generate)
        const path = join(directory, `sample-${prompt.sampleId}.jpg`)
        await writeFileAtomic(path, image.bytes)
        const { mtimeMs } = await stat(path)
        context.emitter.emit({
          type: 'progress',
          percent: 100,
          detail: {
            phase: 'images',
            sampleId: prompt.sampleId,
            status: 'completed',
            path,
            mtimeMs,
          },
        })
      } catch (error) {
        reportSample(context, prompt.sampleId, 'images', 0, 'failed')
        throw error
      }
    }),
  )
  context.signal.throwIfAborted()
  // Reemplazo atómico por muestra: jamás borrar las anteriores antes de
  // escribir las nuevas. Los éxitos parciales sobreviven a cualquier fallo.
  const failure = imageResults.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return { samples: await readStyleSamples(directory) }
}

// Las referencias tal como las quiere cada proveedor: Fal recibe el data URI;
// Evolink, una URL pública que se sube UNA vez para las 4 muestras. Vacío =
// las muestras van por texto (sin personaje con imagen, o la subida falló —
// mismo degradado que el carril de personaje del video).
async function sampleReferenceUrls(
  context: PipelineContext,
  character: SampleCharacter,
  provider: ImageProvider,
  apiKey: string,
): Promise<string[]> {
  if (character.mode !== 'reference') return []
  if (provider === 'fal') return [character.imageDataUri]

  const url = await uploadEvolinkReference(character.imageDataUri, apiKey)
  context.signal.throwIfAborted()
  if (url) return [url]

  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message:
      'the character reference could not be uploaded: samples carry the character as text',
  })
  return []
}

// Una muestra, con el personaje que corresponda. El encargo con referencia
// que falla se reintenta UNA vez como texto para no dejar la casilla vacía;
// cancelación, saldo agotado y clave rechazada salen tal cual — repetir el
// pedido fallaría igual.
async function generateSampleImage(
  context: PipelineContext,
  character: SampleCharacter,
  prompt: PreviewPrompt,
  referenceImageUrls: string[],
  generate: SampleImageRequest,
): Promise<DecodedImage> {
  // Sin protagonista el prompt viaja tal cual; la etiqueta pelada no puede
  // llegar al generador (una gema escrita para el video puede traerla).
  if (character.mode === 'none')
    return generate(neutralizeSampleSubject(prompt.imagePrompt))

  const textPrompt = weaveSampleIdentity(
    prompt.imagePrompt,
    character.description,
    character.name,
  )
  if (character.mode === 'text' || referenceImageUrls.length === 0)
    return generate(textPrompt)

  try {
    return await generate(
      buildCustomStyleReferencePrompt(
        character.name,
        pointSampleToReference(prompt.imagePrompt, character.name),
      ),
      referenceImageUrls,
    )
  } catch (error) {
    context.signal.throwIfAborted()
    if (isInsufficientCreditsFailure(error) || isImageAuthFailure(error))
      throw error

    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `sample ${prompt.sampleId} failed with the character reference: retrying with the character as text`,
    })
    return generate(textPrompt)
  }
}

// Gema sin personaje del usuario: ELLA dice quién es su protagonista (el que
// trae escrito, o uno diseñado) y ese mismo se teje en las cuatro muestras.
// Se resuelve con la MISMA Fase 1 del video (`designStyleProtagonist`): la
// gema cruda como system, la consigna portada con la precedencia del
// personaje del estilo, los recortes y el último recurso. Si no sale una
// descripción usable, las muestras se generan como siempre. Clave rechazada y
// saldo agotado cortan el job, igual que en la redacción.
async function designSampleProtagonist(
  context: PipelineContext,
  gem: string,
): Promise<SampleCharacter> {
  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const log = (level: 'info' | 'warn') => (message: string) => {
    context.emitter.emit({ type: 'log', level, message })
  }
  const protagonist = await designStyleProtagonist({
    gem,
    script: SAMPLE_SCRIPT,
    client: createVerbatimClient({
      apiKey,
      baseUrl: context.config.llm.baseUrl,
    }),
    signal: context.signal,
    onLog: log('info'),
    onWarn: log('warn'),
  })
  context.signal.throwIfAborted()
  if (protagonist)
    return { mode: 'text', name: '', description: protagonist.description }

  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message:
      'the style protagonist could not be designed: samples are generated without a shared protagonist',
  })
  return { mode: 'none' }
}

function isImageAuthFailure(error: unknown): boolean {
  return (
    error instanceof PipelineFailure && error.code === 'image_invalid_api_key'
  )
}

interface PreviewPrompt {
  sampleId: number
  imagePrompt: string
}

interface BatchSample {
  sampleId?: unknown
  // Alias medido: una gema con formato de salida propio devuelve `id`.
  id?: unknown
  prompt?: unknown
}

// Un objeto de muestra suelto dentro de un texto que no es JSON válido.
const LOOSE_SAMPLE_REGEX =
  /\{\s*"(?:sampleId|id)"\s*:\s*\d+\s*,\s*"prompt"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g

// Las entradas del lote, venga como venga. El formato pedido es
// {"samples":[…]}, pero una gema que trae su propio formato de salida puede
// imponerlo (medido: {"prompts":[{"id":1,…}]}, un objeto por escena, a veces
// sin cerrar). Rescatar esas entradas evita cuatro pedidos individuales.
function batchEntries(content: string): unknown[] {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    const parsed = JSON.parse(text) as { samples?: unknown; prompts?: unknown }
    if (Array.isArray(parsed?.samples)) return parsed.samples
    if (Array.isArray(parsed?.prompts)) return parsed.prompts
    return []
  } catch {
    return (text.match(LOOSE_SAMPLE_REGEX) ?? []).flatMap((piece) => {
      try {
        return [JSON.parse(piece) as unknown]
      } catch {
        return []
      }
    })
  }
}

// Solo IDs conocidos y únicos. Nunca asignar prompts por posición: el modelo
// puede devolver el lote fuera de orden o incompleto.
function parsePreviewBatch(content: string): PreviewPrompt[] {
  const prompts = new Map<number, string>()
  const seen = new Set<number>()
  for (const entry of batchEntries(content)) {
    if (!entry || typeof entry !== 'object') continue
    const sample = entry as BatchSample
    const id = sample.sampleId ?? sample.id
    if (
      typeof id !== 'number' ||
      !SAMPLE_FRAGMENTS.some((fragment) => fragment.id === id)
    )
      continue
    if (seen.has(id)) {
      prompts.delete(id)
      continue
    }
    seen.add(id)
    if (typeof sample.prompt !== 'string') continue
    const prompt = extractImagePrompt(
      JSON.stringify({ prompt_imagen: sample.prompt }),
    )
    if (prompt) prompts.set(id, prompt)
  }
  return [...prompts].map(([sampleId, imagePrompt]) => ({
    sampleId,
    imagePrompt,
  }))
}

interface FlowSampleSource {
  style: CustomStyleSummary
  character: ResolvedSampleCharacter
  directory: string
  promptModel?: string
  executionPlan?: FlowToolsExecutionPlan
}

function styleRevision(source: FlowSampleSource): string {
  const { style, character, promptModel } = source
  const legacyRevision = flowHash(
    JSON.stringify([
      style.id,
      style.systemPrompt,
      style.sections,
      style.templateVersion,
      style.shots,
      style.character,
      character,
      promptModel,
    ]),
  )
  return flowExecutionRevision(legacyRevision, source.executionPlan)
}

function pendingFlowSamples(
  context: PipelineContext,
  source: FlowSampleSource,
) {
  return readPendingFlowBatch(
    context,
    `style-samples:${source.directory}`,
    styleRevision(source),
    source.executionPlan,
  )
}

function legacyFlowSample(
  prompt: PreviewPrompt,
  character: SampleCharacter,
): FlowImageRequest {
  const request: FlowImageRequest = {
    key: String(prompt.sampleId),
    prompt: prompt.imagePrompt,
    aspectRatio: '16:9',
  }
  if (character.mode === 'none')
    return { ...request, prompt: neutralizeSampleSubject(prompt.imagePrompt) }
  if (character.mode === 'text')
    return {
      ...request,
      prompt: weaveSampleIdentity(
        prompt.imagePrompt,
        character.description,
        character.name,
      ),
    }
  return {
    ...request,
    prompt: buildCustomStyleReferencePrompt(
      character.name,
      pointSampleToReference(prompt.imagePrompt, character.name),
    ),
    references: [
      flowReference('character', character.name, character.imageDataUri),
    ],
  }
}

// Un solo lote reservado y durable también en muestras de plantilla y del
// catálogo. Recuperar conserva los prompts/referencias originales: nunca
// degrada una referencia ni vuelve a escribir tras un resultado incierto.
async function generateFlowStyleSamples(
  context: PipelineContext,
  source: FlowSampleSource,
  inputs: FlowImageRequest[],
): Promise<GenerateStyleSamplesResult> {
  const { directory, style } = source
  const revision = styleRevision(source)
  const requests: FlowImageRequest[] = []
  for (const input of inputs) {
    const sampleId = Number(input.key)
    if (!SAMPLE_FRAGMENTS.some((fragment) => fragment.id === sampleId))
      throw new PipelineFailure(
        'flow_result_invalid',
        'Unexpected Flow sample ID',
      )
    const destination = join(directory, `sample-${sampleId}.jpg`)
    requests.push({
      ...input,
      destination,
      previousHash: await imageFileHash(destination),
    })
    reportSample(context, sampleId, 'images', 0, 'queued')
  }
  async function isCurrent() {
    if (!(await stat(directory).catch(() => null))?.isDirectory()) return false
    const payload = context.job.payload as
      GenerateStyleSamplesPayload | undefined
    // El borrador es un snapshot del pedido validado, no un estilo guardado.
    if (payload?.catalogDraft) return true
    const current = await readStyleEntry(context, style.id)
    if (!current) return false
    const character = await resolveSampleCharacter(context, current)
    return styleRevision({ ...source, style: current, character }) === revision
  }
  await generateFlowBatch(context, {
    scope: `style-samples:${directory}`,
    revision,
    requests,
    ...(source.executionPlan ? { executionPlan: source.executionPlan } : {}),
    onState(request, status) {
      reportSample(
        context,
        Number(request.key),
        'images',
        status === 'ready' || status === 'downloading' ? 95 : 0,
        status,
      )
    },
    async onReady(request, bytes) {
      const sampleId = Number(request.key)
      const path = join(directory, `sample-${sampleId}.jpg`)
      if (
        !SAMPLE_FRAGMENTS.some((fragment) => fragment.id === sampleId) ||
        request.destination !== path
      )
        throw new PipelineFailure(
          'flow_result_invalid',
          'Unexpected Flow sample destination',
        )
      await importFlowImage(context, {
        destination: path,
        bytes,
        previousHash: request.previousHash ?? null,
        isCurrent,
      })
      const { mtimeMs } = await stat(path)
      context.emitter.emit({
        type: 'progress',
        percent: 100,
        detail: {
          phase: 'images',
          sampleId,
          status: 'completed',
          path,
          mtimeMs,
        },
      })
    },
  })
  return { samples: await readStyleSamples(directory) }
}
