import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { Button } from '@/modules/common/ui/button'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { PREVIEW_PROVIDERS } from '@/modules/characters/constants'
import { PreviewProviderChips } from '@/modules/characters/components/PreviewProviderChips'
import { PreviewThumbnailGrid } from '@/modules/characters/components/PreviewThumbnailGrid'
import { StyleChipList } from '@/modules/characters/components/StyleChipList'
import { StyleSourceTabs } from '@/modules/characters/components/StyleSourceTabs'
import type { StyleSource } from '@/modules/characters/components/StyleSourceTabs'
import type { CharacterPreviewPhase } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type {
  PreviewStyleOption,
  PreviewView,
} from '@/modules/characters/types/characters'

interface CharacterPreviewPanelProps {
  previews: PreviewView[]
  // Catálogo + estilos propios, en ese orden.
  styles: PreviewStyleOption[]
  styleId: string
  provider: ImageProviderId
  generating: boolean
  phase: CharacterPreviewPhase | null
  // Avance de la fase en curso; null = todavía sin dato (solo el spinner).
  percent: number | null
  errorKey: string | null
  disabled: boolean
  missingProviderKey: boolean
  canGenerate: boolean
  // Saldo de los proveedores de imagen: se muestra solo el del elegido, con
  // el botón de refrescar (mismo bloque que el panel del editor).
  credits: ImageCreditsResult | null
  creditsLoading: boolean
  creditsRefreshing: boolean
  onRefreshCredits: () => void
  onStyleChange: (styleId: string) => void
  onProviderChange: (provider: ImageProviderId) => void
  onGenerate: () => void
  onCancel: () => void
}

export function CharacterPreviewPanel({
  previews,
  styles,
  styleId,
  provider,
  generating,
  phase,
  percent,
  errorKey,
  disabled,
  missingProviderKey,
  canGenerate,
  credits,
  creditsLoading,
  creditsRefreshing,
  onRefreshCredits,
  onStyleChange,
  onProviderChange,
  onGenerate,
  onCancel,
}: CharacterPreviewPanelProps) {
  const { t } = useTranslation()

  const styleOf = (id: string) => styles.find((style) => style.id === id)
  // Un preview cuyo estilo propio ya no está en la galería conserva la
  // imagen: solo pierde el nombre.
  const labelOf = (id: string) =>
    styleOf(id)?.label ?? t('characters.preview.deletedStyle')
  const selectedStyle = styleOf(styleId)

  // La pestaña arranca en la del estilo que llega elegido (Create puede abrir el
  // modal con un estilo propio); después es solo un filtro visual.
  const [source, setSource] = useState<StyleSource>(
    selectedStyle?.custom ? 'custom' : 'catalog',
  )

  const visibleStyles = styles.filter((style) =>
    source === 'custom' ? style.custom : !style.custom,
  )
  const doneStyleIds = previews.map((preview) => preview.styleId)
  const activePreview = previews.find((preview) => preview.styleId === styleId)
  // Mientras se genera, el estilo elegido muestra un skeleton en el lugar de su imagen.
  const visiblePreviews = generating
    ? previews.filter((preview) => preview.styleId !== styleId)
    : previews
  const generatingLabel =
    phase === 'prompt'
      ? t('characters.preview.writingPrompt')
      : t('characters.preview.generando')
  const providerLabel =
    PREVIEW_PROVIDERS.find((item) => item.id === provider)?.label ?? provider
  const generateLabel = t(
    activePreview
      ? 'characters.preview.regenerar'
      : 'characters.preview.generar',
    { style: selectedStyle?.label ?? '', provider: providerLabel },
  )
  // Las claves que faltan se piden juntas: la del proveedor y, con estilo
  // propio, la del LLM.
  const missingKeyProviders = selectedStyle?.custom
    ? ['deepinfra' as const, provider]
    : [provider]

  return (
    <section className="space-y-4 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-4">
      <h3 className="font-display text-base font-bold text-foreground">
        {t('characters.preview.titulo')}
      </h3>

      <StyleSourceTabs value={source} onValueChange={setSource}>
        {visibleStyles.length > 0 ? (
          <StyleChipList
            styles={visibleStyles}
            styleId={styleId}
            doneStyleIds={doneStyleIds}
            disabled={disabled || generating}
            onStyleChange={onStyleChange}
          />
        ) : (
          <p className="font-body text-xs text-muted-foreground">
            {t('characters.preview.sinEstilosPropios')}
          </p>
        )}
      </StyleSourceTabs>

      {selectedStyle?.custom && (
        <p className="font-body text-xs text-muted-foreground">
          {t('characters.preview.customStyleNote')}
        </p>
      )}

      {/* Proveedor a la izquierda; a la derecha, el saldo del elegido y el
          botón de refrescar, como en el panel del editor. Tras un preview el
          saldo se vuelve a pedir solo (scheduleCreditsRefresh): el botón es
          para revisarlo a mano. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PreviewProviderChips
          provider={provider}
          disabled={disabled || generating}
          onProviderChange={onProviderChange}
        />
        <ImageCreditsBadges
          credits={credits}
          loading={creditsLoading}
          refreshing={creditsRefreshing}
          active={provider}
          onlyActive
          onRefresh={onRefreshCredits}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={
            disabled || generating || !canGenerate || missingProviderKey
          }
          onClick={onGenerate}
          className="btn-squish h-auto w-full rounded-xl bg-ocean py-4 font-display text-base font-bold text-white hover:bg-ocean/90"
        >
          {generating ? (
            <Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <ImageIcon className="mr-2 h-5 w-5 shrink-0" />
          )}
          <span className="truncate">{generateLabel}</span>
        </Button>
        {generating && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="rounded-xl font-display text-muted-foreground"
          >
            <X className="mr-1.5 h-4 w-4" />
            {t('characters.preview.cancelar')}
          </Button>
        )}
      </div>

      {missingProviderKey && (
        <p className="font-body text-xs text-coral">
          {t('characters.preview.faltaClave')}{' '}
          <Link
            to={apiKeysFocusPath(missingKeyProviders)}
            className="underline"
          >
            {t('characters.irAClaves')}
          </Link>
        </p>
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      <PreviewThumbnailGrid
        previews={visiblePreviews}
        generating={generating}
        generatingLabel={generatingLabel}
        percent={percent}
        labelOf={labelOf}
      />

      <p className="text-center font-body text-xs text-muted-foreground">
        {t('characters.preview.nota')}
      </p>
    </section>
  )
}
