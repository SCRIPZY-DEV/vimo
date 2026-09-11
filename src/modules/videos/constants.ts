import type { LucideIcon } from 'lucide-react'
import {
  RectangleHorizontal,
  RectangleVertical,
  Upload,
  Wand2,
} from 'lucide-react'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type {
  BgmMode,
  CharacterFrequency,
  NarrationMode,
} from '@pipeline/types/video-project.ts'
import {
  NARRATION_CHAR_LIMIT,
  VOICE_SETTINGS_DEFAULTS,
} from '@/modules/voices/constants'
import type { CreateFormValue } from './types/create'
import type {
  AudioMixValue,
  LibraryTab,
  ProjectBadge,
  SceneImageChoice,
} from './types/library'

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
  customStyles: ['videos', 'customStyles'],
  projects: ['videos', 'projects'],
  projectStatus(projectId: string) {
    return ['videos', 'project', projectId]
  },
  projectDetail(projectId: string) {
    return ['videos', 'project', projectId, 'detail']
  },
  imageCredits: ['videos', 'imageCredits'],
  sceneCutPreview(projectId: string, secondsPerScene: number) {
    return ['videos', 'project', projectId, 'sceneCutPreview', secondsPerScene]
  },
} as const

// La tarea sobrevive navegación y reinicios: el proyecto vive en disco.
export const CREATE_TASK_STORAGE_KEY = 'vimo:create:task:v1'

// La pestaña de la biblioteca sobrevive a la navegación: abre en la última
// elegida o en la del último proyecto creado.
export const LIBRARY_TAB_STORAGE_KEY = 'vimo:library:tab:v1'
export const DEFAULT_LIBRARY_TAB: LibraryTab = 'long'

// La alerta de pasos faltantes: el botón de generar la referencia por id.
export const CREATE_BLOCKERS_ID = 'create-blockers'

// Espejo de los límites del sidecar (pipeline/commands/videos).
export const PROJECT_NAME_LIMIT = 80
// El guion no puede superar lo que la voz es capaz de narrar.
export const SCRIPT_CHAR_LIMIT = NARRATION_CHAR_LIMIT
export const MAX_PROJECT_CHARACTERS = 2
export const MAX_SCENE_COUNT = 500

// Carril de segundos-por-escena de los estilos propios. Espejo de
// pipeline/stages/scene-cuts/by-seconds.ts (el slider se mueve entre estos).
// El valor por defecto es una preferencia de Ajustes (useSceneDurationDefaults).
export const SECONDS_PER_SCENE_MIN = 2
export const SECONDS_PER_SCENE_MAX = 15
export const SECONDS_PER_SCENE_DEFAULT = 3
// Atajos del paso de segundos por escena (las píldoras bajo el slider).
export const SECONDS_PER_SCENE_SHORTCUTS = [3, 4, 5, 6, 8, 10]
// El slider dispara muchos valores seguidos y cada corte real es un job del
// sidecar: se espera este rato antes de pedirlo.
export const SCENE_CUT_PREVIEW_DEBOUNCE_MS = 120
// Estimación local del corte por segundos: el resto final cuenta como escena
// si alcanza esta fracción de una ventana (misma regla que el fragmentador).
export const SCENE_REMAINDER_MIN_FRACTION = 0.3

// Últimas líneas de log que la vista conserva (como el origen).
export const LOG_LINES_LIMIT = 50

// El probe de TTS se cachea acá: el sidecar es un proceso por job.
export const PROBE_CACHE_TTL_MS = 2 * 60 * 1000

