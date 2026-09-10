import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
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
  const { credits, isLoading, isRefreshing, refresh } = useImageCredits()

  const qualityOptions = qualityOptionsFor(
    value.imageProvider,
    value.videoFormat,
  )
  const hintKey =
    value.imageProvider === 'fal'
      ? 'create.image.falHint'
      : 'create.image.evolinkHint'

  // Los ids de calidad no se comparten entre proveedores, así que cambiar de
  // proveedor obliga a reajustar la calidad elegida.
  const changeProvider = (provider: ImageProviderId) => {
    onChange({
      imageProvider: provider,
      imageQuality: defaultQualityFor(provider, value.videoFormat),
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
          refreshing={isRefreshing}
          active={value.imageProvider}
          onRefresh={refresh}
        />
      </div>

      <p className="font-body text-xs text-muted-foreground">{t(hintKey)}</p>

      {/* Mismo control segmentado que el modal de estilo: track con borde y
          botones a tamaño de texto normal, para que se lean como botones. */}
      <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5">
        {IMAGE_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={disabled}
            onClick={() => changeProvider(provider.id)}
            className={cn(
              'rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors',
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
        label={t('create.image.reasoningLevel')}
        help={t('create.reasoningLevel.help')}
        value={value.imageQuality}
        options={qualityOptions.map((option) => ({
          id: option.id,
          // Solo el nivel: el formato ya se eligió arriba y la nota dice en
          // qué forma sale. Sin precio: el del catálogo no es el real.
          label: t(option.labelKey),
          note: t(option.noteKey),
        }))}
        disabled={disabled}
        onChange={(imageQuality) => onChange({ imageQuality })}
      />
    </div>
  )
}
