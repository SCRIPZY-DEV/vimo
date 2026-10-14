import { useTranslation } from 'react-i18next'
import { Loader2, PackageOpen, X } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import type { EditorExportState } from '@/modules/videos/types/library'

interface ExportClipsButtonProps {
  exportState: EditorExportState | null
  busy: boolean
  onExport(): void
  onCancel(): void
}

// Export "para editar": un clip mudo por escena + audio en `clips/`; la
// carpeta se abre sola al terminar (lo hace el store con el opener). Mientras
// exporta, el botón es una píldora con el progreso y su «Cancelar», como la
// del render; un segundo clic no vuelve a pedir nada (lo filtra el store).
export function ExportClipsButton({
  exportState,
  busy,
  onExport,
  onCancel,
}: ExportClipsButtonProps) {
  const { t } = useTranslation()

  if (exportState) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-xl border border-input bg-background px-3">
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
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          onClick={onExport}
          disabled={busy}
          className="rounded-xl font-display"
        >
          <PackageOpen className="mr-1.5 h-4 w-4" />
          {t('library.editor.export.button')}
        </Button>
      </TooltipTrigger>
      {/* Debajo del botón: en la barra del editor no hay lugar arriba y el
          texto se perdería contra el borde de la ventana. */}
      <TooltipContent side="bottom" className="max-w-xs text-sm leading-snug">
        {t('library.editor.export.help')}
      </TooltipContent>
    </Tooltip>
  )
}
