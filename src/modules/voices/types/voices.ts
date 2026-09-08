import type {
  GenerateVoicePayload,
  VoiceHistoryEntry,
  VoiceProviderId,
  VoiceSource,
  VoiceSummary,
} from '@pipeline/types/voices.ts'

// Pestañas del catálogo. Las dos de ElevenLabs directo comparten provider y
// se distinguen por `source` (ver VOICE_TAB_CATALOGS).
export type VoiceTab =
  VoiceProviderId | 'elevenlabs-account' | 'elevenlabs-library' | 'favorites'

export interface VoiceTabCatalog {
  provider: VoiceProviderId
  source?: VoiceSource
}

export type VoiceTaskStatus = 'generating' | 'completed' | 'error'

/**
 * Una generación de voz de punta a punta. Vive fuera de React (módulo store)
 * porque el layout desmonta la vista al navegar y el job sigue corriendo; se
 * persiste en localStorage porque el resultado queda en el historial local y
 * puede seguir reproduciéndose tras reabrir la app.
 */
export interface VoiceTask {
  id: string
  jobId: string | null
  status: VoiceTaskStatus
  request: GenerateVoicePayload
  progressPercent: number
  elapsedSeconds: number | null
  entry: VoiceHistoryEntry | null
  creditsRemaining: number | null
  errorKey: string | null
  createdAt: number
}

export interface VoiceFilterState {
  search: string
  language: string
  gender: string
  // Solo ElevenLabs; se filtran client-side sobre las páginas ya cargadas.
  accent: string
  category: string
  // Solo Minimax.
  onlyClones: boolean
  // Client-side en todos los providers: oculta las voces sin muestra de audio.
  onlyWithPreview: boolean
}

/** Una voz marcada como favorita (persistida en localStorage). */
export interface VoiceFavorite extends VoiceSummary {
  addedAt: number
}

/** Estado del formulario de ajustes del probador (superset de los 3 motores). */
export interface VoiceSettingsFormValue {
  speed: number
  pitch: number
  volume: number
  volumeEdge: number
  emotion: string
  stability: number
  similarity: number
  style: number
  speakerBoost: boolean
}

export interface VoiceModelOption {
  id: string
  label: string
  badgeKey?: string
}

/** Snapshot de un catálogo de voces en localStorage (TTL 24 h). */
export interface VoiceListSnapshot {
  savedAt: number
  voices: VoiceSummary[]
}
