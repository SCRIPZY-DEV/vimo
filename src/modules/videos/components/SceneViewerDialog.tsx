import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

interface SceneViewerDialogProps {
  scenes: SceneSummary[]
  sceneId: number
  onClose: () => void
  onNavigate: (sceneId: number) => void
}

// Visor de una escena desde la grilla de progreso: imagen grande + texto +
// prompt. Se navega por ID de escena, no por índice (regla del origen: los
// ids son estables aunque la lista se reordene entre eventos).
export function SceneViewerDialog({
  scenes,
  sceneId,
  onClose,
  onNavigate,
}: SceneViewerDialogProps) {
  const { t } = useTranslation()

  const index = scenes.findIndex((scene) => scene.id === sceneId)
  if (index < 0) return null

  const scene = scenes[index]
  const previous = index > 0 ? scenes[index - 1] : null
  const next = index < scenes.length - 1 ? scenes[index + 1] : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('create.viewer.title', { id: scene.id })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
          <SceneThumbnail scene={scene} />
        </div>

        <p className="font-body text-sm text-foreground">{scene.text}</p>

        {scene.imagePrompt && (
          <p className="font-body text-xs leading-relaxed text-muted-foreground">
            {scene.imagePrompt}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!previous}
            onClick={() => previous && onNavigate(previous.id)}
            className="rounded-lg font-display"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t('create.viewer.previous')}
          </Button>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {index + 1} / {scenes.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!next}
            onClick={() => next && onNavigate(next.id)}
            className="rounded-lg font-display"
          >
            {t('create.viewer.next')}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
