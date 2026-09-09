import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { ListVoicesPayload, ListVoicesResult } from '../../types/voices.ts'

// Listado unificado de voces: un solo contrato para todos los motores.
// Minimax, Edge y la cuenta de ElevenLabs devuelven el catálogo completo (los
// filtros son client-side en la UI); los motores de DubVoice v1 (ElevenLabs,
// Vbee, Fish Audio) y la biblioteca de ElevenLabs paginan server-side con los
// filtros del payload.
export async function listVoices(
  context: PipelineContext,
): Promise<ListVoicesResult> {
  const payload = context.job.payload as ListVoicesPayload | undefined
  const provider = resolveTtsProvider(payload?.provider)
  if (!provider)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.provider must be one of: ${TTS_PROVIDER_IDS}`,
    )

  const apiKey = provider.apiKeyOf(context.job.apiKeys)
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider.vendor} API key is missing`,
    )

  return provider.listVoices({
    apiKey,
    filters: payload?.filters ?? {},
    signal: context.signal,
  })
}
