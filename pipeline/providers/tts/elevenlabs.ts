import type { GenerateVoicePayload } from '../../types/voices.ts'
import {
  DUBVOICE_CATALOG_CHUNK_CHARS,
  dubvoiceCatalogProbeRequest,
  listDubvoiceCatalogVoices,
  synthesizeDubvoiceTask,
} from './dubvoice-catalog.ts'
import { ELEVENLABS_DEFAULT_MODEL } from './elevenlabs-shared.ts'
import type { TtsProvider } from './provider.ts'

// Motor ElevenLabs vía DubVoice: catálogo paginado (~12k voces) y síntesis
// asíncrona por tarea, ambos por el transporte común de dubvoice-catalog.ts.
// Lo propio del motor es el body: modelo, idioma y los cinco voice_settings.
const LANE_NAME = 'ElevenLabs via DubVoice'

function buildBody(
  payload: GenerateVoicePayload,
  text: string,
): Record<string, unknown> {
  const settings = payload.settings ?? {}
  return {
    text,
    voice_id: payload.voiceId,
    model_id: payload.model ?? ELEVENLABS_DEFAULT_MODEL,
    language: payload.language ?? 'auto',
    voice_settings: {
      speed: settings.speed ?? 1,
      stability: settings.stability ?? 0.5,
      similarity_boost: settings.similarityBoost ?? 0.75,
      style: settings.style ?? 0,
      use_speaker_boost: settings.useSpeakerBoost ?? true,
    },
  }
}

export const elevenLabsProvider: TtsProvider = {
  id: 'elevenlabs',
  vendor: 'dubvoice',
  laneName: LANE_NAME,
  chunkCharLimit() {
    return DUBVOICE_CATALOG_CHUNK_CHARS
  },
  reportsProgress: true,
  supportsTaskResume: true,
  apiKeyOf(apiKeys) {
    return apiKeys.dubvoice
  },
  listVoices({ apiKey, filters, signal }) {
    return listDubvoiceCatalogVoices('elevenlabs', apiKey, filters, signal)
  },
  probeRequest(apiKey) {
    return dubvoiceCatalogProbeRequest('elevenlabs', apiKey)
  },
  async synthesize({ payload, text, apiKey, signal, onProgress, checkpoint }) {
    const audio = await synthesizeDubvoiceTask({
      body: buildBody(payload, text),
      textLength: text.length,
      apiKey,
      laneName: LANE_NAME,
      checkpoint,
      signal,
      onProgress: (progress) => onProgress?.(progress),
    })
    return { audio }
  },
  // Si DubVoice está caído y el usuario tiene su propia clave, se sintetiza
  // contra api.elevenlabs.io con la MISMA voz (solo funciona con voces
  // premade públicas: las clonadas de una cuenta no existen en la otra).
  fallbackProviderIds: ['elevenlabs-direct'],
}
