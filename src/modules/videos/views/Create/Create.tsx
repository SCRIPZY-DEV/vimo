import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Brand } from '@/modules/common/brand/brand'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import DoodleWand from '@/modules/common/doodles/DoodleWand'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
import { MODULE_API_KEY_REQUIREMENTS } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { useDefaultSceneCount } from '@/modules/settings/hooks/useDefaultSceneCount'
import { useSceneDurationDefaults } from '@/modules/settings/hooks/useSceneDurationDefaults'
import { videosApi } from '@/modules/videos/api'
import { CreateForm } from '@/modules/videos/components/CreateForm'
import { GenerationProgress } from '@/modules/videos/components/GenerationProgress'
import { TtsProviderDownDialog } from '@/modules/videos/components/TtsProviderDownDialog'
import {
  CREATE_FORM_INITIAL_VALUE,
  VideosRoutes,
  libraryEditorPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useTtsProbe } from '@/modules/videos/hooks/useTtsProbe'
import { createProjectPayload } from '@/modules/videos/utilities/formPayload'
import { readStoredPromptModel } from '@/modules/videos/utilities/promptModelStorage'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { ProbeTtsReason } from '@pipeline/types/video-project.ts'

// Pantalla de creación de video. Espera las preferencias de escenas (cantidad
// por defecto y ritmo de los estilos propios) antes de montar el formulario: el
// estado inicial se siembra una sola vez y la lectura es de disco local
// (staleTime Infinity → instantánea al volver).
export function Create() {
  const { defaultSceneCount, isLoading } = useDefaultSceneCount()
  const { sceneDuration, isLoading: loadingSceneDuration } =
    useSceneDurationDefaults()

  if (isLoading || loadingSceneDuration) return <ViewSpinner />

  return (
    <CreateView
      initialSceneCount={
        defaultSceneCount ?? CREATE_FORM_INITIAL_VALUE.sceneCount
      }
      initialSecondsPerScene={
        sceneDuration?.secondsPerScene ??
        CREATE_FORM_INITIAL_VALUE.secondsPerScene
      }
      initialConfirmScenes={
        sceneDuration?.confirmScenes ?? CREATE_FORM_INITIAL_VALUE.confirmScenes
      }
    />
  )
}

interface CreateViewProps {
  initialSceneCount: number
  initialSecondsPerScene: number
  initialConfirmScenes: boolean
}

// Es dueña de la tarea: el formulario y la pantalla de progreso son
// presentacionales; el estado del job vive en el store de `useCreateTask`
// (sobrevive a la navegación y al reload). Con una tarea viva, la pantalla
// de progreso ocupa la página entera (origen): «Crear otro» la descarta y
// vuelve al formulario.
function CreateView({
  initialSceneCount,
  initialSecondsPerScene,
  initialConfirmScenes,
}: CreateViewProps) {
  const { t } = useTranslation()
  const { isNative, missingKeys } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.videos,
  })
  const { task, startCreation, confirmScenes, resume, cancel, discardTask } =
    useCreateTask()
  const { probe, probing } = useTtsProbe()
  const navigate = useNavigate()

  const [form, setForm] = useState<CreateFormValue>(() => ({
    ...CREATE_FORM_INITIAL_VALUE,
    sceneCount: initialSceneCount,
    secondsPerScene: initialSecondsPerScene,
    confirmScenes: initialConfirmScenes,
    promptModel: readStoredPromptModel(),
  }))

  // Sin auto-export el job termina sin video: el destino natural es el
  // editor (el proyecto quedó en borrador con todo generado, ADR-0016).
  useEffect(() => {
    if (task?.status !== 'completed' || task.videoPath || !task.projectId)
      return
    const projectId = task.projectId
    discardTask()
    navigate(libraryEditorPath(projectId))
  }, [task, discardTask, navigate])
  const [probeFailure, setProbeFailure] = useState<ProbeTtsReason | null>(null)

  usePageTitle(t('create.pageTitle'))

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

  if (task) {
    return (
      <GenerationProgress
        task={task}
        back={{
          labelKey: 'create.progress.createAnother',
          onClick: discardTask,
        }}
        // Cancelar no es un error (origen v0.35.0): se va a la biblioteca en
        // el acto y el proyecto queda ahí como cancelado, reanudable o
        // eliminable. En la pausa no hay job: solo se descarta la tarea.
        onCancel={() => {
          cancel()
          void navigate(VideosRoutes.library)
        }}
        onRetryPipeline={() => void resume()}
        onContinueInEditor={() => {
          const projectId = task.projectId
          discardTask()
          navigate(libraryEditorPath(projectId))
        }}
        onConfirmScenes={(choice) => void confirmScenes(choice)}
        onDismissConfirmation={discardTask}
      />
    )
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

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <CreateForm
          value={form}
          disabled={!isNative || missingKeys}
          submitting={probing}
          onChange={patchForm}
          onPickAudio={() => void pickAudio()}
          onSubmit={() => void submit()}
        />

        <div className="mt-8 border-t border-border/40 pb-2 pt-8 text-center">
          <p className="font-handwritten text-base text-muted-foreground">
            {t('create.form.footerNote')}
          </p>
          <p className="mt-1 font-body text-xs text-muted-foreground/70">
            {t('create.form.footerSupport', { email: Brand.supportEmail })}
          </p>
        </div>
      </motion.section>

      {probeFailure && (
        <TtsProviderDownDialog
          reason={probeFailure}
          retrying={probing}
          // Sigue abierto mientras se vuelve a probar: si el proveedor sigue
          // caído cambia el motivo; si responde, se cierra y arranca.
          onRetry={() => void submit()}
          onClose={() => setProbeFailure(null)}
        />
      )}
    </div>
  )
}
