import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { MAX_SCENE_COUNT } from '@/modules/videos/constants'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import type { SceneConfirmationView } from '@/modules/videos/types/create'

interface ConfirmScenesDialogProps {
  confirmation: SceneConfirmationView
  onConfirm: (sceneCount: number) => void
  onCancel: () => void
}

export function ConfirmScenesDialog({
  confirmation,
  onConfirm,
  onCancel,
}: ConfirmScenesDialogProps) {
  const { t } = useTranslation()
  const [sceneCount, setSceneCount] = useState(confirmation.suggestedScenes)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('create.confirmScenes.title')}
          </DialogTitle>
          <DialogDescription>
            {t('create.confirmScenes.description', {
              duration: formatTime(confirmation.audioDurationSeconds),
              words: confirmation.wordCount,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-scene-count" className="font-display">
            {t('create.confirmScenes.countLabel')}
          </Label>
          <Input
            id="confirm-scene-count"
            type="number"
            min={1}
            max={MAX_SCENE_COUNT}
            value={sceneCount}
            onChange={(event) =>
              setSceneCount(
                clampSceneCount(
                  event.target.value,
                  confirmation.suggestedScenes,
                ),
              )
            }
          />
          <p className="font-body text-xs text-muted-foreground">
            {t('create.confirmScenes.hint', {
              suggested: confirmation.suggestedScenes,
            })}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="rounded-xl font-display"
          >
            {t('create.form.cancel')}
          </Button>
          <Button
            onClick={() => onConfirm(sceneCount)}
            className="rounded-xl font-display font-bold"
          >
            {t('create.confirmScenes.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
