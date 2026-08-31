import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import DoodleWand from '@/modules/common/doodles/DoodleWand'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
import { MODULE_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { videosApi } from '@/modules/videos/api'
import { CompletedPanel } from '@/modules/videos/components/CompletedPanel'
import { TaskErrorCard } from '@/modules/videos/components/TaskErrorCard'
import { ConfirmScenesDialog } from '@/modules/videos/components/ConfirmScenesDialog'
import { CreateForm } from '@/modules/videos/components/CreateForm'
import { GenerationProgress } from '@/modules/videos/components/GenerationProgress'
import { TtsProviderDownDialog } from '@/modules/videos/components/TtsProviderDownDialog'
import {
  CREATE_FORM_INITIAL_VALUE,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useTtsProbe } from '@/modules/videos/hooks/useTtsProbe'
import { createProjectPayload } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { ProbeTtsReason } from '@pipeline/types/video-project.ts'

// Pantalla de creación de video. Es dueña de la tarea: el formulario y los
// paneles de progreso son presentacionales; el estado del job vive en el
// store de `useCreateTask` (sobrevive a la navegación y al reload).
export function Create() {
  const { t } = useTranslation()
  const { isNative, missingKeys } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.videos,
  })
  const { task, startCreation, confirmScenes, resume, cancel, discardTask } =
    useCreateTask()
  const { probe, probing } = useTtsProbe()

  const [form, setForm] = useState<CreateFormValue>(CREATE_FORM_INITIAL_VALUE)
  const [probeFailure, setProbeFailure] = useState<ProbeTtsReason | null>(null)

  usePageTitle(t('create.pageTitle'))

  const busy = task?.status === 'creating' || task?.status === 'generating'
  const showForm = !task || task.status === 'error'

  const patchForm = (patch: Partial<CreateFormValue>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const pickAudio = async () => {
    const path = await videosApi.pickNarrationFile()
    if (path) patchForm({ narrationFilePath: path })
  }

  const submit = async () => {
    // Pre-flight del proveedor de voz: avisa antes de arrancar un pipeline
    // largo. Solo aplica con narración por IA.
    if (form.narrationMode === 'tts' && form.voice) {
      const result = await probe(form.voice)
      if (!result.ok) {
        setProbeFailure(result.reason)
        return
      }
    }
    setProbeFailure(null)
    await startCreation({
      payload: createProjectPayload(form),
      narrationFilePath:
        form.narrationMode === 'own-audio' ? form.narrationFilePath : null,
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <DoodleWand size={48} delay={100} />
        <div>
          <h1 className="font-display text-3xl font-extrabold text-foreground">
            {t('create.title')}
          </h1>
          <p className="font-handwritten text-lg text-muted-foreground">
            {t('create.tagline')}
          </p>
        </div>
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('create.desktopOnly')}
        </p>
      )}

      {missingKeys && (
        <MissingApiKeysNotice
          requirements={MODULE_API_KEY_REQUIREMENTS.videos}
        />
      )}

      {task && task.status !== 'completed' && task.status !== 'error' && (
        <GenerationProgress task={task} onCancel={cancel} />
      )}

      {task?.status === 'completed' && (
        <CompletedPanel task={task} onCreateAnother={discardTask} />
      )}

      {task?.status === 'error' && (
        <TaskErrorCard
          message={t(task.errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}
          onRetry={() => void resume()}
          onDiscard={discardTask}
        />
      )}

      {showForm && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <CreateForm
            value={form}
            disabled={!isNative || missingKeys || busy}
            submitting={busy || probing}
            onChange={patchForm}
            onPickAudio={() => void pickAudio()}
            onSubmit={() => void submit()}
          />
        </motion.section>
      )}

      {task?.status === 'awaitingConfirmation' && task.confirmation && (
        <ConfirmScenesDialog
          confirmation={task.confirmation}
          onConfirm={(sceneCount) => void confirmScenes(sceneCount)}
          onCancel={discardTask}
        />
      )}

      {probeFailure && (
        <TtsProviderDownDialog
          reason={probeFailure}
          onRetry={() => {
            setProbeFailure(null)
            void submit()
          }}
          onClose={() => setProbeFailure(null)}
        />
      )}
    </div>
  )
}
