import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { SUPPORT_NOTE_CLASS } from '@/modules/videos/constants'

interface PromptsProgressCardProps {
  done: number
  total: number
}

// Cabecera del avance de prompts. El porcentaje es REAL: cuenta los prompts
// que llegaron por evento. Si el modelo se traba, la barra se queda quieta —
// exactamente lo que hay que mostrar cuando eso pasa.
export function PromptsProgressCard({ done, total }: PromptsProgressCardProps) {
  const { t } = useTranslation()

  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const writing = done < total

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {writing && (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-saffron" />
          )}
          <div>
            <h3 className="font-display text-xl font-extrabold text-foreground">
              {writing
                ? t('create.prompts.writingTitle', { total })
                : t('create.prompts.doneTitle', { total })}
            </h3>
            <p className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
              {writing
                ? t('create.prompts.writingSubtitle', {
                    done,
                    total,
                    percent,
                  })
                : t('create.prompts.doneSubtitle')}
            </p>
          </div>
        </div>
        {writing && (
          <span className="font-display text-3xl font-extrabold tabular-nums text-saffron">
            {percent}%
          </span>
        )}
      </div>

      {writing && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-saffron transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
