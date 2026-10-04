import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'

interface StyleCloneCreateCardProps {
  disabled: boolean
  // Ya hay tres clonaciones abiertas: la tarjeta lo dice y no abre otra.
  full: boolean
  onOpen: () => void
}

// La tarjeta «Crear estilo con IA» de Mi estilo (ADR-0050): la MISMA silueta
// que «Crear estilo» (zona 4:3 arriba + pie de dos líneas), al lado de ella.
// Solo abre el modal: nunca se transforma en un estilo. Presentacional.
export function StyleCloneCreateCard({
  disabled,
  full,
  onOpen,
}: StyleCloneCreateCardProps) {
  const { t } = useTranslation()
  const blocked = disabled || full

  const open = () => {
    if (!blocked) onOpen()
  }

  return (
    <div
      role="button"
      aria-disabled={blocked}
      tabIndex={blocked ? undefined : 0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
      }}
      className={cn(
        'group flex select-none flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-saffron/50',
        blocked
          ? 'cursor-default opacity-70'
          : 'cursor-pointer hover:border-saffron/60 hover:text-foreground',
      )}
    >
      <div className="flex aspect-[4/3] items-center justify-center">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full bg-saffron/15 text-saffron transition-transform',
            !blocked && 'group-hover:scale-110',
          )}
        >
          <Sparkles className="h-6 w-6" />
        </span>
      </div>
      <div className="px-3.5 py-2.5 text-left">
        <p className="truncate font-display text-base font-bold text-foreground">
          {t('create.styleClone.createCard')}
        </p>
        <p
          className={cn(
            'font-body text-xs text-muted-foreground',
            !full && 'truncate',
          )}
        >
          {full
            ? t('create.styleClone.limitReached')
            : t('create.styleClone.createCardHint')}
        </p>
      </div>
    </div>
  )
}
