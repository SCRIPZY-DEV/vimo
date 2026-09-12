import type { ApiKeys } from '../../config/api-keys.ts'
import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import {
  sceneImageFile,
  isValidFile,
  type ProjectPaths,
} from '../../project/paths.ts'
import { downloadImage } from '../../providers/image/download.ts'
import type { ImageProviderId } from '../../types/image-provider.ts'
import type { Scene } from '../../types/scenes.ts'
import type { VideoFormat } from '../../types/video-format.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'

// Contrato común de los carriles de imagen (normal Fal/Evolink y personaje):
// eventos por escena, flags de regeneración y utilidades compartidas.

export interface ImageLaneEvents {
  onStarted(sceneId: number, attempt: number): void
  onReady(sceneId: number, imagePath: string): void
  // `code` es una clave estable (i18n), no texto user-facing; `detail` es
  // el motivo técnico del proveedor (status, mensaje) para diagnóstico.
  onFailed(sceneId: number, code: string, detail?: string): void
  onProgress(sceneId: number, percent: number, status: string): void
}

export interface ImageLaneOptions {
  paths: ProjectPaths
  signal: AbortSignal
  events: ImageLaneEvents
  // Ids que se regeneran aunque exista la imagen (saltea el cache por
  // archivo). El archivo viejo se conserva hasta que el nuevo sale OK.
  forceRegenerate: Set<number>
  // Ids donde el USUARIO pidió explícitamente OTRA imagen: lo ÚNICO que
  // bypasea la cosecha de una tarea ya pagada (llega con Library).
  explicitNewImage: Set<number>
  // El proyecto usa estilo propio (gema): el carril de personaje cambia la
  // nota que acompaña a la referencia (REFERENCE + escena + APPEARANCE LOCK)
  // en vez de la línea de identidad del catálogo. El carril normal lo ignora.
  customStyle: boolean
}

export interface LaneResult {
  scene: Scene
  imageReady: boolean
}

// Cache por archivo: una imagen válida en disco no se regenera (salvo forzada).
export async function cachedImagePath(
  scene: Scene,
  options: ImageLaneOptions,
): Promise<string | null> {
  if (options.forceRegenerate.has(scene.id)) return null
  const imagePath = sceneImageFile(options.paths, scene.id)
  return (await isValidFile(imagePath)) ? imagePath : null
}

export function sceneHasUsablePrompt(scene: Scene): boolean {
  return isValidPrompt(scene.imagePrompt)
}

// Descarga segura (magic bytes + content-type) con reintentos propios y
// escritura atómica. La tarea YA está completa y cobrada: un fallo acá
// reintenta la MISMA URL, jamás crea otra tarea.
export async function saveImageToFile(
  url: string,
  imagePath: string,
  signal: AbortSignal,
): Promise<void> {
  const image = await downloadImage(url, signal)
  await writeFileAtomic(imagePath, image.bytes)
}

// Hash FNV-1a del pedido exacto al proveedor: si cualquier campo que afecta
// el resultado cambia, la tarea vieja deja de aplicar.
export function hashImageRequest(request: {
  model: string
  prompt: string
  quality: string
  refs?: string[]
}): string {
  const text = `${request.model}|${request.quality}|${(request.refs ?? []).join(',')}|${request.prompt}`
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// ─── Contrato del carril normal (uno por proveedor de imagen) ───

// Resueltos por escena: la escena manda (una regeneración recuerda con qué se
// hizo) y si no trae nada caen las opciones del proyecto.
export interface SceneLaneInputs {
  apiKey: string
  qualityOption: string | undefined
  // Formato del proyecto: Fal corrige una opción horizontal colada en un
  // proyecto vertical; Evolink lo manda como `size`.
  format: VideoFormat
}

export interface ImageLane {
  id: ImageProviderId
  // Escenas en vuelo a la vez contra este proveedor.
  concurrency: number
  apiKeyOf(apiKeys: ApiKeys): string | undefined
  generateScene(
    scene: Scene,
    inputs: SceneLaneInputs,
    options: ImageLaneOptions,
  ): Promise<LaneResult>
}
