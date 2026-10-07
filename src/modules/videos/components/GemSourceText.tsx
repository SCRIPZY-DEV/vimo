import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { CUSTOM_STYLE_FIELD_CLASS } from '@/modules/videos/constants'

interface GemSourceTextProps {
  text: string
}

// «Texto original»: el texto del que salieron las secciones (`sourcePrompt`,
// la gema pegada o la vieja que se actualizó sola), guardado de respaldo (spec
// §4.4). Plegado y solo de lectura, con la misma caja que una sección: sirve
// para compararlo con las secciones o copiar lo que la IA dejó afuera. Si está
// abierto es estado de esta vista; el texto no se edita ni se vuelve a guardar.
export function GemSourceText({ text }: GemSourceTextProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const fieldId = 'gem-source-text'

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={fieldId}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-sm font-bold text-foreground">
            {t('create.gemTemplate.sourceTitle')}
          </span>
          <span className="block font-body text-xs text-muted-foreground">
            {t('create.gemTemplate.sourceHint')}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <textarea
            id={fieldId}
            aria-label={t('create.gemTemplate.sourceTitle')}
            value={text}
            readOnly
            rows={10}
            spellCheck={false}
            className={cn(
              CUSTOM_STYLE_FIELD_CLASS,
              'resize-y font-mono text-xs leading-relaxed text-muted-foreground',
            )}
          />
        </div>
      )}
    </div>
  )
}
