import { setTimeout as delay } from 'node:timers/promises'

import type { LlmConfig } from '../../config/pipeline-config.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { LlmProvider, LlmRequest, LlmTier } from '../../types/llm.ts'

// Port acotado del dispatcher del origen: reintentos con backoff + jitter ante
// rate-limit y una única degradación de tier ante timeout. El fallback Groq
// quedó diferido en ADR-0010 y no se porta por ahora; si vuelve, entra acá
// como segundo LlmProvider sin tocar a quien lo consume.
const RATE_LIMIT_BACKOFF_MS = [1500, 3000, 6000]

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

export async function generateText(
  provider: LlmProvider,
  request: LlmRequest,
  config: LlmConfig,
  signal?: AbortSignal,
): Promise<string> {
  const tier = request.tier ?? 'balanced'

  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.generate({ ...request, tier }, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      if (!(error instanceof PipelineFailure)) throw error

      const backoff = RATE_LIMIT_BACKOFF_MS[attempt]
      if (error.code === 'llm_rate_limited' && backoff !== undefined) {
        await delay(withJitter(backoff), undefined, { signal })
        continue
      }

      if (error.code === 'llm_timeout') {
        const fallback = degradedTier(config, tier)
        if (fallback)
          return provider.generate({ ...request, tier: fallback }, signal)
      }

      throw error
    }
  }
}
