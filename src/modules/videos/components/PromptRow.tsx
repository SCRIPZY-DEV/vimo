import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { hasPrompt } from '@/modules/videos/utilities/hasPrompt'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

interface PromptRowProps {
  scene: SceneSummary
}

function clock(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

// Una escena de la grilla de prompts: número, texto del guion y el prompt
// (o su placeholder mientras se escribe), con los tiempos al costado.
export function PromptRow({ scene }: PromptRowProps) {
  const { t } = useTranslation()
  const ready = hasPrompt(scene)

  return (
    <div
      className={cn(
        'flex gap-4 rounded-2xl border-2 bg-card p-5 transition-colors',
        ready ? 'border-border' : 'border-dashed border-border/60',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 font-display text-sm font-bold',
          ready
            ? 'border-saffron/40 bg-saffron/10 text-foreground'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {scene.id}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        {/* El texto de la escena se ve SIEMPRE: es lo que la persona reconoce
            de su propio guion, y lo que dice qué se está ilustrando. */}
        <p className="font-body text-sm text-muted-foreground">{scene.text}</p>

        {ready ? (
          <p className="font-body text-sm leading-relaxed text-foreground">
            {scene.imagePrompt}
          </p>
        ) : (
          /* Tres barras que laten, del ancho de un prompt: se lee como «acá
             va a aparecer texto» sin fingir contenido que todavía no existe. */
          <div
            className="animate-pulse space-y-2 py-1"
            aria-label={t('create.prompts.writingAria')}
          >
            <div className="h-3 w-full rounded-full bg-muted" />
            <div className="h-3 w-11/12 rounded-full bg-muted" />
            <div className="h-3 w-2/3 rounded-full bg-muted" />
          </div>
        )}
      </div>

      <span className="shrink-0 font-display text-xs font-bold tabular-nums text-muted-foreground">
        {clock(scene.startSeconds ?? 0)} → {clock(scene.endSeconds ?? 0)}
      </span>
    </div>
  )
}
