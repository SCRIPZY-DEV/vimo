import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import type { StyleSource } from '@/modules/videos/types/styles'

interface StyleSourceTabsProps {
  value: StyleSource
  disabled: boolean
  // Pisa el texto del catálogo cuando hay menos estilos que ofrecer (modo
  // demo, ADR-0029); por defecto, el texto del catálogo completo.
  catalogHintKey?: string
  // Cuántos estilos dice ese texto (la demo: las tarjetas a la vista, los de
  // la lista del catálogo con historia en el formato elegido).
  catalogHintCount?: number
  // «Mi estilo» no se puede elegir (todos los modelos de prompts bloqueados,
  // ADR-0028): la pestaña queda inerte y su pista dice por qué.
  customDisabled?: boolean
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
  catalogHintKey,
  catalogHintCount,
  customDisabled = false,
  onChange,
}: StyleSourceTabsProps) {
  const { t } = useTranslation()

  return (
    <div role="tablist" className="grid grid-cols-2 gap-2">
      {TABS.map((tab) => {
        const selected = value === tab.id
        const blocked = tab.id === 'custom' && customDisabled
        const hintKey =
          tab.id === 'catalog' && catalogHintKey ? catalogHintKey : tab.hintKey
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled || blocked}
            onClick={() => onChange(tab.id)}
            className={cn(
              'rounded-xl border-2 px-4 py-3 text-left transition-all',
              selected
                ? 'border-saffron bg-saffron/5'
                : 'border-border bg-card hover:border-saffron/40',
              blocked && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="block font-display text-sm font-bold text-foreground">
              {t(tab.titleKey)}
            </span>
            <span
              className={cn(
                'mt-0.5 block font-body text-xs',
                blocked ? 'text-coral-text' : 'text-muted-foreground',
              )}
            >
              {t(blocked ? 'create.styleSource.customBlockedHint' : hintKey, {
                count: catalogHintCount,
              })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
