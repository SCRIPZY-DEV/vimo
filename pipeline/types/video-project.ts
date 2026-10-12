import type { FlowToolsExecutionPlan } from './flow-execution-plan.ts'
import type { CharacterStyleId } from './characters.ts'
import type { ColorFilterId, GemSections, StyleCharacter } from './styles.ts'
import type { ImageProviderId, FlowRestartRequest } from './image-provider.ts'
import type { MusicGenerationParams } from './music.ts'
import type {
  ScenePromptFailure,
  SceneSummary,
  TranscriptWord,
} from './scenes.ts'
import type { StageId } from '../runner/stage-id.ts'
import type { VideoFormat } from './video-format.ts'
import type { VideoProviderId } from './video-provider.ts'
import type { VoiceGenerationSettings, VoiceProviderId } from './voices.ts'

// Dominio del proyecto de video (módulo Create, ADR-0013). Browser-safe: la
// UI consume estos contratos solo con `import type`.

export type NarrationMode = 'tts' | 'own-audio'

export type BgmMode = 'youtube' | 'evolink-ai'

// Frecuencia de aparición del personaje (port de FrecuenciaPersonaje).
export type CharacterFrequency =
  'rarely' | 'balanced' | 'often' | 'almost-always' | 'always'

// Un personaje asignado al proyecto, en su forma PERSISTIDA (project.json).
// Solo un personaje «con foto» (modo photo) tiene referencia visual, copiada
// en `characters/` dentro del proyecto. Uno de identidad de prompt (modo
// text) viaja siempre como texto, tenga o no retrato del estilo (enmienda del
// 2026-10-02 a la ADR-0021).
export interface ProjectCharacter {
  // Id en la biblioteca `<projectsRoot>/characters/`, si vino de ahí.
  characterId?: string
  name: string
  // Identidad en inglés, neutra de estilo (misma semántica que la biblioteca).
  description: string
  mode: 'photo' | 'text'
  // Archivo dentro de `characters/` del proyecto (reference_1.jpg, …): la
  // foto del personaje. Un proyecto creado antes del 2026-10-02 puede traer
  // acá el retrato del estilo de un personaje de texto: no viaja (lo descarta
  // loadPipelineCharacters).
  referenceImageFile?: string
  isProtagonist?: boolean
}

// Estilo propio del proyecto, INLINE como snapshot (filosofía E20 de los
// personajes: el proyecto es autocontenido) — editar o borrar la gema en la
// galería jamás rompe una regeneración desde Library. `styleId` acá es el id
// de galería (o el de la gema del catálogo), solo diagnóstico;
// `options.styleId` sigue siendo un CharacterStyleId válido: 'normal' con un
// estilo propio o una gema nueva del catálogo, y el id heredado cuando la
// gema del catálogo es una de las 5 de siempre (plan E2 §5.4).
export interface ProjectCustomStyle {
  styleId: string
  name: string
  /** Gema vieja. Excluyente con `sections`. */
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
  /**
   * Entrega 2: el proyecto usa una gema del catálogo directamente. Es el
   * mismo id que `styleId`; `create-video-project` lo exige. Una copia de
   * «Pasar a mi estilo» no lo lleva: su procedencia vive en `style.json`
   * (`origin`), y el proyecto es uno de Mi estilo.
   */
  catalogStyleId?: string
  shots?: string[]
  // Qué declaró la gema sobre su protagonista (snapshot). Ausente = el
  // proyecto manda (comportamiento previo a ADR-0020, intacto).
  character?: StyleCharacter
}

