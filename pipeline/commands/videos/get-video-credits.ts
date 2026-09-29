import { VIDEO_PROVIDERS } from '../../providers/video/registry.ts'
import type { VideoProvider } from '../../providers/video/types.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { toPipelineFailure } from '../../runner/failure.ts'
import type {
  ProviderVideoCredits,
  VideoCreditsResult,
} from '../../types/animation.ts'

// Saldos de los proveedores de animación (ADR-0047), con la misma forma que
// get-image-credits: cada proveedor resuelve por separado y uno caído (o sin
// clave) no tumba al otro — el resultado siempre completa.
export async function getVideoCredits(
  context: PipelineContext,
): Promise<VideoCreditsResult> {
  const kie = await creditsStatus(context, VIDEO_PROVIDERS.kie)
  return { kie, poyo: { available: false, errorCode: 'missing_api_key' } }
}

async function creditsStatus(
  context: PipelineContext,
  provider: VideoProvider,
): Promise<ProviderVideoCredits> {
  const apiKey = provider.apiKeyOf(context.job.apiKeys)
  if (!apiKey) return { available: false, errorCode: 'missing_api_key' }

  try {
    return {
      available: true,
      remaining: await provider.credits(apiKey, context.signal),
    }
  } catch (error) {
    return { available: false, errorCode: toPipelineFailure(error).code }
  }
}
