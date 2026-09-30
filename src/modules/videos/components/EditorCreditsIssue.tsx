import { apiKeysApi } from '@/modules/api-keys/api'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { useCreditsIssueLine } from '@/modules/videos/hooks/useCreditsIssueLine'
import { creditsDomainOf } from '@/modules/videos/utilities/creditsDomainOf'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

interface EditorCreditsIssueProps {
  // Código de saldo agotado del último job del editor (regen o animación).
  code: string
  imageProvider: ImageProviderId
  videoProvider: VideoProviderId
}

// Un job del editor cayó por saldo (ADR-0031): la alerta de la cuenta que
// rechazó, con su saldo leído y el botón de recarga. Contenedor chico y
// dueño de su consulta: solo pide el saldo del dominio que rechazó.
export function EditorCreditsIssue({
  code,
  imageProvider,
  videoProvider,
}: EditorCreditsIssueProps) {
  const domain = creditsDomainOf(code) ?? 'image'
  const issue = useCreditsIssueLine({
    context: { domain, imageProvider, voiceVendor: null, videoProvider },
  })

  // Con saldo leído e insuficiente bloquea (tono de peligro); con saldo
  // ilegible o ya recargado la fila se muestra igual, como información: el
  // job cayó por saldo y la persona tiene que saber de qué cuenta.
  return (
    <InsufficientCreditsAlert
      lines={[issue.line]}
      blocking={issue.line.sufficient === false}
      onReload={(providerId) => void apiKeysApi.openBillingPage(providerId)}
      onRefresh={issue.refresh}
      refreshing={issue.refreshing}
    />
  )
}
