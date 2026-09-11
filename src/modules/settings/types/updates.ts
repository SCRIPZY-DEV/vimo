import type { check } from '@tauri-apps/plugin-updater'

// Handle del update que devuelve el plugin: es un recurso de Rust y solo lo
// retiene el `api/`; el resto del módulo ve AppUpdateInfo.
export type PendingUpdate = NonNullable<Awaited<ReturnType<typeof check>>>

// Lo que latest.json anuncia y la UI muestra antes de instalar.
export interface AppUpdateInfo {
  version: string
  currentVersion: string
  // Cuerpo de `notes` del manifiesto; null cuando la release no trae notas.
  notes: string | null
  // `pub_date` del manifiesto en ISO; null si falta.
  date: string | null
}

export interface UpdateDownloadProgress {
  downloadedBytes: number
  // null cuando el servidor no manda Content-Length.
  totalBytes: number | null
}

export const UpdatePhase = {
  // Web: no hay updater.
  unavailable: 'unavailable',
  idle: 'idle',
  checking: 'checking',
  upToDate: 'upToDate',
  available: 'available',
  installing: 'installing',
  error: 'error',
} as const

export type UpdatePhase = (typeof UpdatePhase)[keyof typeof UpdatePhase]

export interface AppUpdateContextValue {
  isNative: boolean
  phase: UpdatePhase
  update: AppUpdateInfo | null
  progress: UpdateDownloadProgress | null
  // 0 mientras no se conoce el tamaño total.
  progressPercent: number
  // «Más tarde» en el aviso: se oculta hasta el próximo chequeo manual.
  dismissed: boolean
  checkNow: () => void
  install: () => void
  dismiss: () => void
}
