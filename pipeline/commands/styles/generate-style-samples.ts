import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { generateEvolinkImage } from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { SAMPLE_FRAGMENTS, SAMPLE_SCRIPT } from '../../prompts/style-samples.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { extractImagePrompt } from '../../stages/scene-prompts/prompt-extraction.ts'
import { createSceneLlm } from '../../stages/shared/llm.ts'
import type { DecodedImage } from '../../types/images.ts'
import type {
  GenerateStyleSamplesPayload,
  GenerateStyleSamplesResult,
} from '../../types/styles.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  assertValidStyleId,
  readStyleEntry,
  readStyleSamples,
  styleDirectory,
} from './style-store.ts'

// Genera las 4 muestras de un estilo propio (port de POST /estilos/preview
// del origen, sin motor-web): los 4 momentos fijos pasan por el LLM con el
// systemPrompt del estilo (fase prompts) y cada prompt genera una imagen en
// la calidad baja de preview (fase imágenes). Las muestras se escriben
// DIRECTO en `_styles/<id>/` — el round-trip de data URLs del origen existía
// por la separación SPA/servidor, que acá no existe.
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

  // Fail-safe del origen: solo un 'fal' explícito usa Fal.
  const provider = payload.imageProvider === 'fal' ? 'fal' : 'evolink'
  const apiKey = context.job.apiKeys[provider]

  // Ambas claves se exigen ANTES de gastar: sin la de imágenes no tiene
  // sentido pagar los prompts (createSceneLlm valida la de DeepInfra).
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )
  const llm = createSceneLlm(context)

  const systemPrompt = buildCustomStyleSystemPrompt(style)

  // ── Fase 1: un prompt por momento fijo. Un fragmento fallido no aborta a
  // los demás; sin ninguno, no hay nada que generar.
  const prompts: { sampleId: number; imagePrompt: string }[] = []
  for (const [index, fragment] of SAMPLE_FRAGMENTS.entries()) {
    context.signal.throwIfAborted()
    context.emitter.emit({
      type: 'progress',
      percent: Math.round((index / SAMPLE_FRAGMENTS.length) * 100),
      detail: { phase: 'prompts', sampleId: fragment.id },
    })

    try {
      const response = await llm.generate({
        systemPrompt,
        // El guion completo como contexto + el momento a ilustrar (versión
        // acotada del user prompt del carril de escenas).
        userPrompt:
          `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\n` +
          `SCENE TO ILLUSTRATE: ${fragment.text}\n\n` +
          `Write the image prompt for this scene.`,
        jsonOnly: true,
        tier: 'balanced',
      })
      const imagePrompt = extractImagePrompt(response)
      if (imagePrompt) prompts.push({ sampleId: fragment.id, imagePrompt })
    } catch (error) {
      if (context.signal.aborted) throw error
      context.emitter.emit({
        type: 'log',
        level: 'warn',
        message: `sample ${fragment.id} prompt failed: ${String(error)}`,
      })
    }
  }
  if (prompts.length === 0)
    throw new PipelineFailure(
      'style_samples_failed',
      'no sample prompt could be written',
    )

  // ── Fase 2: una imagen por prompt, en la calidad baja de preview.
  const images: { sampleId: number; image: DecodedImage }[] = []
  for (const prompt of prompts) {
    context.signal.throwIfAborted()

    const options = {
      apiKey,
      signal: context.signal,
      onProgress(progress: { percent: number; status: string }) {
        context.emitter.emit({
          type: 'progress',
          percent: progress.percent,
          detail: {
            phase: 'images',
            sampleId: prompt.sampleId,
            status: progress.status,
          },
        })
      },
    }

    try {
      const image =
        provider === 'fal'
          ? await generateFalImage(prompt.imagePrompt, options)
          : await generateEvolinkImage(prompt.imagePrompt, options)
      images.push({ sampleId: prompt.sampleId, image })
    } catch (error) {
      if (context.signal.aborted) throw error
      context.emitter.emit({
        type: 'log',
        level: 'warn',
        message: `sample ${prompt.sampleId} image failed: ${String(error)}`,
      })
    }
  }
  if (images.length === 0)
    throw new PipelineFailure(
      'style_samples_failed',
      'no sample image could be generated',
    )

  // ── Swap: las muestras viejas se borran recién cuando hay nuevas.
  const directory = styleDirectory(context, payload.styleId)
  for (const sample of await readStyleSamples(directory)) {
    await rm(sample.path, { force: true })
  }
  for (const { sampleId, image } of images) {
    await writeFileAtomic(
      join(directory, `sample-${sampleId}.jpg`),
      image.bytes,
    )
  }

  return { samples: await readStyleSamples(directory) }
}
