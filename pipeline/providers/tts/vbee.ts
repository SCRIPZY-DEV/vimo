import type { GenerateVoicePayload } from '../../types/voices.ts'
import {
  DUBVOICE_CATALOG_CHAR_LIMIT,
  dubvoiceCatalogProbeRequest,
  listDubvoiceCatalogVoices,
  synthesizeDubvoiceTask,
} from './dubvoice-catalog.ts'
import type { TtsProvider } from './provider.ts'

// Motor Vbee vía DubVoice (~1.6k voces, 52 idiomas). Mismo transporte que
// ElevenLabs vía DubVoice; el único ajuste que honra es `speed` (0.5–1.5).
// Ignora model_id y language, así que no se mandan.
const LANE_NAME = 'Vbee via DubVoice'

// El catálogo de Vbee etiqueta el idioma por nombre completo ("Spanish"), no
// por código ISO como ElevenLabs y Fish Audio. Cubre los códigos del filtro
// de la UI (VOICE_LANGUAGE_FILTER_CODES); un código desconocido viaja tal cual.
const VBEE_LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  en: 'English',
  pt: 'Portuguese',
  fr: 'French',
  it: 'Italian',
  de: 'German',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
}

function vbeeLanguageParam(code: string): string {
  return VBEE_LANGUAGE_NAMES[code.toLowerCase()] ?? code
}

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
  requestCharLimit: DUBVOICE_CATALOG_CHAR_LIMIT,
  chunksLongText: false,
  reportsProgress: true,
  apiKeyOf(apiKeys) {
    return apiKeys.dubvoice
  },
  listVoices({ apiKey, filters, signal }) {
    return listDubvoiceCatalogVoices('vbee', apiKey, filters, signal, {
      languageParam: vbeeLanguageParam,
    })
  },
  probeRequest(apiKey) {
    return dubvoiceCatalogProbeRequest('vbee', apiKey)
  },
  async synthesize({ payload, text, apiKey, signal, onProgress }) {
    const audio = await synthesizeDubvoiceTask({
      body: buildBody(payload, text),
      textLength: text.length,
      apiKey,
      laneName: LANE_NAME,
      signal,
      onProgress: (progress) => onProgress?.(progress),
    })
    return { audio }
  },
}
