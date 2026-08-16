import { useTranslation } from 'react-i18next'
import { Coins, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { CostFilter } from '../types/costs'

export function CostFilters({
  active,
  onChange,
}: {
  active: CostFilter
  onChange: (filter: CostFilter) => void
}) {
  const { t } = useTranslation()

  const items: { id: CostFilter; label: string; Icon: typeof Coins }[] = [
    { id: 'cheapest', label: t('costs.filtroEconomico'), Icon: Coins },
    { id: 'fastest', label: t('costs.filtroRapido'), Icon: Zap },
    { id: 'quality', label: t('costs.filtroCalidad'), Icon: Sparkles },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const selected = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-display text-xs font-bold transition-colors',
              selected
                ? 'border-saffron bg-saffron text-charcoal'
                : 'border-border bg-card text-muted-foreground hover:border-saffron/40 hover:text-foreground',
            )}
          >
            <item.Icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
