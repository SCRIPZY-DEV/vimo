import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import type {
  EditorRenderState,
  RenderedVideoState,
} from '@/modules/videos/types/library'

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

// Botón de render del editor; vive en la barra de acciones del header.
// Ambas variantes (botón y píldora de progreso) ocupan el mismo lugar.
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
      <div className="flex h-8 items-center gap-2 rounded-lg border border-saffron/40 bg-card px-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-saffron" />
        <span className="font-display text-xs font-bold text-foreground">
          {t(`library.editor.render.phase.${render.phase}`)} · {render.percent}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label={t('library.editor.render.cancel')}
          className="h-6 w-6 rounded-md text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          onClick={onRender}
          disabled={busy}
          className="rounded-lg font-display font-bold"
        >
          <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
          {t(LABEL_KEYS[videoState])}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm leading-snug">
        {t('library.editor.render.help')}
      </TooltipContent>
    </Tooltip>
  )
}
