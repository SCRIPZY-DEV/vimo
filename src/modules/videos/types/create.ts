import type {
  ImagesRecoveryKind,
  RenderPhase,
} from '@pipeline/runner/events.ts'
import type { SceneAnimationProgress } from '@/modules/videos/types/library'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
import type {
  BgmMode,
  CharacterFrequency,
  NarrationMode,
  ProbeTtsReason,
} from '@pipeline/types/video-project.ts'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { VoiceProviderId, VoiceVendorId } from '@pipeline/types/voices.ts'
import type { PromptModelBlockReason } from '@/modules/common/types/promptModelBlocks'
import type { CreditsIssueView } from '@/modules/videos/types/credits'
import type {
  SelectedCustomStyle,
  StyleSource,
} from '@/modules/videos/types/styles'
import type { VoiceSettingsFormValue } from '@/modules/voices/types/voices'

export type CreateTaskStatus =
  'creating' | 'generating' | 'awaitingConfirmation' | 'completed' | 'error'

// Progreso de la síntesis de voz mientras corre la fase 1.
export interface VoiceProgressView {
  provider: VoiceProviderId
  totalChars: number
  elapsedSeconds: number
  percent: number | null
  // Parte en curso (1-based) y total cuando el sidecar troceó la narración.
  partIndex: number | null
  partTotal: number | null
}

// Progreso de la música de fondo generada con IA.
export interface BgmProgressView {
  percent: number
  status: string
  elapsedSeconds: number
}

export interface RenderProgressView {
  percent: number
  phase: RenderPhase
}

// Prompts que el modelo ya terminó de ESCRIBIR, contados sobre el stream
// (carril verbatim). Distinto de los persistidos (`hasPrompt` por escena):
// este se mueve durante la espera y evita que la barra salte de 0 a 100.
export interface PromptsWrittenView {
  ready: number
  total: number
}

// Pasada de recuperación de la fase images en curso: con `rewrite` los
// prompts de `sceneIds` se reescriben (la fila de prompts vuelve a «en
// curso»); con `retry` sus imágenes se re-generan. Distinto de
// `promptsWritten`: cuenta SOLO el subconjunto y muere con el job.
export interface ImagesRecoveryView {
  kind: ImagesRecoveryKind
  sceneIds: number[]
  pass: number
  maxPasses: number
  // Prompts reescritos según el stream del carril verbatim (0 en la casa,
  // donde el avance llega escena a escena por scene-prompt-ready).
  streamed: number
}

// Actividad de la fase de prompts mientras corre: cuándo arrancó y cuándo
// llegó el último avance (prompt listo o cifra del stream). El watchdog
// compara `lastProgressAt` con el reloj para detectar un modelo trabado.
export interface PromptsStageActivity {
  startedAt: number
  lastProgressAt: number
}

// El modelo de prompts dio problemas en ESTE job (ADR-0028): se trabó o
// devolvió errores. Abre el diálogo «seguir esperando / cambiar de modelo»;
// `snoozedUntil` lo silencia hasta esa marca (null = visible).
export interface PromptModelIssueView {
  reason: PromptModelBlockReason
  modelId: string
  snoozedUntil: number | null
}

// Transiciones del job por el modelo de prompts. `halting`: el modelo falló
// y el job se detiene a esperar la decisión de la persona (nada avanza ni se
// rellena). `cancelling` → `relaunching`: cambio de modelo, se cierra el job
// vivo y se relanza el mismo proyecto sin salir de la pantalla de progreso.
export type PromptModelSwitchPhase = 'halting' | 'cancelling' | 'relaunching'

// La pausa que abre el diálogo de confirmación de escenas.
export interface SceneConfirmationView {
  suggestedScenes: number
  audioDurationSeconds: number
  wordCount: number
  // Presente solo en el carril de segundos (estilo propio): el diálogo pasa
  // a modo slider con este valor vigente.
  secondsPerScene?: number
  animationMinutes?: number
}

// Lo que el usuario confirmó en el diálogo: el conteo clásico, o los
// segundos por escena del carril de estilo propio.
export type SceneCutChoice =
  { sceneCount: number } | { secondsPerScene: number }

// Escena tal como la ve la pantalla de progreso: la del contrato más el
// avance de su imagen mientras se genera (scene-image-progress; solo
// Evolink lo informa).
export type SceneView = SceneSummary & {
  imageProgress?: number
  animationActivity?: 'generating' | 'ready' | 'error'
  animationLeadId?: number
  animationProgress?: SceneAnimationProgress
}

