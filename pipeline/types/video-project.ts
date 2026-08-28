import type { CharacterStyleId } from './characters.ts'
import type { ImageProviderId } from './image-provider.ts'
import type { MusicGenerationParams } from './music.ts'
import type { SceneSummary, TranscriptWord } from './scenes.ts'
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
  // Segundos que se saltean del arranque de la música al mezclar (Library).
  bgmOffsetSeconds?: number
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
  // El video renderizado quedó atrás respecto de una edición posterior
  // (escenas, narración o música). Nunca implica borrar el mp4: solo avisa.
  // Lo limpian los jobs que completan un render (ADR-0014).
  videoOutdated?: boolean
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

// ─── Contratos de Library (ADR-0014) ───

// Una tarjeta del listado de la biblioteca. Todo lo derivable del disco se
// deriva al listar (hasVideo, imageCount, thumbnail): la metadata puede
// mentir tras un job interrumpido, el filesystem no.
export interface VideoProjectListItem {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  state: VideoProjectState
  errorCode?: string
  hasVideo: boolean
  videoOutdated: boolean
  imageCount: number
  sceneCount?: number
  // Imagen de la escena de menor id, si existe. mtime como cache-buster:
  // convertFileSrc cachea por URL y la ruta no cambia al regenerar.
  thumbnailPath?: string
  thumbnailMtimeMs?: number
}

export interface ListVideoProjectsResult {
  projects: VideoProjectListItem[]
}

export interface DeleteVideoProjectsPayload {
  projectIds: string[]
}

export interface DeleteVideoProjectsResult {
  deleted: number
}

// Vista de una escena para el editor: el resumen de la UI más los campos
// editables persistidos en scenes.json (el formato congelado no se toca —
// esto es una PROYECCIÓN, vive acá y no en types/scenes.ts).
export interface SceneDetail extends SceneSummary {
  userPrompt?: string
  imageModel?: string
  imageQuality?: string
  charactersPresent?: number[]
  imageMtimeMs?: number
}

export interface VideoProjectDetailPayload {
  projectId: string
}

// El payload completo del editor en una sola lectura (espejo de
// escenas-detalladas del origen). Rutas absolutas derivadas al vuelo, jamás
// persistidas; cada media lleva su mtime como cache-buster.
export interface VideoProjectDetailResult {
  metadata: VideoProjectMetadata
  scenes: SceneDetail[]
  words: TranscriptWord[]
  script: string
  narrationPath?: string
  narrationMtimeMs?: number
  musicPath?: string
  musicMtimeMs?: number
  overlayPath?: string
  videoPath?: string
  videoMtimeMs?: number
}

// Un cambio del editor sobre UNA escena. Solo viajan los campos presentes;
// `userPrompt: ''` limpia el prompt manual (semántica del origen).
export interface SceneChange {
  id: number
  startSeconds?: number
  endSeconds?: number
  userPrompt?: string
  imagePrompt?: string
  imageModel?: string
  imageQuality?: string
  charactersPresent?: number[]
}

export interface UpdateScenesPayload {
  projectId: string
  changes: SceneChange[]
}

export interface UpdateScenesResult {
  applied: number
}

export interface RegenerateSceneImagesPayload {
  projectId: string
  // `rewritePrompt` = borrar el imagePrompt para que scene-prompts lo
  // reescriba (priorizando el userPrompt persistido); false = re-roll de la
  // imagen con el mismo prompt.
  scenes: { id: number; rewritePrompt: boolean }[]
  // Override transitorio del proveedor SOLO para este job; no se persiste.
  imageProvider?: ImageProviderId
}

export interface RegenerateSceneImagesResult {
  regenerated: number[]
  failed: number[]
}

export interface RenderVideoPayload {
  projectId: string
}

export interface RenderVideoResult {
  videoPath: string
}

export interface UpdateAudioMixPayload {
  projectId: string
  voiceVolume?: number
  musicVolume?: number
  bgmOffsetSeconds?: number
}

export type ReplaceNarrationMode = 'upload' | 'resynthesize'

export interface ReplaceNarrationVoice {
  provider: VoiceProviderId
  voiceId: string
  voiceName?: string
  settings?: VoiceGenerationSettings
}

export interface ReplaceNarrationPayload {
  projectId: string
  mode: ReplaceNarrationMode
  // Modo upload: ruta del audio elegido con el dialog nativo.
  audioPath?: string
  // Modo resynthesize: la voz nueva; sin ella se reusa la del proyecto.
  voice?: ReplaceNarrationVoice
}

export type SetProjectMusicSource =
  'youtube' | 'download-url' | 'file' | 'remove'

export interface SetProjectMusicPayload {
  projectId: string
  source: SetProjectMusicSource
  // youtube: URL del video; download-url: URL directa del audio (variación
  // Suno elegida — la generación reusa el subcomando generate-music).
  url?: string
  // file: ruta local elegida con el dialog nativo.
  audioPath?: string
}

export interface ExportClipsPayload {
  projectId: string
}

export interface ExportClipsResult {
  directory: string
  clipCount: number
}

export interface ProviderCreditsStatus {
  available: boolean
  remaining?: number
  currency?: string
  // Con available false: por qué (missing_api_key, fal_admin_key_required…).
  errorCode?: string
}

export interface ImageCreditsResult {
  fal: ProviderCreditsStatus
  evolink: ProviderCreditsStatus
}
