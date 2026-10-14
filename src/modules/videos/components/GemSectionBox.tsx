import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  GEM_SECTION_TEXT_KEYS,
} from '@/modules/videos/constants'
import { GEM_SECTION_LIMITS } from '@/modules/videos/utilities/gemTemplate'
import type { GemSectionKey } from '@pipeline/types/styles.ts'

interface GemSectionBoxProps {
  sectionKey: GemSectionKey
  value: string
  expanded: boolean
  // Tope del textarea: el límite de la sección o lo que queda del total.
  maxLength: number
  // La sección va en inglés y no lo parece: se avisa, sin bloquear. Es una
  // heurística y se equivoca (un nombre con tilde, un préstamo como
  // «Dalí-inspired»), así que el aviso se puede descartar.
  notEnglish: boolean
  disabled: boolean
  onToggle: () => void
  onChange: (value: string) => void
  onDismissNotEnglish: () => void
}

// Una sección de la gema como caja plegable (spec §7): el título y su contador
// siempre a la vista; abierta, la ayuda y el texto. Presentacional.
export function GemSectionBox({
  sectionKey,
  value,
  expanded,
  maxLength,
  notEnglish,
  disabled,
  onToggle,
  onChange,
  onDismissNotEnglish,
}: GemSectionBoxProps) {
  const { t } = useTranslation()
  const texts = GEM_SECTION_TEXT_KEYS[sectionKey]
  const limit = GEM_SECTION_LIMITS[sectionKey]
  const fieldId = `gem-section-${sectionKey}`

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={fieldId}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-sm font-bold text-foreground">
            {t(texts.titleKey)}
          </span>
          {/* Vista previa solo visual: sin aria-hidden, el nombre accesible del
              botón incluiría el texto plegado entero (hasta 12 000 caracteres). */}
          {!expanded && value && (
            <span
              aria-hidden
              className="block truncate font-body text-xs text-muted-foreground"
            >
              {value}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'font-body text-[11px] tabular-nums',
              value.length >= limit
                ? 'text-coral-text'
                : 'text-muted-foreground',
            )}
          >
            {t('create.gemTemplate.sectionCount', {
              used: value.length.toLocaleString(),
              limit: limit.toLocaleString(),
            })}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-border px-3 pb-3 pt-2">
          <p className="font-body text-xs text-muted-foreground">
            {t(texts.hintKey)}
          </p>
          <textarea
            id={fieldId}
            aria-label={t(texts.titleKey)}
            value={value}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            rows={sectionKey === 'visualStyle' ? 10 : 4}
            spellCheck={false}
            className={cn(
              CUSTOM_STYLE_FIELD_CLASS,
              'resize-y font-mono text-xs leading-relaxed',
            )}
          />
          {notEnglish && (
            <div className="flex items-center justify-between gap-2">
              <p className="font-body text-xs text-saffron">
                {t('create.gemTemplate.notEnglish')}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('create.gemTemplate.notEnglishDismiss')}
                onClick={onDismissNotEnglish}
                className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
