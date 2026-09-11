import type { DemoManifest } from '@pipeline/types/demo.ts'

// Lo que la puerta le entrega a Crear en el `state` del router (ADR-0029):
// el manifest ya listo, sin una segunda consulta al sidecar.
export interface CreateDemoNavigationState {
  demo: DemoManifest
}

// Fases de demo-prepare, tal como viajan en `progress.detail.phase`.
export type DemoPreparePhase = 'download' | 'install'

export interface DemoPrepareProgress {
  phase: DemoPreparePhase
  percent: number
}

export type DemoPrepareStatus = 'idle' | 'running' | 'done' | 'error'

export interface DemoPrepareView {
  status: DemoPrepareStatus
  progress: DemoPrepareProgress | null
  manifest: DemoManifest | null
  errorKey: string | null
}
