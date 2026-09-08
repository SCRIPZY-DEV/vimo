// Dominio de voces TTS (DubVoice: Minimax + ElevenLabs + Edge). Port renombrado
// del origen (VozUnificada, BodyVoz, MetadataHistorialVoz).
export type VoiceProviderId = 'minimax' | 'elevenlabs' | 'edge'

// Shape unificado que cruza el contrato: la UI nunca ve los shapes crudos de
// DubVoice (port de unificarMinimax/unificarElevenLabs/unificarEdge).
export interface VoiceSummary {
  provider: VoiceProviderId
  // Minimax: SIEMPRE el id largo ("English_Abbess"); el corto da 500.
  voiceId: string
  name: string
  // Minimax devuelve nombre completo ("Spanish"); Edge devuelve locale
  // ("es-ES"). La UI matchea ambos con languageMatches.
  language?: string
  gender?: string
  accent?: string
  category?: string
  // ElevenLabs preview_url | Minimax sample_audio | Edge: sin preview.
  previewUrl?: string
  // Minimax: voz clonada de la cuenta del usuario.
  isClone?: boolean
}

// ─── Contratos de los subcomandos de voces (payload/result de cada job) ───
// La app los consume solo con `import type` (ADR-0010).

export interface ListVoicesFilters {
  search?: string
  language?: string
  gender?: string
  // Paginación server-side: solo significativa para elevenlabs.
  page?: number
}

export interface ListVoicesPayload {
  provider: VoiceProviderId
  filters?: ListVoicesFilters
}

export interface ListVoicesResult {
  voices: VoiceSummary[]
  // Solo significativo para elevenlabs (paginado server-side).
  hasMore?: boolean
  // Total de voces del catálogo del proveedor: solo elevenlabs lo informa
  // (minimax y edge llegan completos, ahí el total es voices.length).
  total?: number
}

// Ajustes de síntesis por proveedor (port de AjustesVoz). Cada motor lee solo
// los campos que le aplican; el resto se ignora.
export interface VoiceGenerationSettings {
  // minimax 0.5–2 | elevenlabs 0.7–1.2
  speed?: number
  // minimax -12..12
  pitch?: number
  // minimax `vol` 0.5–10
  volume?: number
  // minimax; "" = no se manda
  emotion?: string
  // elevenlabs 0–1
  stability?: number
  similarityBoost?: number
  style?: number
  useSpeakerBoost?: boolean
  // edge 0–100; solo se manda si 0 <= v < 100 (100 = normal)
  volumeEdge?: number
}

export interface GenerateVoicePayload {
  provider: VoiceProviderId
  voiceId: string
  voiceName?: string
  text: string
  // minimax `model` (default speech-02-hd) | elevenlabs `model_id`
  // (default eleven_multilingual_v2)
  model?: string
  // elevenlabs `language` (?? 'auto') | minimax `language_boost`
  // (default 'auto'). 'es'/'en' además fuerzan la normalización de números.
  language?: string
  settings?: VoiceGenerationSettings
}

// Detalle que viaja en los eventos `progress` de generate-voice.
export interface VoiceProgressDetail {
  status?: string
  elapsedSeconds?: number
}

// Una generación guardada en `<projectsRoot>/_history/voices/<id>/`.
export interface VoiceHistoryEntry {
  id: string
  createdAt: string
  provider: VoiceProviderId
  voiceId: string
  voiceName?: string
  model?: string
  // Texto truncado a 1000 chars (como el origen); charsCount es el largo real.
  text: string
  charsCount: number
  creditsUsed?: number
  // Ruta absoluta para que la UI reproduzca vía convertFileSrc(); se deriva
  // al listar, NO se persiste en metadata.json.
  audioPath: string
}

export interface GenerateVoiceResult {
  entry: VoiceHistoryEntry
  // Del header x-credits-remaining, si DubVoice lo mandó.
  creditsRemaining?: number
}

export interface VoiceCreditsResult {
  email?: string
  credits: number
  plan?: string
}

export interface VoiceHistoryListResult {
  entries: VoiceHistoryEntry[]
}

export interface VoiceHistoryDeletePayload {
  id: string
}

// ─── Formas crudas de la API de DubVoice (solo los campos que consumimos) ───

export interface DubvoiceMinimaxVoice {
  voice_id?: string
  voice_name?: string
  description?: string
  sample_audio?: string
  tag_list?: string[]
  gender?: string
  language?: string
  is_clone?: boolean
}

export interface DubvoiceMinimaxVoicesResponse {
  voices?: DubvoiceMinimaxVoice[]
  has_more?: boolean
}

export interface DubvoiceElevenLabsVoice {
  voice_id?: string
  name?: string
  category?: string
  language?: string
  accent?: string
  gender?: string
  preview_url?: string
}

export interface DubvoiceElevenLabsVoicesResponse {
  voices?: DubvoiceElevenLabsVoice[]
  total?: number
  has_more?: boolean
}

export interface DubvoiceEdgeVoice {
  id?: string
  name?: string
  language?: string
  locale?: string
  gender?: string
}

export interface DubvoiceTtsTaskResponse {
  task_id?: string
  status?: string
  progress?: number
  result?: string
  error?: string
}

export interface DubvoiceAccountResponse {
  email?: string
  credits?: number
  plan?: string
}
