import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { cn } from '@/modules/common/utilities/cn'
import type { LibraryTab } from '@/modules/videos/types/library'

interface LibraryFormatTabsProps {
  value: LibraryTab
  // Proyectos por pestaña: el número al lado de cada nombre.
  counts: Record<LibraryTab, number>
  onChange: (value: LibraryTab) => void
}

// Formato largo primero: es el que más se usa.
const TABS: { id: LibraryTab; labelKey: string }[] = [
  { id: 'long', labelKey: 'library.tabs.long' },
  { id: 'shorts', labelKey: 'library.tabs.shorts' },
]

// Pestañas de la biblioteca por formato. Mismo control segmentado que el
// selector de proveedor; la píldora activa se desliza entre pestañas
// (`layoutId`) en vez de saltar.
export function LibraryFormatTabs({
  value,
  counts,
  onChange,
}: LibraryFormatTabsProps) {
  const { t } = useTranslation()

  return (
    <div
      role="tablist"
      className="inline-flex items-center rounded-full border border-border bg-muted p-0.5"
    >
      {TABS.map((tab) => {
        const selected = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
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
                layoutId="library-format-tab"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-saffron shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            {t(tab.labelKey)}
            <span
              className={cn(
                'rounded-full px-1.5 py-px font-body text-[11px] font-semibold tabular-nums',
                selected
                  ? 'bg-charcoal/10 text-charcoal'
                  : 'bg-muted-foreground/10 text-muted-foreground',
              )}
            >
              {counts[tab.id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
