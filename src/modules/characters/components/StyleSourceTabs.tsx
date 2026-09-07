import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Gem } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'

// Origen de los estilos que se listan debajo: el catálogo o la galería propia
export type StyleSource = 'catalog' | 'custom'

interface StyleSourceTabsProps {
  value: StyleSource
  onValueChange: (value: StyleSource) => void
  children: ReactNode
}

export function StyleSourceTabs({
  value,
  onValueChange,
  children,
}: StyleSourceTabsProps) {
  const { t } = useTranslation()

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as StyleSource)}
      className="space-y-3"
    >
      <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-border bg-card p-1.5">
        <TabsTrigger
          value="catalog"
          className="rounded-lg py-2 font-display text-sm font-bold data-[state=active]:bg-saffron data-[state=active]:text-charcoal"
        >
          {t('characters.preview.sourceCatalog')}
        </TabsTrigger>
        <TabsTrigger
          value="custom"
          className="gap-1.5 rounded-lg py-2 font-display text-sm font-bold data-[state=active]:bg-saffron data-[state=active]:text-charcoal"
        >
          <Gem
            aria-label={t('characters.preview.customStyleBadge')}
            className="h-4 w-4"
          />
          {t('characters.preview.sourceCustom')}
        </TabsTrigger>
      </TabsList>

      {children}
    </Tabs>
  )
}
