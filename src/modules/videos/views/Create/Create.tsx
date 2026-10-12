import { estimatedSceneCount } from '@/modules/videos/utilities/estimateCreateCost'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { createApiRequirements } from '@/modules/videos/utilities/createApiRequirements'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Brand } from '@/modules/common/brand/brand'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import DoodleWand from '@/modules/common/doodles/DoodleWand'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { Button } from '@/modules/common/ui/button'
import { useVoiceVendor } from '@/modules/voices/hooks/useVoiceVendor'
import { MissingApiKeysNotice } from '@/modules/api-keys/components/MissingApiKeysNotice'
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
import { useCreateCostCheck } from '@/modules/videos/hooks/useCreateCostCheck'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { useTtsProbe } from '@/modules/videos/hooks/useTtsProbe'
import {
  demoFollowStyle,
  demoFormValue,
} from '@/modules/videos/utilities/demoForm'
import { readDemoState } from '@/modules/videos/utilities/demoState'
import { customStyleForTab } from '@/modules/videos/utilities/formLane'
import { createProjectPayload } from '@/modules/videos/utilities/formPayload'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import {
  refreshedCustomStyle,
  selectedCustomStyleFrom,
} from '@/modules/videos/utilities/selectedCustomStyle'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
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
  const {
    configuredProviders,
    isLoading: loadingApiKeys,
    isFetched: fetchedApiKeys,
  } = useRequiredApiKeys({ requirements: [] })
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

  // Tras el primer resultado, incluso si fue un error, los reintentos no
  // desmontan el formulario ni descartan lo que la persona ya escribió.
  if (
    isLoading ||
    loadingSceneDuration ||
    loadingPromptModel ||
    (loadingApiKeys && !fetchedApiKeys)
  )
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
  // Manifest del pack cuando se entra por la puerta de la demo (ADR-0029).
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
  const {
    task,
    startCreation,
    confirmScenes,
    resume,
    cancel,
    discardTask,
    reportPromptModelIssue,
    snoozePromptModelIssue,
    switchPromptModel,
  } = useCreateTask()
  const { probe, probing } = useTtsProbe()
  const navigate = useNavigate()
  const { styles: customStyles } = useCustomStyles()
  // El catálogo nuevo (Entrega 2): con el interruptor encendido y fuera de la
  // demo, que sigue con el catálogo viejo (plan E2, P5).
  const newCatalog = useAccessFeature('newCatalog') && demo === null
  // El modelo que viaja al proyecto ya resuelto (default aplicado y sin
  // bloqueados, ADR-0028): es el que la tarea vigila.
  const { models, defaultId } = usePromptModels()
  const { blockedIds } = usePromptModelBlocks()

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
  // Con el catálogo nuevo, una selección por pestaña: la de la pestaña que no
  // está a la vista. Vive acá y no en el formulario, que se desmonta con la
  // pantalla de progreso (al generar, o si un pre-check frena el envío): al
  // volver, cada pestaña sigue con su tarjeta. Sin el catálogo nuevo nadie la
  // toca.
  const [otherTabStyle, setOtherTabStyle] =
    useState<SelectedCustomStyle | null>(null)

  const { vendor: defaultVoiceVendor, isLoading: loadingVoiceVendor } =
    useVoiceVendor()
  const checkingVoiceVendor =
    form.narrationMode === 'tts' && !form.voice && loadingVoiceVendor
  const requirements = createApiRequirements(form, defaultVoiceVendor)
  const {
    isNative,
    missingKeys,
    missingRequirements,
    ready: keysReady,
    isFetching: checkingKeys,
    errorKey: keysErrorKey,
    refreshStatus,
  } = useRequiredApiKeys({ requirements })
  const apiReady = keysReady && !checkingVoiceVendor
  const flowCapacity = useFlowCapacity(
    estimatedSceneCount(form, form.script.trim()) || 1,
    form.imageProvider === 'flow' && !demo,
    { executionPlan: form.executionPlan },
  )

  // En demo la gema del pack arranca en uso apenas la galería la lista: se
  // deriva en el render (sin efecto); elegir otra tarjeta la reemplaza.
  const demoGem =
    demo && form.customStyle === null
      ? customStyles.find((style) => style.id === demo.customStyleId)
      : undefined
  const chosenStyle = demoGem
    ? selectedCustomStyleFrom(demoGem)
    : form.customStyle
  // Si la gema elegida se migró a la plantilla mientras tanto (spec §4.4), el
  // envío ya sale con sus secciones: el snapshot se refresca desde la lista,
  // también en el render. Un estilo del catálogo nuevo solo vale en su
  // pestaña y con el catálogo nuevo activo: si el interruptor se apaga a
  // mitad de camino, Crear vuelve al catálogo viejo sin arrastrarlo.
  const customStyle = customStyleForTab(
    {
      styleSource: form.styleSource,
      customStyle: refreshedCustomStyle(chosenStyle, customStyles),
    },
    newCatalog,
  )
  const formValue =
    customStyle === form.customStyle ? form : { ...form, customStyle }

  // El formulario ya avisa con el saldo cacheado; acá se re-lee justo antes
  // de arrancar (ADR-0031): un saldo de hace un minuto pudo gastarse.
  const { verify: verifyCredits } = useCreateCostCheck({ form })

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
      ...(demo || (patch.imageProvider ?? current.imageProvider) !== 'flow'
        ? { executionPlan: undefined }
        : {}),
      // En demo la historia sigue al estilo elegido.
      ...(demo ? demoFollowStyle(demo, current, patch) : {}),
    }))
  }

  const pickAudio = async () => {
    const path = await videosApi.pickNarrationFile()
    if (path) patchForm({ narrationFilePath: path })
  }

  const submit = async () => {
    if (!apiReady && !demo) return
    if (
      form.imageProvider === 'flow' &&
      !demo &&
      !(await flowCapacity.verify())
    )
      return
    setProbeFailure(null)
    const promptModel = resolvePromptModel(
      form.promptModel,
      models,
      defaultId,
      blockedIds,
    )
    await startCreation({
      // La tarea se muestra en el acto. Voz y saldo se comprueban en paralelo
      // antes de crear el proyecto o consumir créditos en generaciones.
      beforeCreate: async (isCurrent) => {
        const [voiceCheck, costCheck] = await Promise.all([
          !demo && formValue.narrationMode === 'tts' && formValue.voice
            ? probe(formValue.voice)
            : null,
          verifyCredits(),
        ])
        if (!isCurrent()) return false
        if (voiceCheck && !voiceCheck.ok) {
          setProbeFailure(voiceCheck.reason)
          return false
        }
        return !costCheck.blocking
      },
      // `formValue` (y no `form`): en demo lleva la gema derivada en el render.
      payload: createProjectPayload(
        { ...formValue, promptModel },
        { demo: demo !== null },
      ),
      narrationFilePath:
        formValue.narrationMode === 'own-audio'
          ? formValue.narrationFilePath
          : null,
      promptModel,
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
        onRestartFlow={(request) => void resume(request)}
        onContinueInEditor={() => {
          const projectId = task.projectId
          discardTask()
          navigate(libraryEditorPath(projectId))
        }}
        onConfirmScenes={(choice) => void confirmScenes(choice)}
        onDismissConfirmation={discardTask}
        onPromptModelStall={() => reportPromptModelIssue(task.id, 'stalled')}
        onSnoozePromptModelIssue={snoozePromptModelIssue}
        onSwitchPromptModel={(modelId) => void switchPromptModel(modelId)}
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

      {keysErrorKey && !demo && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
        >
          <p className="text-sm">{t('apiKeys.statusCheckFailed')}</p>
          <p className="text-xs text-muted-foreground">{t(keysErrorKey)}</p>
          <Button
            type="button"
            variant="outline"
            disabled={checkingKeys}
            onClick={() => void refreshStatus()}
          >
            {t(checkingKeys ? 'apiKeys.checkingStatus' : 'apiKeys.retryStatus')}
          </Button>
        </div>
      )}
      {missingKeys && !checkingVoiceVendor && !demo && (
        <MissingApiKeysNotice requirements={missingRequirements} />
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <CreateForm
          value={formValue}
          demo={demo}
          newCatalog={newCatalog}
          otherTabStyle={otherTabStyle}
          onOtherTabStyleChange={setOtherTabStyle}
          disabled={!isNative}
          apiReady={apiReady || demo !== null}
          apiIssueKey={
            keysErrorKey
              ? 'apiKeys.statusCheckFailed'
              : !apiReady && (checkingKeys || checkingVoiceVendor)
                ? 'apiKeys.checkingStatus'
                : undefined
          }
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