// Reintento automático ante fallos transitorios (port del origen, adaptado
// de regex-sobre-mensajes a códigos): solo las familias de red, timeout y
// rate-limit de los providers. Un código que no esté acá es un error real.
export const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'voice_network',
  'voice_timeout',
  'voice_rate_limited',
  'transcription_network',
  'transcription_rate_limited',
  'llm_network',
  'llm_timeout',
  'llm_rate_limited',
  'image_network',
  'image_timeout',
  'image_rate_limited',
  'music_network',
  'ytdlp_network',
  'ytdlp_timeout',
])
// Saldo agotado en el proveedor (espejo de pipeline/utils/insufficient-
// credits.ts, ADR-0029): nunca se reintenta solo ni abre el diálogo del
// modelo; el proyecto queda pausado y la persona recarga y reanuda.
export const INSUFFICIENT_CREDITS_CODES: ReadonlySet<string> = new Set([
  'voice_insufficient_credits',
  'voice_quota_exceeded',
  'image_insufficient_credits',
  'llm_insufficient_credits',
  'transcription_insufficient_credits',
  'music_insufficient_credits',
])
// Margen sobre la estimación de costo antes de arrancar: estimar de menos y
// quedarse sin saldo a mitad es peor que pedir un poco más.
export const COST_ESTIMATE_SAFETY_FACTOR = 1.1
// Duración de escena del corte automático (espejo de AUTO_SECONDS_PER_SCENE
// en pipeline/stages/scene-cuts/scene-cuts.ts), para estimar cuántas
// imágenes va a pedir un guion sin cantidad fija.
export const AUTO_SECONDS_PER_SCENE = 3
// Caracteres narrados por segundo (~150 palabras/min): duración aproximada
// del audio que todavía no existe, solo para estimar escenas.
export const SPEECH_CHARS_PER_SECOND = 15
// Tope del rango «~50–200 créditos» de una generación de música (Suno vía
// Evolink); línea informativa, la música de fondo es opcional.
export const BGM_CREDITS_ESTIMATE = 200
// Backoff del origen (v0.11.4): 30 s, 90 s y 3 min entre intentos — el
// pipeline retoma desde checkpoint en cada uno.
export const AUTO_RETRY_DELAYS_SECONDS = [30, 90, 180] as const
export const AUTO_RETRY_MAX_ATTEMPTS = AUTO_RETRY_DELAYS_SECONDS.length

// Cancelar pide confirmación: el segundo clic dentro de esta ventana.
export const CANCEL_CONFIRM_WINDOW_MS = 3500

// Vigilancia del modelo de prompts (ADR-0028, solo carril verbatim): si en
// esta ventana no llega ningún prompt nuevo, el modelo se da por trabado, se
// bloquea una hora y se ofrece cambiarlo.
export const PROMPT_STAGE_STALL_MS = 2 * 60 * 1000
export const PROMPT_STAGE_WATCHDOG_TICK_MS = 1000
// Espejo de PROVIDER_TROUBLE_CODES del redactor verbatim (pipeline): los
// códigos que delatan al modelo. `llm_network` no está a propósito (es la red
// del usuario) ni `llm_auth` (es la clave: el job falla con su mensaje).
// `llm_rescue_needed` es el sintético del rescate.
export const PROVIDER_TROUBLE_CODES: ReadonlySet<string> = new Set([
  'llm_timeout',
  'llm_rate_limited',
  'llm_provider_error',
  'llm_empty_response',
  'llm_rescue_needed',
])
// Tras pedir cancelar, cuánto se espera el cierre del sidecar antes de dar
// la tarea por terminada igual (red de seguridad, no el camino normal).
export const CANCEL_SETTLE_TIMEOUT_MS = 8000

// Nota de apoyo de la pantalla de progreso: en el origen `.font-handwritten`
// se redefine como Outfit al 92 % (pisa la config de Tailwind). Acá se acota
// a esta pantalla para no cambiar la tipografía del resto de la app.
export const SUPPORT_NOTE_CLASS = 'font-display text-[0.92em]'

// Carpeta personal al inicio de una ruta (macOS, Linux y Windows), para
// mostrarla como «~/…» igual que el origen.
export const HOME_DIRECTORY_PREFIX_REGEX =
  /^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:[\\/]Users[\\/][^\\/]+)/

// «Copiado» en el visor de escena: cuánto dura la confirmación.
export const COPIED_FEEDBACK_MS = 1800

// Mezcla de audio del editor: defaults (espejo de final-mix.ts en el sidecar)
// y rangos de los sliders. Los volúmenes son ganancia lineal: 1 = original.
export const AUDIO_MIX_DEFAULTS: AudioMixValue = {
  voiceVolume: 1,
  musicVolume: 0.15,
  bgmOffsetSeconds: 0,
}
export const VOLUME_SLIDER_MAX = 2
export const VOLUME_SLIDER_STEP = 0.05
export const BGM_OFFSET_MAX_SECONDS = 120

