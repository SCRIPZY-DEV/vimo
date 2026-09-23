import { useSyncExternalStore } from 'react'
import {
  getAnimationProviderBlocksSnapshot,
  subscribeAnimationProviderBlocks,
  unblockAnimationProvider,
} from '@/modules/common/utilities/animationProviderBlocks'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

// Los proveedores de animación bloqueados ahora mismo (ADR-0040).
// Configuración global: se lee directo desde el componente que lo necesita.
// El snapshot ya viene sin vencidos (el store los purga con un timer).
export function useAnimationProviderBlocks() {
  const blocks = useSyncExternalStore(
    subscribeAnimationProviderBlocks,
    getAnimationProviderBlocksSnapshot,
  )
  const blockedIds = new Set<VideoProviderId>(
    blocks.map((block) => block.providerId),
  )

  return {
    blocks,
    blockedIds,
    isBlocked: (providerId: VideoProviderId) => blockedIds.has(providerId),
    blockedUntil: (providerId: VideoProviderId): number | null =>
      blocks.find((block) => block.providerId === providerId)?.blockedUntil ??
      null,
    unblock: unblockAnimationProvider,
  }
}
