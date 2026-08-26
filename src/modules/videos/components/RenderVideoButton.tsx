import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import type { EditorRenderState } from '@/modules/videos/types/library'

// Estado del mp4 final del proyecto, que decide la etiqueta del botón.
export type RenderedVideoState = 'none' | 'current' | 'outdated'

interface RenderVideoButtonProps {
  render: EditorRenderState | null
  videoState: RenderedVideoState
  busy: boolean
  onRender(): void
  onCancel(): void
}

const LABEL_KEYS: Record<RenderedVideoState, string> = {
  none: 'library.editor.render.render',
  current: 'library.editor.render.rerenderClean',
  outdated: 'library.editor.render.rerender',
}

// Ambas variantes (botón y panel de progreso) ocupan el mismo lugar.
const FLOATING_CLASSES = 'fixed bottom-6 right-6 z-20 shadow-card'

// Botón flotante de render del editor.
export function RenderVideoButton({
  render,
  videoState,
  busy,
  onRender,
  onCancel,
}: RenderVideoButtonProps) {
  const { t } = useTranslation()

  if (render) {
    return (
      <div
        className={cn(
          FLOATING_CLASSES,
          'flex items-center gap-3 rounded-2xl border-2 border-saffron/40 bg-card p-3',
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-saffron" />
        <span className="font-display text-sm font-bold text-foreground">
          {t(`library.editor.render.phase.${render.phase}`)} · {render.percent}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label={t('library.editor.render.cancel')}
          className="h-7 w-7 rounded-lg text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={onRender}
      disabled={busy}
      className={cn(FLOATING_CLASSES, 'rounded-2xl font-display font-bold')}
    >
      <Clapperboard className="mr-1.5 h-4 w-4" />
      {t(LABEL_KEYS[videoState])}
    </Button>
  )
}
