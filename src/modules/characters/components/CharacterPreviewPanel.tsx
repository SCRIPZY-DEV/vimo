import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Check, ImageIcon, Loader2, Sparkles, X } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { PREVIEW_PROVIDERS } from '@/modules/characters/constants'
import type { CharacterPreviewPhase } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
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
  errorKey: string | null
  disabled: boolean
  missingProviderKey: boolean
  canGenerate: boolean
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
  errorKey,
  disabled,
  missingProviderKey,
  canGenerate,
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
  const activePreview = previews.find((preview) => preview.styleId === styleId)
  // Mientras se genera, el estilo elegido muestra un skeleton en el lugar de su imagen.
  const visiblePreviews = generating
    ? previews.filter((preview) => preview.styleId !== styleId)
    : previews
  const generatingLabelKey =
    phase === 'prompt'
      ? 'characters.preview.writingPrompt'
      : 'characters.preview.generando'
  // Las claves que faltan se piden juntas: la del proveedor y, con estilo
  // propio, la del LLM.
  const missingKeyProviders = selectedStyle?.custom
    ? ['deepinfra' as const, provider]
    : [provider]

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
        {styles.map((style) => {
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
              {style.custom && (
                <Sparkles
                  aria-label={t('characters.preview.customStyleBadge')}
                  className="h-3.5 w-3.5"
                />
              )}
              {style.label}
            </button>
          )
        })}
      </div>

      {selectedStyle?.custom && (
        <p className="font-body text-xs text-muted-foreground">
          {t('characters.preview.customStyleNote')}
        </p>
      )}

      <div className="space-y-1.5">
        <Label className="font-display">
          {t('characters.preview.proveedor')}
        </Label>
        <div className="flex gap-2 sm:max-w-md">
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

      {previews.length > 0 || generating ? (
        <ul className="flex flex-wrap justify-center gap-3">
          {visiblePreviews.map((preview) => (
            <li
              key={preview.styleId}
              className="w-[calc((100%-1.5rem)/3)] space-y-1"
            >
              <img
                src={preview.url}
                alt=""
                className="aspect-square w-full rounded-lg border border-border object-cover"
              />
              <p className="truncate text-center font-body text-xs text-muted-foreground">
                {labelOf(preview.styleId)}
              </p>
            </li>
          ))}
          {generating && (
            <li className="w-[calc((100%-1.5rem)/3)] space-y-1">
              <Skeleton className="flex aspect-square w-full items-center justify-center rounded-lg border border-border">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </Skeleton>
              <p className="truncate text-center font-body text-xs text-muted-foreground">
                {t(generatingLabelKey)}
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
