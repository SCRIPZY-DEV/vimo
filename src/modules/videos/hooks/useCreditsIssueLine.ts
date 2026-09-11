import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { creditsIssueLine } from '@/modules/videos/utilities/creditsIssueLine'
import { useVoiceCredits } from '@/modules/voices/hooks/useVoiceCredits'
import type { CreditsIssueContext } from '@/modules/videos/types/credits'

interface UseCreditsIssueLineOptions {
  context: CreditsIssueContext
  // Cuánto falta por gastar en ese proveedor, si se pudo estimar.
  estimated?: number | null
}

// La fila del aviso de saldo para un rechazo: consulta solo la cuenta que
// rechazó (imagen o voz) y la compara con la estimación si la hay.
export function useCreditsIssueLine({
  context,
  estimated = null,
}: UseCreditsIssueLineOptions) {
  const image = useImageCredits({ enabled: context.domain === 'image' })
  const voice = useVoiceCredits({
    vendor: context.voiceVendor ?? 'dubvoice',
    enabled: context.domain === 'voice',
  })

  const line = creditsIssueLine(
    context,
    { image: image.credits, voice: voice.credits },
    estimated,
  )
  const refresh = () => {
    if (context.domain === 'image') image.refresh()
    if (context.domain === 'voice') voice.refresh()
  }

  return {
    line,
    refresh,
    refreshing:
      image.isLoading ||
      image.isRefreshing ||
      voice.isLoading ||
      voice.isRefreshing,
  }
}
