import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Check, ImageIcon, Loader2, Sparkles, X } from 'lucide-react'
import { ProgressBar } from '@/modules/common/components/ProgressBar'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { ApiKeysRoutes } from '@/modules/api-keys/constants'
import {
  FAL_PREVIEW_MODELS,
  PREVIEW_PROVIDERS,
  PREVIEW_STYLES,
} from '@/modules/characters/constants'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type {
  FalImageModelId,
  ImageProviderId,
} from '@pipeline/types/image-provider.ts'
import type { PreviewView } from '@/modules/characters/types/characters'

interface CharacterPreviewPanelProps {
  previews: PreviewView[]
  styleId: CharacterStyleId
  provider: ImageProviderId
  falModel: FalImageModelId
  generating: boolean
  percent: number
  hasProgress: boolean
  errorKey: string | null
  disabled: boolean
  missingProviderKey: boolean
  canGenerate: boolean
  onStyleChange: (styleId: CharacterStyleId) => void
  onProviderChange: (provider: ImageProviderId) => void
  onFalModelChange: (model: FalImageModelId) => void
  onGenerate: () => void
  onCancel: () => void
}

export function CharacterPreviewPanel({
  previews,
  styleId,
  provider,
  falModel,
  generating,
  percent,
  hasProgress,
  errorKey,
  disabled,
  missingProviderKey,
  canGenerate,
  onStyleChange,
  onProviderChange,
  onFalModelChange,
  onGenerate,
  onCancel,
}: CharacterPreviewPanelProps) {
  const { t } = useTranslation()

  const styleOf = (id: CharacterStyleId) =>
    PREVIEW_STYLES.find((style) => style.id === id)
  const activePreview = previews.find((preview) => preview.styleId === styleId)

  return (
    <section className="space-y-4 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-4">
      <div>
        <h3 className="font-display text-base font-bold text-foreground">
          {t('characters.preview.titulo')}
        </h3>
        <p className="font-body text-xs text-muted-foreground">
          {t('characters.preview.nota')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PREVIEW_STYLES.map((style) => {
          const selected = style.id === styleId
          const done = previews.some((preview) => preview.styleId === style.id)
          return (
            <button
              key={style.id}
              type="button"
              disabled={disabled || generating}
              onClick={() => onStyleChange(style.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-xs font-bold transition-colors',
                selected
                  ? 'border-saffron bg-saffron text-charcoal'
                  : 'border-border bg-card text-muted-foreground hover:border-saffron/40 hover:text-foreground',
              )}
            >
              {done && <Check className="h-3.5 w-3.5" />}
              {t(style.labelKey)}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="font-display">
            {t('characters.preview.proveedor')}
          </Label>
          <div className="flex gap-2">
            {PREVIEW_PROVIDERS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={disabled || generating}
                onClick={() => onProviderChange(item.id)}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 font-display text-xs font-bold transition-colors',
                  item.id === provider
                    ? 'border-saffron bg-saffron/20 text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {provider === 'fal' && (
          <div className="space-y-1.5">
            <Label className="font-display">
              {t('characters.preview.modeloFal')}
            </Label>
            <div className="flex gap-2">
              {FAL_PREVIEW_MODELS.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  disabled={disabled || generating}
                  onClick={() => onFalModelChange(model.id)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 font-display text-xs font-bold transition-colors',
                    model.id === falModel
                      ? 'border-saffron bg-saffron/20 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {model.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={
            disabled || generating || !canGenerate || missingProviderKey
          }
          onClick={onGenerate}
          className="rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {activePreview
            ? t('characters.preview.regenerar')
            : t('characters.preview.generar')}
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

      {generating && (
        <div className="flex items-center gap-3">
          <ProgressBar percent={percent} minPercent={4} className="flex-1" />
          {/* Ancho fijo y tabular-nums: el número cambia sin correr la barra. */}
          {hasProgress && (
            <span className="w-10 shrink-0 text-right font-body text-sm tabular-nums text-muted-foreground">
              {Math.round(percent)}%
            </span>
          )}
        </div>
      )}

      {missingProviderKey && (
        <p className="font-body text-xs text-coral">
          {t('characters.preview.faltaClave')}{' '}
          <Link to={ApiKeysRoutes.apiKeys} className="underline">
            {t('characters.irAClaves')}
          </Link>
        </p>
      )}

      {errorKey && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-sm text-destructive">
          {t(errorKey)}
        </p>
      )}

      {previews.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3">
          {previews.map((preview) => (
            <li key={preview.styleId} className="space-y-1">
              <img
                src={preview.url}
                alt=""
                className="aspect-square w-full rounded-lg border border-border object-cover"
              />
              <p className="truncate text-center font-body text-xs text-muted-foreground">
                {t(styleOf(preview.styleId)?.labelKey ?? '')}
              </p>
            </li>
          ))}
          {generating && (
            <li className="w-[calc((100%-1.5rem)/3)] space-y-1">
              <Skeleton className="flex aspect-square w-full items-center justify-center rounded-lg border border-border">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </Skeleton>
              <p className="truncate text-center font-body text-xs text-muted-foreground">
                {t('characters.preview.generando')}
              </p>
            </li>
          )}
        </ul>
      ) : (
        <p className="flex items-center gap-2 font-body text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          {t('characters.preview.vacio')}
        </p>
      )}
    </section>
  )
}
