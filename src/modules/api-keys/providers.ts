import type { ApiKeyProvider } from './types/provider'

/**
 * Catálogo único de proveedores con clave BYO. Rust lo espeja en
 * `src-tauri/src/api_keys/provider.rs`: todo cambio acá se replica allá.
 */
export const API_KEY_PROVIDERS: ApiKeyProvider[] = [
  {
    id: 'deepinfra',
    category: 'llm',
    label: 'DeepInfra',
    getKeyUrl: 'https://deepinfra.com/dash/api_keys',
    keyFormatHint: 'sk-...',
    descriptionKey: 'apiKeys.descripcion.deepinfra',
    recommended: true,
  },
  {
    id: 'fal',
    category: 'image',
    label: 'Fal.ai',
    getKeyUrl: 'https://fal.ai/dashboard/keys',
    keyFormatHint: 'id:secret',
    descriptionKey: 'apiKeys.descripcion.fal',
    badgeKey: 'apiKeys.badge.falAdmin',
    recommended: true,
  },
  {
    id: 'evolink',
    category: 'image',
    label: 'Evolink',
    getKeyUrl: 'https://evolink.ai/',
    keyFormatHint: 'sk-...',
    descriptionKey: 'apiKeys.descripcion.evolink',
    recommended: false,
  },
  {
    id: 'dubvoice',
    category: 'voice',
    label: 'DubVoice',
    getKeyUrl: 'https://www.dubvoice.ai/',
    keyFormatHint: 'sk_live_...',
    descriptionKey: 'apiKeys.descripcion.dubvoice',
    recommended: true,
  },
  {
    id: 'elevenlabs',
    category: 'voice',
    label: 'ElevenLabs',
    getKeyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    keyFormatHint: 'sk_...',
    descriptionKey: 'apiKeys.descripcion.elevenlabs',
    recommended: false,
  },
  {
    id: 'deepgram',
    category: 'transcription',
    label: 'Deepgram',
    getKeyUrl: 'https://console.deepgram.com/',
    keyFormatHint: 'Token',
    descriptionKey: 'apiKeys.descripcion.deepgram',
    recommended: true,
  },
]
