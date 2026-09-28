import { generateText } from '../providers/llm/generate.ts'
import { modelProfile } from '../providers/llm/model-catalog.ts'
import { createVerbatimClient } from '../providers/llm/verbatim-client.ts'
import type { PipelineContext } from '../runner/context.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { SceneLlm } from '../stages/shared/llm.ts'
import type { LlmProvider, LlmTier } from '../types/llm.ts'
import { createProviderFailureReporter } from '../utils/provider-failure.ts'

// Política exclusiva de redacción/revisión de movimiento. No sustituye los
// tiers compartidos de guiones, previews, catálogo ni imágenes estáticas.
const ANIMATION_TEXT_MODELS: Record<LlmTier, string> = {
  premium: 'deepseek-ai/DeepSeek-V4.1-Flash',
  economy: 'XiaomiMiMo/MiMo-V2.6-Flash',
  balanced: 'anthropic/claude-haiku-4-5',
}
const ANIMATION_TEXT_TIMEOUT_MS = 45_000
const ANIMATION_TEXT_OUTPUT_TOKENS = 2000

export function createAnimationLlm(context: PipelineContext): SceneLlm {
  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const client = createVerbatimClient({
    apiKey,
    baseUrl: context.config.llm.baseUrl,
  })
  const config = {
    ...context.config.llm,
    models: ANIMATION_TEXT_MODELS,
  }
  const provider: LlmProvider = {
    name: 'deepinfra',
    async generate(request, signal) {
      signal?.throwIfAborted()
      const profile = modelProfile(config.models[request.tier ?? 'premium'])
      const timeout = AbortSignal.timeout(ANIMATION_TEXT_TIMEOUT_MS)
      try {
        const result = await client.call({
          // Los planes cortos medidos no necesitan margen de razonamiento.
          // MiMo conserva el esfuerzo "none" de su perfil del catálogo.
          profile: { ...profile, outputTokensMargin: 0 },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          contentTokensBudget:
            request.maxOutputTokens ?? ANIMATION_TEXT_OUTPUT_TOKENS,
          requireComplete: true,
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
        return result.content
      } catch (error) {
        // Cancelar el job nunca habilita compras o modelos de rescate.
        signal?.throwIfAborted()
        if (timeout.aborted)
          throw new PipelineFailure(
            'llm_timeout',
            `Animation text request to ${profile.id} timed out`,
            { provider: 'deepinfra' },
          )
        throw error
      }
    },
  }
  const onFailure = createProviderFailureReporter(context.emitter)

  return {
    generate(request) {
      // Conserva el backoff ya utilizado para 429 y el rescate de transporte;
      // todos sus tiers resuelven aquí a la política local de animación.
      return generateText(provider, request, config, {
        signal: context.signal,
        onFailure,
      })
    },
  }
}