// Velocidades del reproductor de la biblioteca (port del origen).
export const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

// Espejo del cap del sidecar (update-scenes.ts): 2500, como en la web de
// origen. Si cambia acá tiene que cambiar allá, o el sidecar rechaza el texto.
export const MAX_USER_PROMPT_CHARS = 2500

// Badges con un job en curso o a medias: desde la biblioteca navegan a Progress.
export const PROGRESS_BADGES: ReadonlySet<ProjectBadge> = new Set([
  'generating',
  'awaitingConfirmation',
  'interrupted',
  'paused',
  'noCredits',
])

// ── Timeline del editor (valores portados 1:1 del TimelineEditor del origen) ──

// Duración mínima de una escena al arrastrar fronteras (piso duro del drag).
export const MIN_SCENE_SECONDS = 1

// Tiempo tipeado en los In/Out del panel de escena: «mm:ss.cc» como muestra
// `formatClipTime`, y también «m:ss», «ss.c» o «ss». Grupos: minutos
// (opcional), segundos, fracción (opcional, coma o punto).
export const CLIP_TIME_INPUT_REGEX =
  /^(?:(\d{1,3}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/

// Segundos que saltan J/L en el preview del editor.
export const EDITOR_SEEK_STEP_SECONDS = 5

// Un frame a 30fps: el paso de las flechas ←/→ (con Shift, 1 segundo).
export const FRAME_SECONDS = 1 / 30

// Niveles discretos de zoom en px por segundo; default = índice 3 (60 px/s).
export const TIMELINE_ZOOM_LEVELS = [20, 30, 45, 60, 90, 120, 180, 240] as const
export const DEFAULT_TIMELINE_ZOOM_INDEX = 3

export const TIMELINE_RULER_HEIGHT = 32
export const TIMELINE_TRACK_HEIGHT = 48
export const TIMELINE_SIDEBAR_WIDTH = 112

// Candidatos de step mayor de la regla: el primero cuyo ancho en px sea >= 50.
export const RULER_MAJOR_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300] as const

// Autoscroll que sigue al playhead: margen de borde y pausa tras interacción
// manual del usuario (scroll/drag) para no pelearle el control.
export const AUTOSCROLL_EDGE_PX = 80
export const AUTOSCROLL_MANUAL_PAUSE_MS = 2500

// Autoscroll por arrastre del playhead contra el borde del viewport:
// franja sensible y velocidad lineal (px por frame de rAF).
export const PLAYHEAD_EDGE_DRAG_PX = 56
export const PLAYHEAD_EDGE_DRAG_MIN_SPEED = 3
export const PLAYHEAD_EDGE_DRAG_MAX_SPEED = 22

// Elementos del timeline cuyo click no debe mover el playhead. El padre lo
// consulta con NO_SEEK_SELECTOR; los hijos lo declaran con NO_SEEK_PROPS.
export const NO_SEEK_PROPS = { 'data-noseek': 'true' } as const
export const NO_SEEK_SELECTOR = '[data-noseek="true"]'

// Forma de onda: margen vertical total (arriba + abajo) que las barras no
// ocupan, y altura mínima de barra para que los silencios no corten la línea.
export const WAVEFORM_VERTICAL_PADDING = 4
export const WAVEFORM_MIN_BAR_HEIGHT = 1

// Preview: un timeupdate más viejo que el último seek por más de esto se
// descarta (tick tardío del media, no un avance real).
export const SEEK_TOLERANCE_SECONDS = 0.5
// Timeline: un click a menos de esto del final lleva exactamente al cierre.
export const TIMELINE_END_SNAP_SECONDS = 0.5

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
    Icon: Wand2,
  },
  {
    id: 'own-audio',
    labelKey: 'create.narration.modeUpload',
    hintKey: 'create.narration.modeUploadHint',
    Icon: Upload,
  },
]

