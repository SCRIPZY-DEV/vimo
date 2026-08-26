import { useTranslation } from 'react-i18next'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import type {
  ImageCreditsResult,
  ProviderCreditsStatus,
} from '@pipeline/types/video-project.ts'

interface ImageCreditsSummaryProps {
  credits: ImageCreditsResult
}

// Saldo de cada proveedor de imagen en una línea («Fal: 120 créditos · …»).
export function ImageCreditsSummary({ credits }: ImageCreditsSummaryProps) {
  const { t } = useTranslation()

  const describe = (label: string, status: ProviderCreditsStatus) => {
    if (!status.available || status.remaining === undefined)
      return t('library.editor.panel.creditsUnavailable', { provider: label })
    return t('library.editor.panel.creditsRemaining', {
      provider: label,
      remaining: status.remaining,
    })
  }

  return (
    <p className="font-body text-[11px] text-muted-foreground">
      {IMAGE_PROVIDERS.map((provider) =>
        describe(provider.label, credits[provider.id]),
      ).join(' · ')}
    </p>
  )
}
