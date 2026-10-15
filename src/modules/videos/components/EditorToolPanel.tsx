import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, X } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { EDITOR_TOOL_PANEL_RESIZE_STEP } from '@/modules/videos/constants'
import type {
  EditorToolPanelProps,
  EditorToolPanelResize,
} from '@/modules/videos/types/editorTools'
import type { KeyboardEvent, PointerEvent } from 'react'

export function EditorToolPanel({
  id,
  title,
  width,
  minWidth,
  maxWidth,
  className,
  children,
  onWidthChange,
  onClose,
}: EditorToolPanelProps) {
  const { t } = useTranslation()
  const resize = useRef<EditorToolPanelResize | null>(null)
  const effectiveWidth = Math.max(minWidth, Math.min(maxWidth, width))

  const changeWidth = (nextWidth: number) => {
    onWidthChange(Math.max(minWidth, Math.min(maxWidth, nextWidth)))
  }

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    const panel = event.currentTarget.closest<HTMLElement>(
      '[data-editor-tool-panel]',
    )
    const container = panel?.closest<HTMLElement>(
      '[data-editor-tool-container]',
    )
    if (!panel || !container) return

    event.currentTarget.focus({ preventScroll: true })
    resize.current = {
      panel,
      container,
      width: effectiveWidth,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: effectiveWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    const current = resize.current
    if (!current || current.pointerId !== event.pointerId) return

    current.width = Math.max(
      minWidth,
      Math.min(maxWidth, current.startWidth + event.clientX - current.startX),
    )
    // El panel y la vista previa siguen el puntero en este mismo evento. React
    // recibe sólo el ancho final, sin reconstruir el timeline en cada píxel.
    current.panel.style.width = `${current.width}px`
    current.container.style.width = `${current.width}px`
    event.currentTarget.setAttribute(
      'aria-valuenow',
      String(Math.round(current.width)),
    )
  }

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    const current = resize.current
    if (!current || current.pointerId !== event.pointerId) return

    resize.current = null
    changeWidth(current.width)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') changeWidth(minWidth)
    else if (event.key === 'End') changeWidth(maxWidth)
    else if (event.key === 'ArrowLeft')
      changeWidth(effectiveWidth - EDITOR_TOOL_PANEL_RESIZE_STEP)
    else if (event.key === 'ArrowRight')
      changeWidth(effectiveWidth + EDITOR_TOOL_PANEL_RESIZE_STEP)
    else return

    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-editor-tool-panel
      style={{ width: effectiveWidth, maxWidth: '100%' }}
      className={cn(
        'relative flex h-full min-h-0 shrink-0 flex-col rounded-2xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <h2
          id={`${id}-title`}
          className="truncate font-display text-sm font-bold text-foreground"
        >
          {title}
        </h2>
        <button
          type="button"
          aria-label={t('common.cerrar')}
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [container-type:inline-size]">
        {children}
      </div>
      <div
        role="separator"
        aria-label={t('library.editor.tools.resize')}
        aria-orientation="vertical"
        aria-controls={id}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(effectiveWidth)}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        onLostPointerCapture={stopResize}
        onKeyDown={resizeWithKeyboard}
        className="group absolute inset-y-3 -right-2 z-10 flex w-4 touch-none cursor-col-resize select-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron"
      >
        <span className="flex h-10 w-3 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors group-hover:border-saffron group-hover:bg-saffron/20 group-active:bg-saffron/30">
          <GripVertical aria-hidden className="h-4 w-3" />
        </span>
      </div>
    </section>
  )
}
