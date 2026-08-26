import { getFalCredits } from '../../providers/image/fal.ts'
import { getEvolinkCredits } from '../../providers/music/evolink.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { toPipelineFailure } from '../../runner/failure.ts'
import type {
  ImageCreditsResult,
  ProviderCreditsStatus,
} from '../../types/video-project.ts'

// Saldos de los proveedores de imagen para el editor. Cada proveedor
// resuelve por separado: uno caído (o sin clave) no tumba al otro — el
// resultado siempre completa y la UI muestra lo que haya.
export async function getImageCredits(
  context: PipelineContext,
): Promise<ImageCreditsResult> {
  const [fal, evolink] = await Promise.all([
    falStatus(context),
    evolinkStatus(context),
  ])
  return { fal, evolink }
}

async function falStatus(
  context: PipelineContext,
): Promise<ProviderCreditsStatus> {
  const apiKey = context.job.apiKeys.fal
  if (!apiKey) return { available: false, errorCode: 'missing_api_key' }

  try {
    const credits = await getFalCredits(apiKey, context.signal)
    const status: ProviderCreditsStatus = {
      available: true,
      currency: credits.currency,
    }
    if (credits.remaining !== null) status.remaining = credits.remaining
    return status
  } catch (error) {
    return { available: false, errorCode: toPipelineFailure(error).code }
  }
}

async function evolinkStatus(
  context: PipelineContext,
): Promise<ProviderCreditsStatus> {
  const apiKey = context.job.apiKeys.evolink
  if (!apiKey) return { available: false, errorCode: 'missing_api_key' }

  try {
    const credits = await getEvolinkCredits(apiKey, context.signal)
    return { available: true, remaining: credits.remaining }
  } catch (error) {
    return { available: false, errorCode: toPipelineFailure(error).code }
  }
}
