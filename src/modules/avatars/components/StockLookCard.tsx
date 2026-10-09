import { useTranslation } from 'react-i18next'
import { Check, Loader2, Plus } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Button } from '@/modules/common/ui/button'
import type { HeyGenLook } from '@pipeline/types/avatar.ts'

interface StockLookCardProps {
  look: HeyGenLook
  added: boolean
  adding: boolean
  disabled: boolean
  onAdd: (look: HeyGenLook) => void
}

// Un look de HeyGen con su vista previa remota, tipo y motores; «Agregar» lo
// copia a la biblioteca y queda marcado como agregado.
export function StockLookCard({
  look,
  added,
  adding,
  disabled,
  onAdd,
}: StockLookCardProps) {
  const { t } = useTranslation()

  // Un look propio que HeyGen todavía entrena, no pudo entrenar o espera el
  // consentimiento no sirve para generar: no se puede agregar. Los de stock
  // no traen `status`.
  const notReady = look.status !== undefined && look.status !== 'ready'

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border-2 border-border bg-card">
      <CharacterPortrait
        src={look.previewImageUrl ?? null}
        doodleSize={56}
        className="aspect-square"
      />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="truncate font-display text-sm font-bold text-foreground">
          {look.name}
        </h3>
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
            {t(`avatars.types.${look.lookType}`)}
          </span>
          {look.supportedEngines.map((engine) => (
            <span
              key={engine}
              className="rounded bg-saffron/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground"
            >
              {t(`avatars.engines.${engine}`)}
            </span>
          ))}
        </div>

        {look.status === 'processing' && (
          <p className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('avatars.status.processing')}
          </p>
        )}
        {look.status === 'failed' && (
          <p className="font-body text-xs text-destructive">
            {t('avatars.status.failed')}
          </p>
        )}

        <Button
          size="sm"
          variant={added ? 'ghost' : 'outline'}
          disabled={disabled || added || adding || notReady}
          onClick={() => onAdd(look)}
          className="mt-auto rounded-lg font-display"
        >
          {adding ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : added ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {added ? t('avatars.stock.agregado') : t('avatars.stock.agregar')}
        </Button>
      </div>
    </article>
  )
}
