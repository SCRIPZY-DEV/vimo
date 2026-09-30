import { VIDEO_PROVIDERS } from '@/modules/videos/constants'
import type { VideoProjectOptions } from '@pipeline/types/video-project.ts'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

// Proveedor con el que se anima la escena seleccionada, por prioridad: el
// elegido en el editor → el persistido en el proyecto → el primero con clave;
// siempre saltando los que el cortacircuitos tiene escondidos. Sin ninguno
// usable devuelve igual uno (el pedido, el del proyecto o el primero) para
// que el selector muestre algo y el panel explique por qué no se puede.
export function preferredVideoProvider(
  pending: VideoProviderId | null | undefined,
  configured: ReadonlySet<string>,
  blocked: ReadonlySet<VideoProviderId>,
  options: VideoProjectOptions | undefined,
): VideoProviderId {
  const usable = (
    id: VideoProviderId | null | undefined,
  ): id is VideoProviderId =>
    id !== null && id !== undefined && configured.has(id) && !blocked.has(id)

  if (usable(pending)) return pending
  if (usable(options?.videoProvider)) return options.videoProvider

  const first = VIDEO_PROVIDERS.map((provider) => provider.id).find(usable)
  if (first) return first

  return pending ?? options?.videoProvider ?? VIDEO_PROVIDERS[0].id
}
