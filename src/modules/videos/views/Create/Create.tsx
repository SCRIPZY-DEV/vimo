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
  DEMO_VIDEO_FORMAT,
  VideosRoutes,
  libraryEditorPath,
} from '@/modules/videos/constants'
import { useCatalogStyles } from '@/modules/videos/hooks/useCatalogStyles'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useCreateCostCheck } from '@/modules/videos/hooks/useCreateCostCheck'
import { useCustomStyles } from '@/modules/videos/hooks/useCustomStyles'
import { useTtsProbe } from '@/modules/videos/hooks/useTtsProbe'
import { readCatalogCharacter } from '@/modules/videos/utilities/catalogCharacterMemory'
import {
  clearCreateDraft,
  readCreateDraft,
  writeCreateDraft,
} from '@/modules/videos/utilities/createDraft'
import {
  demoDefaultCatalogGem,
  demoFollowStyle,
  demoFormValue,
} from '@/modules/videos/utilities/demoForm'
import { readDemoState } from '@/modules/videos/utilities/demoState'
import { customStyleForTab } from '@/modules/videos/utilities/formLane'
import {
  createProjectPayload,
  withAvatarKey,
} from '@/modules/videos/utilities/formPayload'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import { selectedCatalogStyleFrom } from '@/modules/videos/utilities/selectedCatalogStyle'
import { refreshedCustomStyle } from '@/modules/videos/utilities/selectedCustomStyle'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CreateDraft } from '@/modules/videos/utilities/createDraft'
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
  // Manifest del pack cuando se entra por la puerta de la demo (ADR-0029).
  demo: DemoManifest | null
}

// Con qué se montó Crear: el formulario y la selección de la otra pestaña de
// ese primer render, y si salieron de un borrador (trabajo de la persona) o
// de las preferencias.
interface CreateMountSeed extends CreateDraft {
  restored: boolean
}

