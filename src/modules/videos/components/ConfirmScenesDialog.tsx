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
import { DataBox } from '@/modules/videos/components/DataBox'
import { useSceneCutPreview } from '@/modules/videos/hooks/useSceneCutPreview'
import {
  MAX_SCENE_COUNT,
  SECONDS_PER_SCENE_MAX,
  SECONDS_PER_SCENE_MIN,
} from '@/modules/videos/constants'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import {
  readStoredSecondsPerScene,
  storeSecondsPerScene,
} from '@/modules/videos/utilities/secondsPerSceneStorage'
import type {
  SceneConfirmationView,
  SceneCutChoice,
} from '@/modules/videos/types/create'

interface ConfirmScenesDialogProps {
  confirmation: SceneConfirmationView
  projectId: string
  onConfirm: (choice: SceneCutChoice) => void
  onCancel: () => void
}

// La pausa de confirmación, en dos modos: el conteo clásico (input numérico)
// y — cuando la pausa vino del carril de segundos de un estilo propio — el
// slider de segundos-por-escena (port reducido de PasoSegundosPorEscena del
// origen): el usuario elige la DURACIÓN y ve en vivo cuántas escenas salen,
// con la misma implementación que después corta. El valor elegido se
// recuerda entre videos (localStorage).
export function ConfirmScenesDialog({
  confirmation,
  projectId,
  onConfirm,
  onCancel,
}: ConfirmScenesDialogProps) {
  const { t } = useTranslation()
  const secondsLane = confirmation.secondsPerScene !== undefined
  const [sceneCount, setSceneCount] = useState(confirmation.suggestedScenes)
  const [seconds, setSeconds] = useState(() =>
    secondsLane
      ? (confirmation.secondsPerScene ?? readStoredSecondsPerScene())
      : readStoredSecondsPerScene(),
  )

  const preview = useSceneCutPreview({
    projectId,
    secondsPerScene: seconds,
    enabled: secondsLane,
  })
  // Mientras la primera preview llega, la cifra del evento (que salió del
  // mismo corte) evita el hueco.
  const resultingScenes = preview.sceneCount ?? confirmation.suggestedScenes

  const confirm = () => {
    if (!secondsLane) {
      onConfirm({ sceneCount })
      return
    }
    storeSecondsPerScene(seconds)
    onConfirm({ secondsPerScene: seconds })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md rounded-2xl border-2 border-saffron/40">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            {t('create.confirmScenes.title')}
          </DialogTitle>
          <DialogDescription className="font-body leading-relaxed">
            {secondsLane
              ? t('create.confirmScenes.secondsDescription')
              : t('create.confirmScenes.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Los tres datos que informan la decisión, de un vistazo. */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <DataBox
            label={t('create.confirmScenes.duration')}
            value={formatTime(confirmation.audioDurationSeconds)}
          />
          <DataBox
            label={t('create.confirmScenes.words')}
            value={String(confirmation.wordCount)}
          />
          <DataBox
            label={
              secondsLane
                ? t('create.confirmScenes.resulting')
                : t('create.confirmScenes.suggested')
            }
            value={String(
              secondsLane ? resultingScenes : confirmation.suggestedScenes,
            )}
          />
        </div>

        {secondsLane ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label
                htmlFor="confirm-seconds-per-scene"
                className="font-display"
              >
                {t('create.confirmScenes.secondsLabel')}
              </Label>
              <span className="font-mono text-sm font-bold tabular-nums text-saffron">
                {t('create.confirmScenes.secondsValue', { seconds })}
              </span>
            </div>
            <input
              id="confirm-seconds-per-scene"
              type="range"
              min={SECONDS_PER_SCENE_MIN}
              max={SECONDS_PER_SCENE_MAX}
              step={1}
              value={seconds}
              onChange={(event) => setSeconds(Number(event.target.value))}
              className="w-full accent-saffron"
            />
            <p className="font-body text-xs text-muted-foreground">
              {t('create.confirmScenes.secondsScenes', {
                count: resultingScenes,
              })}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              {t('create.confirmScenes.secondsHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-scene-count" className="font-display">
              {t('create.confirmScenes.countLabel')}
            </Label>
            <Input
              id="confirm-scene-count"
              type="number"
              min={1}
              max={MAX_SCENE_COUNT}
              autoFocus
              value={sceneCount}
              onChange={(event) =>
                setSceneCount(
                  clampSceneCount(
                    event.target.value,
                    confirmation.suggestedScenes,
                  ),
                )
              }
              className="font-mono tabular-nums"
            />
            <p className="font-body text-xs text-muted-foreground">
              {t('create.confirmScenes.hint', {
                suggested: confirmation.suggestedScenes,
              })}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="rounded-xl font-display"
          >
            {t('create.form.cancel')}
          </Button>
          <Button
            onClick={confirm}
            className="rounded-xl font-display font-bold"
          >
            {t('create.confirmScenes.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
