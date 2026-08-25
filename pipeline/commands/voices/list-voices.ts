import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { ListVoicesPayload, ListVoicesResult } from '../../types/voices.ts'

// Listado unificado de voces: un solo contrato para todos los motores.
// Minimax y Edge devuelven el catálogo completo (los filtros son client-side
// en la UI); ElevenLabs pagina server-side con los filtros del payload.
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

  const apiKey = context.job.apiKeys.dubvoice
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'dubvoice API key is missing')

  return provider.listVoices({
    apiKey,
    filters: payload?.filters ?? {},
    signal: context.signal,
  })
}
