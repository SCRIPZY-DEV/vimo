import { useId } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/modules/common/utilities/cn'

interface FilterChipOption<TId extends string> {
  id: TId
  label: string
}

interface FilterChipsProps<TId extends string> {
  value: TId
  options: FilterChipOption<TId>[]
  ariaLabel: string
  onChange: (value: TId) => void
}

// Chips de filtro en píldora, como PillTabs pero sin contador: la píldora
// saffron se desliza a la opción elegida (su `layoutId` es propio de cada
// grupo, así dos grupos en pantalla no se la pasan). Presentacional.
export function FilterChips<TId extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: FilterChipsProps<TId>) {
  const pillLayoutId = useId()

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-full border border-border bg-muted p-0.5"
    >
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            // `isolate` + píldora en z negativo: mientras se mueve es una
            // capa compuesta y WebKit no debe pintarla sobre el texto.
            className={cn(
              'relative isolate rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron',
              selected
                ? 'text-charcoal'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {selected && (
              <motion.span
                layoutId={pillLayoutId}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-saffron shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
