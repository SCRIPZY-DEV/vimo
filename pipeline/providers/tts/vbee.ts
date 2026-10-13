import type { GenerateVoicePayload } from '../../types/voices.ts'
import {
  DUBVOICE_CATALOG_CHUNK_CHARS,
  dubvoiceCatalogProbeRequest,
  listDubvoiceCatalogVoices,
  synthesizeDubvoiceTask,
} from './dubvoice-catalog.ts'
import { languageNameParam } from './language-names.ts'
import type { TtsProvider } from './provider.ts'

// Motor Vbee vía DubVoice (~1.6k voces, 52 idiomas). Mismo transporte que
// ElevenLabs vía DubVoice; el único ajuste que honra es `speed` (0.5–1.5).
// Ignora model_id y language, así que no se mandan.
const LANE_NAME = 'Vbee via DubVoice'

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

export const vbeeProvider: TtsProvider = {
  id: 'vbee',
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
    return listDubvoiceCatalogVoices('vbee', apiKey, filters, signal, {
      // Vbee etiqueta el idioma por nombre completo ("Spanish").
      languageParam: languageNameParam,
    })
  },
  probeRequest(apiKey) {
    return dubvoiceCatalogProbeRequest('vbee', apiKey)
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
