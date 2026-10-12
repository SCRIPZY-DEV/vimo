import { FlowRestartButton } from '@/modules/common/components/FlowRestartButton'
import type { FlowRestartRequest } from '@/modules/common/types/flow'
import { FlowRunControls } from '@/modules/common/components/FlowRunControls'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Ban,
  Clapperboard,
  FolderOpen,
  Mic,
  Loader2,
  Music2,
  PlayCircle,
  RefreshCw,
} from 'lucide-react'
import DoodleStar from '@/modules/common/doodles/DoodleStar'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { PhaseProgressPanel } from '@/modules/videos/components/PhaseProgressPanel'
import { ConfirmScenesDialog } from '@/modules/videos/components/ConfirmScenesDialog'
import { ElapsedTimer } from '@/modules/videos/components/ElapsedTimer'
import { GenerationErrorCard } from '@/modules/videos/components/GenerationErrorCard'
import { InsufficientCreditsCard } from '@/modules/videos/components/InsufficientCreditsCard'
import { ProgressStatusPill } from '@/modules/videos/components/ProgressStatusPill'
import { PromptModelIssueDialog } from '@/modules/videos/components/PromptModelIssueDialog'
import { PromptStageWatchdog } from '@/modules/videos/components/PromptStageWatchdog'
import { PromptsGrid } from '@/modules/videos/components/PromptsGrid'
import { PipelineAnimationPanel } from '@/modules/videos/components/PipelineAnimationPanel'
import { SceneImagesGrid } from '@/modules/videos/components/SceneImagesGrid'
import { SecondsPerSceneStep } from '@/modules/videos/components/SecondsPerSceneStep'
import { StageBar } from '@/modules/videos/components/StageBar'
import {
  CANCEL_CONFIRM_WINDOW_MS,
  EDITOR_RESCUE_ERROR_CODES,
  FLOW_PIPELINE_RECOVERY_ERROR_KEYS,
  PIPELINE_STAGES,
  STYLE_GEM_ERROR_CODES,
  SUPPORT_NOTE_CLASS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { shortenHomePath } from '@/modules/videos/utilities/shortenHomePath'
import { isVertical } from '@/modules/videos/utilities/videoFormat'
import { voiceProgressPercent } from '@/modules/videos/utilities/voiceProgressPercent'
import type {
  CreateTask,
  SceneCutChoice,
  VoiceProgressView,
} from '@/modules/videos/types/create'

interface GenerationProgressProps {
  task: CreateTask
  // Botón de vuelta de la cabecera: «Crear otro» en Create, «Volver a la
  // biblioteca» en Library.
  back: { labelKey: string; onClick: () => void }
  onCancel: () => void
  // Reintentar desde el último checkpoint cuando el job falló.
  onRetryPipeline: () => void
  onRestartFlow?: (request: FlowRestartRequest) => void
  // Rescate del origen (v1.32.0): con los prompts persistidos, el fallo de
  // imágenes no bloquea — se sigue en el editor y se regenera desde ahí.
  onContinueInEditor: () => void
  onConfirmScenes: (choice: SceneCutChoice) => void
  onDismissConfirmation: () => void
  // Modelo de prompts trabado o con errores (ADR-0028, carril verbatim).
  onPromptModelStall: () => void
  onSnoozePromptModelIssue: () => void
  onSwitchPromptModel: (modelId: string) => void
}

// Pista bajo la barra de voz: en qué parte va si la narración se troceó; si
// no, qué esperar de cada proveedor mientras sube.
function voiceHintKey(voice: VoiceProgressView): string {
  if (voice.partTotal !== null) return 'create.progress.voice.hintParts'
  if (voice.provider === 'minimax') return 'create.progress.voice.hintMinimax'
  if (voice.provider === 'edge') return 'create.progress.voice.hintEdge'
  return 'create.progress.voice.hintDefault'
}

// Pantalla completa de la corrida del pipeline (port de PantallaProgreso del
// origen): cabecera con título y reloj, fases a la izquierda y, a la derecha,
// el panel de la fase que corre. «Una fase, un panel» (origen v1.1.0): no se
// acumulan paneles de fases pasadas; las imágenes sí se quedan hasta el final
// porque son el resultado que la persona revisa.
export function GenerationProgress({
  task,
  back,
  onCancel,
  onRetryPipeline,
  onRestartFlow,
  onContinueInEditor,
  onConfirmScenes,
  onDismissConfirmation,
  onPromptModelStall,
  onSnoozePromptModelIssue,
  onSwitchPromptModel,
}: GenerationProgressProps) {
  const { t } = useTranslation()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  // Diálogo de cambio de modelo abierto a mano desde la tarjeta de error.
  const [switchingFromError, setSwitchingFromError] = useState(false)

  // Cancelar pide un segundo clic dentro de la ventana (origen v0.35.0).
  useEffect(() => {
    if (!confirmingCancel) return undefined
    const timer = setTimeout(
      () => setConfirmingCancel(false),
      CANCEL_CONFIRM_WINDOW_MS,
    )
    return () => clearTimeout(timer)
  }, [confirmingCancel])

  const paused = task.status === 'awaitingConfirmation'
  // La pausa de un estilo propio pregunta SEGUNDOS por escena con el paso
  // inline; el diálogo clásico de conteo queda para el resto.
  const secondsLane = paused && task.confirmation?.secondsPerScene !== undefined
  const finished = task.status === 'completed'
  const failed = task.status === 'error'
  const generating = !finished && !failed
  const completed = task.completedStages
  const voice = task.voiceProgress
  const hasAnimation = Boolean(
    task.automaticAnimation ||
    task.confirmation?.animationMinutes ||
    task.stage === 'animation' ||
    task.scenes.some((scene) => scene.animationRequestedSeconds !== undefined),
  )
  const showAnimationPanel =
    hasAnimation &&
    (task.stage === 'animation' ||
      task.scenes.some((scene) => scene.animationActivity !== undefined) ||
      completed.includes('animation'))

  // Reglas por datos y no solo por `stage`: al retomar, las fases vienen del
  // disco y `stage` es null hasta el primer evento del job.
  const showVoicePanel =
    voice !== null && (task.stage === 'voice' || !completed.includes('voice'))
  const showBgmPanel =
    task.bgmProgress !== null && task.bgmProgress.status !== 'completed'
  // Solo mientras el job renderiza: al retomar, `renderProgress` puede venir
  // viejo del disco y `stage` es null hasta el primer evento.
  const showRenderPanel =
    generating && task.stage === 'render' && task.renderProgress !== null
  // Pasada de recuperación de imágenes: mientras se reescriben prompts, la
  // grilla de prompts vuelve (solo con las escenas afectadas) y la de
  // imágenes espera; el reintento se anota sobre la grilla de imágenes.
  const recovery = generating ? task.imagesRecovery : null
  const rewriting = recovery?.kind === 'rewrite'
  const retrying = recovery?.kind === 'retry'
  const rewritingScenes = rewriting
    ? task.scenes.filter((scene) => recovery.sceneIds.includes(scene.id))
    : task.scenes
  const showPromptsPanel =
    !paused &&
    (rewriting ||
      (completed.includes('scene-cuts') &&
        !completed.includes('scene-prompts')))
  // La señal es que los prompts terminaron, no que las imágenes arrancaron;
  // y se quedan también al terminar o fallar.
  const showImagesPanel =
    !paused &&
    !rewriting &&
    (completed.includes('scene-prompts') ||
      task.stage === 'images' ||
      !generating)
  // La fase en la que se cayó el job: la primera sin completar.
  const failedStage = failed
    ? (PIPELINE_STAGES.find(
        (stage) =>
          (stage.id !== 'animation' || hasAnimation) &&
          !completed.includes(stage.id),
      )?.id ?? null)
    : null
  // Rescate por el editor: un fallo de imágenes, o un código que deja el
  // proyecto reparable desde ahí aunque la fase caída sea otra (el render sin
  // imágenes cae en `render` con todo lo demás en disco).
  const editorRescue =
    failedStage === 'images' ||
    failedStage === 'animation' ||
    (task.errorCode !== null && EDITOR_RESCUE_ERROR_CODES.has(task.errorCode))
  // Solo el carril verbatim tiene un modelo elegible que cambiar — y no
  // cuando la culpa es de la gema: cambiar de modelo repetiría el fallo.
  const gemAtFault =
    task.errorCode !== null && STYLE_GEM_ERROR_CODES.has(task.errorCode)
  const promptModelSwitchable =
    task.usesCustomStyle && failedStage === 'scene-prompts' && !gemAtFault
  const promptModelStalled =
    generating && task.promptModelIssue?.reason === 'stalled'

  return (
    // Fluida hasta 1600px (el origen se acota a 1152 y centra): acá el
    // sidebar ya descuenta 256px y la pantalla se veía chica a ventana
    // completa; las columnas y la grilla crecen con la ventana.
    <div className="mx-auto max-w-[1600px] space-y-6 px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={back.onClick}
            className="-ml-3 mb-1 font-display font-semibold text-muted-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t(back.labelKey)}
          </Button>
          <h1 className="font-display text-3xl font-extrabold text-foreground">
            {task.projectName}
          </h1>
          <ProgressStatusPill status={task.status} />
        </div>

        <div className="flex items-center gap-3">
          <ElapsedTimer task={task} />
          {generating && (
            <Button
              variant={confirmingCancel ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => {
                if (!confirmingCancel) {
                  setConfirmingCancel(true)
                  return
                }
                setConfirmingCancel(false)
                onCancel()
              }}
              className="font-display font-semibold"
            >
              <Ban className="mr-1.5 h-4 w-4" />
              {confirmingCancel
                ? t('create.progress.cancelConfirm')
                : t('create.progress.cancel')}
            </Button>
          )}
          {finished && task.videoPath && (
            <button
              type="button"
              onClick={() => void videosApi.openVideo(task.videoPath ?? '')}
              className="btn-squish inline-flex items-center gap-2 rounded-xl bg-saffron px-5 py-3 font-display font-bold text-charcoal shadow-lg shadow-saffron/30"
            >
              <PlayCircle className="h-5 w-5" />
              {t('create.progress.viewVideo')}
            </button>
          )}
        </div>
      </div>

      {/* Dos columnas recién desde `xl` (y no `lg` como el origen): acá el
          sidebar vive dentro del viewport y se lleva 256px, así que cada
          layout aparece al mismo ancho de CONTENIDO que en el origen. En la
          ventana mínima (1024) se apila en una columna. La columna de fases
          es más ancha que los 280px del origen: a ventana completa se veía
          diminuta. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <h2 className="font-display text-base font-bold text-foreground">
            {t('create.progress.phasesTitle')}
          </h2>
          {task.imageProvider === 'flow' && <FlowRunControls />}
          <StageBar
            flowImages={task.imageProvider === 'flow'}
            currentStage={task.stage}
            showAnimation={hasAnimation}
            completedStages={completed}
            paused={paused}
            recovery={recovery}
            promptModelStalled={promptModelStalled}
          />
          {task.audioDurationSeconds !== null && (
            <div className="rounded-lg bg-muted/50 p-3 font-body text-sm text-muted-foreground">
              {t('create.progress.audioSummary', {
                seconds: task.audioDurationSeconds.toFixed(1),
                scenes: task.scenes.length,
              })}
            </div>
          )}
        </aside>

        {/* `min-w-0`: sin esto la columna 1fr usa su min-content como mínimo y
            un mensaje largo la ensancha más allá del viewport. */}
        <div className="min-w-0 space-y-6">
          {task.status === 'creating' && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border-2 border-saffron/30 bg-saffron/5 p-6 font-display font-semibold"
            >
              <Loader2 className="h-5 w-5 animate-spin text-saffron" />
              {t('create.progress.startingTitle')}
            </div>
          )}
          {/* Va arriba de todo: el pipeline está detenido esperándolo. */}
          {secondsLane && task.confirmation && (
            <SecondsPerSceneStep
              projectId={task.projectId}
              confirmation={task.confirmation}
              onConfirm={onConfirmScenes}
            />
          )}

          {finished && task.videoPath && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-xl border-2 border-saffron/30 bg-card"
            >
              {/* Un short a w-full saldría gigante (mismo criterio que
                  LibraryVideoPlayer): se limita por alto y se centra sobre
                  el fondo negro del recuadro. */}
              <div
                className={cn(
                  'bg-black',
                  isVertical(task.videoFormat) && 'flex justify-center',
                )}
              >
                <video
                  key={task.videoPath}
                  src={videosApi.videoSource(task.videoPath)}
                  controls
                  className={cn(
                    'bg-black',
                    isVertical(task.videoFormat) ? 'max-h-[70vh]' : 'w-full',
                  )}
                />
              </div>
              <div className="flex items-center gap-3 p-4">
                <DoodleStar size={28} delay={300} />
                <p
                  className={cn(
                    SUPPORT_NOTE_CLASS,
                    'min-w-0 flex-1 text-foreground',
                  )}
                >
                  {t('create.progress.savedAt')}{' '}
                  <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                    {shortenHomePath(task.videoPath)}
                  </code>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void videosApi.revealVideo(task.videoPath ?? '')
                  }
                  className="shrink-0 rounded-xl font-display text-muted-foreground"
                >
                  <FolderOpen className="mr-1.5 h-4 w-4" />
                  {t('common.revealVideo')}
                </Button>
              </div>
            </motion.div>
          )}

          {showVoicePanel && voice && (
            <PhaseProgressPanel
              Icon={Mic}
              title={t('create.progress.voice.title', {
                provider: voice.provider,
              })}
              elapsedSeconds={voice.elapsedSeconds}
              percent={voiceProgressPercent(voice)}
              hint={t(voiceHintKey(voice), {
                chars: voice.totalChars.toLocaleString(),
                part: voice.partIndex,
                total: voice.partTotal,
              })}
            />
          )}

          {showBgmPanel && task.bgmProgress && (
            <PhaseProgressPanel
              Icon={Music2}
              title={t('create.progress.music.title')}
              elapsedSeconds={task.bgmProgress.elapsedSeconds}
              percent={task.bgmProgress.percent}
            />
          )}

          {showRenderPanel && task.renderProgress && (
            <PhaseProgressPanel
              Icon={Clapperboard}
              // El mismo nombre que la fase en la lista de la izquierda: con
              // dos textos distintos la pantalla se contradecía.
              title={t('create.stages.render')}
              percent={task.renderProgress.percent}
              hint={t(`create.progress.render.${task.renderProgress.phase}`)}
            />
          )}

          {task.retry && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl border-2 border-saffron/40 bg-saffron/5 p-4"
            >
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-saffron" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-foreground">
                  {t('create.progress.retry.title', {
                    seconds: task.retry.secondsLeft,
                  })}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {t('create.progress.retry.attempt', {
                      attempt: task.retry.attempt,
                      max: task.retry.maxAttempts,
                    })}
                  </span>
                </p>
                {task.errorKey && (
                  <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">
                    {t(task.errorKey)}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {failed && task.creditsIssue && (
            <InsufficientCreditsCard
              message={t(task.errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}
              projectId={task.projectId}
              context={{
                domain: task.creditsIssue.domain,
                imageProvider: task.imageProvider,
                voiceVendor: task.voiceVendor,
                // Las animaciones automáticas también usan el saldo de Kie.
                videoProvider: 'kie',
              }}
              onRetry={onRetryPipeline}
              onContinueInEditor={editorRescue ? onContinueInEditor : undefined}
            />
          )}

          {failed && !task.creditsIssue && (
            <GenerationErrorCard
              flowRecovery={
                task.imageProvider === 'flow' &&
                failedStage === 'images' &&
                FLOW_PIPELINE_RECOVERY_ERROR_KEYS.has(task.errorKey ?? '')
              }
              message={t(task.errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}
              failedStage={failedStage}
              errorCode={task.errorCode}
              onRetry={onRetryPipeline}
              onContinueInEditor={editorRescue ? onContinueInEditor : undefined}
              onSwitchPromptModel={
                promptModelSwitchable
                  ? () => setSwitchingFromError(true)
                  : undefined
              }
            />
          )}

          {failed &&
            task.imageProvider === 'flow' &&
            task.errorKey === 'extension.restartRequired' &&
            onRestartFlow && <FlowRestartButton onRestart={onRestartFlow} />}

          {showPromptsPanel && (
            <PromptsGrid
              scenes={rewritingScenes}
              complete={completed.includes('scene-prompts') && !rewriting}
              written={
                rewriting
                  ? {
                      ready: recovery.streamed,
                      total: recovery.sceneIds.length,
                    }
                  : task.promptsWritten
              }
              recovery={rewriting ? recovery : null}
            />
          )}

          {showAnimationPanel && (
            <PipelineAnimationPanel
              scenes={task.scenes}
              endSeconds={task.animationEndSeconds}
              videoFormat={task.videoFormat}
              active={generating && task.stage === 'animation'}
              complete={completed.includes('animation')}
            />
          )}

          {showImagesPanel && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-foreground">
                  {t('create.progress.imagesCount', {
                    ready: task.scenes.filter(
                      (scene) => scene.imageStatus === 'ok',
                    ).length,
                    total: task.scenes.length,
                  })}
                </h2>
              </div>
              {retrying && (
                <p
                  className={cn(
                    SUPPORT_NOTE_CLASS,
                    '-mt-2 mb-3 text-muted-foreground',
                  )}
                >
                  {t('create.progress.recovery.retryingImages', {
                    count: recovery.sceneIds.length,
                    pass: recovery.pass,
                    maxPasses: recovery.maxPasses,
                  })}
                </p>
              )}
              <SceneImagesGrid
                scenes={task.scenes}
                videoFormat={task.videoFormat}
              />
            </div>
          )}

          {task.logs.length > 0 && (
            <details className="rounded-lg border border-border bg-muted/30 p-3">
              <summary className="cursor-pointer font-display text-xs font-semibold text-muted-foreground">
                {t('create.progress.logs', { count: task.logs.length })}
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
                {task.logs.join('\n')}
              </pre>
            </details>
          )}
        </div>
      </div>

      {/* La confirmación de escenas sucede en el contexto visual del pipeline,
          no en una pantalla aparte (origen v0.13.37). */}
      <ConfirmScenesDialog
        open={paused && !secondsLane}
        confirmation={task.confirmation}
        onConfirm={onConfirmScenes}
        onCancel={onDismissConfirmation}
      />

      {/* Vigilancia del modelo de prompts (ADR-0028): el watchdog no pinta
          nada; el diálogo abre solo cuando la tarea registra un problema. */}
      <PromptStageWatchdog task={task} onStall={onPromptModelStall} />
      <PromptModelIssueDialog
        task={task}
        forceOpen={switchingFromError}
        onDismiss={() => {
          setSwitchingFromError(false)
          onSnoozePromptModelIssue()
        }}
        onRetry={onRetryPipeline}
        onSwitch={(modelId) => {
          setSwitchingFromError(false)
          onSwitchPromptModel(modelId)
        }}
        onCancel={() => {
          setSwitchingFromError(false)
          onCancel()
        }}
      />
    </div>
  )
}