// Origen de la música de fondo: generada con IA o extraída de un YouTube.
export const BGM_MODES: { id: BgmMode; labelKey: string }[] = [
  { id: 'evolink-ai', labelKey: 'create.music.modeAi' },
  { id: 'youtube', labelKey: 'create.music.modeYoutube' },
]

// Estilos visuales del video (mismo dataset que el preview de personajes).
export const VIDEO_STYLES: {
  id: CharacterStyleId
  labelKey: string
  descriptionKey: string
}[] = [
  {
    id: 'normal',
    labelKey: 'create.styles.normal',
    descriptionKey: 'create.styles.normalDesc',
  },
  {
    id: 'pov_stickman',
    labelKey: 'create.styles.stickman',
    descriptionKey: 'create.styles.stickmanDesc',
  },
  {
    id: 'cartoon',
    labelKey: 'create.styles.cartoon',
    descriptionKey: 'create.styles.cartoonDesc',
  },
  {
    id: 'fantasia',
    labelKey: 'create.styles.fantasy',
    descriptionKey: 'create.styles.fantasyDesc',
  },
  {
    id: 'terror',
    labelKey: 'create.styles.terror',
    descriptionKey: 'create.styles.terrorDesc',
  },
]

// Muestras de referencia por estilo empaquetadas en public/style-references/
// (generadas offline en el repo origen; 4 JPGs por estilo, <id>_1..4.jpg).
export const STYLE_REFERENCE_SAMPLE_COUNT = 4
export const STYLE_REFERENCES_BASE_PATH = '/style-references'

// Rotación del carrusel de muestras al hacer hover en una tarjeta de estilo.
export const SAMPLE_CAROUSEL_INTERVAL_MS = 1200

// Carrusel arrastrable del modal del estilo (port de CarruselMuestras del
// origen). Cuánto hay que arrastrar para pasar de muestra, como fracción del
// ancho: en px sería injusto, la misma distancia es «mucho» en una ventana
// chica y «nada» en un monitor grande. Cuánto «pesa» arrastrar más allá de la
// primera o la última. Y la transición con la que la tira se acomoda al
// soltar (durante el arrastre no hay transición: sería llegar tarde a
// propósito).
export const SAMPLE_SWIPE_FRACTION = 0.18
export const SAMPLE_SWIPE_EDGE_RESISTANCE = 0.3
export const SAMPLE_SWIPE_SETTLE_TRANSITION =
  'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)'

// ── Estilos propios («Mi estilo») ──

// Cuántas muestras genera el sidecar por estilo (las 4 situaciones fijas).
export const CUSTOM_STYLE_SAMPLE_COUNT = 4

// Espejo de los límites del sidecar (pipeline/commands/styles/style-store.ts).
export const CUSTOM_STYLE_NAME_LIMIT = 80
export const CUSTOM_STYLE_PROMPT_LIMIT = 30_000
export const CUSTOM_STYLE_MAX_SHOTS = 20

// Planos recomendados que llena el botón del modal (verbatim del origen).
export const RECOMMENDED_SHOTS = [
  'Wide shot',
  'Medium shot',
  'Close-up',
  'Over-the-shoulder shot',
  'Low angle shot',
  'High angle shot',
  'Point-of-view shot',
  'Two shot',
] as const

// Ids `st-<timestamp36>-<rand>`: cronológicos y dentro del STYLE_ID_PATTERN
// del sidecar (≤ 40 chars, minúsculas).
export function newCustomStyleId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `st-${Date.now().toString(36)}-${random}`
}

// Formato del video: horizontal clásico o vertical para shorts.
export const DEFAULT_VIDEO_FORMAT: VideoFormat = '16:9'

export const VIDEO_FORMATS: {
  id: VideoFormat
  titleKey: string
  detailKey: string
  Icon: LucideIcon
}[] = [
  {
    id: '16:9',
    titleKey: 'create.format.longTitle',
    detailKey: 'create.format.longDetail',
    Icon: RectangleHorizontal,
  },
  {
    id: '9:16',
    titleKey: 'create.format.shortTitle',
    detailKey: 'create.format.shortDetail',
    Icon: RectangleVertical,
  },
]