// Una generación de video de punta a punta. Vive fuera de React (módulo
// store) porque el layout desmonta la vista al navegar y el job sigue
// corriendo; se persiste en localStorage porque el proyecto queda en disco y
// la pausa de confirmación puede resolverse tras reabrir la app.
export interface CreateTask {
  id: string
  jobId: string | null
  projectId: string
  projectName: string
  status: CreateTaskStatus
  // Fase en curso; null antes de arrancar o al terminar.
  stage: StageId | null
  completedStages: StageId[]
  scenes: SceneView[]
  audioDurationSeconds: number | null
  voiceProgress: VoiceProgressView | null
  bgmProgress: BgmProgressView | null
  renderProgress: RenderProgressView | null
  promptsWritten: PromptsWrittenView | null
  imagesRecovery: ImagesRecoveryView | null
  confirmation: SceneConfirmationView | null
  // Últimas líneas de log del sidecar (capadas).
  logs: string[]
  videoPath: string | null
  errorKey: string | null
  // Código crudo del fallo del pipeline (el mismo que project.json guarda en
  // metadata.errorCode); null si el error no vino de un job. Aditivo: las
  // tareas guardadas antes del campo lo restauran como null.
  errorCode: string | null
  startedAt: number
  // Cronómetro honesto (origen v1.1.0): el tiempo esperando a la persona no
  // cuenta. pausedAt marca la pausa en curso; pausedMs acumula las cerradas.
  pausedAt: number | null
  pausedMs: number
  // Congela el cronómetro al completar (la vista «Listo» muestra el total).
  finishedAt: number | null
  // Cuenta regresiva del reintento automático en curso; null = no hay.
  retry: RetryView | null
  // Reintentos automáticos ya consumidos (se agota en AUTO_RETRY_MAX_ATTEMPTS).
  retryAttempts: number
  // Formato del proyecto: la vista de progreso pinta la grilla sin refetch.
  videoFormat: VideoFormat
  // Cancelación pedida (origen v0.35.0): la tarea deja de mostrarse y solo
  // espera el cierre del job para liberar el turno; cancelar no es un error.
  cancelRequested: boolean
  // El proyecto usa un estilo propio (carril verbatim): ahí el modelo elegido
  // escribe los prompts y puede bloquearse (ADR-0028). Con estilo de Vimo no
  // hay modelo que vigilar.
  automaticAnimation?: boolean
  // Recibido del sidecar; puede atravesar una imagen heredada sin recortarla.
  animationEndSeconds?: number
  usesCustomStyle: boolean
  // Modelo de prompts RESUELTO (nunca null con estilo propio: el default de
  // la casa ya viene aplicado). Es el que se bloquea si falla.
  promptModel: string | null
  // Solo mientras corre la fase de prompts de un job vivo.
  promptsStageActivity: PromptsStageActivity | null
  promptModelIssue: PromptModelIssueView | null
  promptModelSwitch: PromptModelSwitchPhase | null
  // Proveedor de imagen y vendor de voz del proyecto: con un rechazo por
  // saldo la tarjeta sabe qué cuenta mostrar y a dónde mandar a recargar.
  imageProvider: ImageProviderId | null
  voiceVendor: VoiceVendorId | null
  // El job cayó por saldo agotado (ADR-0031). Sobrevive al reinicio: el
  // proyecto quedó pausado en disco por el mismo motivo.
  creditsIssue: CreditsIssueView | null
}

// Campos de CreateTask que gobiernan el cronómetro de la cabecera. El reloj
// depende solo de ellos: la tarea entera cambia de identidad con cada evento
// del sidecar y no sirve como dependencia de un intervalo.
export type CreateTaskTiming = Pick<
  CreateTask,
  'startedAt' | 'pausedAt' | 'pausedMs' | 'finishedAt'
>

// Semilla desde disco al reanudar un proyecto (origen: `hidratar`): la grilla
// y las fases aparecen ya hechas en vez de vacías hasta el primer evento.
export interface CreateTaskSeed {
  scenes: SceneSummary[]
  completedStages: StageId[]
  audioDurationSeconds: number | null
}

// Cómo se lanza (o reanuda) el pipeline de un proyecto que ya existe en disco.
export interface ProjectRunOptions {
  videoFormat?: VideoFormat
  // Estado en disco para sembrar la tarea (Library lo tiene a mano).
  seed?: CreateTaskSeed
  // Carril del proyecto y modelo resuelto (ver CreateTask): la vista los saca
  // de project.json al reanudar.
  automaticAnimation?: boolean
  usesCustomStyle?: boolean
  promptModel?: string | null
  imageProvider?: ImageProviderId | null
  voiceVendor?: VoiceVendorId | null
}

