import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import type { StyleSource } from '@/modules/videos/types/styles'

interface StyleSourceTabsProps {
  value: StyleSource
  disabled: boolean
  onChange: (value: StyleSource) => void
}

const TABS: { id: StyleSource; titleKey: string; hintKey: string }[] = [
  {
    id: 'catalog',
    titleKey: 'create.styleSource.catalog',
    hintKey: 'create.styleSource.catalogHint',
  },
  {
    id: 'custom',
    titleKey: 'create.styleSource.custom',
    hintKey: 'create.styleSource.customHint',
  },
]

// Fuente del estilo visual: catálogo de Vimo o galería propia. Elegir una
// desactiva la otra — es imposible mandar ambas (port de EditorGuion).
export function StyleSourceTabs({
  value,
  disabled,
  onChange,
}: StyleSourceTabsProps) {
  const { t } = useTranslation()

  return (
    <div role="tablist" className="grid grid-cols-2 gap-2">
      {TABS.map((tab) => {
        const selected = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              'rounded-xl border-2 px-4 py-3 text-left transition-all',
              selected
                ? 'border-saffron bg-saffron/5'
                : 'border-border bg-card hover:border-saffron/40',
            )}
          >
            <span className="block font-display text-sm font-bold text-foreground">
              {t(tab.titleKey)}
            </span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">
              {t(tab.hintKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
