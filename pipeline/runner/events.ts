import type { JsonValue } from '../types/json.ts'
import type { SceneAnimationView } from '../types/animation.ts'
import type { SceneSummary } from '../types/scenes.ts'
import type { VideoProviderId } from '../types/video-provider.ts'
import type { VoiceProviderId } from '../types/voices.ts'
import type { StageId } from './stage-id.ts'

// Contrato de salida del sidecar (ADR-0010): cada evento es una línea NDJSON
// por stdout. Rust las parsea y las reenvía por el Channel del invoke que
// lanzó el job. src/ consume estos tipos SOLO con `import type`.

export interface JobStartedEvent {
  type: 'job-started'
}

export interface StageStartedEvent {
  type: 'stage-started'
  stageId: StageId
}

export interface StageSkippedEvent {
  type: 'stage-skipped'
  stageId: StageId
}

export interface StageCompletedEvent {
  type: 'stage-completed'
  stageId: StageId
}

export interface ProgressEvent {
  type: 'progress'
  stageId?: StageId
  percent?: number
  message?: string
  // Datos extra propios de la tarea (p. ej. créditos estimados de música).
  detail?: JsonValue
}

export interface LogEvent {
  type: 'log'
  level: 'info' | 'warn' | 'error'
  message: string
}

// ─── Eventos del pipeline de video (Create, ADR-0013) ───
// Espejo tipado de los eventos del origen: eventos propios en vez de
// `progress.detail` para que el switch de la UI sea legible y los shapes
// viajen por `import type` sin casts.

// Las escenas quedaron definidas (tras los cortes, Fase 3).
export interface ScenesPlannedEvent {
  type: 'scenes-planned'
  scenes: SceneSummary[]
  audioDurationSeconds: number
  // Fin real de la animación automática; no modifica los cortes de imágenes.
  animationEndSeconds?: number
}

// Una escena ya tiene su prompt de imagen (Fase 4, incremental).
export interface ScenePromptReadyEvent {
  type: 'scene-prompt-ready'
  scene: SceneSummary
}

// Avance del redactor mientras ESCRIBE (Fase 4, carril verbatim): cifras
// absolutas del stream, no incrementos — un evento perdido no descuadra.
// Espejo de `prompts-progreso` del origen; es lo que hace que la barra
// avance en vez de saltar de 0 a 100 cuando el lote termina.
export interface ScenePromptsProgressEvent {
  type: 'scene-prompts-progress'
  ready: number
  total: number
}

// El modelo ELEGIDO del carril verbatim (Fase 4, Mi estilo) falló de verdad:
// agotó los reintentos de un lote con un código del proveedor, o dejó escenas
// tercas que pasan a la ronda de rescate con otro modelo (`llm_rescue_needed`).
// Los reintentos internos y la ronda de rescate NO lo emiten. La UI lo usa
// para bloquear ese modelo un rato y ofrecer cambiarlo; nunca detiene el job.
export interface PromptModelTroubleEvent {
  type: 'prompt-model-trouble'
  modelId: string
  code: string
  sceneIds: number[]
}

export type ImagesRecoveryKind = 'rewrite' | 'retry'

// Pasada de recuperación de la fase images (Fase 5). `rewrite`: se están
// reescribiendo los prompts de `sceneIds` (rechazadas por contenido o sin
// prompt válido) — la UI devuelve la fila de prompts a «en curso» sin que la
// fase se reabra en el runner. `retry`: se re-generan las imágenes de
// `sceneIds`; llega siempre, haya habido reescritura o no, y cierra el
// `rewrite` anterior. Cifras absolutas e idempotentes: describe el estado, no
// un delta. Cada prompt reescrito viaja además como `scene-prompt-ready`.
export interface ImagesRecoveryPassEvent {
  type: 'images-recovery-pass'
  kind: ImagesRecoveryKind
  sceneIds: number[]
  pass: number
  maxPasses: number
}

export interface SceneImageStartedEvent {
  type: 'scene-image-started'
  sceneId: number
}

export interface SceneImageReadyEvent {
  type: 'scene-image-ready'
  sceneId: number
  // Ruta absoluta; la UI la muestra vía convertFileSrc().
  imagePath: string
}

export interface SceneImageFailedEvent {
  type: 'scene-image-failed'
  sceneId: number
  // Clave estable para i18n, como el code de job-failed.
  code: string
  // Detalle técnico del proveedor (status HTTP, mensaje): para diagnóstico,
  // nunca se muestra crudo al usuario.
  detail?: string
}

// Progreso de una imagen en curso (solo Evolink informa avance).
export interface SceneImageProgressEvent {
  type: 'scene-image-progress'
  sceneId: number
  percent: number
  status: string
}

// ─── Eventos de la animación de escenas (ADR-0047, `animate-scenes`) ───
// Espejo de los eventos de imagen: `sceneId` es siempre la escena que
// ENCABEZA el clip; `sceneIds` son todas las que cubre, para que la UI pinte
// el bloque entero y no solo la marcada.

