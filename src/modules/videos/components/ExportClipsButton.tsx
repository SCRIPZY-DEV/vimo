import { useTranslation } from 'react-i18next'
import { Loader2, PackageOpen } from 'lucide-react'
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
}

// Export "para editar": un clip mudo por escena + audio en `clips/`; la
// carpeta se abre sola al terminar (lo hace el store con el opener).
export function ExportClipsButton({
  exportState,
  busy,
  onExport,
}: ExportClipsButtonProps) {
  const { t } = useTranslation()

  if (exportState) {
    return (
      <Button variant="outline" disabled className="rounded-xl font-display">
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        {t('library.editor.export.progress', {
          percent: exportState.percent,
        })}
      </Button>
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
