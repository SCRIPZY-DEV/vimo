import type { LucideIcon } from 'lucide-react'
import { FileAudio, Mic } from 'lucide-react'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type {
  FalImageModelId,
  ImageProviderId,
} from '@pipeline/types/image-provider.ts'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type {
  BgmMode,
  CharacterFrequency,
  NarrationMode,
} from '@pipeline/types/video-project.ts'
import { VOICE_SETTINGS_DEFAULTS } from '@/modules/voices/constants'
import type { CreateFormValue } from './types/create'

export const VideosRoutes = {
  create: '/create',
  library: '/library',
  libraryPlayer: '/library/:projectId',
  libraryProgress: '/library/:projectId/progress',
  libraryEditor: '/library/:projectId/edit',
} as const

// Rutas con :projectId resuelto (para <Link>/navigate).
export function libraryPlayerPath(projectId: string): string {
  return `/library/${projectId}`
}

export function libraryProgressPath(projectId: string): string {
  return `/library/${projectId}/progress`
}

export function libraryEditorPath(projectId: string): string {
  return `/library/${projectId}/edit`
}

export const videosQueryKeys = {
  characters: ['videos', 'characters'],
  projects: ['videos', 'projects'],
  projectStatus(projectId: string) {
    return ['videos', 'project', projectId]
  },
  projectDetail(projectId: string) {
    return ['videos', 'project', projectId, 'detail']
  },
  imageCredits: ['videos', 'imageCredits'],
} as const

// La tarea sobrevive navegación y reinicios: el proyecto vive en disco.
export const CREATE_TASK_STORAGE_KEY = 'vimo:create:task:v1'

// Espejo de los límites del sidecar (pipeline/commands/videos).
export const PROJECT_NAME_LIMIT = 80
export const SCRIPT_CHAR_LIMIT = 100_000
export const MAX_PROJECT_CHARACTERS = 2
export const MAX_SCENE_COUNT = 500

// Últimas líneas de log que la vista conserva (como el origen).
export const LOG_LINES_LIMIT = 50

// El probe de TTS se cachea acá: el sidecar es un proceso por job.
export const PROBE_CACHE_TTL_MS = 2 * 60 * 1000

// Cancelar pide confirmación: el segundo clic dentro de esta ventana.
export const CANCEL_CONFIRM_WINDOW_MS = 3500

// Curva sintética del progreso de voz cuando el proveedor no informa avance
// real (Minimax y Edge no lo exponen): 90·(1−e^(−t/22)) — port del origen.
export const VOICE_CURVE_CEILING = 90
export const VOICE_CURVE_TIME_CONSTANT = 22

// Fases del pipeline, en orden, con su etiqueta i18n.
export const PIPELINE_STAGES: { id: StageId; labelKey: string }[] = [
  { id: 'voice', labelKey: 'create.stages.voice' },
  { id: 'transcription', labelKey: 'create.stages.transcription' },
  { id: 'scene-cuts', labelKey: 'create.stages.sceneCuts' },
  { id: 'scene-prompts', labelKey: 'create.stages.scenePrompts' },
  { id: 'images', labelKey: 'create.stages.images' },
  { id: 'render', labelKey: 'create.stages.render' },
]

// Origen de la narración: leída por IA o subida por la persona.
export const NARRATION_MODES: {
  id: NarrationMode
  labelKey: string
  hintKey: string
  Icon: LucideIcon
}[] = [
  {
    id: 'tts',
    labelKey: 'create.narration.modeAi',
    hintKey: 'create.narration.modeAiHint',
    Icon: Mic,
  },
  {
    id: 'own-audio',
    labelKey: 'create.narration.modeUpload',
    hintKey: 'create.narration.modeUploadHint',
    Icon: FileAudio,
  },
]

// Origen de la música de fondo: generada con IA o extraída de un YouTube.
export const BGM_MODES: { id: BgmMode; labelKey: string }[] = [
  { id: 'evolink-ai', labelKey: 'create.music.modeAi' },
  { id: 'youtube', labelKey: 'create.music.modeYoutube' },
]

// Estilos visuales del video (mismo dataset que el preview de personajes).
export const VIDEO_STYLES: { id: CharacterStyleId; labelKey: string }[] = [
  { id: 'normal', labelKey: 'create.styles.normal' },
  { id: 'pov_stickman', labelKey: 'create.styles.stickman' },
  { id: 'cartoon', labelKey: 'create.styles.cartoon' },
  { id: 'fantasia', labelKey: 'create.styles.fantasy' },
  { id: 'terror', labelKey: 'create.styles.terror' },
]

