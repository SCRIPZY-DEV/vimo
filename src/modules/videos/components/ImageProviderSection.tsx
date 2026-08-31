import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { ImageCreditsBadges } from '@/modules/videos/components/ImageCreditsBadges'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import { useImageCredits } from '@/modules/videos/hooks/useImageCredits'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import {
  defaultQualityFor,
  qualityOptionsFor,
} from '@/modules/videos/utilities/imageQuality'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface ImageProviderSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function ImageProviderSection({
  value,
  disabled,
  onChange,
}: ImageProviderSectionProps) {
  const { t } = useTranslation()
  const { credits, isLoading, refresh } = useImageCredits()

  const qualityOptions = qualityOptionsFor(value.imageProvider)
  const hintKey =
    value.imageProvider === 'fal'
      ? 'create.image.falHint'
      : 'create.image.evolinkHint'

  // Los ids de calidad no se comparten entre proveedores, así que cambiar de
  // proveedor obliga a reajustar la calidad elegida.
  const changeProvider = (provider: ImageProviderId) => {
    onChange({
      imageProvider: provider,
      imageQuality: defaultQualityFor(provider),
    })
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Label className="flex items-center gap-2 font-display font-semibold">
          <Sparkles className="h-4 w-4 text-saffron" />
          {t('create.image.provider')}
        </Label>
        <ImageCreditsBadges
          credits={credits}
          loading={isLoading}
          active={value.imageProvider}
          onRefresh={refresh}
        />
      </div>

      <p className="font-body text-xs text-muted-foreground">{t(hintKey)}</p>

      <div className="inline-flex items-center rounded-full bg-muted p-0.5">
        {IMAGE_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={disabled}
            onClick={() => changeProvider(provider.id)}
            className={cn(
              'rounded-full px-3 py-1 font-display text-xs font-bold transition-colors',
              value.imageProvider === provider.id
                ? 'bg-saffron text-charcoal shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {provider.label}
          </button>
        ))}
      </div>

      <LabeledSelect
        label={t('create.image.quality')}
        value={value.imageQuality}
        options={qualityOptions.map((option) => ({
          id: option.id,
          label: t(option.labelKey),
          priceUsd: option.priceUsd,
          note: t(option.noteKey),
        }))}
        disabled={disabled}
        onChange={(imageQuality) => onChange({ imageQuality })}
      />
    </div>
  )
}
