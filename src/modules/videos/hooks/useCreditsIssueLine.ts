import { useAvatarBalance } from '@/modules/avatars/hooks/useAvatarBalance'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { useVideoCredits } from '@/modules/common/hooks/useVideoCredits'
import { creditsIssueLine } from '@/modules/videos/utilities/creditsIssueLine'
import { useVoiceCredits } from '@/modules/voices/hooks/useVoiceCredits'
import type { CreditsIssueContext } from '@/modules/videos/types/credits'

interface UseCreditsIssueLineOptions {
  context: CreditsIssueContext
  // Cuánto falta por gastar en ese proveedor, si se pudo estimar.
  estimated?: number | null
}

// La fila del aviso de saldo para un rechazo: consulta solo la cuenta que
// rechazó (imagen, voz, animación o el avatar de HeyGen) y la compara con la
// estimación si la hay.
export function useCreditsIssueLine({
  context,
  estimated = null,
}: UseCreditsIssueLineOptions) {
  const image = useImageCredits({ enabled: context.domain === 'image' })
  const voice = useVoiceCredits({
    vendor: context.voiceVendor ?? 'dubvoice',
    enabled: context.domain === 'voice',
  })
  const video = useVideoCredits({ enabled: context.domain === 'animation' })
  const avatar = useAvatarBalance({ enabled: context.domain === 'avatar' })

  const line = creditsIssueLine(
    context,
    {
      image: image.credits,
      voice: voice.credits,
      video: video.credits,
      avatar: avatar.status,
    },
    estimated,
  )
  const refresh = () => {
    if (context.domain === 'image') image.refresh()
    if (context.domain === 'voice') voice.refresh()
    if (context.domain === 'animation') video.refresh()
    if (context.domain === 'avatar') avatar.refresh()
  }

  return {
    line,
    refresh,
    refreshing:
      image.isLoading ||
      image.isRefreshing ||
      voice.isLoading ||
      voice.isRefreshing ||
      video.isLoading ||
      video.isRefreshing ||
      avatar.loading ||
      avatar.refreshing,
  }
}
