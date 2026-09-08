import type { VoiceProviderId } from '@pipeline/types/voices.ts'
import type {
  VoiceFilterState,
  VoiceModelOption,
  VoiceSettingsFormValue,
} from './types/voices'

export const VoicesRoutes = {
  voices: '/voices',
} as const

export const voicesQueryKeys = {
  credits: ['voices', 'credits'],
  history: ['voices', 'history'],
  list(provider: VoiceProviderId, filtersKey: string) {
    return ['voices', 'list', provider, filtersKey]
  },
} as const

/** La tarea sobrevive navegación; el audio queda en el historial local. */
export const VOICE_TASK_STORAGE_KEY = 'vimo:voices:task:v1'
export const VOICE_FAVORITES_STORAGE_KEY = 'vimo:voices:favorites:v1'

/**
 * Snapshot de los catálogos Minimax/Edge en localStorage (reemplaza los caches
 * en memoria del server viejo: el sidecar es un proceso por job y no puede
 * cachear). ElevenLabs no se cachea: pagina server-side y es rápido por página.
 */
export const VOICE_LIST_CACHE_PREFIX = 'vimo:voices:list:'
export const VOICE_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const VOICE_LIST_CACHE_MAX_VOICES = 2000

/** Voces por página en la paginación client-side (Minimax y favoritos). */
export const VOICE_PAGE_SIZE = 30

// Espejo de ELEVENLABS_PAGE_SIZE del sidecar (pipeline/providers/tts):
// ElevenLabs pagina server-side, así que la UI necesita el mismo tamaño para
// traducir el total del proveedor a número de páginas.
export const ELEVENLABS_PAGE_SIZE = 60
export const SEARCH_DEBOUNCE_MS = 300

/** Espera antes de re-consultar el saldo (DubVoice descuenta async). */
export const CREDITS_SETTLE_DELAY_MS = 3000

/** Espejo de VOICE_TEXT_LIMITS del sidecar (pipeline/commands/voices). */
export const VOICE_TEXT_LIMITS: Record<VoiceProviderId, number> = {
  minimax: 4500,
  elevenlabs: 4500,
  edge: 4500,
}

/**
 * Tope total de caracteres que la voz puede narrar en un video (90 000,
 * según el dueño, 2026-09-07). El guion de Crear se limita a esto: un guion
 * más largo armaría un video cuya narración no se puede generar. Espejado
 * en el sidecar (pipeline/commands/videos/create-video-project.ts).
 */
export const NARRATION_CHAR_LIMIT = 90_000

/** Créditos DubVoice por carácter, para el costo estimado del probador. */
export const VOICE_COST_FACTORS: Record<VoiceProviderId, number> = {
  minimax: 1,
  elevenlabs: 1,
  edge: 0.5,
}

/** Etiquetas técnicas de marca: van en el dataset, no se traducen (ADR-0008). */
export const VOICE_MODELS: Record<VoiceProviderId, VoiceModelOption[]> = {
  minimax: [
    {
      id: 'speech-02-hd',
      label: 'Speech-02 HD',
      badgeKey: 'voices.modelos.calidad',
    },
    {
      id: 'speech-02-turbo',
      label: 'Speech-02 Turbo',
      badgeKey: 'voices.modelos.velocidad',
    },
    {
      id: 'speech-01-hd',
      label: 'Speech-01 HD',
      badgeKey: 'voices.modelos.balance',
    },
  ],
  elevenlabs: [
    {
      id: 'eleven_multilingual_v2',
      label: 'Multilingual v2',
      badgeKey: 'voices.modelos.calidad',
    },
    { id: 'eleven_v3', label: 'Eleven v3', badgeKey: 'voices.modelos.calidad' },
    {
      id: 'eleven_turbo_v2_5',
      label: 'Turbo v2.5',
      badgeKey: 'voices.modelos.velocidad',
    },
    {
      id: 'eleven_flash_v2_5',
      label: 'Flash v2.5',
      badgeKey: 'voices.modelos.velocidad',
    },
  ],
  edge: [{ id: 'default', label: 'Microsoft Edge' }],
}

export const DEFAULT_VOICE_MODELS: Record<VoiceProviderId, string> = {
  minimax: 'speech-02-hd',
  elevenlabs: 'eleven_multilingual_v2',
  edge: 'default',
}

/** Chips de emoción de Minimax ('' = sin emoción explícita). */
export const MINIMAX_EMOTIONS = [
  '',
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'fearful',
  'disgusted',
] as const

/** Defaults de los ajustes de síntesis (port de AJUSTES_VOZ_DEFAULT). */
export const VOICE_SETTINGS_DEFAULTS: VoiceSettingsFormValue = {
  speed: 1,
  pitch: 0,
  volume: 1,
  volumeEdge: 100,
  emotion: '',
  stability: 0.5,
  similarity: 0.75,
  style: 0,
  speakerBoost: true,
}

export const VOICE_FILTERS_INITIAL_VALUE: VoiceFilterState = {
  search: '',
  language: '',
  gender: '',
  accent: '',
  category: '',
  onlyClones: false,
  onlyWithPreview: false,
}

/** Códigos de idioma del filtro (mismas 10 opciones del origen). */
export const VOICE_LANGUAGE_FILTER_CODES = [
  'es',
  'en',
  'pt',
  'fr',
  'it',
  'de',
  'ru',
  'ja',
  'zh',
] as const

/** Código de error del sidecar/Rust → clave i18n del mensaje. */
export const VOICE_ERROR_MESSAGE_KEYS: Record<string, string> = {
  voice_network: 'voices.errores.network',
  voice_invalid_api_key: 'voices.errores.invalidApiKey',
  voice_rate_limited: 'voices.errores.rateLimited',
  voice_maintenance: 'voices.errores.maintenance',
  voice_provider_error: 'voices.errores.providerError',
  voice_generation_failed: 'voices.errores.generationFailed',
  voice_timeout: 'voices.errores.timeout',
  voice_download_failed: 'voices.errores.downloadFailed',
  voice_empty_audio: 'voices.errores.emptyAudio',
  voice_text_too_long: 'voices.errores.textTooLong',
  invalid_payload: 'voices.errores.invalido',
  missing_api_key: 'voices.errores.missingApiKey',
  missing_projects_root: 'voices.errores.missingProjectsRoot',
  cancelled: 'voices.errores.cancelado',
  sidecar_missing: 'voices.errores.sidecar',
  sidecar_spawn: 'voices.errores.sidecar',
  sidecar_write: 'voices.errores.sidecar',
}

export const UNKNOWN_VOICE_ERROR_KEY = 'voices.errores.desconocido'
export const INTERRUPTED_ERROR_KEY = 'voices.errores.interrumpida'

export const DUBVOICE_DASHBOARD_URL = 'https://www.dubvoice.ai/'
