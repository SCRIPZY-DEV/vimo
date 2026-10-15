import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { DemoManifest, DemoStatusResult } from '@pipeline/types/demo.ts'

// Lo que la puerta le entrega a Crear en el `state` del router (ADR-0029):
// el manifest ya listo, sin una segunda consulta al sidecar.
export interface CreateDemoNavigationState {
  demo: DemoManifest
}

// Fases de demo-prepare, tal como viajan en `progress.detail.phase`.
export type DemoPreparePhase = 'download' | 'install'

export interface DemoPrepareProgress {
  // El avance total del pack por bytes (0–100).
  percent: number
  // La fase y la parte en curso (desde 1) de `parts`. En null mientras otro
  // demo-prepare instala: demo-status solo dice cuánto quedó bajado.
  phase: DemoPreparePhase | null
  part: number | null
  parts: number | null
}

// idle: sin job · running: el job de esta app baja o instala · waiting: otro
// demo-prepare tiene el candado (`demo_busy`), o el propio calló más que el
// perro guardián, y se espera mirando demo-status · done: la demo quedó lista
// · error: el intento terminó con un fallo.
export type DemoPrepareStatus =
  'idle' | 'running' | 'waiting' | 'done' | 'error'

export interface DemoPrepareSnapshot {
  status: DemoPrepareStatus
  progress: DemoPrepareProgress | null
  manifest: DemoManifest | null
  // El código del fallo; null también cuando el fallo no trae código.
  errorCode: string | null
  // Con `demo_disk_full`: el espacio libre que pide lo que falta, según
  // demo-status al fallar (null si no se pudo consultar).
  requiredFreeBytes: number | null
}

// Lo que el store de la descarga usa del sidecar: videosApi en la app, un
// doble en el guard.
export interface DemoPrepareApi {
  startDemoPrepare(
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle>
  demoStatus(): Promise<DemoStatusResult>
  errorCode(error: unknown): string | null
}

// Los tiempos del store de la descarga (constants.ts en la app; cortos en el
// guard).
export interface DemoPrepareTiming {
  // Cada cuánto se consulta demo-status mientras se espera a otro job.
  pollIntervalMs: number
  // Sin ningún evento del job por este tiempo, se da por mudo.
  silenceLimitMs: number
  // Una consulta de demo-status que no vuelve en este tiempo no cuenta.
  statusTimeoutMs: number
}

export interface DemoPrepareStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): DemoPrepareSnapshot
  start(): void
  reset(): void
}

// El aviso de un fallo de la puerta: su clave i18n y lo que interpola.
export interface DemoFailureMessage {
  key: string
  values?: Record<string, string>
}

// El fallo de la consulta de demo-status (null en `code` = sin código).
export interface DemoGateStatusError {
  code: string | null
}

export interface DemoGateInput {
  // Lo que respondió demo-status; null mientras se consulta o si falló.
  status: DemoStatusResult | null
  statusError: DemoGateStatusError | null
  job: DemoPrepareSnapshot
}

// Lo que muestra la puerta.
export type DemoGateScreen =
  // La demo está lista: se entra a Crear con su manifest.
  | { kind: 'enter'; manifest: DemoManifest }
  // Consultando demo-status.
  | { kind: 'checking' }
  // Sin pack ni avance: el tamaño y «Descargar la demo».
  | { kind: 'offer'; downloadBytes: number }
  // Con avance de otra sesión y sin job: la descarga sigue sola.
  | { kind: 'resume' }
  // El job de esta app baja o instala.
  | { kind: 'progress'; progress: DemoPrepareProgress | null }
  // Otro demo-prepare instala: se espera mirando demo-status.
  | { kind: 'waiting'; progress: DemoPrepareProgress | null }
  // Falló la descarga (`job`) o la consulta (`status`). `requiredFreeBytes`
  // solo con el disco lleno.
  | {
      kind: 'failed'
      source: 'job' | 'status'
      errorCode: string | null
      requiredFreeBytes: number | null
    }

// Lo que muestra la tarjeta: todo menos entrar, que navega.
export type DemoGateCardScreen = Exclude<DemoGateScreen, { kind: 'enter' }>

// Lo que hace Crear en demo con un pedido de estilo o de pestaña
// (utilities/demoForm.ts, spec demo v4 §2): el cambio que se aplica y si
// volvió a la gema del avatar en vez de lo pedido (el formulario lo avisa).
export interface DemoStyleRequestResult {
  patch: Partial<CreateFormValue>
  redirected: boolean
}
