import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { DataBox } from '@/modules/videos/components/DataBox'
import { MAX_SCENE_COUNT } from '@/modules/videos/constants'
import { clampSceneCount } from '@/modules/videos/utilities/clampSceneCount'
import type {
  SceneConfirmationView,
  SceneCutChoice,
} from '@/modules/videos/types/create'

interface ConfirmScenesDialogProps {
  open: boolean
  confirmation: SceneConfirmationView | null
  onConfirm: (choice: SceneCutChoice) => void
  onCancel: () => void
}

interface ConfirmScenesFormProps {
  confirmation: SceneConfirmationView
  onConfirm: (choice: SceneCutChoice) => void
  onCancel: () => void
}

// El formulario vive en su propio componente para que su estado arranque de
// cero cada vez que el diálogo se abre (se monta con él).
function ConfirmScenesForm({
  confirmation,
  onConfirm,
  onCancel,
}: ConfirmScenesFormProps) {
  const { t } = useTranslation()
  const [sceneCount, setSceneCount] = useState(confirmation.suggestedScenes)

  return (
    <>
      <h2 className="font-display text-xl font-extrabold text-foreground">
        {t('create.confirmScenes.title')}
      </h2>
      <p className="mt-1.5 font-body text-sm leading-relaxed text-muted-foreground">
        {t('create.confirmScenes.description')}
      </p>

      {/* Los tres datos que informan la decisión, de un vistazo. */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/40 p-3">
        <DataBox
          label={t('create.confirmScenes.duration')}
          // «01:14», como en el origen: formatTime da «1:14».
          value={formatTime(confirmation.audioDurationSeconds).padStart(5, '0')}
        />
        <DataBox
          label={t('create.confirmScenes.words')}
          value={String(confirmation.wordCount)}
        />
        <DataBox
          label={t('create.confirmScenes.suggested')}
          value={String(confirmation.suggestedScenes)}
        />
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm({ sceneCount })
        }}
      >
        <div>
          <Label
            htmlFor="confirm-scene-count"
            className="font-display text-sm font-semibold"
          >
            {t('create.confirmScenes.countLabel')}
          </Label>
          <Input
            id="confirm-scene-count"
            type="number"
            min={1}
            max={MAX_SCENE_COUNT}
            inputMode="numeric"
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
            className="mt-1 font-mono text-base tabular-nums"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('create.form.cancel')}
          </Button>
          <Button
            type="submit"
            className="bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
          >
            {t('create.confirmScenes.confirm')}
          </Button>
        </div>
      </form>
    </>
  )
}

// La pausa clásica del pipeline: «tu audio dura X, ¿cuántas escenas?» (port
// de DialogConfirmarEscenas del origen). Queda montado siempre y se abre con
// `open`, así el cierre anima la salida. El carril de segundos de un estilo
// propio no pasa por acá: usa SecondsPerSceneStep, inline en la pantalla.
export function ConfirmScenesDialog({
  open,
  confirmation,
  onConfirm,
  onCancel,
}: ConfirmScenesDialogProps) {
  return (
    <AnimatePresence>
      {open && confirmation && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-2xl border-2 border-saffron/40 bg-card p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <ConfirmScenesForm
              confirmation={confirmation}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
