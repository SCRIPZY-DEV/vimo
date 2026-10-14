import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { GemSectionBox } from '@/modules/videos/components/GemSectionBox'
import { GEM_SECTION_TEXT_KEYS } from '@/modules/videos/constants'
import { nonEnglishSectionKeys } from '@/modules/videos/utilities/englishSections'
import {
  GEM_SECTION_KEYS,
  GEM_TOTAL_CHAR_LIMIT,
  gemSectionsLength,
  sectionMaxLength,
} from '@/modules/videos/utilities/gemTemplate'
import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

interface GemSectionsEditorProps {
  sections: GemSections
  disabled: boolean
  onChange: (key: GemSectionKey, value: string) => void
}

// Las secciones de una gema de plantilla, una caja cada una en el orden
// canónico (spec §7). `visualStyle` arranca abierta; una opcional vacía es un
// «Agregar sección» hasta que se abre. Qué caja está abierta y qué avisos de
// inglés se descartaron es estado de esta vista; el texto lo maneja el modal,
// que lo guarda al cerrar.
export function GemSectionsEditor({
  sections,
  disabled,
  onChange,
}: GemSectionsEditorProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<ReadonlySet<GemSectionKey>>(
    () => new Set<GemSectionKey>(['visualStyle']),
  )
  // Los avisos de «no parece inglés» que la persona descartó. La heurística se
  // equivoca, así que un aviso descartado no vuelve mientras sigue editando.
  const [dismissed, setDismissed] = useState<ReadonlySet<GemSectionKey>>(
    () => new Set<GemSectionKey>(),
  )

  const notEnglish = new Set(nonEnglishSectionKeys(sections))
  const total = gemSectionsLength(sections)
  const totalFull = total >= GEM_TOTAL_CHAR_LIMIT

  const toggle = (key: GemSectionKey) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
        return next
      }
      next.add(key)
      return next
    })
  }

  const dismissNotEnglish = (key: GemSectionKey) => {
    setDismissed((current) => new Set(current).add(key))
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium">
          {t('create.gemTemplate.sectionsTitle')}
        </p>
        <p className="font-body text-xs text-muted-foreground">
          {t('create.gemTemplate.sectionsHint')}
        </p>
      </div>

      {GEM_SECTION_KEYS.map((key) => {
        const value = sections[key] ?? ''
        const shown =
          key === 'visualStyle' || value.length > 0 || expanded.has(key)
        if (!shown)
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-3 py-2 text-left font-display text-sm font-bold text-muted-foreground transition-colors hover:border-saffron/60 hover:text-foreground disabled:opacity-60"
            >
              <Plus className="h-4 w-4 shrink-0" />
              {t('create.gemTemplate.addSection', {
                title: t(GEM_SECTION_TEXT_KEYS[key].titleKey),
              })}
            </button>
          )

        return (
          <GemSectionBox
            key={key}
            sectionKey={key}
            value={value}
            expanded={expanded.has(key)}
            maxLength={sectionMaxLength(sections, key)}
            notEnglish={notEnglish.has(key) && !dismissed.has(key)}
            disabled={disabled}
            onToggle={() => toggle(key)}
            onChange={(next) => onChange(key, next)}
            onDismissNotEnglish={() => dismissNotEnglish(key)}
          />
        )
      })}

      <p
        className={cn(
          'font-body text-xs tabular-nums',
          totalFull ? 'text-coral-text' : 'text-muted-foreground',
        )}
      >
        {t('create.gemTemplate.totalCount', {
          used: total.toLocaleString(),
          limit: GEM_TOTAL_CHAR_LIMIT.toLocaleString(),
        })}
      </p>
      {totalFull && (
        <p className="font-body text-xs text-coral-text">
          {t('create.gemTemplate.totalFull')}
        </p>
      )}
    </div>
  )
}
