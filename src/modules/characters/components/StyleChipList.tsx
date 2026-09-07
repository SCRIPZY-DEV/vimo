import { Check } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { PreviewStyleOption } from '@/modules/characters/types/characters'

interface StyleChipListProps {
  styles: PreviewStyleOption[]
  styleId: string
  // Estilos que ya tienen un preview generado
  doneStyleIds: string[]
  disabled: boolean
  onStyleChange: (styleId: string) => void
}

export function StyleChipList({
  styles,
  styleId,
  doneStyleIds,
  disabled,
  onStyleChange,
}: StyleChipListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {styles.map((style) => {
        const selected = style.id === styleId
        const done = doneStyleIds.includes(style.id)

        return (
          <button
            key={style.id}
            type="button"
            disabled={disabled}
            onClick={() => onStyleChange(style.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 font-display text-sm font-bold transition-colors disabled:opacity-50',
              selected
                ? 'border-saffron bg-saffron text-charcoal'
                : 'border-border bg-card text-muted-foreground hover:border-saffron/40 hover:text-foreground',
            )}
          >
            {done && <Check className="h-3.5 w-3.5" />}
            {style.label}
          </button>
        )
      })}
    </div>
  )
}
