import { AVATAR_PROGRESS_TICK_MS } from '@/modules/videos/constants'
import { useNow } from '@/modules/videos/hooks/useNow'
import { avatarRenderPercent } from '@/modules/videos/utilities/avatarRenderPercent'
import type { SceneAvatarRendering } from '@/modules/videos/types/library'

// Porcentaje vivo del render de un avatar en curso. El reloj es el único
// sistema externo: un tick por segundo mientras haya render.
export function useAvatarRenderPercent(
  rendering: SceneAvatarRendering | undefined,
): number | undefined {
  const now = useNow(rendering !== undefined, AVATAR_PROGRESS_TICK_MS)

  if (!rendering) return undefined
  return avatarRenderPercent(rendering.startedAt, now)
}
