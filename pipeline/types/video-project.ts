import type { CharacterStyleId } from './characters.ts'
import type { FalImageModelId, ImageProviderId } from './image-provider.ts'
import type { MusicGenerationParams } from './music.ts'
import type { SceneSummary } from './scenes.ts'
import type { StageId } from '../runner/stage-id.ts'
import type { VoiceGenerationSettings, VoiceProviderId } from './voices.ts'

// Dominio del proyecto de video (módulo Create, ADR-0013). Browser-safe: la
// UI consume estos contratos solo con `import type`.

export type NarrationMode = 'tts' | 'own-audio'

export type BgmMode = 'youtube' | 'evolink-ai'

// Frecuencia de aparición del personaje (port de FrecuenciaPersonaje).
export type CharacterFrequency =
  'rarely' | 'balanced' | 'often' | 'almost-always' | 'always'

// Un personaje asignado al proyecto, en su forma PERSISTIDA (project.json).
// La referencia visual vive en `characters/` dentro del proyecto: una foto
// subida (modo photo) o el preview del estilo actual copiado de la
// biblioteca (modo text) — regla E20 del origen: jamás el preview de OTRO
// estilo, rompería la identidad con las escenas vecinas.
export interface ProjectCharacter {
  // Id en la biblioteca `<projectsRoot>/characters/`, si vino de ahí.
  characterId?: string
  name: string
  // Identidad en inglés, neutra de estilo (misma semántica que la biblioteca).
  description: string
  mode: 'photo' | 'text'
  // Archivo dentro de `characters/` del proyecto (reference_1.jpg, …).
  referenceImageFile?: string
  isProtagonist?: boolean
}

// Opciones del proyecto (port con whitelist de OpcionesProyecto: solo lo que
// el pipeline nuevo consume). Se persisten en project.json y las stages las
// leen del contexto — nada llega por entorno (ADR-0010).
export interface VideoProjectOptions {
  styleId: CharacterStyleId
  // 0 = automática (≈ una escena cada 3 segundos de audio).
  sceneCount: number
  narrationMode: NarrationMode
  voiceProvider?: VoiceProviderId
  voiceId?: string
  voiceName?: string
  voiceSettings?: VoiceGenerationSettings
  imageProvider: ImageProviderId
  // Solo se respeta con imageProvider 'fal'.
  falModel?: FalImageModelId
  imageQuality?: string
  useBgm: boolean
  bgmMode?: BgmMode
  // Modo youtube: URL del video del que yt-dlp extrae el audio.
  bgmUrl?: string
  // Modo evolink-ai: parámetros de la generación Suno.
  bgmMusic?: MusicGenerationParams
  useOverlay: boolean
  overlayUrl?: string
  // Pausar tras los cortes para que el usuario confirme la cantidad de
  // escenas (evento awaiting-scene-confirmation, ADR-0013).
  confirmScenes: boolean
  characters?: ProjectCharacter[]
  characterFrequency?: CharacterFrequency
  // Mezcla final del render; defaults 1.0 (voz) y 0.15 (música).
  voiceVolume?: number
  musicVolume?: number
  // En el contrato por compatibilidad con Library; la UI de Create no lo
  // expone: todo job renderiza hasta el final (decisión 4 de ADR-0013).
  autoRender?: boolean
}

export type VideoProjectState =
  | 'draft'
  | 'generating'
  | 'awaiting-confirmation'
  | 'paused'
  | 'completed'
  | 'error'

// Metadata persistida en project.json. `completedStages` es lo que permite
// retomar: una stage cuyo artefacto es válido se saltea al relanzar.
export interface VideoProjectMetadata {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  state: VideoProjectState
  options: VideoProjectOptions
  completedStages: StageId[]
  audioDurationSeconds?: number
  sceneCount?: number
  wordCount?: number
  // Clave i18n del último fallo (mismo patrón { code } de los jobs).
  errorCode?: string
}

// ─── Contratos de los subcomandos del dominio videos ───

// Un personaje ENTRANTE al crear el proyecto: el modo photo trae la foto
// como data URI; el modo text referencia la biblioteca por characterId.
export interface NewVideoProjectCharacter {
  characterId?: string
  name: string
  description: string
  mode: 'photo' | 'text'
  photoDataUri?: string
  isProtagonist?: boolean
}

export interface CreateVideoProjectPayload {
  name: string
  // Guion; opcional solo con narrationMode 'own-audio'.
  script?: string
  options: VideoProjectOptions
  characters?: NewVideoProjectCharacter[]
}

export interface CreateVideoProjectResult {
  projectId: string
  projectDir: string
}

export interface UploadNarrationPayload {
  projectId: string
  // Ruta absoluta elegida con el dialog nativo; se copia (o transcodifica
  // con ffmpeg) a narration.mp3 dentro del proyecto.
  audioPath: string
}

export interface RunVideoPipelinePayload {
  projectId: string
  // Corta el recorrido tras esta stage (harness de verificación de
  // ADR-0010; Library lo reusará para regenerar por partes).
  untilStage?: StageId
}

export interface RunVideoPipelineResult {
  // 'awaiting-confirmation' = cierre limpio en pausa, NO es un completado:
  // la UI muestra el diálogo y relanza tras confirm-scenes.
  status: 'completed' | 'awaiting-confirmation'
  // Ruta absoluta del mp4 final (solo con status 'completed').
  videoPath?: string
}

export interface ConfirmScenesPayload {
  projectId: string
  sceneCount: number
}

export interface ProbeTtsPayload {
  provider: VoiceProviderId
  voiceId?: string
}

export type ProbeTtsReason =
  'ok' | 'maintenance' | 'auth' | 'rate' | 'config' | 'other'

export interface ProbeTtsResult {
  ok: boolean
  reason: ProbeTtsReason
}

export interface VideoProjectStatusPayload {
  projectId: string
}

export interface VideoProjectStatusResult {
  metadata: VideoProjectMetadata
  scenes: SceneSummary[]
}
