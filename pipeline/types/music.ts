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
