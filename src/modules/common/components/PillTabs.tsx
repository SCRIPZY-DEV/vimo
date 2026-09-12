import { motion } from 'framer-motion'
import { cn } from '@/modules/common/utilities/cn'

export interface PillTabsOption<TId extends string> {
  id: TId
  label: string
  // Cuántos elementos hay detrás de la pestaña: el número al lado del nombre.
  count: number
}

interface PillTabsProps<TId extends string> {
  value: TId
  options: PillTabsOption<TId>[]
  ariaLabel: string
  // Único por grupo en pantalla: la píldora deslizante de framer-motion se
  // identifica por él, y dos grupos con el mismo id se robarían la píldora.
  layoutId: string
  onChange: (value: TId) => void
}

// Pestañas en píldora con contador, calcadas de las de la Biblioteca
// («Formato largo 7 · Shorts 8»): la píldora saffron se desliza entre
// pestañas (`layoutId`) en vez de saltar. Presentacional.
export function PillTabs<TId extends string>({
  value,
  options,
  ariaLabel,
  layoutId,
  onChange,
}: PillTabsProps<TId>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-full border border-border bg-muted p-0.5"
    >
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            // `isolate` + píldora en z negativo: mientras se mueve es una
            // capa compuesta y WebKit no debe pintarla sobre el texto.
            className={cn(
              'relative isolate inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors',
              selected
                ? 'text-charcoal'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-saffron shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            {option.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-px font-body text-[11px] font-semibold tabular-nums',
                selected
                  ? 'bg-charcoal/10 text-charcoal'
                  : 'bg-muted-foreground/10 text-muted-foreground',
              )}
            >
              {option.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
