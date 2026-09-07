import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { PREVIEW_PROVIDERS } from '@/modules/characters/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface PreviewProviderChipsProps {
  provider: ImageProviderId
  disabled: boolean
  onProviderChange: (provider: ImageProviderId) => void
}

export function PreviewProviderChips({
  provider,
  disabled,
  onProviderChange,
}: PreviewProviderChipsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-body text-sm text-muted-foreground">
        {t('characters.preview.proveedor')}
      </span>
      {PREVIEW_PROVIDERS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onProviderChange(item.id)}
          className={cn(
            'rounded-full border px-4 py-1.5 font-display text-sm font-bold transition-colors disabled:opacity-50',
            item.id === provider
              ? 'border-ocean bg-ocean text-white'
              : 'border-border bg-card text-muted-foreground hover:border-ocean/40 hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