// Proveedores de imagen; las etiquetas son marcas, no se traducen.
export const IMAGE_PROVIDERS: { id: ImageProviderId; label: string }[] = [
  { id: 'evolink', label: 'Evolink' },
  { id: 'fal', label: 'Fal' },
]

export const FAL_IMAGE_MODELS: { id: FalImageModelId; label: string }[] = [
  { id: 'gpt-image-2', label: 'GPT-Image 2' },
  { id: 'flux-schnell', label: 'Flux Schnell' },
]

// Opciones de calidad por proveedor. Evolink solo expone gpt-image-2 a 16:9
// 1K, así que de la opción solo importa la calidad; en Fal el id lleva el
// tamaño exacto (convención `<W>x<H>_<quality>` del catálogo del origen).
export const EVOLINK_QUALITY_OPTIONS: { id: string; labelKey: string }[] = [
  { id: '1024x576_low', labelKey: 'create.quality.low' },
  { id: '1024x576_medium', labelKey: 'create.quality.medium' },
  { id: '1024x576_high', labelKey: 'create.quality.high' },
]

export const FAL_GPT_IMAGE_QUALITY_OPTIONS: { id: string; labelKey: string }[] =
  [
    { id: '1920x1080_low', labelKey: 'create.quality.low' },
    { id: '1920x1080_medium', labelKey: 'create.quality.medium' },
    { id: '1920x1080_high', labelKey: 'create.quality.high' },
  ]

// flux-schnell no tiene niveles: su "opción" es el preset de tamaño.
export const FLUX_SIZE_OPTION = 'landscape_16_9'

// Personajes con referencia visual: Evolink siempre los soporta; en Fal solo
// los modelos gpt-image-* (flux-schnell no admite imagen de referencia).
export function modelSupportsCharacters(
  provider: ImageProviderId,
  falModel: FalImageModelId,
): boolean {
  if (provider === 'evolink') return true
  return falModel.startsWith('gpt-image')
}

// Frecuencias de aparición del personaje, de menor a mayor.
export const CHARACTER_FREQUENCIES: {
  id: CharacterFrequency
  labelKey: string
}[] = [
  { id: 'rarely', labelKey: 'create.characters.frequency.rarely' },
  { id: 'balanced', labelKey: 'create.characters.frequency.balanced' },
  { id: 'often', labelKey: 'create.characters.frequency.often' },
  { id: 'almost-always', labelKey: 'create.characters.frequency.almostAlways' },
  { id: 'always', labelKey: 'create.characters.frequency.always' },
]

// Extensiones de audio que acepta el modo "subir mi narración".
export const NARRATION_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac']

export const CREATE_FORM_INITIAL_VALUE: CreateFormValue = {
  name: '',
  narrationMode: 'tts',
  script: '',
  narrationFilePath: null,
  styleId: 'normal',
  sceneCount: 0,
  imageProvider: 'evolink',
  falModel: 'gpt-image-2',
  imageQuality: '1024x576_low',
  voice: null,
  voiceSettings: VOICE_SETTINGS_DEFAULTS,
  characters: [],
  characterFrequency: 'balanced',
  useBgm: false,
  bgmMode: 'evolink-ai',
  bgmUrl: '',
  bgmPrompt: '',
  bgmInstrumental: true,
  useOverlay: false,
  overlayUrl: '',
  confirmScenes: true,
}

