import { setTimeout as delay } from 'node:timers/promises'
import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
import { modelProfile } from '../../providers/llm/model-catalog.ts'
import { createVerbatimClient } from '../../providers/llm/verbatim-client.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import type { SceneLlm } from './llm.ts'

// Política exclusiva de Catálogo (ADR-0036); no cambia preferencias de Mi estilo,
// fichas premium ni deadlines de imágenes/voz ya facturadas.
export const CATALOG_MODEL_IDS = [
  'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'openai/gpt-oss-120b-Turbo',
  'openai/gpt-oss-120b-Ultra',
] as const
export const CATALOG_ATTEMPT_MS = 90_000
export const CATALOG_LLM_CONCURRENCY = 6
// Un corte de red o un 429 dura segundos: descartar el modelo para todo el job
// dejaba al job sin modelos por un parpadeo de la conexión. Se descarta recién
// tras varios fallos seguidos, y si todos cayeron por eso se espera y se
// vuelve a barrer la lista antes de declarar el catálogo agotado.
export const CATALOG_TRANSIENT_CODES = ['llm_network', 'llm_rate_limited']
export const CATALOG_TRANSIENT_STRIKES = 3
export const CATALOG_TRANSIENT_RETRY_MS = [2_000, 5_000]
const DEFAULT_CONTENT_TOKENS = 1200
const clients = new WeakMap<PipelineContext, SceneLlm>()

export function createCatalogSceneLlm(context: PipelineContext): SceneLlm {
  const cached = clients.get(context)
  if (cached) return cached

  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const client = createVerbatimClient({
    apiKey,
    baseUrl: context.config.llm.baseUrl,
  })
  const unavailable = new Set<string>()
  const transientStrikes = new Map<string, number>()
  const limit = limitConcurrency(CATALOG_LLM_CONCURRENCY)
  const accountAbort = new AbortController()
  let accountError: unknown
  const llm: SceneLlm = {
    generate(request) {
      return limit(async () => {
        for (let pass = 0; ; pass++) {
          let transientFailure = false
          for (const modelId of CATALOG_MODEL_IDS) {
            context.signal.throwIfAborted()
            if (accountError) throw accountError
            if (unavailable.has(modelId)) continue
            const profile = modelProfile(modelId)
            if (!profile.inCatalog || profile.retired) continue

            const deadline = AbortSignal.timeout(
              Math.min(CATALOG_ATTEMPT_MS, context.config.llm.timeoutMs),
            )
            try {
              const response = await client.call({
                profile,
                messages: [
                  { role: 'system', content: request.systemPrompt },
                  { role: 'user', content: request.userPrompt },
                ],
                contentTokensBudget:
                  request.maxOutputTokens ?? DEFAULT_CONTENT_TOKENS,
                signal: AbortSignal.any([
                  context.signal,
                  accountAbort.signal,
                  deadline,
                ]),
                onProgress: request.onProgress,
                requireComplete: true,
              })
              context.signal.throwIfAborted()
              if (accountError) throw accountError
              transientStrikes.delete(modelId)
              if (!request.validate || request.validate(response.content))
                return response.content

              // Un formato inválido afecta a este pedido, no declara caído un
              // modelo que puede estar redactando otras escenas correctamente.
              context.emitter.emit({
                type: 'log',
                level: 'warn',
                message: `catalog model ${modelId} returned unusable content; switching model`,
              })
            } catch (error) {
              context.signal.throwIfAborted()
              if (accountError) throw accountError
              if (
                isLlmAuthFailure(error) ||
                isInsufficientCreditsFailure(error)
              ) {
                accountError = error
                accountAbort.abort()
                throw error
              }
              if (!deadline.aborted && !(error instanceof PipelineFailure))
                throw error
              // Un plazo vencido cuenta como strike, igual que la red: descartar
              // el modelo para todo el job por una sola respuesta lenta dejaba
              // escenas sin prompt en videos largos y tumbaba la corrida.
              const transient =
                deadline.aborted ||
                (error instanceof PipelineFailure &&
                  CATALOG_TRANSIENT_CODES.includes(error.code))
              if (transient) {
                transientFailure = true
                const strikes = (transientStrikes.get(modelId) ?? 0) + 1
                transientStrikes.set(modelId, strikes)
                if (strikes >= CATALOG_TRANSIENT_STRIKES)
                  unavailable.add(modelId)
              }
              // Truncamiento/vacío es local al pedido; la saturación se
              // comparte entre biblia, director y redactor del mismo job.
              else if (
                error instanceof PipelineFailure &&
                !['llm_empty_response', 'llm_output_truncated'].includes(
                  error.code,
                )
              )
                unavailable.add(modelId)
              context.emitter.emit({
                type: 'log',
                level: 'warn',
                message: `catalog model ${modelId} unavailable (${deadline.aborted ? 'deadline' : error instanceof PipelineFailure ? error.code : 'failure'}); switching model`,
              })
            }
          }
          const wait = CATALOG_TRANSIENT_RETRY_MS[pass]
          if (!transientFailure || wait === undefined) break
          context.emitter.emit({
            type: 'log',
            level: 'warn',
            message: `catalog models hit transient failures; retrying in ${wait / 1000}s`,
          })
          await delay(wait, undefined, { signal: context.signal })
        }
        throw new PipelineFailure(
          'catalog_prompts_incomplete',
          'catalog text models exhausted; images must not be generated from filler',
        )
      })
    },
  }
  clients.set(context, llm)
  return llm
}
