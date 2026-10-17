import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'
import { FlowRestartInline } from '@/modules/common/components/FlowRestartInline'
import type { FlowRestartRequest } from '@/modules/common/types/flow'
import { FLOW_PHASE_KEYS } from '@/modules/common/constants'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ImageCreditsBadges } from '@/modules/common/components/ImageCreditsBadges'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Button } from '@/modules/common/ui/button'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { PREVIEW_PROVIDERS } from '@/modules/characters/constants'
import { PreviewProviderChips } from '@/modules/characters/components/PreviewProviderChips'
import { PreviewThumbnailGrid } from '@/modules/characters/components/PreviewThumbnailGrid'
import { StyleChipList } from '@/modules/characters/components/StyleChipList'
import { StyleSourceTabs } from '@/modules/characters/components/StyleSourceTabs'
import type { StyleSource } from '@/modules/characters/components/StyleSourceTabs'
import type { CharacterPreviewPhase } from '@pipeline/types/characters.ts'
import type { CreditsShortfallLine } from '@/modules/common/types/credits'
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
  executionPlan?: FlowToolsExecutionPlan
  recoveringFlow: boolean
  generating: boolean
  phase: CharacterPreviewPhase | null
  imageStatus?: string | null
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
  // El mismo saldo comparado (ADR-0031): con `sufficient === false` el
  // botón se frena y se ofrece recargar.
  creditsLine: CreditsShortfallLine
  creditsRefreshing: boolean
  onRefreshCredits: () => void
  onStyleChange: (styleId: string) => void
  onProviderChange: (provider: ImageProviderId) => void
  onRestart: (request: FlowRestartRequest) => void
  onGenerate: () => void
  onCancel: () => void
}

export function CharacterPreviewPanel({
  previews,
  styles,
  styleId,
  provider,
  recoveringFlow,
  generating,
  phase,
  imageStatus,
  percent,
  errorKey,
  disabled,
  missingProviderKey,
  canGenerate,
  credits,
  creditsLoading,
  creditsLine,
  creditsRefreshing,
  onRefreshCredits,
  onStyleChange,
  onProviderChange,
  onRestart,
  onGenerate,
  onCancel,
}: CharacterPreviewPanelProps) {
  const { t } = useTranslation()
  const insufficientCredits = creditsLine.sufficient === false

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
  const queued =
    provider === 'flow' && phase !== 'prompt' && imageStatus === 'queued'
  const generatingLabel =
    phase === 'prompt'
      ? t('characters.preview.writingPrompt')
      : imageStatus && Object.hasOwn(FLOW_PHASE_KEYS, imageStatus)
        ? t(FLOW_PHASE_KEYS[imageStatus])
        : t(
            provider === 'flow'
              ? 'extension.generatingImages'
              : 'characters.preview.generando',
          )
  const providerLabel = t(
    PREVIEW_PROVIDERS.find((item) => item.id === provider)?.labelKey ??
      'extension.engineFlow',
  )
  const generateLabel = t(
    activePreview
      ? 'characters.preview.regenerar'
      : 'characters.preview.generar',
    { style: selectedStyle?.label ?? '', provider: providerLabel },
  )
  // Las claves que faltan se piden juntas: la del proveedor y, con estilo
  // propio, la del LLM.
  const paidProviders = provider === 'flow' ? [] : [provider]
  const missingKeyProviders = selectedStyle?.custom
    ? ['deepinfra' as const, ...paidProviders]
    : paidProviders

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
          disabled={disabled || generating || recoveringFlow}
          onProviderChange={onProviderChange}
        />
        <ImageCreditsBadges
          showFlowGenerationControls={recoveringFlow}
          credits={credits}
          loading={creditsLoading}
          refreshing={creditsRefreshing}
          active={provider}
          onlyActive
          onRefresh={onRefreshCredits}
        />
      </div>
      {recoveringFlow && (
        <p className="text-xs text-muted-foreground">
          {t('extension.recoverHint')}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={
            disabled ||
            generating ||
            !canGenerate ||
            missingProviderKey ||
            insufficientCredits
          }
          onClick={onGenerate}
          className="btn-squish h-auto w-full rounded-xl bg-ocean py-4 font-display text-base font-bold text-white hover:bg-ocean/90"
        >
          {generating && !queued ? (
            <Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" />
          ) : (
            <ImageIcon className="mr-2 h-5 w-5 shrink-0" />
          )}
          <span className="truncate">
            {recoveringFlow ? t('extension.recoverResult') : generateLabel}
          </span>
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
        <p className="font-body text-xs text-coral-text">
          {t('characters.preview.faltaClave')}{' '}
          <Link
            to={apiKeysFocusPath(missingKeyProviders)}
            className="underline"
          >
            {t('characters.irAClaves')}
          </Link>
        </p>
      )}

      {insufficientCredits && (
        <InsufficientCreditsAlert
          lines={[creditsLine]}
          blocking
          onReload={(providerId) => void apiKeysApi.openBillingPage(providerId)}
          onRefresh={onRefreshCredits}
          refreshing={creditsRefreshing}
        />
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}
      {provider === 'flow' && errorKey === 'extension.restartRequired' && (
        <FlowRestartInline
          disabled={disabled || generating}
          onRestart={onRestart}
        />
      )}

      <PreviewThumbnailGrid
        previews={visiblePreviews}
        generating={generating}
        generatingLabel={generatingLabel}
        queued={queued}
        percent={percent}
        labelOf={labelOf}
      />

      <p className="text-center font-body text-xs text-muted-foreground">
        {t('characters.preview.nota')}
      </p>
    </section>
  )
}