// Código de error del sidecar/Rust → clave i18n del mensaje.
export const CREATE_ERROR_MESSAGE_KEYS: Record<string, string> = {
  // Proyecto y entradas
  invalid_payload: 'create.errors.invalidPayload',
  project_not_found: 'create.errors.projectNotFound',
  project_metadata_corrupt: 'create.errors.projectCorrupt',
  project_exists: 'create.errors.projectExists',
  character_preview_missing: 'create.errors.characterPreviewMissing',
  script_missing: 'create.errors.scriptMissing',
  narration_missing: 'create.errors.narrationMissing',
  narration_source_missing: 'create.errors.narrationSourceMissing',
  narration_unsupported_format: 'create.errors.narrationUnsupportedFormat',
  // Binarios empaquetados
  ffmpeg_missing: 'create.errors.ffmpegMissing',
  ffmpeg_failed: 'create.errors.ffmpegFailed',
  ytdlp_missing: 'create.errors.ytdlpMissing',
  // Voz
  voice_not_configured: 'create.errors.voiceNotConfigured',
  voice_all_lanes_failed: 'create.errors.voiceAllLanesFailed',
  voice_chunking_inconsistent: 'create.errors.voiceChunking',
  voice_network: 'create.errors.voiceNetwork',
  voice_invalid_api_key: 'create.errors.voiceInvalidApiKey',
  voice_rate_limited: 'create.errors.voiceRateLimited',
  voice_maintenance: 'create.errors.voiceMaintenance',
  voice_provider_error: 'create.errors.voiceProviderError',
  voice_generation_failed: 'create.errors.voiceProviderError',
  voice_timeout: 'create.errors.voiceTimeout',
  voice_download_failed: 'create.errors.voiceDownloadFailed',
  voice_empty_audio: 'create.errors.voiceEmptyAudio',
  // Música y overlay
  music_generation_failed: 'create.errors.musicGenerationFailed',
  music_download_failed: 'create.errors.musicDownloadFailed',
  ytdlp_invalid_url: 'create.errors.ytdlpInvalidUrl',
  ytdlp_needs_login: 'create.errors.ytdlpNeedsLogin',
  ytdlp_geo_restricted: 'create.errors.ytdlpGeoRestricted',
  ytdlp_private_video: 'create.errors.ytdlpPrivateVideo',
  ytdlp_video_unavailable: 'create.errors.ytdlpVideoUnavailable',
  ytdlp_age_restricted: 'create.errors.ytdlpAgeRestricted',
  ytdlp_members_only: 'create.errors.ytdlpMembersOnly',
  ytdlp_copyright_removed: 'create.errors.ytdlpCopyright',
  ytdlp_network: 'create.errors.ytdlpNetwork',
  ytdlp_timeout: 'create.errors.ytdlpTimeout',
  ytdlp_unsupported_url: 'create.errors.ytdlpUnsupportedUrl',
  ytdlp_failed: 'create.errors.ytdlpFailed',
  // Transcripción
  transcription_invalid_api_key: 'create.errors.transcriptionInvalidApiKey',
  transcription_rate_limited: 'create.errors.transcriptionRateLimited',
  transcription_network: 'create.errors.transcriptionNetwork',
  transcription_failed: 'create.errors.transcriptionFailed',
  transcription_empty: 'create.errors.transcriptionEmpty',
  words_missing: 'create.errors.wordsMissing',
  scenes_missing: 'create.errors.scenesMissing',
  // LLM
  llm_network: 'create.errors.llmNetwork',
  llm_timeout: 'create.errors.llmTimeout',
  llm_rate_limited: 'create.errors.llmRateLimited',
  llm_provider_error: 'create.errors.llmProviderError',
  llm_empty_response: 'create.errors.llmProviderError',
  // Imágenes
  image_network: 'create.errors.imageNetwork',
  image_invalid_api_key: 'create.errors.imageInvalidApiKey',
  image_provider_error: 'create.errors.imageProviderError',
  image_task_not_found: 'create.errors.imageProviderError',
  image_content_policy: 'create.errors.imageContentPolicy',
  image_timeout: 'create.errors.imageTimeout',
  image_download_failed: 'create.errors.imageDownloadFailed',
  image_rate_limited: 'create.errors.imageRateLimited',
  image_missing_prompt: 'create.errors.imageMissingPrompt',
  image_attempts_exhausted: 'create.errors.imageProviderError',
  images_incomplete: 'create.errors.imagesIncomplete',
  // Render
  render_missing_images: 'create.errors.renderMissingImages',
  render_stalled: 'create.errors.renderStalled',
  // Transversales
  missing_api_key: 'create.errors.missingApiKey',
  missing_projects_root: 'create.errors.missingProjectsRoot',
  cancelled: 'create.errors.cancelled',
  sidecar_missing: 'create.errors.sidecar',
  sidecar_spawn: 'create.errors.sidecar',
  sidecar_write: 'create.errors.sidecar',
}

export const UNKNOWN_CREATE_ERROR_KEY = 'create.errors.unknown'
export const INTERRUPTED_ERROR_KEY = 'create.errors.interrupted'

// Mapa de errores de todo el módulo (videosApi.errorMessageKey): los de
// Create más los propios del editor.
export const LIBRARY_ERROR_MESSAGE_KEYS: Record<string, string> = {
  ...CREATE_ERROR_MESSAGE_KEYS,
  invalid_audio_url: 'library.errors.invalidAudioUrl',
  audio_too_large: 'library.errors.audioTooLarge',
  clips_no_scenes: 'library.errors.clipsNoScenes',
  clips_no_images: 'library.errors.clipsNoImages',
  fal_admin_key_required: 'library.errors.falAdminKeyRequired',
  music_invalid_api_key: 'create.errors.missingApiKey',
  music_network: 'create.errors.musicGenerationFailed',
}
