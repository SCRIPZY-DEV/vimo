import { createHeyGenClient } from '../../providers/avatar/heygen.ts'
import type { HeyGenClient } from '../../providers/avatar/heygen.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'

// La clave llega en el job (Rust la inyecta desde el llavero, ADR-0011); sin
// ella el fallo es traducible y no se intenta nada.
export function requireHeyGenClient(context: PipelineContext): HeyGenClient {
  const apiKey = context.job.apiKeys.heygen
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'HeyGen API key is missing')

  return createHeyGenClient(apiKey, context.signal)
}
