import { PipelineFailure } from '../../runner/failure.ts'
import { isAuthStatus, LLM_AUTH_CODE } from './auth-failure.ts'
import { isInsufficientCreditsResponse } from '../../utils/insufficient-credits.ts'
import type {
  ChatCompletionResponse,
  LlmProvider,
  LlmProviderOptions,
  LlmRequest,
} from '../../types/llm.ts'

// Parámetros de muestreo portados del provider del origen.
const TEMPERATURE = 0.85
const TOP_P = 0.95
const DEFAULT_MAX_OUTPUT_TOKENS = 700
// Id del proveedor en los fallos (ADR-0038).
const FAILURE_PROVIDER = 'deepinfra'

export function createDeepInfraProvider(
  options: LlmProviderOptions,
): LlmProvider {
  const { apiKey, config } = options

  return {
    name: 'deepinfra',
    async generate(request: LlmRequest, signal?: AbortSignal) {
      const timeout = AbortSignal.timeout(config.timeoutMs)
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.models[request.tier ?? 'balanced'],
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: request.temperature ?? TEMPERATURE,
          top_p: TOP_P,
          max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          ...(request.jsonOnly
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      }).catch((error: unknown) => {
        // Una cancelación pedida no se disfraza de error del proveedor.
        if (signal?.aborted) throw error
        if (timeout.aborted)
          throw new PipelineFailure(
            'llm_timeout',
            'DeepInfra request timed out',
            { provider: FAILURE_PROVIDER },
          )
        throw new PipelineFailure('llm_network', 'DeepInfra request failed', {
          provider: FAILURE_PROVIDER,
        })
      })

      if (response.status === 429)
        throw new PipelineFailure(
          'llm_rate_limited',
          'DeepInfra rate limit hit',
          { provider: FAILURE_PROVIDER, httpStatus: response.status },
        )
      if (!response.ok) {
        const bodyText = (await response.text().catch(() => '')).slice(0, 300)
        // Saldo agotado antes que la clave (ADR-0031): un 403 con detalle de
        // balance no es «revisá tu clave», es «recargá».
        if (isInsufficientCreditsResponse(response.status, bodyText))
          throw new PipelineFailure(
            'llm_insufficient_credits',
            `DeepInfra rejected the request for insufficient balance (status=${response.status}) ${bodyText}`,
            { provider: FAILURE_PROVIDER, httpStatus: response.status },
          )
        // Credenciales rechazadas: es la clave, no el modelo (ver auth-failure).
        if (isAuthStatus(response.status))
          throw new PipelineFailure(
            LLM_AUTH_CODE,
            `DeepInfra rejected the API key (status=${response.status})`,
            { provider: FAILURE_PROVIDER, httpStatus: response.status },
          )
        throw new PipelineFailure(
          'llm_provider_error',
          `DeepInfra failed (status=${response.status}) ${bodyText}`,
          { provider: FAILURE_PROVIDER, httpStatus: response.status },
        )
      }

      const body = (await response.json()) as ChatCompletionResponse
      const content = body.choices?.[0]?.message?.content
      if (!content)
        throw new PipelineFailure(
          'llm_empty_response',
          'DeepInfra returned no content',
          { provider: FAILURE_PROVIDER, httpStatus: response.status },
        )

      return content
    },
  }
}
