import type { LucideIcon } from 'lucide-react'
import {
  Clapperboard,
  Film,
  Mic,
  Music2,
  RectangleHorizontal,
  RectangleVertical,
  Upload,
  UserRound,
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
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'
import type { GemSectionKey } from '@pipeline/types/styles.ts'
import type { ScenePromptFailureSource } from '@pipeline/types/scenes.ts'
import {
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_DEFAULT_APPEARANCES,
} from '@pipeline/types/avatar.ts'
import {
  NARRATION_CHAR_LIMIT,
  VOICE_SETTINGS_DEFAULTS,
} from '@/modules/voices/constants'
import type {
  AvatarRenderPhase,
  AvatarUsability,
  CreateFormValue,
  SelectedCharacter,
  StageToneClasses,
} from './types/create'
import type {
  AudioMixValue,
  LibraryTab,
  ProjectBadge,
  SceneImageChoice,
  TimelineBlockKind,
  TimelineLayout,
  TimelineTrackId,
  TimelineTrackKind,
} from './types/library'

export const VideosRoutes = {
  create: '/create',
  createDemo: '/create-demo',
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
  catalogStyles: ['videos', 'catalogStyles'],
  // Catálogo remoto (ADR-0049): la sincronización de la pestaña y la lista
  // del admin.
  catalogSync: ['videos', 'catalogSync'],
  catalogAdmin: ['videos', 'catalogAdmin'],
  characters: ['videos', 'characters'],
  customStyles: ['videos', 'customStyles'],
  demoStatus: ['videos', 'demoStatus'],
  projects: ['videos', 'projects'],
  projectStatus(projectId: string) {
    return ['videos', 'project', projectId]
  },
  projectDetail(projectId: string) {
    return ['videos', 'project', projectId, 'detail']
  },
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
export const SECONDS_PER_SCENE_MIN = 3
export const SECONDS_PER_SCENE_MAX = 12
export const SECONDS_PER_SCENE_DEFAULT = 3
// Atajos del paso de segundos por escena (las píldoras bajo el slider).
export const SECONDS_PER_SCENE_SHORTCUTS = [3, 4, 5, 6, 8, 10, 12]
export const ANIMATION_MINUTES_MIN = 1
export const ANIMATION_MINUTES_DEFAULT = 1
export const ANIMATION_DIALOG_MARGIN_PX = 16
export const ANIMATION_DIALOG_KEY_STEP_PX = 16
export const SECONDS_PER_MINUTE = 60
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
  'voice_request_pending',
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
// credits.ts, ADR-0031): nunca se reintenta solo ni abre el diálogo del
// modelo; el proyecto queda pausado y la persona recarga y reanuda.
export const INSUFFICIENT_CREDITS_CODES: ReadonlySet<string> = new Set([
  'voice_insufficient_credits',
  'voice_quota_exceeded',
  'image_insufficient_credits',
  'llm_insufficient_credits',
  'transcription_insufficient_credits',
  'music_insufficient_credits',
  'animation_insufficient_credits',
  'avatar_insufficient_credits',
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
// del usuario) ni `llm_auth` (es la clave: el job falla con su mensaje), ni
// `llm_prompt_language` (es la gema: pide otro idioma, ver STYLE_GEM_ERROR_CODES).
// `llm_rescue_needed` es el sintético del rescate.
export const PROVIDER_TROUBLE_CODES: ReadonlySet<string> = new Set([
  'llm_timeout',
  'llm_rate_limited',
  'llm_provider_error',
  'llm_empty_response',
  'llm_rescue_needed',
])
// Fallos que dejan el proyecto rescatable desde el editor: los prompts y las
// imágenes que sí salieron están en disco, así que la tarjeta ofrece
// «Continuar en el editor» además de reanudar. `render_missing_images` cae en
// `render`, no en `images`: por eso no alcanza con mirar la fase caída.
export const EDITOR_RESCUE_ERROR_CODES: ReadonlySet<string> = new Set([
  'images_incomplete',
  'render_missing_images',
])
// Rechazos definitivos de HeyGen para una aparición (spec §14): con el mismo
// look y la misma narración, pedirla de nuevo falla igual. Si dominan en un
// `avatar_incomplete`, la cabecera del fallo dice la salida (el editor, o
// cambiar el look) en vez de «Reanudá». De estos, la fase no vuelve a pedir
// sola la moderación ni el look no soportado (`isFinalRejection`,
// pipeline/avatar/lane.ts); `avatar_invalid_request` sí se vuelve a pedir en
// cada reanudación.
export const AVATAR_DEFINITIVE_REJECTION_CODES: ReadonlySet<string> = new Set([
  'avatar_moderation_rejected',
  'avatar_look_unsupported',
  'avatar_invalid_request',
])
// Por qué una escena de Catálogo quedó sin prompt (rescate por el editor):
// quién falló, el redactor, el revisor narrativo o los modelos de texto.
export const PROMPT_FAILURE_REASON_KEYS: Record<
  ScenePromptFailureSource,
  string
> = {
  writer: 'library.editor.panel.promptFailureWriter',
  reviewer: 'library.editor.panel.promptFailureReviewer',
  models: 'library.editor.panel.promptFailureModels',
}
// Fallos cuya culpa es la GEMA del estilo, no el modelo (espejo de
// LLM_PROMPT_LANGUAGE del redactor verbatim): el estilo pide los prompts en
// otro idioma y los prompts de imagen salen siempre en inglés. No bloquean al
// modelo una hora ni ofrecen cambiarlo — cambiar de modelo repite el fallo —;
// el remedio es editar la gema.
export const STYLE_GEM_ERROR_CODES: ReadonlySet<string> = new Set([
  'llm_prompt_language',
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
export const TIMELINE_SIDEBAR_WIDTH = 160

// Pistas del timeline y su estado de interfaz por proyecto (ADR-0056).
export const TIMELINE_TRACK_IDS: readonly TimelineTrackId[] = [
  'scenes',
  'narration',
  'music',
]
export const TIMELINE_TRACK_KINDS: Record<TimelineTrackId, TimelineTrackKind> =
  {
    scenes: 'visual',
    narration: 'audio',
    music: 'audio',
  }
export const TIMELINE_TRACK_ICONS: Record<TimelineTrackId, LucideIcon> = {
  scenes: Film,
  narration: Mic,
  music: Music2,
}
export const TIMELINE_TRACK_LABEL_KEYS: Record<TimelineTrackId, string> = {
  scenes: 'library.editor.timeline.scenes',
  narration: 'library.editor.timeline.narration',
  music: 'library.editor.timeline.music',
}
export const DEFAULT_TIMELINE_LAYOUT: TimelineLayout = {
  order: ['scenes', 'narration', 'music'],
  muted: { scenes: false, narration: false, music: false },
  locked: { scenes: false, narration: false, music: false },
}
// Una entrada por proyecto: `vimo:editor:timeline:v1:<projectId>`.
export const TIMELINE_LAYOUT_STORAGE_KEY_PREFIX = 'vimo:editor:timeline:v1:'
// Reordenar pistas con el puntero: px que hay que mover el asa antes de que
// arranque el arrastre, así un clic sin movimiento no se toma como arrastre.
export const TIMELINE_TRACK_DRAG_ACTIVATION_PX = 4

// Candidatos de step mayor de la regla: el primero cuyo ancho en px sea >= 50.
export const RULER_MAJOR_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300] as const

// Autoscroll que sigue al playhead: margen de borde y pausa tras interacción
// manual del usuario (scroll/drag) para no pelearle el control.
export const AUTOSCROLL_EDGE_PX = 80
export const AUTOSCROLL_MANUAL_PAUSE_MS = 2500

// Rueda en modo «líneas» (DOM_DELTA_LINE): píxeles por línea para pasarla a
// desplazamiento horizontal del timeline.
export const WHEEL_LINE_PX = 16

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
// Preview: el clip de animación se re-sincroniza con la narración solo si se
// desvía más que esto mientras suena (un seek por tick lo trabaría).
export const CLIP_PREVIEW_DRIFT_SECONDS = 0.3

// Bloques de la pista de escenas con la tarjeta compartida (ADR-0057, §10.3):
// el color de cada tipo viaja como variable CSS (`--tone`) y la ficha de
// arriba a la izquierda lo identifica. El clip animado conserva el celeste de
// ADR-0047; el avatar estrena el morado.
export const TIMELINE_BLOCK_TONES: Record<TimelineBlockKind, string> = {
  clip: 'var(--sky)',
  avatar: 'var(--amethyst)',
}
export const TIMELINE_BLOCK_ICONS: Record<TimelineBlockKind, LucideIcon> = {
  clip: Clapperboard,
  avatar: UserRound,
}
// Avance simulado del render de un avatar (HeyGen no informa porcentaje):
// lo medido va de 32 s a 4 min (spec §17); a los 2 min llega a
// ANIMATION_RAMP_PERCENT y después frena hacia el tope.
export const AVATAR_EXPECTED_RENDER_SECONDS = 120
// Cada cuánto corre el reloj de los renders del avatar (editor y progreso).
export const AVATAR_PROGRESS_TICK_MS = 1000
// La fase del render de una aparición en el panel del progreso (spec §8).
// Atada al tipo del evento: una fase nueva del sidecar no compila sin texto.
export const AVATAR_RENDER_PHASE_KEYS: Record<AvatarRenderPhase, string> = {
  audio: 'create.progress.avatarPhase.audio',
  upload: 'create.progress.avatarPhase.upload',
  render: 'create.progress.avatarPhase.render',
  download: 'create.progress.avatarPhase.download',
  normalize: 'create.progress.avatarPhase.normalize',
}

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
  { id: 'avatar', labelKey: 'create.stages.avatar' },
  { id: 'animation', labelKey: 'create.stages.animation' },
  { id: 'render', labelKey: 'create.stages.render' },
]

// Color de la fila de la fase en curso: la animación en celeste y el avatar
// en morado, como sus bloques en el timeline; las demás en ocean.
export const ACTIVE_STAGE_TONES: Partial<Record<StageId, StageToneClasses>> = {
  animation: { row: 'border-sky/60 bg-sky/5', badge: 'bg-sky text-white' },
  avatar: {
    row: 'border-amethyst/60 bg-amethyst/5',
    badge: 'bg-amethyst text-white',
  },
}
export const DEFAULT_ACTIVE_STAGE_TONE: StageToneClasses = {
  row: 'border-ocean/60 bg-ocean/5',
  badge: 'bg-ocean text-white',
}

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

// ── Catálogo de Vimo (Entrega 2) ──

// Qué modo de personaje eligió la persona en «Ver» para cada estilo del
// catálogo (plan E2 §5.5). La lee y la escribe
// utilities/catalogCharacterMemory.ts, que la espeja con `typeof` porque corre
// bajo un guard con Node pelado (sin el alias `@/`).
export const CATALOG_CHARACTER_STORAGE_KEY = 'vimo:catalog:character:v1'

// Cuántas muestras de un estilo del catálogo acepta «Pasar a mi estilo»
// (sample-1..4.jpg). Espejo de CATALOG_SAMPLE_COUNT en
// pipeline/commands/catalog/catalog-store.ts; utilities/catalogSamples.ts lo
// espeja con `typeof`, como la clave de arriba.
export const CATALOG_SAMPLE_COUNT = 4

// Fallos de «Pasar a mi estilo» cuyo texto general está escrito para el
// formulario de Crear y engañaría en el aviso de la copia: `invalid_payload`
// («Revisá los datos del formulario.») y `style_not_found` («Ese estilo ya no
// existe en tu galería.», cuando acá falta en el catálogo). Con estos, el
// aviso dice solo que la copia no salió.
export const CATALOG_COPY_UNDETAILED_ERROR_CODES: ReadonlySet<string> = new Set(
  ['invalid_payload', 'style_not_found'],
)

// ── Catálogo remoto administrado (Entrega 3, ADR-0049) ──

// Rutas de vimo.click; la URL base es de common (VIMO_SERVER_BASE_URL).
export const CATALOG_PATH = '/api/catalogo'
export const CATALOG_ADMIN_PATH = '/api/admin/catalogo'
// El catálogo entero pesa unos 200 KB y la publicación lista el bucket: más
// margen que los 15 s del cliente común.
export const CATALOG_SERVER_TIMEOUT_MS = 30_000
// «Traducir con IA» llama a un modelo.
export const CATALOG_TRANSLATE_TIMEOUT_MS = 60_000
// Cada vez que se monta la pestaña se vuelve a preguntar por el catálogo, salvo
// que se haya preguntado hace menos de esto (volver a la pestaña enseguida no
// repite el pedido).
export const CATALOG_SYNC_STALE_TIME_MS = 60_000
// La lista del admin se vuelve a pedir si pasó más de esto desde la última.
export const CATALOG_ADMIN_STALE_TIME_MS = 30_000
// Cuánto queda a la vista el aviso de una acción del admin que salió bien;
// uno en curso o fallido se queda hasta que la persona lo descarte.
export const CATALOG_ADMIN_TOAST_DURATION_MS = 6000
// Muestras de un borrador del catálogo: las 4 situaciones fijas, como en Mi
// estilo, subidas al bucket `previews-gemas` de Supabase.
export const CATALOG_DRAFT_SAMPLE_COUNT = 4
// Espejo del `check` de la tabla y de STYLE_ID_PATTERN del sidecar.
export const CATALOG_STYLE_ID_LIMIT = 40
export const CATALOG_STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
// Espejo de CATALOG_TAG_LIMIT y CATALOG_TAG_LABEL_LIMIT
// (pipeline/prompts/catalog-gems/tags.ts).
export const CATALOG_TAG_LIMIT = 5
export const CATALOG_TAG_LABEL_LIMIT = 24
// Dos admins no se pisan (plan E3, P11): con este código el modal ofrece
// volver a intentar con la revisión nueva sin perder lo escrito.
export const CATALOG_DRAFT_CONFLICT_CODE = 'borrador-cambio'
// Código → clave i18n de los endpoints del catálogo (plan E3 §5.3) y del
// cliente común de vimo.click (`network` y `timeout`).
export const CATALOG_SERVER_ERROR_MESSAGE_KEYS: Record<string, string> = {
  'sin-token': 'create.catalogAdmin.errors.session',
  'token-invalido': 'create.catalogAdmin.errors.session',
  'sin-acceso': 'create.catalogAdmin.errors.noAccess',
  'funcion-desactivada': 'create.catalogAdmin.errors.featureOff',
  'no-admin': 'create.catalogAdmin.errors.notAdmin',
  'pedido-invalido': 'create.catalogAdmin.errors.invalidRequest',
  'estilo-invalido': 'create.catalogAdmin.errors.invalidStyle',
  'no-existe': 'create.catalogAdmin.errors.notFound',
  'id-en-uso': 'create.catalogAdmin.errors.idTaken',
  'borrador-cambio': 'create.catalogAdmin.errors.draftChanged',
  'faltan-muestras': 'create.catalogAdmin.errors.missingSamples',
  archivado: 'create.catalogAdmin.errors.archived',
  'almacenamiento-fallo': 'create.catalogAdmin.errors.storageFailed',
  'catalogo-vacio': 'create.catalogAdmin.errors.emptyCatalog',
  'modelo-fallo': 'create.catalogAdmin.errors.modelFailed',
  'modelo-timeout': 'create.catalogAdmin.errors.modelTimeout',
  'error-interno': 'create.catalogAdmin.errors.serverError',
  network: 'create.catalogAdmin.errors.network',
  timeout: 'create.catalogAdmin.errors.timeout',
}
export const UNKNOWN_CATALOG_SERVER_ERROR_KEY =
  'create.catalogAdmin.errors.unknown'

// ── Estilos propios («Mi estilo») ──

// Cuántas muestras genera el sidecar por estilo (las 4 situaciones fijas).
export const CUSTOM_STYLE_SAMPLE_COUNT = 4

// Espejo de los límites del sidecar (pipeline/commands/styles/style-store.ts).
// La gema que se pega admite hasta 100 000 caracteres (eran 30 000, el tope del
// origen): hay gemas más largas. También es lo que acepta el agente
// reconstructor (GEM_REBUILD_TEXT_LIMIT en utilities/gemTemplate.ts).
export const CUSTOM_STYLE_NAME_LIMIT = 80
export const CUSTOM_STYLE_PROMPT_LIMIT = 100_000
export const CUSTOM_STYLE_MAX_SHOTS = 20

// Campo de texto del modal de estilo: nombre, gema, secciones y planos.
export const CUSTOM_STYLE_FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary disabled:opacity-60'

// Píldora con el nombre del estilo del catálogo del que se clona una gema: en
// el aviso de la copia en curso y en el modal de la copia.
export const CATALOG_ORIGIN_BADGE_CLASS =
  'inline-flex items-center rounded-full bg-saffron px-2.5 py-0.5 align-middle font-display text-xs font-bold text-charcoal'

// Título y ayuda de cada sección de la gema en el modal (spec §4.1). El orden
// en que se muestran es GEM_SECTION_KEYS (utilities/gemTemplate.ts).
export const GEM_SECTION_TEXT_KEYS: Record<
  GemSectionKey,
  { titleKey: string; hintKey: string }
> = {
  visualStyle: {
    titleKey: 'create.gemTemplate.sections.visualStyle.title',
    hintKey: 'create.gemTemplate.sections.visualStyle.hint',
  },
  character: {
    titleKey: 'create.gemTemplate.sections.character.title',
    hintKey: 'create.gemTemplate.sections.character.hint',
  },
  dynamism: {
    titleKey: 'create.gemTemplate.sections.dynamism.title',
    hintKey: 'create.gemTemplate.sections.dynamism.hint',
  },
  camera: {
    titleKey: 'create.gemTemplate.sections.camera.title',
    hintKey: 'create.gemTemplate.sections.camera.hint',
  },
  rules: {
    titleKey: 'create.gemTemplate.sections.rules.title',
    hintKey: 'create.gemTemplate.sections.rules.hint',
  },
  promptStart: {
    titleKey: 'create.gemTemplate.sections.promptStart.title',
    hintKey: 'create.gemTemplate.sections.promptStart.hint',
  },
  promptEnd: {
    titleKey: 'create.gemTemplate.sections.promptEnd.title',
    hintKey: 'create.gemTemplate.sections.promptEnd.hint',
  },
}

// Cada cuánto se refresca el porcentaje simulado de la adaptación de una gema
// en su tarjeta (spec §4.4). La curva y sus tiempos viven con
// `gemAdaptationPercent` (utilities), que corre bajo un guard con Node pelado.
export const GEM_ADAPTATION_TICK_MS = 500

// Cuánto queda a la vista, en el modal de una gema recién adaptada, el aviso
// con lo que ajustó la IA si la persona no lo cierra: alcanza para leer una
// lista de avisos y no queda ahí para siempre.
export const GEM_WARNINGS_AUTO_DISMISS_MS = 60_000

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

// ── Agente reconstructor de gemas (vimo.click, ADR-0048) ──

// Ruta del endpoint; la URL base es de common (VIMO_SERVER_BASE_URL).
export const GEM_REBUILD_PATH = '/api/estilos/reconstruir'
// El servidor corta al modelo a los 120 s: el cliente espera un poco más para
// recibir su `modelo-timeout` en vez de adelantarse con un timeout propio.
export const GEM_REBUILD_TIMEOUT_MS = 150_000
// Código → clave i18n: los del servidor (spec §6.1 más los tres que sumó el
// contrato: `pedido-invalido`, `funcion-desactivada` y `error-interno`, y
// `sin-estilo-visual`, que pidió el dueño el 2026-10-01; se comparan tal cual
// llegan) y los del cliente común de vimo.click (`network` y `timeout`).
export const GEM_REBUILD_ERROR_MESSAGE_KEYS: Record<string, string> = {
  'sin-token': 'create.gemTemplate.errors.session',
  'token-invalido': 'create.gemTemplate.errors.session',
  'sin-acceso': 'create.gemTemplate.errors.noAccess',
  'funcion-desactivada': 'create.gemTemplate.errors.featureOff',
  'pedido-invalido': 'create.gemTemplate.errors.invalidRequest',
  'texto-invalido': 'create.gemTemplate.errors.invalidText',
  'sin-estilo-visual': 'create.gemTemplate.errors.noVisualStyle',
  'cupo-agotado': 'create.gemTemplate.errors.quotaExhausted',
  'modelo-fallo': 'create.gemTemplate.errors.modelFailed',
  'modelo-timeout': 'create.gemTemplate.errors.modelTimeout',
  'error-interno': 'create.gemTemplate.errors.serverError',
  network: 'create.gemTemplate.errors.network',
  timeout: 'create.gemTemplate.errors.timeout',
}
export const UNKNOWN_GEM_REBUILD_ERROR_KEY = 'create.gemTemplate.errors.unknown'
// El texto no describe un estilo visual (un guion, una lista de temas):
// reintentar con el mismo texto daría lo mismo, así que no se ofrece.
export const GEM_REBUILD_NO_VISUAL_STYLE_CODE = 'sin-estilo-visual'
// Cupo agotado sin la hora en que vuelve (el contrato la manda siempre; si
// falta, el mensaje no la promete).
export const GEM_REBUILD_QUOTA_CODE = 'cupo-agotado'
export const GEM_REBUILD_QUOTA_LATER_KEY =
  'create.gemTemplate.errors.quotaExhaustedLater'

// ── Creador de estilo con IA (vimo.click, ADR-0050) ──

// Ruta del endpoint; la URL base es de common (VIMO_SERVER_BASE_URL).
export const STYLE_CLONE_PATH = '/api/estilos/crear-con-ia'
// El servidor corta el turno a los 285 s: el cliente espera un poco más para
// recibir su `modelo-timeout` en vez de adelantarse con un timeout propio.
export const STYLE_CLONE_TIMEOUT_MS = 300_000
// El servidor manda un latido cada 10 s mientras el modelo trabaja: con este
// silencio la conexión se da por cortada.
export const STYLE_CLONE_IDLE_TIMEOUT_MS = 45_000
// Hasta cuántas imágenes propias (espejo de MAX_CLONE_IMAGES del sidecar y de
// MAX_IMAGENES del servidor). Con más imágenes la IA mide mejor el estilo.
export const STYLE_CLONE_IMAGE_LIMIT = 10
export const STYLE_CLONE_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
// Espejo de LIMITE_COMENTARIO del servidor.
export const STYLE_CLONE_COMMENT_LIMIT = 2_000
// Alto máximo de cada imagen de una escena de prueba en el modal. El modal
// mide hasta el 90 % del alto de la ventana (StyleCloneModal) y el paso de las
// escenas muestra las 4 pruebas, la caja «¿Qué ajustamos?» y los botones sin
// desplazarse: todo lo que no son las imágenes mide unos 23 rem (el nombre, la
// etiqueta, las cabeceras de las tarjetas, la caja, los botones y los
// espacios) y lo que sobra se reparte entre las 2 filas de imágenes. En una
// ventana cómoda no achica nada (la imagen mide lo que su 16:9); en la ventana
// mínima de la app (640 px de alto) quedan de unos 85 px. Por debajo de 5 rem
// ya no se achican: el modal se desplaza.
export const STYLE_CLONE_SCENE_FRAME_CLASS =
  'max-h-[max(5rem,calc((90vh_-_24rem)/2))]'
// Código → clave i18n de lo que es propio de la clonación: los del servidor,
// los del cliente de vimo.click (`network`, `timeout`) y los del sidecar que
// no tienen ya su texto en CREATE_ERROR_MESSAGE_KEYS (yt-dlp, imágenes y
// claves se leen de ahí).
export const STYLE_CLONE_ERROR_MESSAGE_KEYS: Record<string, string> = {
  'sin-token': 'create.styleClone.errors.session',
  'token-invalido': 'create.styleClone.errors.session',
  'sin-acceso': 'create.styleClone.errors.noAccess',
  'funcion-desactivada': 'create.styleClone.errors.featureOff',
  'pedido-invalido': 'create.styleClone.errors.invalidRequest',
  'material-invalido': 'create.styleClone.errors.invalidMaterial',
  'cupo-agotado': 'create.styleClone.errors.quotaExhausted',
  'modelo-fallo': 'create.styleClone.errors.modelFailed',
  'modelo-timeout': 'create.styleClone.errors.modelTimeout',
  'contenido-bloqueado': 'create.styleClone.errors.contentBlocked',
  'error-interno': 'create.styleClone.errors.serverError',
  network: 'create.styleClone.errors.network',
  timeout: 'create.styleClone.errors.timeout',
  style_clone_no_material: 'create.styleClone.errors.noMaterial',
  style_clone_invalid_images: 'create.styleClone.errors.invalidImages',
  style_clone_file_missing: 'create.styleClone.errors.sessionLost',
  style_clone_session_missing: 'create.styleClone.errors.sessionLost',
}
export const UNKNOWN_STYLE_CLONE_ERROR_KEY = 'create.styleClone.errors.unknown'
// Códigos con los que reintentar no cambia nada: la persona tiene que hacer
// otra cosa (otro video, otras imágenes) o la función no es para su cuenta.
export const STYLE_CLONE_FINAL_ERROR_CODES: ReadonlySet<string> = new Set([
  'sin-acceso',
  'funcion-desactivada',
  'contenido-bloqueado',
  'style_clone_file_missing',
  'style_clone_session_missing',
])

// Ids `st-<timestamp36>-<rand>`: cronológicos y dentro del STYLE_ID_PATTERN
// del sidecar (≤ 40 chars, minúsculas).
export function newCustomStyleId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `st-${Date.now().toString(36)}-${random}`
}

// Formato del video: horizontal clásico o vertical para shorts.
export const DEFAULT_VIDEO_FORMAT: VideoFormat = '16:9'

// Modo demo (ADR-0029, ADR-0030): la demo arranca en 16:9; qué otros
// formatos se ofrecen (Short) lo decide el manifest del pack instalado.
export const DEMO_VIDEO_FORMAT: VideoFormat = '16:9'

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

// Proveedores de animación de escenas (ADR-0047), en el orden del selector.
// Etiquetas de marca: no se traducen.
export const VIDEO_PROVIDERS: { id: VideoProviderId; label: string }[] = [
  { id: 'kie', label: 'Kie.ai' },
]

// Fallos de animación que repetir el pedido no arregla: el modal de fallo
// no ofrece reintentar esas escenas (moderación, escena sin imagen y las
// marcas que el planificador rechaza).
export const NON_RETRYABLE_ANIMATION_CODES: ReadonlySet<string> = new Set([
  'animation_content_policy',
  'animation_invalid_request',
  'animation_image_missing',
  'animation_already_covered',
  'animation_slot_out_of_range',
])

// Avance simulado de un clip (ADR-0047): Kie no informa porcentaje y PoYo lo
// deja en 0 hasta terminar. Medido con clips reales el 2026-09-12: 78 s (PoYo)
// y 88 s (Kie) desde el clic, contando los ~10 s de escribir el prompt. El
// porcentaje sube en línea recta hasta ANIMATION_RAMP_PERCENT en ese tiempo y
// después se frena asintóticamente hacia el tope; el 100 % lo pone solo el
// clip listo.
export const ANIMATION_EXPECTED_SECONDS = 75
export const ANIMATION_RAMP_PERCENT = 90
export const ANIMATION_PROGRESS_CAP_PERCENT = 99
export const ANIMATION_PROGRESS_TICK_MS = 1000

// Opciones de nivel de razonamiento por proveedor (ambos generan con
// gpt-image-2, ADR-0015). Para la persona es «cuánto razona el modelo antes
// de dibujar»; para el sidecar sigue siendo la calidad del catálogo del
// origen: Evolink solo expone 16:9 1K, así que del id solo importa el nivel;
// en Fal el id lleva el tamaño exacto (convención `<W>x<H>_<quality>`). La
// etiqueta visible lleva el nivel y el formato elegido («Bajo · 16:9»), sin
// repetir «Nivel de razonamiento», que ya es la etiqueta del campo.
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
    labelKey: 'create.reasoningLevel.low',
    noteKey: 'create.reasoningLevel.evolinkLowNote',
    priceUsd: 0.0036,
    credits: 0.24,
  },
  {
    id: '1024x576_medium',
    labelKey: 'create.reasoningLevel.medium',
    noteKey: 'create.reasoningLevel.evolinkMediumNote',
    priceUsd: 0.0273,
    credits: 1.85,
  },
  {
    id: '1024x576_high',
    labelKey: 'create.reasoningLevel.high',
    noteKey: 'create.reasoningLevel.evolinkHighNote',
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
    labelKey: 'create.reasoningLevel.low',
    noteKey: 'create.reasoningLevel.falNote',
    priceUsd: 0.005,
  },
  {
    id: '1920x1080_medium',
    labelKey: 'create.reasoningLevel.medium',
    noteKey: 'create.reasoningLevel.falNote',
    priceUsd: 0.04,
  },
  {
    id: '1920x1080_high',
    labelKey: 'create.reasoningLevel.high',
    noteKey: 'create.reasoningLevel.falNote',
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
    labelKey: 'create.reasoningLevel.low',
    noteKey: 'create.reasoningLevel.falVerticalNote',
    priceUsd: 0.005,
  },
  {
    id: '1080x1920_medium',
    labelKey: 'create.reasoningLevel.medium',
    noteKey: 'create.reasoningLevel.falVerticalNote',
    priceUsd: 0.04,
  },
  {
    id: '1080x1920_high',
    labelKey: 'create.reasoningLevel.high',
    noteKey: 'create.reasoningLevel.falVerticalNote',
    priceUsd: 0.158,
  },
]

// Pestañas del picker de personajes: filtran por cómo se fijó la identidad
// (con foto primero, como en la biblioteca).
export const CHARACTER_PICKER_FILTERS: {
  id: SelectedCharacter['mode']
  labelKey: string
}[] = [
  { id: 'photo', labelKey: 'create.characters.filter.photo' },
  { id: 'text', labelKey: 'create.characters.filter.text' },
]

// Frecuencias de aparición del personaje que ofrece el formulario, de menor a
// mayor. Solo dos (v0.61.0 del origen): si elegiste personaje es porque lo
// querés ver — «equilibrado» es la mitad del video bien mezclada y «siempre»
// todas las escenas. Los niveles intermedios (`rarely`, `often`,
// `almost-always`) los sigue soportando el sidecar para proyectos ya
// guardados, pero la UI no los ofrece más.
export const CHARACTER_FREQUENCIES: {
  id: CharacterFrequency
  labelKey: string
  percentKey: string
}[] = [
  {
    id: 'balanced',
    labelKey: 'create.characters.frequency.balanced',
    percentKey: 'create.characters.frequency.balancedPercent',
  },
  {
    id: 'always',
    labelKey: 'create.characters.frequency.always',
    percentKey: 'create.characters.frequency.alwaysPercent',
  },
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
  animateScenes: false,
  animateWholeVideo: false,
  animationMinutes: ANIMATION_MINUTES_DEFAULT,
  useAvatar: false,
  avatar: null,
  avatarAppearances: AVATAR_DEFAULT_APPEARANCES,
  avatarSecondsPerAppearance: AVATAR_DEFAULT_APPEARANCE_SECONDS,
  avatarStartsVideo: true,
  imageProvider: 'evolink',
  imageQuality: '1024x576_low',
  voice: null,
  voiceSettings: VOICE_SETTINGS_DEFAULTS,
  characters: [],
  withdrawnCharacters: [],
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

// Qué dice cada ficha de avatar en la tarjeta de Crear: cuántos looks sirven
// para el formato del video, o por qué no se puede usar. (La orientación del
// look por formato NO se espeja acá: la regla es `lookOrientationFit`
// (pipeline/avatar/look-orientation.ts), sobre AVATAR_LOOK_ORIENTATION_BY_FORMAT
// de pipeline/types/avatar.ts, y un espejo podría divergir de ella.)
export const AVATAR_USABILITY_LABEL_KEYS: Record<AvatarUsability, string> = {
  usable: 'create.avatar.lookCount',
  training: 'create.avatar.training',
  failed: 'create.avatar.unavailable',
  noLook: 'create.avatar.noLookShort',
}
// El motivo, con el nombre del avatar, cuando no tiene un look para el
// formato del video.
export const AVATAR_NO_LOOK_KEYS: Record<VideoFormat, string> = {
  '16:9': 'create.avatar.noLookLandscape',
  '9:16': 'create.avatar.noLookPortrait',
}
// La vista previa del look elegido en la tarjeta, con la forma del video.
export const AVATAR_LOOK_FRAME_CLASSES: Record<VideoFormat, string> = {
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
}
// Su ancho fijo, al lado del desplegable del look (el alto sale de la forma):
// la vertical más angosta, para que no estire la tarjeta.
export const AVATAR_LOOK_PREVIEW_WIDTH_CLASSES: Record<VideoFormat, string> = {
  '16:9': 'w-40',
  '9:16': 'w-24',
}
// Fichas de esqueleto mientras se lee la biblioteca de avatares.
export const AVATAR_PICKER_SKELETONS = 5
// Cuánto vale la lectura de la biblioteca de avatares que hace Crear: quien
// tiene la clave de HeyGen y no usa el avatar no paga un proceso del sidecar
// en cada montaje ni en cada foco de la ventana. Agregar o quitar un avatar,
// o el sondeo de lo que procesa, la invalidan igual.
export const CREATE_AVATAR_LIBRARY_STALE_TIME_MS = 60_000

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
  // Avatar presentador elegido en Crear (ADR-0057): lo valida
  // create-video-project contra la biblioteca. `avatar_not_found` y
  // `avatar_group_missing` (HeyGen ya no tiene el avatar) reusan el texto de
  // la biblioteca de avatares.
  avatar_not_found: 'avatars.errors.notFound',
  avatar_group_missing: 'avatars.errors.groupMissing',
  avatar_look_unavailable: 'create.errors.avatarLookUnavailable',
  avatar_look_orientation_mismatch:
    'create.errors.avatarLookOrientationMismatch',
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
  voice_request_pending: 'create.errors.voiceRequestPending',
  voice_request_unresolved: 'create.errors.voiceRequestUnresolved',
  project_busy: 'library.errors.projectBusy',
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
  catalog_prompts_incomplete: 'create.errors.catalogPromptsIncomplete',
  scene_prompt_alignment_failed: 'create.errors.scenePromptAlignmentFailed',
  catalog_prompt_pending_image: 'create.errors.catalogPromptPendingImage',
  llm_empty_response: 'create.errors.llmProviderError',
  llm_rescue_needed: 'create.errors.llmRescueNeeded',
  llm_prompt_language: 'create.errors.llmPromptLanguage',
  llm_auth: 'create.errors.llmAuth',
  llm_insufficient_credits: 'create.errors.llmInsufficientCredits',
  // Imágenes
  image_network: 'create.errors.imageNetwork',
  image_invalid_api_key: 'create.errors.imageInvalidApiKey',
  image_account_rejected: 'create.errors.imageAccountRejected',
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
  // Animación de escenas (ADR-0047)
  animation_insufficient_credits: 'create.errors.animationInsufficientCredits',
  animation_invalid_api_key: 'create.errors.animationInvalidApiKey',
  animation_rate_limited: 'create.errors.animationRateLimited',
  animation_provider_down: 'create.errors.animationProviderDown',
  animation_provider_error: 'create.errors.animationProviderError',
  animation_invalid_request: 'create.errors.animationInvalidRequest',
  animation_task_not_found: 'create.errors.animationProviderError',
  animation_attempts_exhausted: 'create.errors.animationProviderError',
  animation_content_policy: 'create.errors.animationContentPolicy',
  animation_network: 'create.errors.animationNetwork',
  animation_timeout: 'create.errors.animationTimeout',
  animation_download_failed: 'create.errors.animationDownloadFailed',
  animation_upload_failed: 'create.errors.animationUploadFailed',
  animation_image_missing: 'create.errors.animationImageMissing',
  animation_clip_missing: 'create.errors.animationClipMissing',
  animation_submission_unknown: 'create.errors.animationSubmissionUnknown',
  animation_media_invalid: 'create.errors.animationMediaInvalid',
  animation_prompt_failed: 'create.errors.animationPromptFailed',
  animation_project_busy: 'create.errors.animationProjectBusy',
  animation_request_changed: 'create.errors.animationRequestChanged',
  animation_incomplete: 'create.errors.animationIncomplete',
  animation_timing_locked: 'create.errors.animationTimingLocked',
  // Escenas de avatar con HeyGen (ADR-0057, spec §14). Los códigos que la
  // biblioteca de avatares ya traduce reusan SUS claves (avatars.errors.*,
  // las mismas de src/modules/avatars/constants.ts): no se duplica el texto.
  // `avatar_not_found` → avatars.errors.notFound está arriba, con los
  // rechazos de Crear.
  avatar_invalid_key: 'avatars.errors.invalidKey',
  avatar_insufficient_credits: 'avatars.errors.insufficientCredits',
  avatar_rate_limited: 'avatars.errors.rateLimited',
  avatar_look_unsupported: 'avatars.errors.lookUnsupported',
  avatar_moderation_rejected: 'avatars.errors.moderationRejected',
  avatar_invalid_request: 'avatars.errors.providerError',
  avatar_provider_error: 'avatars.errors.providerError',
  avatar_network: 'avatars.errors.network',
  // Los que introduce la fase `avatar` llevan texto propio en create.errors.
  avatar_render_failed: 'create.errors.avatarRenderFailed',
  avatar_timeout: 'create.errors.avatarTimeout',
  avatar_download_failed: 'create.errors.avatarDownloadFailed',
  avatar_incomplete: 'create.errors.avatarIncomplete',
  avatar_sentences_unavailable: 'create.errors.avatarSentencesUnavailable',
  // El render (auto-export al final del pipeline) no encontró ni el clip ni
  // la vista previa del look de una aparición.
  avatar_render_look_unavailable: 'create.errors.avatarRenderLookUnavailable',
  // Escena de avatar (ADR-0057): sus fronteras con clip o recibos de HeyGen no
  // se mueven en la entrega 2.
  avatar_timing_locked: 'create.errors.avatarTimingLocked',
  // Transversales
  missing_api_key: 'create.errors.missingApiKey',
  missing_projects_root: 'create.errors.missingProjectsRoot',
  // Estilos propios
  style_not_found: 'create.errors.styleNotFound',
  style_save_failed: 'create.errors.styleSaveFailed',
  style_samples_failed: 'create.errors.styleSamplesFailed',
  // Catálogo remoto (ADR-0049)
  catalog_sync_failed: 'create.errors.catalogSyncFailed',
  catalog_upload_failed: 'create.errors.catalogUploadFailed',
  // Modo demo (ADR-0029)
  demo_not_ready: 'create.errors.demoNotReady',
  demo_pack_incomplete: 'create.errors.demoNotReady',
  demo_style_not_included: 'create.errors.demoStyleNotIncluded',
  demo_format_not_included: 'create.errors.demoFormatNotIncluded',
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
  animation_image_locked: 'library.errors.animationImageLocked',
  // Rechazo del editor: una escena de avatar no tiene imagen (ADR-0057).
  avatar_scene_without_image: 'library.errors.avatarSceneWithoutImage',
  // El render o el export del editor no encontró ni el clip ni la vista
  // previa del look de una aparición.
  avatar_render_look_unavailable: 'library.errors.avatarRenderLookUnavailable',
  animation_undo_pending: 'library.errors.animationUndoPending',
  animation_source_missing: 'library.errors.animationSourceMissing',
  invalid_audio_url: 'library.errors.invalidAudioUrl',
  audio_too_large: 'library.errors.audioTooLarge',
  clips_no_scenes: 'library.errors.clipsNoScenes',
  clips_no_images: 'library.errors.clipsNoImages',
  fal_admin_key_required: 'library.errors.falAdminKeyRequired',
  music_invalid_api_key: 'create.errors.missingApiKey',
  music_network: 'create.errors.musicGenerationFailed',
  demo_project: 'library.errors.demoProject',
  // Rechazos del planificador de animación (ADR-0047): no son fallos del
  // proveedor, son marcas que no se pueden convertir en clip.
  animation_already_covered: 'library.errors.animationAlreadyCovered',
  animation_slot_out_of_range: 'library.errors.animationSlotOutOfRange',
}

// Códigos de la puerta de la demo (demo-status / demo-prepare, ADR-0029).
// Ninguno es reintentable: un fallo de la demo es final.
export const DEMO_ERROR_MESSAGE_KEYS: Record<string, string> = {
  demo_offline: 'createDemo.errors.offline',
  demo_download_failed: 'createDemo.errors.downloadFailed',
  demo_pack_corrupt: 'createDemo.errors.packCorrupt',
  demo_pack_unreadable: 'createDemo.errors.packUnreadable',
  demo_pack_incomplete: 'createDemo.errors.packIncomplete',
  missing_projects_root: 'create.errors.missingProjectsRoot',
}
export const UNKNOWN_DEMO_ERROR_KEY = 'createDemo.errors.unknown'
