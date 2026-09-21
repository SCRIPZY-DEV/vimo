import { setTimeout as delay } from 'node:timers/promises'

import type { LlmConfig } from '../../config/pipeline-config.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { LlmProvider, LlmRequest, LlmTier } from '../../types/llm.ts'
import {
  reportFromFailure,
  type ProviderFailureReporter,
} from '../../utils/provider-failure.ts'

// Port acotado del dispatcher del origen: reintentos con backoff + jitter ante
// rate-limit y una única degradación de tier ante timeout. El fallback Groq
// quedó diferido en ADR-0010 y no se porta por ahora; si vuelve, entra acá
// como segundo LlmProvider sin tocar a quien lo consume.
const RATE_LIMIT_BACKOFF_MS = [1500, 3000, 6000]
// Intentos totales ante rate-limit: el primero más uno por cada espera.
const RATE_LIMIT_MAX_ATTEMPTS = RATE_LIMIT_BACKOFF_MS.length + 1

const TIER_DEGRADATION: Record<LlmTier, LlmTier | null> = {
  premium: 'balanced',
  balanced: 'economy',
  economy: null,
}

function withJitter(ms: number): number {
  return ms + Math.random() * Math.min(1000, ms / 2)
}

// Degradar solo tiene sentido si el tier inferior resuelve a otro modelo.
function degradedTier(config: LlmConfig, tier: LlmTier): LlmTier | null {
  const fallback = TIER_DEGRADATION[tier]
  if (!fallback || config.models[fallback] === config.models[tier]) return null

  return fallback
}

export interface GenerateTextOptions {
  signal?: AbortSignal
  // Reintentos por rate-limit y degradación de tier: fallos que el
  // dispatcher absorbe, reportados al log de diagnóstico (ADR-0038).
  onFailure?: ProviderFailureReporter
}

export async function generateText(
  provider: LlmProvider,
  request: LlmRequest,
  config: LlmConfig,
  options: GenerateTextOptions = {},
): Promise<string> {
  const { signal, onFailure } = options
  const tier = request.tier ?? 'balanced'

  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.generate({ ...request, tier }, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      if (!(error instanceof PipelineFailure)) throw error

      const backoff = RATE_LIMIT_BACKOFF_MS[attempt]
      if (error.code === 'llm_rate_limited' && backoff !== undefined) {
        onFailure?.(
          reportFromFailure(error, {
            provider: error.provider ?? provider.name,
            attempt: attempt + 1,
            maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
            recovered: true,
          }),
        )
        await delay(withJitter(backoff), undefined, { signal })
        continue
      }

      if (error.code === 'llm_timeout') {
        const fallback = degradedTier(config, tier)
        if (fallback) {
          onFailure?.(
            reportFromFailure(error, {
              provider: error.provider ?? provider.name,
              recovered: true,
              detail: `${error.message}; degrading tier ${tier} -> ${fallback}`,
            }),
          )
          return provider.generate({ ...request, tier: fallback }, signal)
        }
      }

      throw error
    }
  }
}
