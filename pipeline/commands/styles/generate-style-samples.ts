import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { generateEvolinkImage } from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import { createInteractiveLlm } from '../../providers/llm/interactive.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { SAMPLE_FRAGMENTS, SAMPLE_SCRIPT } from '../../prompts/style-samples.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { extractImagePrompt } from '../../stages/scene-prompts/prompt-extraction.ts'
import type {
  GenerateStyleSamplesPayload,
  GenerateStyleSamplesResult,
} from '../../types/styles.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import {
  assertValidStyleId,
  readStyleEntry,
  readStyleSamples,
  styleDirectory,
} from './style-store.ts'

const PROMPT_EXPECTED_MS = 15_000
const PREVIEW_POLL_INTERVAL_MS = 1000
const PREVIEW_BATCH_TOKENS_BUDGET = 3600

// Un pedido redacta los cuatro prompts; si el lote no sirve, se completan
// solo los faltantes en paralelo. Después arrancan los cuatro encargos. Cada imagen se guarda y se
// anuncia en cuanto llega, sin esperar al encargo más lento.
export async function generateStyleSamples(
  context: PipelineContext,
): Promise<GenerateStyleSamplesResult> {
  const payload = context.job.payload as GenerateStyleSamplesPayload | undefined
  if (!payload?.styleId)
    throw new PipelineFailure('invalid_payload', 'payload.styleId is required')
  assertValidStyleId(payload.styleId)

  const style = await readStyleEntry(context, payload.styleId)
  if (!style)
    throw new PipelineFailure(
      'style_not_found',
      `style "${payload.styleId}" does not exist`,
    )

  const provider = payload.imageProvider === 'fal' ? 'fal' : 'evolink'
  const apiKey = context.job.apiKeys[provider]
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )

  const llm = createInteractiveLlm(context)
  const systemPrompt = buildCustomStyleSystemPrompt(style)
  const report = (
    sampleId: number,
    phase: 'prompts' | 'images',
    percent: number,
    status: string,
  ) => {
    context.emitter.emit({
      type: 'progress',
      percent,
      detail: { phase, sampleId, status },
    })
  }

  let batchPercent = 0
  const reportBatch = (percent: number) => {
    batchPercent = Math.max(batchPercent, percent)
    for (const fragment of SAMPLE_FRAGMENTS)
      report(fragment.id, 'prompts', batchPercent, 'processing')
  }
  reportBatch(0)
  const stopBatch = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    reportBatch,
  )
  let batch: PreviewPrompt[] = []
  try {
    batch = await llm.generate({
      maxAttempts: 1,
      contentTokensBudget: PREVIEW_BATCH_TOKENS_BUDGET,
      messages: [
        {
          role: 'system',
          content:
            systemPrompt +
            '\n\n# PREVIEW BATCH OUTPUT FORMAT\nFor this request, replace the single-scene output format above with {"samples":[{"sampleId":1,"prompt":"..."}]}. Return exactly one independent image prompt for EACH supplied scene ID, preserving IDs. Apply the style and allowed shots to every prompt. Do not merge scenes or return a collage. Return JSON only.',
        },
        {
          role: 'user',
          content: `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\nSCENES TO ILLUSTRATE: ${JSON.stringify(SAMPLE_FRAGMENTS)}`,
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
    report(prompt.sampleId, 'prompts', 100, 'completed')
  const missing = SAMPLE_FRAGMENTS.filter(
    (fragment) => !batch.some((prompt) => prompt.sampleId === fragment.id),
  )
  const promptResults = await Promise.allSettled(
    missing.map(async (fragment) => {
      let percent = batchPercent
      const progress = (next: number) => {
        percent = Math.max(percent, next)
        report(fragment.id, 'prompts', percent, 'processing')
      }
      const stop = startSimulatedProgress(
        Date.now(),
        PROMPT_EXPECTED_MS,
        progress,
      )
      try {
        const imagePrompt = await llm.generate({
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\nSCENE TO ILLUSTRATE: ${fragment.text}\n\nWrite the image prompt for this scene.`,
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
        report(fragment.id, 'prompts', 100, 'completed')
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
  const directory = styleDirectory(context, payload.styleId)

  // Publicar TODAS las tarjetas antes del primer POST.
  for (const prompt of prompts)
    report(prompt.sampleId, 'images', 0, 'processing')
  const imageResults = await Promise.allSettled(
    prompts.map(async (prompt) => {
      const options = {
        apiKey,
        signal: context.signal,
        pollIntervalMs: PREVIEW_POLL_INTERVAL_MS,
        onProgress(progress: { percent: number; status: string }) {
          // 100 se reserva para el archivo escrito, no para el CDN listo.
          report(
            prompt.sampleId,
            'images',
            Math.min(99, progress.percent),
            progress.status,
          )
        },
      }
      try {
        const image =
          provider === 'fal'
            ? await generateFalImage(prompt.imagePrompt, options)
            : await generateEvolinkImage(prompt.imagePrompt, options)
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
        report(prompt.sampleId, 'images', 0, 'failed')
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

interface PreviewPrompt {
  sampleId: number
  imagePrompt: string
}

interface BatchSample {
  sampleId?: unknown
  prompt?: unknown
}

// Solo IDs conocidos y únicos. Nunca asignar prompts por posición: el modelo
// puede devolver el lote fuera de orden o incompleto.
function parsePreviewBatch(content: string): PreviewPrompt[] {
  let parsed: { samples?: unknown }
  try {
    parsed = JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    )
  } catch {
    return []
  }
  if (!parsed || !Array.isArray(parsed.samples)) return []
  const prompts = new Map<number, string>()
  const seen = new Set<number>()
  for (const entry of parsed.samples) {
    if (!entry || typeof entry !== 'object') continue
    const sample = entry as BatchSample
    const id = sample.sampleId
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
