import type { MusicFormValue } from './types/music'

export const MusicRoutes = {
  music: '/music',
} as const

export const musicQueryKeys = {
  credits: ['music', 'credits'],
  history: ['music', 'history'],
} as const

/** La tarea sobrevive navegación y reinicios (los URLs de Evolink duran 72 h). */
export const MUSIC_TASK_STORAGE_KEY = 'vimo:music:task:v1'

/** Ventana mínima entre generaciones (port del rate-limit del origen). */
export const GENERATION_COOLDOWN_MS = 60_000

/** Espera antes de re-consultar el saldo (Evolink descuenta créditos async). */
export const CREDITS_SETTLE_DELAY_MS = 3000

export const MUSIC_MODEL_LABEL = 'suno-v5-beta'
export const MUSIC_VARIATIONS = 2

export const PROMPT_LIMIT = 500
export const PROMPT_LIMIT_CUSTOM = 5000
export const STYLE_LIMIT = 1000
export const SONG_TITLE_LIMIT = 80
export const NAME_LIMIT = 60

export const MUSIC_FORM_INITIAL_VALUE: MusicFormValue = {
  prompt: '',
  instrumental: true,
  advanced: false,
  style: '',
  title: '',
  negativeTags: '',
  vocalGender: '',
}

/** Código de error del sidecar/Rust → clave i18n del mensaje. */
export const MUSIC_ERROR_MESSAGE_KEYS: Record<string, string> = {
  music_network: 'music.errores.network',
  music_invalid_api_key: 'music.errores.invalidApiKey',
  music_provider_error: 'music.errores.providerError',
  music_task_expired: 'music.errores.taskExpired',
  music_generation_failed: 'music.errores.generationFailed',
  music_timeout: 'music.errores.timeout',
  music_download_failed: 'music.errores.downloadFailed',
  llm_network: 'music.errores.llmNetwork',
  llm_timeout: 'music.errores.llmTimeout',
  llm_rate_limited: 'music.errores.llmRateLimited',
  llm_provider_error: 'music.errores.llmProviderError',
  llm_empty_response: 'music.errores.llmProviderError',
  missing_api_key: 'music.errores.missingApiKey',
  missing_projects_root: 'music.errores.missingProjectsRoot',
  cancelled: 'music.errores.cancelado',
  sidecar_missing: 'music.errores.sidecar',
  sidecar_spawn: 'music.errores.sidecar',
  sidecar_write: 'music.errores.sidecar',
}

export const UNKNOWN_MUSIC_ERROR_KEY = 'music.errores.desconocido'
export const INTERRUPTED_ERROR_KEY = 'music.errores.interrumpida'
export const COOLDOWN_ERROR_KEY = 'music.errores.cooldown'

/** Fondos para opciones sin cover (Evolink casi nunca devuelve imagen). */
export const OPTION_GRADIENTS: string[] = [
  'radial-gradient(circle at 30% 20%, hsl(43 100% 70%), hsl(43 100% 52%), hsl(0 100% 75%))',
  'radial-gradient(circle at 70% 30%, hsl(199 89% 70%), hsl(199 89% 48%), hsl(258 90% 66%))',
  'radial-gradient(circle at 40% 70%, hsl(258 90% 76%), hsl(258 90% 58%), hsl(199 89% 48%))',
  'radial-gradient(circle at 60% 40%, hsl(0 100% 78%), hsl(16 100% 62%), hsl(43 100% 52%))',
]
