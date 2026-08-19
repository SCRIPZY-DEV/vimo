// Dominio de música IA (Evolink / Suno). Port renombrado del origen
// (ParamsMusicaSuno, ProgresoMusica, ResultadoMusica).
export interface MusicGenerationParams {
  prompt: string
  customMode?: boolean
  style?: string
  title?: string
  instrumental?: boolean
  negativeTags?: string
  vocalGender?: 'm' | 'f'
}

export interface MusicProgress {
  percent: number
  status: string
  elapsedSeconds: number
}

export interface MusicOption {
  audioUrl: string
  coverUrl?: string
  title?: string
  durationSeconds?: number
}

export interface MusicGenerationResult {
  options: MusicOption[]
  estimatedCredits: number
}

export interface MusicGenerationCallbacks {
  onEstimatedCredits?(credits: number): void | Promise<void>
  onProgress?(progress: MusicProgress): void | Promise<void>
}

export interface MusicGenerationOptions {
  apiKey: string
  signal?: AbortSignal
  callbacks?: MusicGenerationCallbacks
}

// ─── Contratos de los subcomandos de música (payload/result de cada job) ───
// La app los consume solo con `import type` (ADR-0010).

export interface SuggestMusicPromptPayload {
  script: string
}

export interface SuggestMusicPromptResult {
  prompt: string
}

// Detalle que viaja en los eventos `progress` de generate-music.
export interface MusicProgressDetail {
  status?: string
  elapsedSeconds?: number
  estimatedCredits?: number
}

export interface ChooseMusicPayload {
  option: MusicOption
  // Nombre que eligió el usuario para encontrarla en el historial.
  name?: string
  prompt: string
  customMode?: boolean
  style?: string
  instrumental?: boolean
}

export interface ChooseMusicResult {
  entry: MusicHistoryEntry
}

// Una pista guardada en `<projectsRoot>/_history/music/<id>/`.
export interface MusicHistoryEntry {
  id: string
  createdAt: string
  model: string
  prompt: string
  customMode: boolean
  instrumental: boolean
  style?: string
  title?: string
  name?: string
  durationSeconds?: number
  // Rutas absolutas para que la UI reproduzca vía convertFileSrc().
  audioPath: string
  coverPath?: string
}

export interface MusicHistoryListResult {
  entries: MusicHistoryEntry[]
}

export interface MusicHistoryDeletePayload {
  id: string
}

export interface EvolinkCredits {
  remaining: number
  used: number
  unlimited: boolean
  userRemaining: number
  userUsed: number
  tokenRemaining: number
  tokenUsed: number
}

// Formas crudas de la API de Evolink (solo los campos que consumimos).
export interface EvolinkGenerationResponse {
  id?: string
  status?: string
  usage?: { credits_reserved?: number }
}

export interface EvolinkTaskResponse {
  status?: string
  progress?: number
  results?: unknown[]
  error?: { code?: string; message?: string }
}

export interface EvolinkCreditsResponse {
  data?: {
    token?: {
      remaining_credits?: number
      used_credits?: number
      unlimited_credits?: boolean
    }
    user?: { remaining_credits?: number; used_credits?: number }
  }
}
