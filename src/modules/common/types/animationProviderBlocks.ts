import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

// Un proveedor de animación que el sidecar dio por caído (ADR-0040): varios
// encargos seguidos fallaron por él. Vencido = ya no bloquea.
export interface AnimationProviderBlock {
  providerId: VideoProviderId
  // Código del fallo que lo tumbó, para poder explicarlo.
  code: string
  // Epoch ms.
  blockedUntil: number
}