// Proveedores de imagen; las etiquetas son marcas, no se traducen.
export const IMAGE_PROVIDERS: { id: ImageProviderId; label: string }[] = [
  { id: 'evolink', label: 'Evolink' },
  { id: 'fal', label: 'Fal' },
]

// Opciones de calidad por proveedor (ambos generan con gpt-image-2, ADR-0015).
// Evolink solo expone 16:9 1K, así que de la opción solo importa la calidad;
// en Fal el id lleva el tamaño exacto (convención `<W>x<H>_<quality>` del
// catálogo del origen). La etiqueta visible no nombra la resolución sino el
// formato del video y el nivel («16:9 · Low», «9:16 · High»): `labelKey` es
// una clave por nivel y quien la traduce interpola el `format` vigente (el
// elegido en el formulario, o el del proyecto en el editor).
// Los precios (USD por imagen) vienen del catálogo del origen
// (src/core/costos.ts); si cambian, actualizar también el catálogo
// informativo de modules/costs/catalog.ts (ADR-0008). Evolink cobra en
// créditos propios: `credits` por imagen es lo que se compara con su saldo.
export const EVOLINK_QUALITY_OPTIONS: {
  id: string
  labelKey: string
  noteKey: string
  priceUsd: number
  credits: number
}[] = [
  {
    id: '1024x576_low',
    labelKey: 'create.quality.low',
    noteKey: 'create.quality.evolinkLowNote',
    priceUsd: 0.0036,
    credits: 0.24,
  },
  {
    id: '1024x576_medium',
    labelKey: 'create.quality.medium',
    noteKey: 'create.quality.evolinkMediumNote',
    priceUsd: 0.0273,
    credits: 1.85,
  },
  {
    id: '1024x576_high',
    labelKey: 'create.quality.high',
    noteKey: 'create.quality.evolinkHighNote',
    priceUsd: 0.1072,
    credits: 7.29,
  },
]

export const FAL_QUALITY_OPTIONS: {
  id: string
  labelKey: string
  noteKey: string
  priceUsd: number
}[] = [
  {
    id: '1920x1080_low',
    labelKey: 'create.quality.low',
    noteKey: 'create.quality.falNote',
    priceUsd: 0.005,
  },
  {
    id: '1920x1080_medium',
    labelKey: 'create.quality.medium',
    noteKey: 'create.quality.falNote',
    priceUsd: 0.04,
  },
  {
    id: '1920x1080_high',
    labelKey: 'create.quality.high',
    noteKey: 'create.quality.falNote',
    priceUsd: 0.158,
  },
]

// Variante 9:16 de Fal (OpenAI cobra portrait y landscape igual por tier).
// Evolink no necesita lista propia: es agnóstico al formato (manda `size`).
export const FAL_QUALITY_OPTIONS_VERTICAL: {
  id: string
  labelKey: string
  noteKey: string
  priceUsd: number
}[] = [
  {
    id: '1080x1920_low',
    labelKey: 'create.quality.low',
    noteKey: 'create.quality.falVerticalNote',
    priceUsd: 0.005,
  },
  {
    id: '1080x1920_medium',
    labelKey: 'create.quality.medium',
    noteKey: 'create.quality.falVerticalNote',
    priceUsd: 0.04,
  },
  {
    id: '1080x1920_high',
    labelKey: 'create.quality.high',
    noteKey: 'create.quality.falVerticalNote',
    priceUsd: 0.158,
  },
]

// El proveedor tarda unos segundos en reflejar el gasto: el refetch de saldos
// tras una generación se difiere (mismo criterio que el origen).
export const CREDITS_REFRESH_DELAY_MS = 4000