export interface SceneAnimationStartedEvent {
  type: 'scene-animation-started'
  sceneId: number
  sceneIds: number[]
  attempt: number
  animationId?: string
  startSeconds?: number
  endSeconds?: number
}

// Progreso de un clip en curso. Solo PoYo informa porcentaje; con Kie viaja
// el estado y el tiempo transcurrido, y la UI simula el avance por tiempo.
export interface SceneAnimationProgressEvent {
  type: 'scene-animation-progress'
  sceneId: number
  percent?: number
  status: string
  elapsedSeconds: number
  attempt?: number
  maxAttempts?: number
  retryPhase?: 'prompt' | 'video' | 'upload'
}

export interface SceneAnimationReadyEvent {
  type: 'scene-animation-ready'
  sceneId: number
  sceneIds: number[]
  // Ruta absoluta; la UI la muestra vía convertFileSrc().
  clipPath: string
  // Lo que el proveedor dice haber cobrado por este clip, si lo informa.
  creditsConsumed?: number
  animation?: SceneAnimationView
}

export interface SceneAnimationFailedEvent {
  type: 'scene-animation-failed'
  sceneId: number
  // Clave estable para i18n, como el code de job-failed.
  code: string
  // Detalle técnico del proveedor: es lo que el modal de fallo muestra como
  // «por qué», además del mensaje traducido.
  detail?: string
}

// El proveedor de animación está caído o degradado: varios encargos seguidos
// fallaron por él (nunca por saldo, validación o moderación). El job sigue
// con lo que pueda; la UI esconde ese proveedor un rato y ofrece el otro.
export interface AnimationProviderTroubleEvent {
  type: 'animation-provider-trouble'
  provider: VideoProviderId
  code: string
}

// Progreso de la síntesis de voz. Sin `percent` real (Minimax/Edge no lo
// informan) la UI dibuja su curva sintética desde elapsedSeconds. Con texto
// troceado viajan la parte en curso (1-based) y el total, y `percent` es el
// agregado de todas las partes.
export interface VoiceProgressEvent {
  type: 'voice-progress'
  provider: VoiceProviderId
  totalChars: number
  elapsedSeconds: number
  percent?: number
  partIndex?: number
  partTotal?: number
}

// Progreso de la música de fondo generada con IA (Evolink/Suno).
export interface BgmProgressEvent {
  type: 'bgm-progress'
  percent: number
  status: string
  elapsedSeconds: number
}

export type RenderPhase = 'chunks' | 'concat' | 'final'

export interface RenderProgressEvent {
  type: 'render-progress'
  percent: number
  phase: RenderPhase
}

// Un tramo del video en segundos: dónde aparece el avatar en la pausa de
// confirmación (ADR-0057).
export interface AvatarSpanWindow {
  startSeconds: number
  endSeconds: number
}

// Pausa de confirmación (Fase 3): el job cierra LIMPIO después de esto —
// no es un completado; la UI muestra el diálogo y relanza tras
// confirm-scenes (semántica del origen, fuente histórica de bugs).
export interface AwaitingSceneConfirmationEvent {
  type: 'awaiting-scene-confirmation'
  suggestedScenes: number
  audioDurationSeconds: number
  wordCount: number
  // Presente solo en el carril de segundos (estilo propio): el diálogo pasa
  // a modo slider y `suggestedScenes` es el conteo que sale de ESTE valor.
  secondsPerScene?: number
  // El prefijo usa cortes fijos; el slider solo modifica el tramo restante.
  animationMinutes?: number
  // Solo con avatar (ADR-0057): dónde aparece, ya ajustado a frases y con los
  // tramos libres cortos absorbidos. Confirmar otra cantidad o duración solo
  // reparte las escenas libres: estos tramos no se mueven. Vacío si ninguna
  // aparición entró en el audio.
  avatarSpans?: AvatarSpanWindow[]
}

// ─── Eventos del avatar presentador (ADR-0057, diseño §8) ───
// `scene-cuts` emite `avatar-planned`; la fase `avatar` y el comando
// `avatar-render-scenes`, el resto. `sceneId` es siempre una escena de avatar
// (una aparición), y viaja suelto aunque haya un objeto: el log de
// diagnóstico (ADR-0038) descarta los objetos.

// El avatar quedó planificado en el corte: qué escenas son de avatar y
// cuántas apariciones pedidas no entraron en el audio (no es un fallo; la UI
// lo cuenta y lo toma como un valor, no lo suma). `scene-cuts` lo emite una
// vez por corrida: con «Confirmar escenas», ANTES de
// `awaiting-scene-confirmation` (las escenas del corte sugerido y las
// descartadas del plan), y otra vez en el job que corta o reusa el corte, con
// sus escenas y las pedidas que le faltan a ese corte.
export interface AvatarPlannedEvent {
  type: 'avatar-planned'
  sceneIds: number[]
  dropped: number
}

// Empezó el render de una aparición: la UI arranca su reloj (HeyGen tarda
// minutos y la barra no puede parecer colgada).
export interface AvatarSceneStartedEvent {
  type: 'avatar-scene-started'
  sceneId: number
}

