import { listEdgeVoices } from '../../providers/tts/edge.ts'
import { listElevenLabsVoices } from '../../providers/tts/elevenlabs.ts'
import { listMinimaxVoices } from '../../providers/tts/minimax.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { ListVoicesPayload, ListVoicesResult } from '../../types/voices.ts'

const VOICE_PROVIDERS = new Set(['minimax', 'elevenlabs', 'edge'])

// Listado unificado de voces: un solo contrato para los tres motores.
// Minimax y Edge devuelven el catálogo completo (los filtros son client-side
// en la UI); ElevenLabs pagina server-side con los filtros del payload.
export async function listVoices(
  context: PipelineContext,
): Promise<ListVoicesResult> {
  const payload = context.job.payload as ListVoicesPayload | undefined
  if (!payload?.provider || !VOICE_PROVIDERS.has(payload.provider))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.provider must be minimax, elevenlabs or edge',
    )

  const apiKey = context.job.apiKeys.dubvoice
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'dubvoice API key is missing')

  if (payload.provider === 'elevenlabs')
    return listElevenLabsVoices(apiKey, payload.filters ?? {}, context.signal)
  if (payload.provider === 'edge')
    return { voices: await listEdgeVoices(apiKey, context.signal) }

  return { voices: await listMinimaxVoices(apiKey, context.signal) }
}
