import * as Dialog from '@radix-ui/react-dialog'
import { GripHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAnimationDialogPosition } from '@/modules/videos/hooks/useAnimationDialogPosition'
import type { AnimationDialogProps } from '@/modules/videos/types/animationDialog'

// Radix conserva foco, Escape y cierre exterior. Sin overlay ni cambios de
// layout, el editor y su preview mantienen el tamaño mientras se mueve.
export function AnimationDialog({
  title,
  trigger,
  children,
}: AnimationDialogProps) {
  return (
    <Dialog.Root modal={false}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <AnimationDialogContent title={title}>
          {children}
        </AnimationDialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AnimationDialogContent({
  title,
  children,
}: Omit<AnimationDialogProps, 'trigger'>) {
  const { t } = useTranslation()
  const { panelRef, position, onPointerDown, onKeyDown } =
    useAnimationDialogPosition()

  return (
    <Dialog.Content
      ref={panelRef}
      aria-describedby={undefined}
      className="fixed left-1/2 top-24 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col rounded-2xl border-2 border-sky/50 bg-background shadow-2xl outline-none"
      style={
        position
          ? { left: position.x, top: position.y, transform: 'none' }
          : undefined
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-sky/20 p-3">
        <button
          type="button"
          aria-label={t('library.editor.animationDialog.move')}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-lg p-1 text-left outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-sky cursor-grab"
        >
          <GripHorizontal aria-hidden className="h-4 w-4 shrink-0 text-sky" />
          <Dialog.Title asChild>
            <span className="font-display text-sm font-bold">{title}</span>
          </Dialog.Title>
        </button>
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label={t('library.editor.animationDialog.close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sky/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </Dialog.Close>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-4">{children}</div>
    </Dialog.Content>
  )
}
