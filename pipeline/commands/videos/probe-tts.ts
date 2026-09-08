import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  ProbeTtsPayload,
  ProbeTtsResult,
} from '../../types/video-project.ts'

// Pre-flight del proveedor TTS ANTES de arrancar un pipeline largo (port del
// probe del origen, v0.15.6): valida contra los endpoints de LISTADO — que
// no generan audio ni facturan — pero ejercitan auth y salud del servicio.
// El resultado nunca es un job-failed: la UI decide con { ok, reason }.
// El cache de 2 min vive en la UI (el sidecar es un proceso por job).
const PROBE_TIMEOUT_MS = 15_000

export async function probeTts(
  context: PipelineContext,
): Promise<ProbeTtsResult> {
  const payload = context.job.payload as ProbeTtsPayload | undefined
  const provider = resolveTtsProvider(payload?.provider)
  if (!provider)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.provider must be one of: ${TTS_PROVIDER_IDS}`,
    )

  const apiKey = provider.apiKeyOf(context.job.apiKeys)
  if (!apiKey) return { ok: false, reason: 'config' }

  const request = provider.probeRequest(apiKey)

  let response: Response
  try {
    response = await fetch(request.url, {
      ...request.init,
      signal: AbortSignal.any([
        context.signal,
        AbortSignal.timeout(PROBE_TIMEOUT_MS),
      ]),
    })
  } catch (error) {
    // Cancelación pedida ≠ proveedor caído.
    if (context.signal.aborted) throw error
    return { ok: false, reason: 'other' }
  }

  if (response.ok) return { ok: true, reason: 'ok' }

  const bodyText = await response.text().catch(() => '')
  return { ok: false, reason: classifyProbeFailure(response.status, bodyText) }
}

function classifyProbeFailure(
  status: number,
  bodyText: string,
): ProbeTtsResult['reason'] {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate'

  const maintenance =
    /maintenance|temporarily unavailable|failed to enqueue|gateway/i.test(
      bodyText,
    )
  if (maintenance || status === 502 || status === 503 || status === 504)
    return 'maintenance'

  return 'other'
}
