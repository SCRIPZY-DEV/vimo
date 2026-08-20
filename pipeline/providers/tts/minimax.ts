import { PipelineFailure } from '../../runner/failure.ts'
import type {
  DubvoiceMinimaxVoice,
  DubvoiceMinimaxVoicesResponse,
  GenerateVoicePayload,
  VoiceSummary,
} from '../../types/voices.ts'
import {
  DUBVOICE_BASE_URL,
  LIST_TIMEOUT_MS,
  SYNTHESIS_TIMEOUT_MS,
  authHeaders,
  downloadAudioFromUrl,
  dubvoiceFetch,
  readAudioResponse,
  type AudioDownload,
} from './dubvoice.ts'

// Motor Minimax vía DubVoice. El voice_id es SIEMPRE el largo del listado
// ("English_Abbess"): el corto ("Abbess") devuelve 500 — verificado con curl
// en el origen contra lo que afirmaba el soporte. Trust the wire.
const VOICES_PAGE_SIZE = 100
const MAX_VOICES_PAGES = 50
const DEFAULT_MODEL = 'speech-02-hd'

// El listado devuelve el idioma como nombre completo ("Spanish"); cuando
// falta, el prefijo del voice_id largo suele traerlo ("Spanish_Reader").
function languageFromVoiceId(voiceId: string): string | undefined {
  const parts = voiceId.split('_')
  if (parts.length >= 2) return parts[0]
  return undefined
}

function inferGender(tags: string[]): string | undefined {
  for (const tag of tags) {
    const lowered = tag.toLowerCase()
    if (lowered === 'male' || lowered === 'man' || lowered === 'masculino')
      return 'male'
    if (lowered === 'female' || lowered === 'woman' || lowered === 'femenino')
      return 'female'
  }

  return undefined
}

function normalizeVoice(voice: DubvoiceMinimaxVoice): VoiceSummary | null {
  if (!voice.voice_id) return null

  const tags = voice.tag_list ?? []
  const summary: VoiceSummary = {
    provider: 'minimax',
    voiceId: voice.voice_id,
    name: voice.voice_name ?? voice.voice_id,
  }

  const language = voice.language ?? languageFromVoiceId(voice.voice_id)
  if (language) summary.language = language
  const gender = inferGender(tags) ?? voice.gender
  if (gender) summary.gender = gender
  if (voice.sample_audio) summary.previewUrl = voice.sample_audio
  const isClone =
    voice.is_clone ?? tags.some((tag) => tag.toLowerCase().includes('clone'))
  if (isClone) summary.isClone = true

  return summary
}

// Pagina internamente hasta agotar (~674 voces) y devuelve el listado
// completo normalizado; los filtros son client-side en la UI.
export async function listMinimaxVoices(
  apiKey: string,
  signal?: AbortSignal,
): Promise<VoiceSummary[]> {
  const voices: VoiceSummary[] = []

  for (let page = 1; page <= MAX_VOICES_PAGES; page++) {
    const response = await dubvoiceFetch(
      `${DUBVOICE_BASE_URL}/api/minimax-tts/voices`,
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({ page, page_size: VOICES_PAGE_SIZE }),
      },
      { timeoutMs: LIST_TIMEOUT_MS, signal },
    )

    const data = (await response.json()) as DubvoiceMinimaxVoicesResponse
    for (const voice of data.voices ?? []) {
      const normalized = normalizeVoice(voice)
      if (normalized) voices.push(normalized)
    }
    if (!data.has_more) break
  }

  return voices
}

export async function synthesizeMinimax(
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<AudioDownload> {
  const settings = payload.settings ?? {}
  const body: Record<string, unknown> = {
    text,
    voice_id: payload.voiceId,
    model: payload.model ?? DEFAULT_MODEL,
    language_boost: payload.language ?? 'auto',
    speed: settings.speed ?? 1,
    vol: settings.volume ?? 1,
    pitch: settings.pitch ?? 0,
  }
  if (settings.emotion) body.emotion = settings.emotion

  const response = await dubvoiceFetch(
    `${DUBVOICE_BASE_URL}/api/minimax-tts`,
    {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    },
    { timeoutMs: SYNTHESIS_TIMEOUT_MS, signal },
  )

  // Minimax responde audio binario directo O JSON con la URL del CDN.
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.startsWith('audio/')) return readAudioResponse(response)

  const data = (await response.json()) as { audio_url?: string; url?: string }
  const audioUrl = data.audio_url ?? data.url
  if (!audioUrl)
    throw new PipelineFailure(
      'voice_provider_error',
      'Minimax synthesis returned neither audio nor audio_url',
    )

  return { audio: await downloadAudioFromUrl(audioUrl, signal) }
}