// Opciones del proyecto (port con whitelist de OpcionesProyecto: solo lo que
// el pipeline nuevo consume). Se persisten en project.json y las stages las
// leen del contexto — nada llega por entorno (ADR-0010).
export interface VideoProjectOptions {
  styleId: CharacterStyleId
  // Presente = el proyecto usa un estilo propio; el resolver lo prefiere
  // sobre styleId (pipeline/stages/shared/project-style.ts).
  customStyle?: ProjectCustomStyle
  // 0 = automática (≈ una escena cada 3 segundos de audio).
  sceneCount: number
  narrationMode: NarrationMode
  voiceProvider?: VoiceProviderId
  voiceId?: string
  voiceName?: string
  voiceSettings?: VoiceGenerationSettings
  imageProvider: ImageProviderId
  // Sólo intenciones nuevas Flow; ausente conserva el ejecutor RPC.
  executionPlan?: FlowToolsExecutionPlan
  imageQuality?: string
  // 16:9 (default) o 9:16 vertical. Ausente = 16:9: los proyectos previos
  // renderizan byte-idéntico (ver pipeline/types/video-format.ts).
  videoFormat?: VideoFormat
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
  // Carril de segundos-por-escena (solo con customStyle): la duración de
  // cada escena en segundos [2..15] y el número sale del audio — al revés
  // del corte clásico. Ausente = 3 en el carril; sin customStyle se ignora
  // (los cortes clásicos siguen byte-idénticos).
  secondsPerScene?: number
  // Modelo LLM que escribe los prompts del carril verbatim (solo con
  // customStyle). Ausente = el de la casa. NO se valida contra el catálogo:
  // un id retirado o desconocido se degrada con aviso (resolveVerbatimModel),
  // así un proyecto viejo sigue generando.
  promptModel?: string
  characters?: ProjectCharacter[]
  characterFrequency?: CharacterFrequency
  // Mezcla final del render; defaults 1.0 (voz) y 0.15 (música).
  voiceVolume?: number
  musicVolume?: number
  // Segundos que se saltean del arranque de la música al mezclar (Library).
  bgmOffsetSeconds?: number
  // Quema el texto de cada escena abajo del video en la mezcla final.
  // Ausente = false: los proyectos previos renderizan byte-idéntico.
  subtitles?: boolean
  // Con false, el job de Create genera todo MENOS el render: el proyecto
  // queda en borrador y el video se arma desde el editor (ADR-0016 revierte
  // la decisión 4 de ADR-0013). Ausente = true — los proyectos previos y los
  // re-render de Library se comportan igual que siempre.
  autoRender?: boolean
  // Modo demo (ADR-0029): el proyecto nació desde la puerta de la demo y
  // run-video-pipeline SIMULA las fases con el pack pre-hecho en vez de
  // llamar a proveedores. Solo lo pone ese camino; ausente/false = pipeline
  // real de siempre. Se persiste: el editor lo lee para bloquear acciones.
  demo?: boolean
  // Proveedor con el que se animan las escenas de este proyecto (ADR-0047).
  // Lo persiste `animate-scenes` con el elegido en cada pedido: así la
  // alerta de saldo sabe qué cuenta rechazó. Ausente = nunca se animó.
  videoProvider?: VideoProviderId
  // Ausente o cero desactiva animación; enteros positivos seleccionan el prefijo.
  animationMinutes?: number
  // Solo 9:16: anima todo el audio, cuya duración se conoce después de la voz.
  animateWholeVideo?: boolean
}

export type VideoProjectState =
  | 'draft'
  | 'generating'
  | 'awaiting-confirmation'
  | 'paused'
  | 'completed'
  | 'error'

// Por qué un proyecto quedó en `paused`: la persona canceló, o el proveedor
// rechazó por saldo agotado (ADR-0031). Ambos se reanudan igual; cambia el
// texto y, con saldo, la UI re-chequea antes de relanzar.
export type PauseReason = 'cancelled' | 'insufficient-credits'

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
  // Solo con state = 'paused'. Con 'insufficient-credits', errorCode guarda
  // el código del dominio que rechazó (voice_*, image_*, …).
  pauseReason?: PauseReason
  // El video renderizado quedó atrás respecto de una edición posterior
  // (escenas, narración o música). Nunca implica borrar el mp4: solo avisa.
  // Lo limpian los jobs que completan un render (ADR-0014).
  videoOutdated?: boolean
  // Política visual aplicada al último MP4; ausente = render anterior a esta regla.
  renderTransitionVersion?: number
  // Con qué modelo se escribieron los prompts de verdad (tras la
  // degradación, si la hubo). Solo auditoría: no gobierna nada.
  promptModelUsed?: { id: string; label: string }
  // El protagonista que el carril verbatim resolvió para este video cuando
  // NO hay personaje del usuario (el que el estilo describe, o uno diseñado).
  // A diferencia de `promptModelUsed`, esto SÍ gobierna: reanudar, reescribir
  // por política de contenido y «Regenerar imagen» lo reusan en vez de
  // rediseñarlo, así el video no cambia de personaje a mitad de camino.
  styleProtagonist?: StyleProtagonist
}

// De dónde salió el protagonista guardado. Solo diagnóstico: no cambia cómo
// se teje.
//  - style-phase      — la Fase 1 de la gema lo devolvió.
//  - platform-phase   — salió de un reintento con la fase de la plataforma.
//  - fallback-request — la Fase 1 no dejó nada y lo resolvió el pedido JSON.
//  - recovered        — proyecto anterior a este campo: se leyó de los prompts
//                       de escena ya guardados.
//  - style-section    — gema de plantilla (ADR-0048): lo define su sección
//                       `character`, sin Fase 1.
export type StyleProtagonistSource =
  | 'style-phase'
  | 'platform-phase'
  | 'fallback-request'
  | 'recovered'
  | 'style-section'