// Códigos del saldo (get-image-credits) que para la persona significan una
// sola cosa: falta configurar la clave — no hay clave, o el proveedor la
// rechazó (Fal responde 401/403 también cuando la clave no es de admin;
// Evolink, cuando es inválida). Cualquier otro código es un error de red o
// del proveedor y se muestra como tal.
export const NOT_CONFIGURED_CREDITS_CODES: ReadonlySet<string> = new Set([
  'missing_api_key',
  'fal_admin_key_required',
  'music_invalid_api_key',
])

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
  // Create lo siembra con la preferencia de Ajustes.
  promptModel: null,
  sceneCount: 0,
  // Create lo siembra con la preferencia de Ajustes.
  secondsPerScene: SECONDS_PER_SCENE_DEFAULT,
  imageProvider: 'evolink',
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
  // Create siembra las dos con la preferencia de Ajustes; la segunda no tiene
  // casilla (ver CreateFormValue).
  confirmScenes: true,
  confirmSceneDuration: true,
  subtitles: false,
  autoRender: false,
  videoFormat: DEFAULT_VIDEO_FORMAT,
  styleSource: 'catalog',
  customStyle: null,
}

// Con qué se regenera una escena que no trae calidad propia: los mismos
// defaults del formulario de creación.
export const DEFAULT_IMAGE_CHOICE: SceneImageChoice = {
  provider: CREATE_FORM_INITIAL_VALUE.imageProvider,
  quality: CREATE_FORM_INITIAL_VALUE.imageQuality,
}

// Código de error del sidecar/Rust → clave i18n del mensaje.
export const CREATE_ERROR_MESSAGE_KEYS: Record<string, string> = {
  // Proyecto y entradas
  invalid_payload: 'create.errors.invalidPayload',
  project_not_found: 'create.errors.projectNotFound',
  project_metadata_corrupt: 'create.errors.projectCorrupt',
  project_exists: 'create.errors.projectExists',
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
  voice_quota_exceeded: 'create.errors.voiceQuotaExceeded',
  voice_insufficient_credits: 'create.errors.voiceInsufficientCredits',
  voice_account_restricted: 'create.errors.voiceAccountRestricted',
  voice_library_add_failed: 'create.errors.voiceLibraryAddFailed',
  // Música y overlay
  music_generation_failed: 'create.errors.musicGenerationFailed',
  music_download_failed: 'create.errors.musicDownloadFailed',
  music_insufficient_credits: 'create.errors.musicInsufficientCredits',
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
  transcription_insufficient_credits:
    'create.errors.transcriptionInsufficientCredits',
  transcription_empty: 'create.errors.transcriptionEmpty',
  words_missing: 'create.errors.wordsMissing',
  scenes_missing: 'create.errors.scenesMissing',
  // LLM
  llm_network: 'create.errors.llmNetwork',
  llm_timeout: 'create.errors.llmTimeout',
  llm_rate_limited: 'create.errors.llmRateLimited',
  llm_provider_error: 'create.errors.llmProviderError',
  llm_empty_response: 'create.errors.llmProviderError',
  llm_rescue_needed: 'create.errors.llmRescueNeeded',
  llm_auth: 'create.errors.llmAuth',
  llm_insufficient_credits: 'create.errors.llmInsufficientCredits',
  // Imágenes
  image_network: 'create.errors.imageNetwork',
  image_invalid_api_key: 'create.errors.imageInvalidApiKey',
  image_provider_error: 'create.errors.imageProviderError',
  image_task_not_found: 'create.errors.imageProviderError',
  image_content_policy: 'create.errors.imageContentPolicy',
  image_timeout: 'create.errors.imageTimeout',
  image_download_failed: 'create.errors.imageDownloadFailed',
  image_rate_limited: 'create.errors.imageRateLimited',
  image_insufficient_credits: 'create.errors.imageInsufficientCredits',
  image_missing_prompt: 'create.errors.imageMissingPrompt',
  image_attempts_exhausted: 'create.errors.imageProviderError',
  images_incomplete: 'create.errors.imagesIncomplete',
  // Render
  render_missing_images: 'create.errors.renderMissingImages',
  render_stalled: 'create.errors.renderStalled',
  // Transversales
  missing_api_key: 'create.errors.missingApiKey',
  missing_projects_root: 'create.errors.missingProjectsRoot',
  // Estilos propios
  style_not_found: 'create.errors.styleNotFound',
  style_save_failed: 'create.errors.styleSaveFailed',
  style_samples_failed: 'create.errors.styleSamplesFailed',
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
