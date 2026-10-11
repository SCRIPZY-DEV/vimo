import type {
  AwaitingSceneConfirmationEvent,
  ImagesRecoveryKind,
  PipelineEventPayload,
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
import type { AvatarLookType, AvatarSummary } from '@pipeline/types/avatar.ts'
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
  // Dónde sale el avatar (spec §6.1): la pausa lo dice en una línea. Cambiar
  // la cantidad o los segundos solo reparte las escenas libres. Ausente sin
  // avatar; vacío si ninguna aparición entró en la narración.
  avatarSpans?: AvatarSpanView[]
  // Cuántas apariciones pedidas no entraron (`avatar-planned`, o el estado
  // rearmado desde el disco).
  avatarDropped?: number
  // El tipo del look elegido: con su tarifa, la línea suma lo que cobra HeyGen
  // por esos tramos (la cifra real, no la de Crear).
  avatarLookType?: AvatarLookType
}

// La cuenta del diálogo de cantidad con avatar (countStepSceneEstimate): las
// escenas que deja el corte con la cantidad tecleada, cuántas llevan imagen
// (las apariciones no) y la mínima posible con esos tramos.
export interface CountStepEstimate {
  total: number
  images: number
  minimum: number
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
  // El render de HeyGen de esta escena de avatar en ESTA corrida (spec §3.3:
  // memoria, no disco); no sobrevive al reinicio.
  avatarActivity?: AvatarSceneActivity
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
  // El proyecto pidió avatar presentador (options.avatar): la fila «Avatar»
  // de las fases aparece desde el arranque. Aditivo: las tareas guardadas
  // antes lo derivan de sus escenas (taskHasAvatar).
  hasAvatar?: boolean
  // Apariciones que no entraron en la narración (`avatar-planned`).
  avatarDropped?: number
  // Tipo del look del avatar pedido (options.avatar): la tarifa del costo real
  // en la pausa de escenas.
  avatarLookType?: AvatarLookType
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
  // El proyecto tiene avatar presentador (de project.json al reanudar).
  hasAvatar?: boolean
  avatarLookType?: AvatarLookType
  // Apariciones que no entraron, del estado rearmado desde el disco: la nota
  // del progreso aparece aunque la corrida no vuelva a cortar.
  avatarDropped?: number
}

// Estado visible del reintento automático ante un fallo transitorio.
export interface RetryView {
  attempt: number
  maxAttempts: number
  secondsLeft: number
}

// Fase del render de una escena de avatar que informa el sidecar
// (`avatar-scene-progress`, ADR-0057 §8).
export type AvatarRenderPhase = Extract<
  PipelineEventPayload,
  { type: 'avatar-scene-progress' }
>['phase']

// El render de HeyGen de una escena de avatar en esta corrida. El tiempo que
// informa el sidecar llega con cada consulta a HeyGen (cada 5 a 20 s); el
// panel suma el reloj local desde `receivedAt` para que nada parezca colgado.
export interface AvatarSceneActivity {
  status: 'generating' | 'ready' | 'failed'
  phase: AvatarRenderPhase | null
  elapsedSeconds: number
  receivedAt: number
  // El `avatar_*` con el que falló, para el motivo.
  code?: string
}

// Un tramo de avatar en la pausa de confirmación de escenas (spec §6.1).
export type AvatarSpanView = NonNullable<
  AwaitingSceneConfirmationEvent['avatarSpans']
>[number]

// El mensaje de la cabecera de un fallo: su clave i18n y, si la clave tiene
// plural, cuántas cosas cuenta (failureMessageOf).
export interface FailureMessage {
  key: string
  count?: number
}

// Clases de la fila de la fase en curso en la pantalla de progreso.
export interface StageToneClasses {
  row: string
  badge: string
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

// El avatar presentador elegido en el formulario (spec §9, con el cambio de
// dirección del dueño del 2026-10-10): un avatar de la biblioteca y UNO de sus
// looks —el escenario con el que sale, por defecto el principal—, ya
// comprobado contra el motor de Vimo y la orientación del formato del video
// (utilities/selectableAvatar.ts). Lo que viaja en `options.avatar` sale de
// acá; `name` es solo para la persona.
export interface SelectedAvatar {
  // Id en la biblioteca: create-video-project lo valida y copia la vista
  // previa de ESTE look al proyecto (spec §6.2 y §16).
  id: string
  name: string
  lookId: string
  lookName: string
  lookType: AvatarLookType
}

// Si un avatar de la biblioteca sirve para un video en este formato y, si
// no, por qué: entrena, falló o no tiene ningún look listo con Avatar III en
// la orientación del formato.
export type AvatarUsability = 'usable' | 'training' | 'failed' | 'noLook'

// Lo que Crear lee de la biblioteca de avatares para validar la elección del
// formulario (useAvatars): la lista, si todavía carga y si no se pudo leer.
export interface AvatarLibraryRead {
  entries: AvatarSummary[]
  isLoading: boolean
  errorKey: string | null
}

// Voz elegida en el picker.
export interface SelectedVoice {
  provider: VoiceProviderId
  voiceId: string
  name: string
}

// Por qué carril sale el video (utilities/formLane.ts): el catálogo viejo (5
// estilos por `options.styleId`), una gema del catálogo nuevo (Entrega 2, por
// el carril de Mi estilo con su `catalogStyleId`) o una gema de Mi estilo.
export type FormLane = 'legacy-catalog' | 'catalog-gem' | 'custom'

// Las dos selecciones de estilo después de cambiar de pestaña con el catálogo
// nuevo (utilities/formLane.ts): la que queda en uso en la pestaña de destino
// y la que se guarda para la otra.
export interface TabSwitchSelection {
  customStyle: SelectedCustomStyle | null
  otherTabStyle: SelectedCustomStyle | null
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
  // Avatar presentador (ADR-0057, spec §9): el interruptor de la tarjeta, el
  // avatar y el look elegidos (null = ninguno todavía) y cuántas veces y
  // cuánto sale. Con el interruptor apagado no viaja nada; la elección se
  // conserva para volver a encenderlo. Sin selector de motor: es
  // AVATAR_DEFAULT_ENGINE.
  useAvatar: boolean
  avatar: SelectedAvatar | null
  avatarAppearances: number
  avatarSecondsPerAppearance: number
  // La primera aparición abre el video.
  avatarStartsVideo: boolean
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
  // Todos los modelos de prompts bloqueados (ADR-0028): con estilo propio (o
  // uno del catálogo nuevo) no hay quién escriba los prompts.
  promptModelsBlocked?: boolean
  // El catálogo nuevo está activo (interruptor `newCatalog` encendido y fuera
  // de la demo, plan E2 P5): la pestaña Catálogo pide elegir una tarjeta.
  newCatalog?: boolean
  // El fijo de la gema ya no está en la biblioteca (lo resuelve
  // useStyleCharacter contra el catálogo; acá se nombra en la lista de pasos).
  fixedCharacterMissing?: boolean
  animationKeyMissing?: boolean
  // El avatar o el look elegidos ya no sirven: se fueron de la biblioteca,
  // perdieron Avatar III o no tienen la orientación del formato del video
  // (selectedAvatarUnavailable, contra la lista). Sin clave de HeyGen no hay
  // bloqueo: el formulario ya llega con el avatar apagado (withAvatarKey).
  avatarUnavailable?: boolean
}

// Cómo se arma el payload de create-video-project desde el formulario.
export interface CreateProjectPayloadOptions {
  // Modo demo (ADR-0029): el proyecto nace con options.demo y sin pausas.
  demo?: boolean
}