export interface StyleProtagonist {
  // Lo que se replica en el turno de assistant de la Fase 2.
  portrait: string
  // Lo que se teje, idéntico, al final de cada escena que lo nombra.
  description: string
  // La ropa base separada de la identidad fija (oración «Outfit:» de la
  // ficha), cuando la Fase 1 la devolvió así. Solo diagnóstico: el tejido la
  // vuelve a separar de `description` en cada escena.
  outfit?: string
  source: StyleProtagonistSource
}

// ─── Contratos de los subcomandos del dominio videos ───

// Un personaje ENTRANTE al crear el proyecto: el modo photo trae la foto
// como data URI; el modo text referencia la biblioteca por characterId.
export interface NewVideoProjectCharacter {
  characterId?: string
  name: string
  // Obligatoria en modo text (es la identidad); opcional con foto.
  description: string
  // photo = la identidad es una imagen: `photoDataUri` directa o, con
  // `characterId`, la foto guardada en la biblioteca (ADR-0033). text = la
  // identidad es la descripción; la referencia visual es el preview del
  // estilo actual, si existe.
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

export interface RunVideoPipelinePayload extends FlowRestartRequest {
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
  // Exactamente uno de los dos: el conteo clásico, o los segundos del carril
  // de estilo propio (una confirmación por conteo en ese carril se traduce a
  // segundos equivalentes — red de seguridad v1.31.1 del origen).
  sceneCount?: number
  secondsPerScene?: number
}

// Cambia el modelo que escribe los prompts de un proyecto de Mi estilo que ya
// existe en disco (la UI lo usa al «cambiar de modelo» tras un bloqueo). null
// = el de la casa. No toca scenes.json: los prompts válidos se conservan y el
// modelo nuevo escribe solo los que faltan al relanzar.
export interface SetPromptModelPayload {
  projectId: string
  promptModel: string | null
}

export interface PreviewSceneCutsPayload {
  projectId: string
  secondsPerScene: number
}

// Vista previa del corte por segundos: función pura sobre words.json — la
// MISMA implementación que después corta, así la vista previa no puede
// mentir.
export interface PreviewSceneCutsResult {
  sceneCount: number
  audioDurationSeconds: number
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
  // Largo del guion en disco (script.txt), para estimar el costo de la voz
  // pendiente al reanudar sin volver a mandar el texto.
  scriptCharCount?: number
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
  pauseReason?: PauseReason
  hasVideo: boolean
  videoOutdated: boolean
  // Ausente = 16:9 (proyectos previos al selector de formato).
  videoFormat?: VideoFormat
  // Etiqueta del modelo que escribió los prompts, solo en la vía verbatim
  // (Mi estilo). Ausente = los escribió la casa y la tarjeta dice Vimo.
  promptModelLabel?: string
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
  // La descripción guardada todavía no se aplicó al imagePrompt: la próxima
  // regeneración lo reescribe (ver hasPendingUserPrompt).
  userPromptPending?: boolean
  imageModel?: string
  imageQuality?: string
  charactersPresent?: number[]
  imageMtimeMs?: number
  // Por qué la escena quedó sin prompt (rescate por el editor).
  promptFailure?: ScenePromptFailure
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
  staticTransitionIn?: boolean
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

export interface RegenerateSceneImagesPayload extends FlowRestartRequest {
  projectId: string
  // El clic del editor autoriza una intención idempotente, nunca un retry ciego.
  flowRegenerationRequestId?: string
  // Recuperación explícita: sólo recibo durable; nunca crea otra intención.
  flowRecoverOnly?: boolean
  // `rewritePrompt` = borrar el imagePrompt para que scene-prompts lo
  // reescriba (priorizando el userPrompt persistido); false = re-roll de la
  // imagen con el mismo prompt, SALVO que la escena tenga una descripción
  // pendiente de aplicar: ahí el sidecar reescribe igual.
  scenes: { id: number; rewritePrompt: boolean }[]
  // Override transitorio del proveedor SOLO para este job; no se persiste.
  imageProvider?: ImageProviderId
  executionPlan?: FlowToolsExecutionPlan
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
  // Omitido conserva el movimiento de la exportación anterior.
  imageMotion?: boolean
}

export interface ExportClipsResult {
  directory: string
  clipCount: number
}

export interface ProviderCreditsStatus {
  available: boolean
  remaining?: number
  // Plan sin tope (Evolink enterprise): `remaining` no significa nada.
  unlimited?: boolean
  currency?: string
  // Con available false: por qué (missing_api_key, fal_admin_key_required…).
  errorCode?: string
}

export interface ImageCreditsResult {
  fal: ProviderCreditsStatus
  evolink: ProviderCreditsStatus
}
