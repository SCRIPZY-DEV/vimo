import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
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
import { usePromptModelPreference } from '@/modules/settings/hooks/usePromptModelPreference'
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
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { useTtsProbe } from '@/modules/videos/hooks/useTtsProbe'
import {
  demoFollowStyle,
  demoFormValue,
} from '@/modules/videos/utilities/demoForm'
import { readDemoState } from '@/modules/videos/utilities/demoState'
import { createProjectPayload } from '@/modules/videos/utilities/formPayload'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import { selectedCustomStyleFrom } from '@/modules/videos/utilities/selectedCustomStyle'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { DemoManifest } from '@pipeline/types/demo.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { ProbeTtsReason } from '@pipeline/types/video-project.ts'

// Pantalla de creación de video. Espera las preferencias (escenas, ritmo de los
// estilos propios y modelo de escritura) y el estado de las claves antes de
// montar el formulario: el estado inicial se siembra una sola vez y la
// lectura es de disco local (staleTime Infinity → instantánea al volver).
export function Create() {
  const { defaultSceneCount, isLoading } = useDefaultSceneCount()
  const { sceneDuration, isLoading: loadingSceneDuration } =
    useSceneDurationDefaults()
  const { promptModelDefaults, isLoading: loadingPromptModel } =
    usePromptModelPreference()
  const { configuredProviders, isLoading: loadingApiKeys } = useRequiredApiKeys(
    { requirements: MODULE_API_KEY_REQUIREMENTS.videos },
  )
  const location = useLocation()
  const navigate = useNavigate()
  // El manifest de la demo llega una sola vez, en el state del router de la
  // puerta; se captura al montar y se pasa como dato.
  const [demo] = useState<DemoManifest | null>(() =>
    readDemoState(location.state),
  )

  // Limpia el state del historial (espejo del replaceState del origen):
  // «atrás» o un reload vuelven a un Crear normal.
  useEffect(() => {
    if (readDemoState(location.state) === null) return
    void navigate(VideosRoutes.create, { replace: true })
  }, [location.state, navigate])

  if (isLoading || loadingSceneDuration || loadingPromptModel || loadingApiKeys)
    return <ViewSpinner />

  return (
    <CreateView
      initialSceneCount={
        defaultSceneCount ?? CREATE_FORM_INITIAL_VALUE.sceneCount
      }
      initialImageProvider={
        preferredImageProvider(configuredProviders) ??
        CREATE_FORM_INITIAL_VALUE.imageProvider
      }
      initialSecondsPerScene={
        sceneDuration?.secondsPerScene ??
        CREATE_FORM_INITIAL_VALUE.secondsPerScene
      }
      initialConfirmScenes={
        sceneDuration?.confirmScenes ?? CREATE_FORM_INITIAL_VALUE.confirmScenes
      }
      initialPromptModel={promptModelDefaults?.modelId ?? null}
      demo={demo}
    />
  )
}

interface CreateViewProps {
  initialSceneCount: number
  // El proveedor de imagen con clave configurada (Evolink si están las dos).
  initialImageProvider: ImageProviderId
  initialSecondsPerScene: number
  // Preferencia «preguntar al generar» de Ajustes: siembra la casilla del
  // catálogo y fija (sin casilla) la pausa de duración del estilo propio.
  initialConfirmScenes: boolean
  initialPromptModel: string | null
  // Manifest del pack cuando se entra por la puerta de la demo (ADR-0027).
  demo: DemoManifest | null
}

// Es dueña de la tarea: el formulario y la pantalla de progreso son
// presentacionales; el estado del job vive en el store de `useCreateTask`
// (sobrevive a la navegación y al reload). Con una tarea viva, la pantalla
// de progreso ocupa la página entera (origen): «Crear otro» la descarta y
// vuelve al formulario.
function CreateView({
  initialSceneCount,
  initialImageProvider,
  initialSecondsPerScene,
  initialConfirmScenes,
  initialPromptModel,
  demo,
}: CreateViewProps) {
  const { t } = useTranslation()
  const { isNative, missingKeys } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.videos,
  })
  const { task, startCreation, confirmScenes, resume, cancel, discardTask } =
    useCreateTask()
  const { probe, probing } = useTtsProbe()
  const navigate = useNavigate()
  const { styles: customStyles } = useCustomStyles()

  const [form, setForm] = useState<CreateFormValue>(() => {
    const base: CreateFormValue = {
      ...CREATE_FORM_INITIAL_VALUE,
      sceneCount: initialSceneCount,
      // Los ids de calidad son por proveedor: la calidad acompaña al elegido.
      imageProvider: initialImageProvider,
      imageQuality: defaultQualityFor(
        initialImageProvider,
        CREATE_FORM_INITIAL_VALUE.videoFormat,
      ),
      secondsPerScene: initialSecondsPerScene,
      confirmScenes: initialConfirmScenes,
      // Con estilo propio no hay casilla: la pausa la decide Ajustes.
      confirmSceneDuration: initialConfirmScenes,
      promptModel: initialPromptModel,
    }
    return demo ? demoFormValue(base, demo) : base
  })

  // En demo la gema del pack arranca en uso apenas la galería la lista: se
  // deriva en el render (sin efecto); elegir otra tarjeta la reemplaza.
  const demoGem =
    demo && form.customStyle === null
      ? customStyles.find((style) => style.id === demo.customStyleId)
      : undefined
  const formValue = demoGem
    ? { ...form, customStyle: selectedCustomStyleFrom(demoGem) }
    : form

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
    setForm((current) => ({
      ...current,
      ...patch,
      // En demo la historia sigue al estilo elegido.
      ...(demo ? demoFollowStyle(demo, current, patch) : {}),
    }))
  }

  const pickAudio = async () => {
    const path = await videosApi.pickNarrationFile()
    if (path) patchForm({ narrationFilePath: path })
  }

  const submit = async () => {
    // Pre-flight del proveedor de voz: avisa antes de arrancar un pipeline
    // largo. Solo aplica con narración por IA, y no en demo (sin probe).
    if (!demo && formValue.narrationMode === 'tts' && formValue.voice) {
      const result = await probe(formValue.voice)
      if (!result.ok) {
        setProbeFailure(result.reason)
        return
      }
    }
    setProbeFailure(null)
    await startCreation({
      payload: createProjectPayload(formValue, { demo: demo !== null }),
      narrationFilePath:
        formValue.narrationMode === 'own-audio'
          ? formValue.narrationFilePath
          : null,
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

      {missingKeys && !demo && (
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
          value={formValue}
          demo={demo}
          disabled={!isNative || (missingKeys && !demo)}
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
