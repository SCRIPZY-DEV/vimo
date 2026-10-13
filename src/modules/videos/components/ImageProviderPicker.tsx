import { useTranslation } from 'react-i18next'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { cn } from '@/modules/common/utilities/cn'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import type { ImageProviderPickerProps } from '@/modules/videos/types/imageProviderPicker'

// Con qué proveedor salen las muestras de un estilo: el mismo control
// segmentado que el formulario de Crear (el elegido en saffron pleno), con el
// saldo de cada proveedor y el botón de refrescar al lado. Lo comparten el
// modal de Mi estilo y el del catálogo del admin (ADR-0049).
export function ImageProviderPicker({
  provider,
  disabled,
  credits,
  showFlowGenerationControls = true,
  onChoose,
}: ImageProviderPickerProps) {
  const { t } = useTranslation()

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium">
        {t('create.customStyles.providerQuestion')}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center rounded-2xl border border-border bg-muted p-0.5">
          {IMAGE_PROVIDERS.map((imageProvider) => {
            const chosen = provider === imageProvider.id
            return (
              <button
                key={imageProvider.id}
                type="button"
                disabled={disabled}
                onClick={() => onChoose(imageProvider.id)}
                className={cn(
                  'cursor-pointer rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors disabled:cursor-default disabled:opacity-60',
                  chosen
                    ? 'bg-saffron text-charcoal shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(imageProvider.labelKey)}
              </button>
            )
          })}
        </div>
        <ImageCreditsBadges
          showFlowGenerationControls={showFlowGenerationControls}
          credits={credits.credits}
          loading={credits.isLoading}
          refreshing={credits.isRefreshing}
          active={provider}
          onRefresh={credits.refresh}
        />
      </div>
      {provider !== 'flow' && (
        <p className="mt-1.5 font-body text-xs text-muted-foreground">
          {t('create.customStyles.providerHint')}
        </p>
      )}
    </div>
  )
}
