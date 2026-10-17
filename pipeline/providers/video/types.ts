import type { ApiKeys } from '../../config/api-keys.ts'
import type {
  AnimationResolution,
  VideoProviderId,
} from '../../types/video-provider.ts'

// Contrato común de los proveedores de imagen-a-video. Los dos son asíncronos
// con la misma forma que Evolink (crear tarea, consultar, descargar), así que
// el carril de animación no sabe con cuál está hablando.

export type VideoAspectRatio = '16:9' | '9:16'

export interface VideoClipRequest {
  prompt: string
  // Imágenes de escena, ya subidas al host del proveedor y en orden: la
  // primera es el fotograma de partida. Cuántas viajan lo decide `maxImages`.
  imageUrls: string[]
  durationSeconds: number
  aspectRatio: VideoAspectRatio
  // Kie la manda tal cual; PoYo la acepta pero sigue pidiendo 720p.
  resolution: AnimationResolution
}

export interface VideoClipResult {
  videoUrl: string
  // Créditos que el proveedor dice haber cobrado. Ausente si no lo informa.
  creditsConsumed?: number
}

export interface VideoTaskProgress {
  // Solo poyo informa avance real; con Kie queda indefinido y la app simula
  // el porcentaje a partir del tiempo transcurrido.
  percent?: number
  status: string
  elapsedSeconds: number
  // Los reintentos locales mantienen el clip visible sin anunciar un fallo final.
  attempt?: number
  maxAttempts?: number
  retryPhase?: 'prompt' | 'video' | 'upload'
}

// Lo que devuelve una verificación final de la tarea: terminada, fallida, o
// null si sigue viva o no se pudo consultar.
export interface VideoTaskCheck {
  result?: VideoClipResult
  error?: { code?: string; message?: string; creditsConsumed?: number }
}

export interface VideoProvider {
  id: VideoProviderId
  // Cuántas imágenes de escena acepta como referencia. Kie toma las dos
  // escenas que el clip cubre; poyo toma solo la primera, y la segunda se
  // describe dentro del prompt.
  maxImages: number
  // Tope de caracteres del prompt. Pasarse NO falla al crear: el proveedor
  // acepta la tarea y la mata después («The prompt is too long»), así que el
  // redactor escribe con este presupuesto y recorta antes de encargar.
  maxPromptChars: number
  apiKeyOf(apiKeys: ApiKeys): string | undefined
  // Sube una imagen local al host del proveedor y devuelve su URL pública.
  // Los dos borran el archivo a los pocos días: se sube en cada corrida.
  uploadImage(
    localPath: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<string>
  createTask(
    request: VideoClipRequest,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<string>
  pollTask(
    taskId: string,
    apiKey: string,
    signal: AbortSignal,
    onProgress?: (progress: VideoTaskProgress) => void,
  ): Promise<VideoClipResult>
  inspectTask(taskId: string, apiKey: string): Promise<VideoTaskCheck | null>
  // Saldo en créditos. Falla con un PipelineFailure clasificado (clave
  // inválida, red, proveedor caído): el subcomando de saldos lo vuelca como
  // errorCode y la UI distingue «sin configurar» de «no se pudo leer».
  credits(apiKey: string, signal: AbortSignal): Promise<number>
}
