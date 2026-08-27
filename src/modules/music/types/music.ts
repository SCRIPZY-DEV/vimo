import type {
  MusicGenerationParams,
  MusicHistoryEntry,
  MusicOption,
} from '@pipeline/types/music.ts'

export type MusicTaskStatus =
  'generating' | 'readyToChoose' | 'choosing' | 'completed' | 'error'

/**
 * Una generación de música de punta a punta: generar → elegir → guardada.
 * Vive fuera de React (módulo store) porque el layout desmonta la vista al
 * navegar y el job sigue corriendo; se persiste en localStorage porque los
 * URLs de Evolink duran 72 h y la elección puede pasar tras reabrir la app.
 */
export interface MusicTask {
  id: string
  jobId: string | null
  status: MusicTaskStatus
  request: MusicGenerationParams
  progressPercent: number
  elapsedSeconds: number | null
  estimatedCredits: number | null
  options: MusicOption[] | null
  chosenOption: MusicOption | null
  chosenEntry: MusicHistoryEntry | null
  errorKey: string | null
  errorSeconds: number | null
  createdAt: number
}

export interface MusicFormValue {
  prompt: string
  instrumental: boolean
}
