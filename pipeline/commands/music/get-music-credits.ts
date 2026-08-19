import { getEvolinkCredits } from '../../providers/music/evolink.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { EvolinkCredits } from '../../types/music.ts'

// Saldo de créditos de Evolink (compartido entre música e imágenes).
export async function getMusicCredits(
  context: PipelineContext,
): Promise<EvolinkCredits> {
  const apiKey = context.job.apiKeys.evolink
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'evolink API key is missing')

  return getEvolinkCredits(apiKey, context.signal)
}
