import type { VoiceProviderId, VoiceVendorId } from '@pipeline/types/voices.ts'
import type {
  VoiceFilterState,
  VoiceModelOption,
  VoiceSettingsFormValue,
  VoiceTab,
  VoiceTabCatalog,
} from './types/voices'

export const VoicesRoutes = {
  voices: '/voices',
} as const

export const voicesQueryKeys = {
  // Prefijo para invalidar el saldo de cualquier vendor.
  creditsRoot: ['voices', 'credits'],
  credits(vendor: VoiceVendorId) {
    return ['voices', 'credits', vendor]
  },
  history: ['voices', 'history'],
  list(provider: VoiceProviderId, filtersKey: string) {
    return ['voices', 'list', provider, filtersKey]
  },
  listRoot(provider: VoiceProviderId) {
    return ['voices', 'list', provider]
  },
} as const

// ─── Dos proveedores de voces (ADR-0024) ───
// El vendor se deriva del id de motor: DubVoice agrupa cinco motores con una
// clave; ElevenLabs directo es uno solo con la clave del usuario.
export const VOICE_PROVIDERS_BY_VENDOR: Record<
  VoiceVendorId,
  VoiceProviderId[]
> = {
  dubvoice: ['minimax', 'elevenlabs', 'vbee', 'fishaudio', 'edge'],
  elevenlabs: ['elevenlabs-direct'],
}

// Pestañas de la página Voces según el vendor activo. Edge queda fuera del
// catálogo visible (sin muestras del proveedor).
export const VOICE_TABS_BY_VENDOR: Record<VoiceVendorId, VoiceTab[]> = {
  dubvoice: ['minimax', 'elevenlabs', 'vbee', 'fishaudio', 'favorites'],
  elevenlabs: ['elevenlabs-account', 'elevenlabs-library', 'favorites'],
}

// Pestañas del picker de voz de Crear/Library: DubVoice incluye Edge (sin
// muestras, pero gratis); ElevenLabs directo, cuenta y biblioteca.
export const VOICE_PICKER_TABS_BY_VENDOR: Record<
  VoiceVendorId,
  Exclude<VoiceTab, 'favorites'>[]
> = {
  dubvoice: ['minimax', 'elevenlabs', 'vbee', 'fishaudio', 'edge'],
  elevenlabs: ['elevenlabs-account', 'elevenlabs-library'],
}

// Qué catálogo pide cada pestaña. Las dos de ElevenLabs directo son el mismo
// motor con distinta fuente: la biblioteca pública no es un proveedor.
export const VOICE_TAB_CATALOGS: Record<
  Exclude<VoiceTab, 'favorites'>,
  VoiceTabCatalog
> = {
  minimax: { provider: 'minimax' },
  elevenlabs: { provider: 'elevenlabs' },
  vbee: { provider: 'vbee' },
  fishaudio: { provider: 'fishaudio' },
  edge: { provider: 'edge' },
  'elevenlabs-direct': { provider: 'elevenlabs-direct', source: 'account' },
  'elevenlabs-account': { provider: 'elevenlabs-direct', source: 'account' },
  'elevenlabs-library': { provider: 'elevenlabs-direct', source: 'library' },
}

/** Etiquetas de marca por motor (historial, Crear): no se traducen. */
export const VOICE_PROVIDER_LABELS: Record<VoiceProviderId, string> = {
  minimax: 'Minimax',
  elevenlabs: 'ElevenLabs · DubVoice',
  vbee: 'Vbee · DubVoice',
  fishaudio: 'Fish Audio · DubVoice',
  edge: 'Edge TTS',
  'elevenlabs-direct': 'ElevenLabs',
}

/** Catálogos completos que se guardan como snapshot en localStorage. */
export const VOICE_SNAPSHOT_PROVIDERS: VoiceProviderId[] = ['minimax', 'edge']

/** Categorías de la biblioteca pública de ElevenLabs (filtro server-side). */
export const ELEVENLABS_LIBRARY_CATEGORIES = [
  'professional',
  'high_quality',
  'famous',
] as const
export const ELEVENLABS_LIBRARY_CATEGORY_LABEL_KEYS: Record<string, string> = {
  professional: 'voices.filtros.categorias.professional',
  high_quality: 'voices.filtros.categorias.high_quality',
  famous: 'voices.filtros.categorias.famous',
}

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

// Espejo de CATALOG_PAGE_SIZE del sidecar (pipeline/providers/tts): los
// catálogos paginados server-side (ElevenLabs, Vbee y Fish Audio vía DubVoice,
// biblioteca de ElevenLabs) necesitan el mismo tamaño en la UI para traducir el
// total del proveedor a número de páginas.
export const CATALOG_PAGE_SIZE = 60
export const SEARCH_DEBOUNCE_MS = 300

/** Espera antes de re-consultar el saldo (DubVoice descuenta async). */
export const CREDITS_SETTLE_DELAY_MS = 3000

/**
 * Tope total de caracteres que la voz puede narrar (90 000, según el dueño,
 * 2026-09-07), en cualquier motor: cada uno trocea el texto a su tope por
 * llamada en el sidecar. Lo usan el guion de Crear y el probador de voz.
 * Espejo de TTS_TEXT_CHAR_LIMIT (pipeline/providers/tts/text-limits.ts).
 */
export const NARRATION_CHAR_LIMIT = 90_000
export const VOICE_TEXT_LIMIT = NARRATION_CHAR_LIMIT

/** Unidades del vendor por carácter (créditos DubVoice o caracteres de
 *  ElevenLabs), para el costo estimado del probador. */
export const VOICE_COST_FACTORS: Record<VoiceProviderId, number> = {
  minimax: 1,
  elevenlabs: 1,
  vbee: 1,
  fishaudio: 1,
  edge: 0.5,
  'elevenlabs-direct': 1,
}

/** Mismos modelos en los dos carriles ElevenLabs (DubVoice los reenvía tal cual). */
const ELEVENLABS_MODELS: VoiceModelOption[] = [
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
]

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
  elevenlabs: ELEVENLABS_MODELS,
  // Vbee y Fish Audio no eligen modelo: DubVoice lo decide por la voz.
  vbee: [{ id: 'default', label: 'Vbee' }],
  fishaudio: [{ id: 'default', label: 'Fish Audio' }],
  edge: [{ id: 'default', label: 'Microsoft Edge' }],
  'elevenlabs-direct': ELEVENLABS_MODELS,
}

export const DEFAULT_VOICE_MODELS: Record<VoiceProviderId, string> = {
  minimax: 'speech-02-hd',
  elevenlabs: 'eleven_multilingual_v2',
  vbee: 'default',
  fishaudio: 'default',
  edge: 'default',
  'elevenlabs-direct': 'eleven_multilingual_v2',
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
  voice_chunking_inconsistent: 'voices.errores.chunkingInconsistent',
  voice_quota_exceeded: 'voices.errores.quotaExceeded',
  voice_insufficient_credits: 'voices.errores.insufficientCredits',
  voice_account_restricted: 'voices.errores.accountRestricted',
  voice_library_add_failed: 'voices.errores.libraryAddFailed',
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
export const ELEVENLABS_VOICE_LAB_URL = 'https://elevenlabs.io/app/voice-lab'

/** Dónde clona voces cada vendor. */
export const VOICE_CLONING_URLS: Record<VoiceVendorId, string> = {
  dubvoice: DUBVOICE_DASHBOARD_URL,
  elevenlabs: ELEVENLABS_VOICE_LAB_URL,
}
