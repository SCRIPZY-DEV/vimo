import type { VideoProviderId } from '../../types/video-provider.ts'
import { kieVideoProvider } from './kie.ts'
import { poyoVideoProvider } from './poyo.ts'
import type { VideoProvider } from './types.ts'

// Registro de proveedores de animación. Agregar uno es agregar un archivo y
// una línea acá, más su alta en los tres catálogos de claves. Mismo criterio
// que `IMAGE_LANES` con los carriles de imagen.
export const VIDEO_PROVIDERS: Record<VideoProviderId, VideoProvider> = {
  kie: kieVideoProvider,
  poyo: poyoVideoProvider,
}
