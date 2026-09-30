import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { SUPPORT_NOTE_CLASS } from '@/modules/videos/constants'

interface PromptsProgressCardProps {
  done: number
  total: number
  drafted: number
  complete: boolean
  // Pasada de reescritura (fase de imágenes): los títulos cambian y el
  // spinner se mantiene aunque el conteo llegue al total — la pasada la
  // cierra el evento de reintento, no el contador.
  rewrite: { pass: number; maxPasses: number } | null
}

// El porcentaje refleja la escritura recibida por stream. Llegar al 100%
// no completa la fase: sigue cargando mientras se validan y guardan los
// prompts, hasta recibir la confirmación del pipeline.
export function PromptsProgressCard({
  done,
  total,
  drafted,
  complete,
  rewrite,
}: PromptsProgressCardProps) {
  const { t } = useTranslation()

  const writing = rewrite !== null || !complete || done < total
  const written = Math.min(total, Math.max(done, drafted))
  const percent = total > 0 ? Math.floor((written / total) * 100) : 0
  const finalizing = writing && total > 0 && written >= total && !rewrite
  const title = rewrite
    ? t('create.prompts.rewritingTitle', { total })
    : finalizing
      ? t('create.prompts.finalizingTitle')
      : writing
        ? t('create.prompts.writingTitle', { total })
        : t('create.prompts.doneTitle', { total })
  const subtitle = rewrite
    ? t('create.prompts.rewritingSubtitle', {
        done: written,
        total,
        percent,
        pass: rewrite.pass,
        maxPasses: rewrite.maxPasses,
      })
    : writing
      ? t('create.prompts.writingSubtitle', { done: written, total, percent })
      : t('create.prompts.doneSubtitle')

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {writing && (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-saffron" />
          )}
          <div>
            <h3 className="font-display text-xl font-extrabold text-foreground">
              {title}
            </h3>
            <p className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
              {subtitle}
            </p>
            {rewrite && (
              <p
                className={cn(SUPPORT_NOTE_CLASS, 'mt-1 text-muted-foreground')}
              >
                {t('create.prompts.rewritingHint')}
              </p>
            )}
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