// El paso del carril en el que va una aparición (diseño §7.2): el audio
// cortado, las subidas, el render en HeyGen, la descarga y la normalización.
// Desde la entrega 2h (diseño §24.3) `render` quiere decir «HeyGen aceptó el
// render»: la aparición ya está cobrada. Hasta que HeyGen responde, el pedido
// va en `upload` (también al repetir uno sin respuesta o al reusar el audio, y
// mientras espera a una cuenta llena). La app cuenta como cobradas las que
// llegaron a `render`, `download` o `normalize` (`AVATAR_CHARGED_PHASES`) para
// avisar antes de cancelar: emitir `render` antes de que HeyGen acepte haría
// que el aviso contara como cobrado algo que no se cobró. El carril no repite
// la misma fase dos veces seguidas.
export type AvatarScenePhase =
  'audio' | 'upload' | 'render' | 'download' | 'normalize'

export interface AvatarSceneProgressEvent {
  type: 'avatar-scene-progress'
  sceneId: number
  phase: AvatarScenePhase
  elapsedSeconds: number
}

// La aparición quedó lista: `scene` trae su resumen con la vista del avatar
// (el clip y su estado).
export interface AvatarSceneReadyEvent {
  type: 'avatar-scene-ready'
  sceneId: number
  scene: SceneSummary
}

export interface AvatarSceneFailedEvent {
  type: 'avatar-scene-failed'
  sceneId: number
  // Clave estable para i18n (avatar_*, en create.errors.*), como el code de
  // job-failed.
  code: string
}

// HeyGen está caído o degradado (red, 5xx o 429 que no ceden): el job sigue
// con lo que pueda y la UI lo avisa. `httpStatus` solo viaja cuando hubo una
// respuesta HTTP real (una caída de red no tiene).
export interface AvatarProviderTroubleEvent {
  type: 'avatar-provider-trouble'
  code: string
  httpStatus?: number
}

export interface JobCompletedEvent {
  type: 'job-completed'
  result: JsonValue | null
}

export interface JobFailedEvent {
  type: 'job-failed'
  // Clave estable para i18n; `cancelled` marca una cancelación pedida. Este
  // evento también lo manda Rust (no el sidecar) cuando el proceso termina sin
  // job-completed ni job-failed —un crash, falta de memoria, un kill—: con
  // `sidecar_exited`, o con `cancelled` si se había pedido la cancelación, y
  // el código de salida o la señal en `message` (ADR-0010, enmienda
  // 2026-10-15). Así todo job termina en uno de los dos eventos terminales.
  code: string
  message: string
  // Proveedor externo y status HTTP del fallo, cuando el error los trae
  // (PipelineFailure con detalles): el log de diagnóstico (ADR-0038) los
  // registra; la UI no los usa.
  provider?: string
  httpStatus?: number
  // Id de la tarea asíncrona del proveedor (DubVoice), cuando el fallo lo trae.
  taskId?: string
}

// Fallo de un proveedor externo en el camino: se emite en cada reintento o
// fallback para que el log de diagnóstico (ADR-0038) lo vea aunque el job
// termine bien. `recovered: true` = el pipeline reintenta o cae a otro carril.
export interface ProviderFailureEvent {
  type: 'provider-failure'
  provider: string
  code: string
  httpStatus?: number
  attempt?: number
  maxAttempts?: number
  recovered: boolean
  stageId?: StageId
  sceneId?: number
  // Id de la tarea asíncrona del proveedor (DubVoice), para reclamarle.
  taskId?: string
  // Motivo técnico, ≤ 300 caracteres; Rust lo redacta antes de subirlo.
  detail?: string
}

export type PipelineEventPayload =
  | JobStartedEvent
  | StageStartedEvent
  | StageSkippedEvent
  | StageCompletedEvent
  | ProgressEvent
  | LogEvent
  | ScenesPlannedEvent
  | ScenePromptReadyEvent
  | ScenePromptsProgressEvent
  | PromptModelTroubleEvent
  | ImagesRecoveryPassEvent
  | SceneImageStartedEvent
  | SceneImageReadyEvent
  | SceneImageFailedEvent
  | SceneImageProgressEvent
  | SceneAnimationStartedEvent
  | SceneAnimationProgressEvent
  | SceneAnimationReadyEvent
  | SceneAnimationFailedEvent
  | AnimationProviderTroubleEvent
  | VoiceProgressEvent
  | BgmProgressEvent
  | RenderProgressEvent
  | AwaitingSceneConfirmationEvent
  | AvatarPlannedEvent
  | AvatarSceneStartedEvent
  | AvatarSceneProgressEvent
  | AvatarSceneReadyEvent
  | AvatarSceneFailedEvent
  | AvatarProviderTroubleEvent
  | JobCompletedEvent
  | JobFailedEvent
  | ProviderFailureEvent

// Lo que viaja de verdad por el canal: el payload sellado con el id del job.
export type PipelineEvent = PipelineEventPayload & { jobId: string }
