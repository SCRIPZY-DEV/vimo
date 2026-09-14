import type { GenerateVoicePayload } from '../../types/voices.ts'
import {
  DUBVOICE_CATALOG_CHUNK_CHARS,
  dubvoiceCatalogProbeRequest,
  listDubvoiceCatalogVoices,
  synthesizeDubvoiceTask,
} from './dubvoice-catalog.ts'
import type { TtsProvider } from './provider.ts'

// Motor Fish Audio vía DubVoice (~275 voces comunitarias, 15 idiomas). Mismo
// transporte que ElevenLabs vía DubVoice; el único ajuste que honra es
// `speed` (0.5–1.5). Ignora model_id y language, así que no se mandan. El
// catálogo etiqueta el idioma por código ISO, como ElevenLabs.
const LANE_NAME = 'Fish Audio via DubVoice'

function buildBody(
  payload: GenerateVoicePayload,
  text: string,
): Record<string, unknown> {
  return {
    text,
    voice_id: payload.voiceId,
    voice_settings: { speed: payload.settings?.speed ?? 1 },
  }
}

export const fishAudioProvider: TtsProvider = {
  id: 'fishaudio',
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
    return listDubvoiceCatalogVoices('fishaudio', apiKey, filters, signal)
  },
  probeRequest(apiKey) {
    return dubvoiceCatalogProbeRequest('fishaudio', apiKey)
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
}
