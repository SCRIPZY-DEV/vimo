import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/common/ui/dialog'
import { PAID_IMAGE_PROVIDERS } from '@/modules/videos/constants'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import type { PaidImageProviderId } from '@pipeline/types/image-provider.ts'
import type { FlowPaidCompletionButtonProps } from '@/modules/videos/types/flowPaidCompletion'

export function FlowPaidCompletionButton({
  count,
  format,
  onConfirm,
}: FlowPaidCompletionButtonProps) {
  const { t } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PaidImageProviderId | null>(null)
  const provider =
    selected && configuredProviders.has(selected)
      ? selected
      : preferredImageProvider(configuredProviders)
  const estimate = provider
    ? imageCostEstimate(provider, defaultQualityFor(provider, format), count)
    : null
  if (count < 1) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full rounded-xl">
          {t('extension.paidComplete')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('extension.paidComplete')}</DialogTitle>
          <DialogDescription>
            {t('extension.paidCompleteDescription', { count })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('extension.paidCompleteHint')}
        </p>
        {provider ? (
          <label className="space-y-2 text-sm">
            <span>{t('extension.paidProvider')}</span>
            <select
              className="w-full rounded-lg border border-border bg-background p-3"
              value={provider}
              onChange={(event) =>
                setSelected(event.target.value as PaidImageProviderId)
              }
            >
              {PAID_IMAGE_PROVIDERS.filter((option) =>
                configuredProviders.has(option.id),
              ).map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p role="alert">{t('extension.paidProviderRequired')}</p>
        )}
        {estimate && (
          <p className="text-sm">
            {t(
              estimate.unit === 'credits'
                ? 'extension.paidEstimateCredits'
                : 'extension.paidEstimateUsd',
              { amount: estimate.estimated.toFixed(2) },
            )}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!provider}
            onClick={() => {
              if (!provider) return
              setOpen(false)
              onConfirm(provider)
            }}
          >
            {t('extension.paidConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
