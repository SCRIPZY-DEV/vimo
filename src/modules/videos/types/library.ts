import type { SceneImageStatus } from '@pipeline/types/scenes.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

// Tipos de las vistas de biblioteca (Library, Player, Progress, Editor).

// Estado que muestra la tarjeta/el player. `interrupted` no existe en disco:
// se deriva cuando un proyecto quedó `generating` sin ningún job vivo (el
// sidecar es un proceso por job — si la app murió, nadie lo normaliza).
export type ProjectBadge =
  | 'ready'
  | 'outdated'
  | 'generating'
  | 'awaitingConfirmation'
  | 'interrupted'
  | 'paused'
  | 'error'
  | 'draft'

// Una escena esperando regeneración. La cola se coalesce: UN job de regen
// por proyecto a la vez; lo encolado durante un job sale en el siguiente.
export interface RegenQueueEntry {
  id: number
  rewritePrompt: boolean
}

export interface EditorRenderState {
  jobId: string | null
  percent: number
  phase: string
}

export interface EditorExportState {
  jobId: string | null
  percent: number
}

// Estado del editor de UN proyecto: vive fuera de React (los jobs siguen al
// navegar) y NO se persiste — un job muere con la app y el detail refetchea
// la verdad del disco al volver.
export interface LibraryEditorTask {
  projectId: string
  regenQueue: RegenQueueEntry[]
  activeRegen: { jobId: string | null; sceneIds: number[] } | null
  // Override transitorio del proveedor para el próximo lote de regen.
  pendingImageProvider: ImageProviderId | null
  // Estados transitorios por escena (spinner de la cola y del job).
  sceneStatus: Record<number, SceneImageStatus>
  // Motivo (clave i18n) del último fallo por escena: sobrevive al cierre
  // del job y se borra al reintentar esa escena.
  sceneErrors: Record<number, string>
  // Cache-buster por escena: sube cuando llega una imagen nueva.
  sceneVersions: Record<number, number>
  render: EditorRenderState | null
  export: EditorExportState | null
  // Reemplazo de narración / música en curso (exclusión con regen/render).
  audioBusy: boolean
  errorKey: string | null
  // Sube al cerrar cada job: la vista invalida sus queries al verlo cambiar.
  revision: number
}
