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
  downloading: 'downloading',
  installing: 'installing',
  error: 'error',
} as const

export type UpdatePhase = (typeof UpdatePhase)[keyof typeof UpdatePhase]

// Etapa de la mutación de instalar: primero baja el paquete, después lo instala.
export const UpdateInstallStage = {
  downloading: 'downloading',
  installing: 'installing',
} as const

export type UpdateInstallStage =
  (typeof UpdateInstallStage)[keyof typeof UpdateInstallStage]

// Dónde corre la app, según Rust (get_update_install_location). Solo
// `installable` permite que el updater reemplace la app.
export const UpdateInstallLocation = {
  installable: 'installable',
  // macOS la ejecuta desde una copia de solo lectura (no se movió a Aplicaciones).
  translocated: 'translocated',
  // Corre desde /Volumes: el DMG montado o un disco externo.
  externalVolume: 'externalVolume',
} as const

export type UpdateInstallLocation =
  (typeof UpdateInstallLocation)[keyof typeof UpdateInstallLocation]

// Causa de un fallo al instalar, clasificada desde el texto del error.
export const UpdateInstallFailure = {
  readOnlyLocation: 'readOnlyLocation',
  permissionDenied: 'permissionDenied',
  installerBlocked: 'installerBlocked',
  network: 'network',
  signature: 'signature',
  jobRunning: 'jobRunning',
  unknown: 'unknown',
} as const

export type UpdateInstallFailure =
  (typeof UpdateInstallFailure)[keyof typeof UpdateInstallFailure]

export interface UpdateInstallFailureReport {
  failure: UpdateInstallFailure
  // Texto crudo del error, para soporte.
  detail: string
}

export interface AppUpdateContextValue {
  isNative: boolean
  phase: UpdatePhase
  update: AppUpdateInfo | null
  progress: UpdateDownloadProgress | null
  // 0 mientras no se conoce el tamaño total.
  progressPercent: number
  // «Más tarde» en el aviso: se oculta hasta el próximo chequeo manual.
  dismissed: boolean
  // false cuando la app corre desde un lugar que el updater no puede reemplazar.
  canInstallInPlace: boolean
  // Último fallo al instalar; null si no hubo o si se reintentó.
  installFailure: UpdateInstallFailureReport | null
  downloadInstaller: () => void
  checkNow: () => void
  install: () => void
  dismiss: () => void
}
