import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { isLlmAuthFailure } from './auth-failure.ts'
import { modelProfile } from './model-catalog.ts'
import {
  createVerbatimClient,
  type VerbatimMessage,
} from './verbatim-client.ts'

// Política INTERACTIVA: previews y fichas breves, nunca el modelo elegido
// para las escenas del video. Un 429 cambia de modelo sin esperar la cola.
// El plazo corto es explícito para texto descartable, pedido por el usuario;
// nunca se aplica a POST de imágenes o voz que crean encargos pagados.
export const INTERACTIVE_MODEL_IDS = [
  'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'openai/gpt-oss-120b-Turbo',
  'openai/gpt-oss-120b-Ultra',
] as const
export const INTERACTIVE_ATTEMPT_MS = 25_000
const CONTENT_TOKENS_BUDGET = 900

interface InteractiveRequest<T> {
  contentTokensBudget?: number
  maxAttempts?: number
  messages: VerbatimMessage[]
  parse(content: string): T | null
  onProgress?(content: string): void
}

export function createInteractiveLlm(context: PipelineContext) {
  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const client = createVerbatimClient({
    apiKey,
    baseUrl: context.config.llm.baseUrl,
  })
  // Compartido por las cuatro muestras del job: no volver a elegir un modelo
  // que acaba de fallar; los pedidos que ya avanzan pueden terminar.
  const unavailable = new Set<string>()

  return {
    async generate<T>(request: InteractiveRequest<T>): Promise<T> {
      let attempts = 0
      let lastError: unknown = new PipelineFailure(
        'llm_provider_error',
        'no interactive model available',
      )
      for (const modelId of INTERACTIVE_MODEL_IDS) {
        context.signal.throwIfAborted()
        if (unavailable.has(modelId)) continue
        const profile = modelProfile(modelId)
        if (!profile.inCatalog || profile.retired) continue
        if (attempts >= (request.maxAttempts ?? INTERACTIVE_MODEL_IDS.length))
          break
        attempts++

        const deadline = AbortSignal.timeout(
          Math.min(INTERACTIVE_ATTEMPT_MS, context.config.llm.timeoutMs),
        )
        try {
          const response = await client.call({
            profile,
            messages: request.messages,
            contentTokensBudget:
              request.contentTokensBudget ?? CONTENT_TOKENS_BUDGET,
            signal: AbortSignal.any([context.signal, deadline]),
            onProgress: request.onProgress,
          })
          const parsed = request.parse(response.content)
          if (parsed !== null) return parsed
          throw new PipelineFailure(
            'llm_empty_response',
            'interactive response was not usable',
          )
        } catch (error) {
          context.signal.throwIfAborted()
          if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
            throw error
          if (!deadline.aborted && !(error instanceof PipelineFailure))
            throw error
          lastError = deadline.aborted
            ? new PipelineFailure(
                'llm_timeout',
                'interactive model exceeded its deadline',
              )
            : error
          unavailable.add(modelId)
          context.emitter.emit({
            type: 'log',
            level: 'warn',
            message: `interactive model ${modelId} unavailable; trying next candidate`,
          })
        }
      }
      throw lastError
    },
  }
}
