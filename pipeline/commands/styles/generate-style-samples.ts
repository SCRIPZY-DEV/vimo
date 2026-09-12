import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { generateEvolinkImage } from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import { createInteractiveLlm } from '../../providers/llm/interactive.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { SAMPLE_FRAGMENTS, SAMPLE_SCRIPT } from '../../prompts/style-samples.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
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

// Dos fases paralelas acotadas a las cuatro muestras: primero se validan los
// prompts, después arrancan los cuatro encargos. Cada imagen se guarda y se
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

  const promptResults = await Promise.allSettled(
    SAMPLE_FRAGMENTS.map(async (fragment) => {
      report(fragment.id, 'prompts', 0, 'processing')
      let percent = 0
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
  const prompts = promptResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
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
