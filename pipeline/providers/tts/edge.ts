import type {
  DubvoiceEdgeVoice,
  GenerateVoicePayload,
  VoiceSummary,
} from '../../types/voices.ts'
import {
  DUBVOICE_BASE_URL,
  LIST_TIMEOUT_MS,
  SYNTHESIS_TIMEOUT_MS,
  authHeaders,
  dubvoiceFetch,
  readAudioResponse,
  type AudioDownload,
} from './dubvoice.ts'
import type { TtsProvider } from './provider.ts'
import { EDGE_LIVE_VOICE_IDS } from './edge-live-voice-ids.ts'

// Motor Edge TTS (Microsoft) vía DubVoice. En este endpoint SOLO funciona
// `volume`: `rate`/`pitch` devuelven audio vacío y el campo `voice` da 400
// (verificado en vivo en el origen — trust the wire, no la doc).

// Espejo del tope de DubVoice, igual para los tres motores.
export const EDGE_CHAR_LIMIT = 4500

function normalizeVoice(voice: DubvoiceEdgeVoice): VoiceSummary | null {
  if (!voice.id) return null

  const summary: VoiceSummary = {
    provider: 'edge',
    voiceId: voice.id,
    name: voice.name ?? voice.id,
  }
  const language = voice.locale ?? voice.language
  if (language) summary.language = language
  if (voice.gender) summary.gender = voice.gender

  return summary
}

function rawVoices(data: unknown): DubvoiceEdgeVoice[] {
  if (Array.isArray(data)) return data as DubvoiceEdgeVoice[]
  if (data && typeof data === 'object') {
    const record = data as {
      voices?: DubvoiceEdgeVoice[]
      data?: DubvoiceEdgeVoice[]
    }
    if (Array.isArray(record.voices)) return record.voices
    if (Array.isArray(record.data)) return record.data
  }

  return []
}

// Lista las voces Edge filtrando las que Microsoft retiró del servicio
// (siguen en el listado de DubVoice pero responden 200 con 0 bytes).
export async function listEdgeVoices(
  apiKey: string,
  signal?: AbortSignal,
): Promise<VoiceSummary[]> {
  const response = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/edge-tts`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const data = (await response.json()) as unknown
  const voices: VoiceSummary[] = []
  for (const voice of rawVoices(data)) {
    if (!voice.id || !EDGE_LIVE_VOICE_IDS.has(voice.id)) continue
    const normalized = normalizeVoice(voice)
    if (normalized) voices.push(normalized)
  }

  return voices
}

export async function synthesizeEdge(
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AudioDownload> {
  const volumeEdge = payload.settings?.volumeEdge
  const body: Record<string, unknown> = { text, voice_id: payload.voiceId }
  // 100 = volumen normal = no se manda (reproduce el baseline del servicio).
  if (typeof volumeEdge === 'number' && volumeEdge >= 0 && volumeEdge < 100)
    body.volume = volumeEdge

  const response = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/edge-tts`,
    {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    },
    { timeoutMs: SYNTHESIS_TIMEOUT_MS, signal },
  )

  return readAudioResponse(response)
}

export const edgeProvider: TtsProvider = {
  id: 'edge',
  vendor: 'dubvoice',
  laneName: 'Edge TTS (via DubVoice)',
  requestCharLimit: EDGE_CHAR_LIMIT,
  chunksLongText: false,
  reportsProgress: false,
  apiKeyOf(apiKeys) {
    return apiKeys.dubvoice
  },
  listVoices({ apiKey, signal }) {
    return listEdgeVoices(apiKey, signal).then((voices) => ({ voices }))
  },
  probeRequest(apiKey) {
    return {
      url: `${DUBVOICE_BASE_URL}/api/edge-tts`,
      init: { headers: authHeaders(apiKey) },
    }
  },
  synthesize({ payload, text, apiKey, signal }) {
    return synthesizeEdge(payload, text, apiKey, signal)
  },
}
