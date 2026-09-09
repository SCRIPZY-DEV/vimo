// Dominio de voces TTS. Port renombrado del origen (VozUnificada, BodyVoz,
// MetadataHistorialVoz).
//
// Dos vendors (ADR-0024): DubVoice es un agregador (una clave, cinco motores:
// minimax, elevenlabs, vbee, fishaudio, edge) y ElevenLabs directo usa la
// clave propia del usuario contra api.elevenlabs.io. El id de provider es el
// MOTOR y queda persistido en project.json, historial y favoritos; el vendor
// se deriva del id. 'elevenlabs' sigue siendo el motor vía DubVoice
// (compatibilidad con lo ya guardado); 'elevenlabs-direct' es la API directa.
export type VoiceProviderId =
  'minimax' | 'elevenlabs' | 'vbee' | 'fishaudio' | 'edge' | 'elevenlabs-direct'

export type VoiceVendorId = 'dubvoice' | 'elevenlabs'

// Solo elevenlabs-direct: 'account' = voces de la cuenta del usuario
// (/v2/voices); 'library' = biblioteca pública (/v1/shared-voices).
export type VoiceSource = 'account' | 'library'

// Shape unificado que cruza el contrato: la UI nunca ve los shapes crudos de
// DubVoice (port de unificarMinimax/unificarElevenLabs/unificarEdge).
export interface VoiceSummary {
  provider: VoiceProviderId
  // Minimax: SIEMPRE el id largo ("English_Abbess"); el corto da 500.
  voiceId: string
  name: string
  // Minimax y Vbee devuelven nombre completo ("Spanish"); Edge devuelve
  // locale ("es-ES"); ElevenLabs y Fish Audio, código ISO ("es"). La UI
  // matchea todos con languageMatches.
  language?: string
  gender?: string
  accent?: string
  category?: string
  // ElevenLabs preview_url | Minimax sample_audio | Edge: sin preview.
  previewUrl?: string
  // Minimax: voz clonada de la cuenta del usuario. ElevenLabs directo: voz
  // clonada o profesional de la cuenta.
  isClone?: boolean
  // Solo elevenlabs-direct con source 'library': dueño público de la voz.
  // Su presencia significa «hay que añadirla a la cuenta antes de usarla»
  // (subcomando add-library-voice); nunca se persiste en project.json ni en
  // el historial.
  libraryOwnerId?: string
}

// ─── Contratos de los subcomandos de voces (payload/result de cada job) ───
// La app los consume solo con `import type` (ADR-0010).

export interface ListVoicesFilters {
  search?: string
  language?: string
  gender?: string
  // Paginación server-side: solo significativa para los motores de DubVoice
  // v1 (elevenlabs, vbee, fishaudio) y para elevenlabs-direct con source
  // 'library'. 1-indexado (la conversión al 0-indexado de ElevenLabs la hace
  // el sidecar).
  page?: number
  // Solo elevenlabs-direct (default 'account').
  source?: VoiceSource
  // Solo elevenlabs-direct con source 'library': filtro server-side.
  category?: string
}

export interface ListVoicesPayload {
  provider: VoiceProviderId
  filters?: ListVoicesFilters
}

export interface ListVoicesResult {
  voices: VoiceSummary[]
  // Solo significativo en los catálogos paginados server-side.
  hasMore?: boolean
  // Total de voces del catálogo del proveedor: solo los motores de DubVoice
  // v1 (elevenlabs, vbee, fishaudio) lo informan; los catálogos completos
  // tienen total = voices.length y la biblioteca de ElevenLabs no lo expone.
  total?: number
}

// Ajustes de síntesis por proveedor (port de AjustesVoz). Cada motor lee solo
// los campos que le aplican; el resto se ignora.
export interface VoiceGenerationSettings {
  // minimax 0.5–2 | elevenlabs 0.7–1.2 | vbee y fishaudio 0.5–1.5 (su único
  // ajuste)
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

// Detalle que viaja en los eventos `progress` de generate-voice. Con texto
// troceado trae la parte en curso (1-based) y el total; `percent` del evento
// es el agregado de todas las partes.
export interface VoiceProgressDetail {
  status?: string
  elapsedSeconds?: number
  partIndex?: number
  partTotal?: number
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

export interface VoiceCreditsPayload {
  // Sin payload → 'dubvoice' (compatibilidad).
  vendor?: VoiceVendorId
}

export interface VoiceCreditsResult {
  vendor: VoiceVendorId
  // dubvoice: créditos prepagos; elevenlabs: caracteres de la cuota mensual.
  unit: 'credits' | 'characters'
  // dubvoice: saldo; elevenlabs: caracteres restantes (limit - used).
  credits: number
  email?: string
  plan?: string
  // Solo elevenlabs: para «X de Y caracteres» y la fecha de renovación.
  quota?: VoiceCharacterQuota
}

export interface VoiceCharacterQuota {
  used: number
  limit: number
  // ISO 8601.
  resetsAt?: string
}

// Añade una voz de la biblioteca pública de ElevenLabs a la cuenta del
// usuario y devuelve el voice_id con el que ya se puede sintetizar.
export interface AddLibraryVoicePayload {
  libraryOwnerId: string
  voiceId: string
  name: string
}

export interface AddLibraryVoiceResult {
  voiceId: string
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

// Item de GET /api/v1/voices, el mismo envelope para elevenlabs, vbee y
// fishaudio (accent y category solo vienen en ElevenLabs).
export interface DubvoiceCatalogVoice {
  voice_id?: string
  name?: string
  category?: string
  language?: string
  accent?: string
  gender?: string
  preview_url?: string
}

export interface DubvoiceCatalogVoicesResponse {
  voices?: DubvoiceCatalogVoice[]
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

// ─── Formas crudas de la API directa de ElevenLabs (solo lo que consumimos) ───

export interface ElevenLabsVoice {
  voice_id?: string
  name?: string
  // 'premade' | 'cloned' | 'generated' | 'professional' | ...
  category?: string
  preview_url?: string
  labels?: {
    language?: string
    gender?: string
    accent?: string
    [key: string]: string | undefined
  }
  sharing?: {
    original_voice_id?: string
    public_owner_id?: string
  }
}

export interface ElevenLabsVoicesResponse {
  voices?: ElevenLabsVoice[]
  has_more?: boolean
  next_page_token?: string | null
}

export interface ElevenLabsSharedVoice {
  public_owner_id?: string
  voice_id?: string
  name?: string
  category?: string
  language?: string
  gender?: string
  accent?: string
  preview_url?: string
}

export interface ElevenLabsSharedVoicesResponse {
  voices?: ElevenLabsSharedVoice[]
  has_more?: boolean
}

export interface ElevenLabsSubscriptionResponse {
  tier?: string
  character_count?: number
  character_limit?: number
  next_character_count_reset_unix?: number
}

export interface ElevenLabsAddVoiceResponse {
  voice_id?: string
}
