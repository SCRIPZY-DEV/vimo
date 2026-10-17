import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, Loader2, PackageOpen, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/common/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import type { EditorExportState } from '@/modules/videos/types/library'

interface ExportClipsButtonProps {
  exportState: EditorExportState | null
  busy: boolean
  onExport(imageMotion: boolean): void
  onCancel(): void
}

// La elección sólo afecta esta exportación, no el render ni el proyecto.
export function ExportClipsButton({
  exportState,
  busy,
  onExport,
  onCancel,
}: ExportClipsButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [imageMotion, setImageMotion] = useState(true)
  const container = useRef<HTMLDivElement>(null)
  const unavailable = busy || exportState !== null

  // Otra tarea puede empezar con el diálogo abierto. Nunca conserva una
  // confirmación oculta que reaparezca sola cuando esa tarea termine.
  if (open && unavailable) setOpen(false)

  function confirmExport() {
    if (!open || unavailable) return
    setOpen(false)
    onExport(imageMotion)
  }

  return (
    <div ref={container} tabIndex={-1} className="rounded-xl outline-none">
      <Dialog open={open} onOpenChange={setOpen}>
        {exportState ? (
          <div className="flex h-10 items-center gap-2 rounded-xl border border-input bg-background px-3 outline-none">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="font-display text-sm text-foreground">
              {t('library.editor.export.progress', {
                percent: exportState.percent,
              })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCancel}
              aria-label={t('library.editor.export.cancel')}
              className="h-6 w-6 rounded-md text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={unavailable}
                  className="rounded-xl font-display"
                >
                  <PackageOpen className="mr-1.5 h-4 w-4" />
                  {t('library.editor.export.button')}
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              className="max-w-xs text-sm leading-snug"
            >
              {t('library.editor.export.help')}
            </TooltipContent>
          </Tooltip>
        )}
        <DialogContent
          className="rounded-2xl"
          onCloseAutoFocus={(event) => {
            // El botón queda deshabilitado al exportar; un contenedor estable
            // recibe el foco. Cancelar/Escape vuelven al Trigger normalmente.
            if (!unavailable) return
            event.preventDefault()
            container.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('library.editor.export.button')}</DialogTitle>
            <DialogDescription>
              {t('library.editor.export.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-4">
            <label className="flex flex-1 cursor-pointer items-start gap-3 font-body text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={imageMotion}
                disabled={unavailable}
                onChange={(event) => setImageMotion(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
              />
              {t('library.editor.export.imageMotion')}
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t('library.editor.export.imageMotionHelpLabel')}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-xs text-sm leading-snug"
              >
                {t('library.editor.export.imageMotionHelp')}
              </TooltipContent>
            </Tooltip>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">
                {t('library.editor.export.cancelDialog')}
              </Button>
            </DialogClose>
            <Button onClick={confirmExport} disabled={unavailable}>
              {t('library.editor.export.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