// Es dueña de la tarea: el formulario y la pantalla de progreso son
// presentacionales; el estado del job vive en el store de `useCreateTask`
// (sobrevive a la navegación y al reload). Con una tarea viva, la pantalla
// de progreso ocupa la página entera (origen): «Crear otro» la descarta y
// vuelve al formulario. El formulario, en cambio, sobrevive a la navegación
// en el borrador de Crear (createDraft), solo mientras la app sigue abierta.
function CreateView({
  initialSceneCount,
  initialImageProvider,
  initialSecondsPerScene,
  initialConfirmScenes,
  initialPromptModel,
  demo,
}: CreateViewProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const { isNative, missingKeys, configuredProviders } = useRequiredApiKeys({
    requirements: MODULE_API_KEY_REQUIREMENTS.videos,
  })
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
    switchVoice,
  } = useCreateTask()
  const { probe, probing } = useTtsProbe()
  const navigate = useNavigate()
  const { styles: customStyles } = useCustomStyles()
  // El catálogo nuevo (Entrega 2): con el interruptor encendido y siempre en
  // la demo, aunque la cuenta no lo tenga (spec demo v4 §2: sus historias son
  // de los estilos del catálogo nuevo). Sin el carril viejo, la demo tampoco
  // muestra cantidad de escenas ni «Confirmar escenas».
  const newCatalog = useAccessFeature('newCatalog') || demo !== null
  // La lista del catálogo de la galería: la demo la lee para la tarjeta que
  // usa sin una elegida (withDemoDefaultStyle). Fuera de la demo no se pide
  // de paso: la pide la galería al montarse.
  const { gems: catalogGems } = useCatalogStyles({ enabled: demo !== null })
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
    // La demo arranca en 16:9, con la calidad de ese formato.
    if (demo)
      return demoFormValue(
        {
          ...base,
          videoFormat: DEMO_VIDEO_FORMAT,
          imageQuality: defaultQualityFor(
            initialImageProvider,
            DEMO_VIDEO_FORMAT,
          ),
        },
        demo,
      )

    // De vuelta en Crear (spec §9), el borrador manda sobre la semilla de las
    // preferencias: el formulario sigue como se dejó. Salvo lo que ninguna
    // pantalla de Crear edita y solo siembra Ajustes —la duración de escena
    // de las gemas y la pausa para elegirla—: eso sale siempre de la semilla
    // actual, así una preferencia cambiada con un borrador vivo es la que
    // viaja al generar.
    const draft = readCreateDraft()
    if (!draft) return base

    return {
      ...draft.form,
      secondsPerScene: base.secondsPerScene,
      confirmSceneDuration: base.confirmSceneDuration,
    }
  })
  // Con el catálogo nuevo, una selección por pestaña: la de la pestaña que no
  // está a la vista. Vive acá y no en el formulario, que se desmonta con la
  // pantalla de progreso (al generar, o si un pre-check frena el envío): al
  // volver, cada pestaña sigue con su tarjeta. Sin el catálogo nuevo nadie la
  // toca. También vuelve con el borrador.
  const [otherTabStyle, setOtherTabStyle] =
    useState<SelectedCustomStyle | null>(() => {
      if (demo) return null

      return readCreateDraft()?.otherTabStyle ?? null
    })

  // Con qué se montó el formulario y si salió de un borrador: lo que decide
  // qué se guarda (saveCreateDraft). Cada cambio arma un objeto nuevo, así
  // que basta comparar referencias.
  const [seed] = useState<CreateMountSeed>(() => ({
    form,
    otherTabStyle,
    restored: !demo && readCreateDraft() !== null,
  }))

  // El borrador sigue al formulario en cada cambio: es un efecto porque
  // sincroniza con algo de afuera de React (la memoria del módulo), y así
  // salir de Crear por un enlace («Crear escenario», «Ir a Claves API») no
  // pierde nada. La demo ni lo lee ni lo escribe.
  useEffect(() => {
    if (demo) return

    saveCreateDraft({ form, otherTabStyle }, seed)
  }, [form, otherTabStyle, demo, seed])

  // En demo, la pestaña Catálogo sin tarjeta elegida usa la primera que
  // ofrece la galería, con su historia (spec demo v4 §2): así arranca y así
  // queda al apagar el avatar con Jardinería. Se deriva en el render, sin
  // efecto, apenas la lista del catálogo carga (mientras tanto no hay ninguna
  // y el envío se frena), y el primer cambio la deja en el formulario
  // (patchForm): lo que se ve es lo que se edita. El modo de personaje es el
  // que usaría un clic en la galería (el recordado o el de sus muestras).
  const withDemoDefaultStyle = (current: CreateFormValue): CreateFormValue => {
    if (!demo) return current

    const gem = demoDefaultCatalogGem(demo, current, catalogGems)
    if (!gem) return current

    const customStyle = selectedCatalogStyleFrom(
      gem,
      language,
      readCatalogCharacter(gem, localStorage),
    )
    return {
      ...current,
      customStyle,
      ...demoFollowStyle(demo, current, { customStyle }),
    }
  }
  const shownForm = withDemoDefaultStyle(form)
  // Si la gema elegida se migró a la plantilla mientras tanto (spec §4.4), el
  // envío ya sale con sus secciones: el snapshot se refresca desde la lista,
  // también en el render. Un estilo del catálogo nuevo solo vale en su
  // pestaña y con el catálogo nuevo activo: si el interruptor se apaga a
  // mitad de camino, Crear vuelve al catálogo viejo sin arrastrarlo.
  const customStyle = customStyleForTab(
    {
      styleSource: shownForm.styleSource,
      customStyle: refreshedCustomStyle(shownForm.customStyle, customStyles),
    },
    newCatalog,
  )
  // Sin clave de HeyGen la tarjeta del avatar se ve apagada: lo que se
  // valida, se estima y se envía también lo tiene apagado (spec §9). La
  // elección se queda en `form` para cuando vuelva la clave. La demo no
  // depende de HeyGen: su avatar es el de la historia (spec demo v4 §2).
  const keyedForm = withAvatarKey(
    shownForm,
    configuredProviders.has('heygen') || demo !== null,
  )
  const formValue =
    customStyle === keyedForm.customStyle
      ? keyedForm
      : { ...keyedForm, customStyle }

  // El formulario ya avisa con el saldo cacheado; acá se re-lee justo antes
  // de arrancar (ADR-0031): un saldo de hace un minuto pudo gastarse.
  const { verify: verifyCredits } = useCreateCostCheck({ form: keyedForm })

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
    setForm((current) => {
      // En demo el cambio parte de lo que se ve (la tarjeta derivada y su
      // historia) y la historia sigue al estilo elegido.
      const shown = withDemoDefaultStyle(current)
      return {
        ...shown,
        ...patch,
        ...(demo ? demoFollowStyle(demo, shown, patch) : {}),
      }
    })
  }

  const pickAudio = async () => {
    const path = await videosApi.pickNarrationFile()
    if (path) patchForm({ narrationFilePath: path })
  }

  const submit = async () => {
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
      // El proyecto ya existe: recién ahí el borrador cumplió (spec §9). Si
      // un pre-chequeo frena, si se cancela o si createProject falla (una
      // clave o un avatar rechazados), el borrador sigue, y salir por el menú
      // y volver con «Crear otro» no pierde el formulario. No se vuelve a
      // descartar al terminar la tarea: el formulario sigue en el estado de
      // esta vista, «Crear otro» vuelve a él tal como estaba y lo guarda de
      // nuevo (returnToForm), y una generación nueva arranca del último
      // formulario, como ahora. La demo no lo toca.
      onProjectCreated: () => {
        if (!demo) clearCreateDraft()
      },
      // `formValue` (y no `form`): en demo lleva la tarjeta derivada en el
      // render, con su historia.
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

  // «Crear otro» y cerrar la confirmación de escenas descartan la tarea y
  // vuelven al formulario tal como estaba (el store los trata como el mismo
  // cierre): el que se vuelve a mostrar queda otra vez como borrador, así
  // salir de Crear sin tocarlo y volver tampoco lo pierde (spec §9), con la
  // misma regla que el efecto: la semilla de preferencias intacta de un
  // montaje nuevo no se guarda. Se guarda acá, en el manejador, y nunca en un
  // efecto: la autonavegación al editor también descarta la tarea y no tiene
  // que guardarlo. La demo no lo toca.
  const returnToForm = () => {
    if (!demo) saveCreateDraft({ form, otherTabStyle }, seed)
    discardTask()
  }

  if (task) {
    return (
      <GenerationProgress
        task={task}
        // «Crear otro» descarta la corrida viva: con apariciones del avatar
        // cobradas y sin terminar, la pantalla avisa antes (entrega 2h, spec
        // §24.4) y recién «Cancelar igual» vuelve al formulario.
        back={{
          labelKey: 'create.progress.createAnother',
          onClick: returnToForm,
          cancelsRun: true,
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
        onDismissConfirmation={returnToForm}
        onPromptModelStall={() => reportPromptModelIssue(task.id, 'stalled')}
        onSnoozePromptModelIssue={snoozePromptModelIssue}
        onSwitchPromptModel={(modelId) => void switchPromptModel(modelId)}
        onSwitchVoice={(voice) => void switchVoice(voice)}
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
          newCatalog={newCatalog}
          otherTabStyle={otherTabStyle}
          onOtherTabStyleChange={setOtherTabStyle}
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

// Guarda el borrador de Crear (spec §9), salvo un formulario intacto —la
// semilla de las preferencias con la que Crear se montó— cuando no hay
// borrador: así Crear sigue tomando las preferencias y las claves del
// momento. Uno restaurado de un borrador es trabajo de la persona y se guarda
// aunque no se haya tocado (si no, generar con él, volver con «Crear otro» y
// salir lo perdería). Con un borrador ya escrito se refleja todo, también una
// vuelta a los valores de la semilla. Lo usan el efecto que sigue al
// formulario y returnToForm: una sola regla para los dos.
function saveCreateDraft(next: CreateDraft, seed: CreateMountSeed): void {
  const untouched =
    next.form === seed.form && next.otherTabStyle === seed.otherTabStyle
  if (untouched && !seed.restored && readCreateDraft() === null) return

  writeCreateDraft(next)
}