// Estado visible del reintento automático ante un fallo transitorio.
export interface RetryView {
  attempt: number
  maxAttempts: number
  secondsLeft: number
}

// Un personaje elegido en el formulario (hasta 2).
export interface SelectedCharacter {
  characterId: string
  name: string
  description: string
  // photo = su identidad es la foto de la biblioteca (referencia en todos los
  // estilos); text = su identidad es la descripción (ADR-0033).
  mode: 'photo' | 'text'
  // La ilustración con la que se lo dibuja en el formulario: su foto, la del
  // estilo actual o, si todavía no existe, cualquiera de las suyas. Nunca
  // viaja al proyecto — es solo para que la persona reconozca a quién eligió.
  portraitPath: string | null
}

// Voz elegida en el picker.
export interface SelectedVoice {
  provider: VoiceProviderId
  voiceId: string
  name: string
}

// Estado completo del formulario de creación.
export interface CreateFormValue {
  name: string
  narrationMode: NarrationMode
  script: string
  // Ruta del audio elegido con el dialog nativo (modo own-audio).
  narrationFilePath: string | null
  styleId: CharacterStyleId
  // Fuente del estilo: con 'custom', customStyle manda y styleId viaja como
  // 'normal' (el contrato del pipeline lo sigue validando).
  styleSource: StyleSource
  customStyle: SelectedCustomStyle | null
  // Modelo LLM del carril verbatim (solo viaja con estilo propio). null = el
  // de la casa; se siembra con la preferencia de Ajustes.
  promptModel: string | null
  // 0 = cantidad automática. Solo aplica con estilo de catálogo: con estilo
  // propio el corte va por duración de escena.
  sceneCount: number
  // Duración de cada escena en segundos (solo viaja con estilo propio). Se
  // siembra con la preferencia de Ajustes.
  secondsPerScene: number
  // Activa la animación del inicio del video; la selección técnica es interna.
  animateScenes: boolean
  animateWholeVideo: boolean
  animationMinutes: number
  imageProvider: ImageProviderId
  imageQuality: string
  voice: SelectedVoice | null
  voiceSettings: VoiceSettingsFormValue
  characters: SelectedCharacter[]
  // Personajes que una gema «genérico»/«sin personaje» retiró del formulario
  // (v1.31.2 del origen): vuelven solos cuando un estilo los acepta de nuevo.
  // No viajan en el payload.
  withdrawnCharacters: SelectedCharacter[]
  characterFrequency: CharacterFrequency
  useBgm: boolean
  bgmMode: BgmMode
  bgmUrl: string
  bgmPrompt: string
  bgmInstrumental: boolean
  useOverlay: boolean
  overlayUrl: string
  // Pausa para confirmar la CANTIDAD de escenas: la casilla del formulario,
  // que solo se muestra con estilo de catálogo. Se siembra con la preferencia
  // de Ajustes.
  confirmScenes: boolean
  // Pausa para elegir la DURACIÓN de cada escena (solo viaja con estilo
  // propio). No tiene casilla: es la preferencia «No preguntarme al generar»
  // de Ajustes, con la que se siembra, y el formulario no la toca.
  confirmSceneDuration: boolean
  // Quema el texto de cada escena abajo del video al renderizar.
  subtitles: boolean
  // Con false (default), al terminar la generación se va al editor y el
  // render se dispara desde ahí (ADR-0016).
  autoRender: boolean
  videoFormat: VideoFormat
}

// Resultado cacheado del probe de TTS (por proveedor + voz).
export interface ProbeCacheEntry {
  ok: boolean
  reason: ProbeTtsReason
  expiresAt: number
}

// Lo que formBlockers no puede derivar del formulario solo.
export interface FormBlockersContext {
  // Todos los modelos de prompts bloqueados (ADR-0028): con estilo propio no
  // hay quién escriba los prompts.
  promptModelsBlocked?: boolean
  // El fijo de la gema ya no está en la biblioteca (lo resuelve
  // useStyleCharacter contra el catálogo; acá se nombra en la lista de pasos).
  fixedCharacterMissing?: boolean
  animationKeyMissing?: boolean
}

// Cómo se arma el payload de create-video-project desde el formulario.
export interface CreateProjectPayloadOptions {
  // Modo demo (ADR-0029): el proyecto nace con options.demo y sin pausas.
  demo?: boolean
}
