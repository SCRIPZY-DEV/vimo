import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Music2, SlidersHorizontal, X } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { SlotPortal } from '@/modules/common/components/SlotPortal'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { EDITOR_BAR_SLOT_IDS } from '@/modules/common/constants'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { useVideoCredits } from '@/modules/common/hooks/useVideoCredits'
import { Button } from '@/modules/common/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { clamp } from '@/modules/common/utilities/clamp'
import { videosApi } from '@/modules/videos/api'
import { AnimationFailureDialog } from '@/modules/videos/components/AnimationFailureDialog'
import { AudioMixDialog } from '@/modules/videos/components/AudioMixDialog'
import { EditorBarTitle } from '@/modules/videos/components/EditorBarTitle'
import { EditorCreditsIssue } from '@/modules/videos/components/EditorCreditsIssue'
import { EditorAnimationRange } from '@/modules/videos/components/EditorAnimationRange'
import { EditorAvatarFallbackNotice } from '@/modules/videos/components/EditorAvatarFallbackNotice'
import { EditorTransitionToggle } from '@/modules/videos/components/EditorTransitionToggle'
import { TRANSITION_POLICY_VERSION } from '@pipeline/animation/transitions.ts'
import { EditorPreviewPlayer } from '@/modules/videos/components/EditorPreviewPlayer'
import { MissingImagesBanner } from '@/modules/videos/components/MissingImagesBanner'
import { EditorImageGallery } from '@/modules/videos/components/EditorImageGallery'
import { EditorScenePanel } from '@/modules/videos/components/EditorScenePanel'
import { EditorTimeline } from '@/modules/videos/components/EditorTimeline'
import { ExportClipsButton } from '@/modules/videos/components/ExportClipsButton'
import { MusicDialog } from '@/modules/videos/components/MusicDialog'
import { RenderVideoButton } from '@/modules/videos/components/RenderVideoButton'
import {
  AUDIO_MIX_DEFAULTS,
  DEFAULT_TIMELINE_ZOOM_INDEX,
  INSUFFICIENT_CREDITS_CODES,
  TIMELINE_ZOOM_LEVELS,
  UNKNOWN_CREATE_ERROR_KEY,
  libraryProgressPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useEditorShortcuts } from '@/modules/videos/hooks/useEditorShortcuts'
import { useLibraryEditor } from '@/modules/videos/hooks/useLibraryEditor'
import { useProjectAudio } from '@/modules/videos/hooks/useProjectAudio'
import { useTimelineLayout } from '@/modules/videos/hooks/useTimelineLayout'
import { animationPlanPreview } from '@/modules/videos/utilities/animationPlanPreview'
import { avatarRunOptions } from '@/modules/videos/utilities/avatarRunOptions'
import { isTaskLiveFor } from '@/modules/videos/utilities/isTaskLiveFor'
import { missingImageSceneIds } from '@/modules/videos/utilities/missingImageSceneIds'
import { renderedVideoState } from '@/modules/videos/utilities/renderedVideoState'
import type { EditorPlayerHandle } from '@/modules/videos/types/library'
import type { VideoProjectOptions } from '@pipeline/types/video-project.ts'

// Editor de proyecto. La vista solo cablea: la copia de trabajo y las
// ediciones viven en useLibraryEditor, el audio en useProjectAudio y los
// jobs en el store del editor.
export function LibraryEditor() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId = '' } = useParams()

  const editor = useLibraryEditor(projectId)
  const { detail, isLoading, errorKey, workingScenes, selectedScene } = editor
  const audio = useProjectAudio(projectId)
  const timelineLayout = useTimelineLayout(projectId)
  const {
    credits,
    isLoading: creditsLoading,
    isRefreshing: creditsRefreshing,
    refresh: refreshCredits,
  } = useImageCredits()
  // Saldo de animación solo si hay alguna clave cargada: sin clave la
  // consulta no tiene nada que leer (y cada consulta levanta un proceso).
  const videoCredits = useVideoCredits({
    enabled: editor.configuredProviders.has(editor.videoProvider),
  })
  const { task: createTask, startPipelineForProject } = useCreateTask()

  const [cursorSeconds, setCursorSeconds] = useState(0)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_TIMELINE_ZOOM_INDEX)
  const [scrubbing, setScrubbing] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const [mixOpen, setMixOpen] = useState(false)
  const [mix, setMix] = useState(AUDIO_MIX_DEFAULTS)
  const [syncedOptions, setSyncedOptions] = useState<
    VideoProjectOptions | undefined
  >(undefined)

  // Handle imperativo del preview: lo usan los atajos y el timeline. El
  // cursor también vive en un ref para que los callbacks de teclado lean el
  // valor vigente sin re-suscribirse.
  const playerRef = useRef<EditorPlayerHandle | null>(null)
  const cursorRef = useRef(0)

  const selectSceneFromTimeline = (sceneId: number) => {
    editor.setSelectedSceneId(sceneId)
    const scene = workingScenes.find((item) => item.id === sceneId)
    // Seleccionar lleva el cursor al arranque de la escena (con un pelito de
    // margen), sin cambiar el estado de reproducción.
    if (scene?.startSeconds !== undefined)
      playerRef.current?.seekTo(scene.startSeconds + 0.05)
  }

  const previewSceneAnimation = (sceneId: number) => {
    const scene = workingScenes.find((item) => item.id === sceneId)
    if (!scene) return undefined
    return animationPlanPreview(
      workingScenes.filter(
        (item) =>
          item.startSeconds !== undefined && item.endSeconds !== undefined,
      ),
      scene,
      {
        videoFormat: detail?.metadata.options.videoFormat ?? '16:9',
        durationSeconds:
          detail?.metadata.audioDurationSeconds ??
          workingScenes.reduce(
            (total, item) => Math.max(total, item.endSeconds ?? 0),
            0,
          ),
      },
    )
  }

  const handleTimeChange = (seconds: number) => {
    cursorRef.current = seconds
    setCursorSeconds(seconds)
  }

  const zoomBy = (delta: number) => {
    setZoomIndex((index) =>
      clamp(index + delta, 0, TIMELINE_ZOOM_LEVELS.length - 1),
    )
  }

  useEditorShortcuts({
    onTogglePlay: () => playerRef.current?.togglePlay(),
    onToggleMute: () => playerRef.current?.toggleMute(),
    onSeekBy: (delta) => playerRef.current?.seekTo(cursorRef.current + delta),
    onSeekToStart: () => playerRef.current?.seekTo(0),
    // El player clampea a la duración real.
    onSeekToEnd: () => playerRef.current?.seekTo(Number.MAX_SAFE_INTEGER),
    onDeselect: () => editor.setSelectedSceneId(null),
    onZoomIn: () => zoomBy(1),
    onZoomOut: () => zoomBy(-1),
    onZoomReset: () => setZoomIndex(DEFAULT_TIMELINE_ZOOM_INDEX),
  })

  usePageTitle(detail?.metadata.name ?? t('library.pageTitle'))

  // La mezcla local arranca de las opciones persistidas (ajuste durante el
  // render: se resincroniza con cada refetch del detail).
  const options = detail?.metadata.options
  if (options && options !== syncedOptions) {
    setSyncedOptions(options)
    setMix({
      voiceVolume: options.voiceVolume ?? AUDIO_MIX_DEFAULTS.voiceVolume,
      musicVolume: options.musicVolume ?? AUDIO_MIX_DEFAULTS.musicVolume,
      bgmOffsetSeconds:
        options.bgmOffsetSeconds ?? AUDIO_MIX_DEFAULTS.bgmOffsetSeconds,
    })
  }

  // Un solo portal de las migas, primer hijo en todos los estados: al pasar de
  // «cargando» al editor no se remonta y la miga no parpadea.
  const titlePortal = (
    <SlotPortal id={EDITOR_BAR_SLOT_IDS.title}>
      <EditorBarTitle name={detail?.metadata.name} />
    </SlotPortal>
  )

  if (isLoading || (!detail && !errorKey)) {
    return (
      <>
        {titlePortal}
        <ViewSpinner />
      </>
    )
  }

  if (!detail) {
    return (
      <>
        {titlePortal}
        <div className="mx-auto max-w-5xl px-8 py-10">
          <ErrorMessage>{t(errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}</ErrorMessage>
        </div>
      </>
    )
  }

  const metadata = detail.metadata
  const videoFormat = metadata.options.videoFormat ?? '16:9'
  // Modo demo (ADR-0029): las imágenes y la narración vienen del pack; el
  // sidecar rechaza regenerarlas (demo_project) y acá ni se ofrece.
  const demoProject = metadata.options.demo === true
  const creatingHere = isTaskLiveFor(createTask, projectId)
  if (metadata.state === 'generating' && creatingHere)
    return <Navigate to={libraryProgressPath(projectId)} replace />

  const task = editor.editorTask.task
  const videoState = renderedVideoState(
    Boolean(detail.videoPath),
    metadata.videoOutdated === true ||
      metadata.renderTransitionVersion !== TRANSITION_POLICY_VERSION,
  )
  const busy =
    editor.editorTask.isProjectBusy(projectId) ||
    creatingHere ||
    audio.audioBusy
  const durationSeconds =
    metadata.audioDurationSeconds ??
    workingScenes.reduce(
      (total, scene) => Math.max(total, scene.endSeconds ?? 0),
      0,
    )
  const hasMusic = Boolean(detail.musicPath)

  // Qué haría el planificador con la escena seleccionada (ADR-0041): el
  // panel lo dice en una línea y el timeline marca las escenas que absorbería.
  const animationPlan = selectedScene
    ? previewSceneAnimation(selectedScene.id)
    : undefined
  const plannedSceneIds = animationPlan?.sceneIds ?? []
  const missingAnimationImage =
    (animationPlan?.requestedSeconds ?? 0) > 0 &&
    plannedSceneIds.some(
      (id) => !workingScenes.find((scene) => scene.id === id)?.imagePath,
    )

  // Fuentes de media compartidas por el player y el timeline (waveforms).
  // El mp4 solo se reproduce con render vigente; si no, el player simula.
  const narrationSrc = detail.narrationPath
    ? videosApi.videoSource(detail.narrationPath, detail.narrationMtimeMs)
    : null
  const musicSrc = detail.musicPath
    ? videosApi.videoSource(detail.musicPath, detail.musicMtimeMs)
    : null
  const videoSrc =
    videoState === 'current' && detail.videoPath
      ? videosApi.videoSource(detail.videoPath, detail.videoMtimeMs)
      : null

  // Silencio por pista (ADR-0056): solo el visor. La mezcla guardada y el
  // diálogo de Audio siguen con sus volúmenes, y el render no cambia.
  const previewMix = {
    ...mix,
    voiceVolume: timelineLayout.layout.muted.narration ? 0 : mix.voiceVolume,
    musicVolume: timelineLayout.layout.muted.music ? 0 : mix.musicVolume,
  }

  // Silenciar una pista solo tiene efecto sobre los elementos de audio de la
  // simulación: con una pista silenciada el visor deja el mp4 y simula. Una
  // pista sin fuente (un proyecto sin música) no suena en ningún modo, así
  // que su silencio no cambia el modo.
  const anyTrackMuted =
    (timelineLayout.layout.muted.narration && narrationSrc !== null) ||
    (timelineLayout.layout.muted.music && musicSrc !== null)
  // El silencio fuerza la simulación solo si había un mp4 que mostrar: la
  // insignia del visor lo dice.
  const mutedPreview = anyTrackMuted && videoSrc !== null

  const generateDraft = async () => {
    const started = await startPipelineForProject(projectId, metadata.name, {
      videoFormat: metadata.options.videoFormat,
      ...avatarRunOptions(metadata.options.avatar),
    })
    if (started) void navigate(libraryProgressPath(projectId))
  }

  // Proyecto sin escenas (borrador): no hay nada que editar todavía.
  if (workingScenes.length === 0) {
    return (
      <>
        {titlePortal}
        <div className="mx-auto max-w-3xl px-8 py-16">
          <div className="space-y-3 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6 text-center">
            <p className="font-body text-sm text-muted-foreground">
              {t('library.editor.draftHint')}
            </p>
            <Button
              disabled={busy}
              onClick={() => void generateDraft()}
              className="rounded-xl font-display font-bold"
            >
              {t('library.editor.generateDraft')}
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {titlePortal}
      <SlotPortal id={EDITOR_BAR_SLOT_IDS.actions}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setMusicOpen(true)}
              className="rounded-lg font-display"
            >
              <Music2 className="mr-1.5 h-3.5 w-3.5" />
              {t('library.editor.musicButton')}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-sm leading-snug">
            {t('library.editor.musicButtonHelp')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setMixOpen(true)}
              className="rounded-lg font-display"
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {t('library.editor.audioButton')}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-sm leading-snug">
            {t('library.editor.audioButtonHelp')}
          </TooltipContent>
        </Tooltip>
        <ExportClipsButton
          exportState={task?.export ?? null}
          busy={busy}
          onExport={() => void editor.editorTask.startExport(projectId)}
        />
        <RenderVideoButton
          render={task?.render ?? null}
          videoState={videoState}
          busy={busy}
          onRender={() => void editor.editorTask.startRender(projectId)}
          onCancel={() => editor.editorTask.cancelActiveJob(projectId)}
        />
      </SlotPortal>

      <div className="flex flex-col gap-5 px-6 py-6 lg:h-full">
        <MissingImagesBanner sceneIds={missingImageSceneIds(workingScenes)} />

        {/* Las apariciones del avatar con la imagen fija del look, con
          «Regenerarlas (N)» (entrega 2d): Crear salta acá sin exportar. */}
        <EditorAvatarFallbackNotice
          projectId={projectId}
          scenes={workingScenes}
          busy={busy || editor.savingChanges}
          locked={demoProject}
        />

        {task?.errorKey && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <p className="font-body text-sm text-destructive-text">
              {t(task.errorKey)}
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => editor.editorTask.clearError(projectId)}
              aria-label={t('library.editor.dismissError')}
              className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* El job cayó por saldo agotado (ADR-0031): qué cuenta rechazó, cuánto
          hay y a dónde recargar. Vale para regenerar imágenes y para animar. */}
        {task?.errorCode && INSUFFICIENT_CREDITS_CODES.has(task.errorCode) && (
          <EditorCreditsIssue
            code={task.errorCode}
            imageProvider={editor.imageChoice.provider}
            videoProvider={editor.videoProvider}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <EditorAnimationRange
            projectId={projectId}
            scenes={workingScenes}
            durationSeconds={durationSeconds}
            videoFormat={videoFormat}
            busy={busy}
            locked={demoProject}
          />
          <EditorTransitionToggle
            projectId={projectId}
            scenes={workingScenes}
            busy={busy}
          />
          <EditorImageGallery
            key={projectId}
            projectId={projectId}
            scenes={workingScenes}
            videoFormat={videoFormat}
            durationSeconds={durationSeconds}
            imageProvider={editor.imageChoice.provider}
            locked={demoProject}
            busy={busy || editor.savingChanges}
            onRegenerateImages={editor.regenerateGalleryImages}
            onUndoAnimation={editor.undoAnimation}
            undoingSceneId={editor.undoingSceneId}
          />
        </div>

        {/* Fila superior: desde lg toma toda la altura libre (≈70/30 entre visor
          y panel); el panel scrollea por dentro si se pasa. */}
        <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1 lg:min-h-0">
            <EditorPreviewPlayer
              scenes={workingScenes}
              sceneVersions={task?.sceneVersions ?? {}}
              narrationSrc={narrationSrc}
              musicSrc={musicSrc}
              videoSrc={mutedPreview ? null : videoSrc}
              mutedPreview={mutedPreview}
              durationSeconds={durationSeconds}
              videoFormat={videoFormat}
              mix={previewMix}
              cursorSeconds={cursorSeconds}
              scrubbing={scrubbing}
              onTimeChange={handleTimeChange}
              playerRef={playerRef}
            />
          </div>

          <div className="lg:min-h-0 lg:w-[30%] lg:max-w-[420px] lg:shrink-0">
            <EditorScenePanel
              scene={selectedScene}
              projectId={projectId}
              scenes={workingScenes}
              characters={options?.characters ?? []}
              imageChoice={editor.imageChoice}
              videoFormat={videoFormat}
              credits={credits}
              creditsLoading={creditsLoading}
              creditsRefreshing={creditsRefreshing}
              onRefreshCredits={refreshCredits}
              busy={busy || editor.savingChanges}
              savingScenes={task?.savingScenes === true}
              regenerateLocked={demoProject}
              userPromptPending={editor.userPromptPending}
              errorKey={
                selectedScene ? task?.sceneErrors[selectedScene.id] : undefined
              }
              onUserPromptChange={editor.patchSelectedUserPrompt}
              onUserPromptBlur={editor.commitSelectedUserPrompt}
              canEditClipIn={editor.canEditClipIn}
              canEditClipOut={editor.canEditClipOut}
              onClipTimeChange={editor.moveSelectedClipEdge}
              onImageChoiceChange={editor.changeImageChoice}
              onCharactersChange={editor.changeCharacters}
              onRegenerate={() => void editor.regenerateSelected()}
              animation={{
                busy:
                  editor.savingChanges ||
                  creatingHere ||
                  audio.audioBusy ||
                  missingAnimationImage ||
                  !editor.editorTask.canStartAnimation(
                    projectId,
                    plannedSceneIds,
                  ),
                provider: editor.videoProvider,
                configuredProviders: editor.configuredProviders,
                credits: videoCredits.credits,
                creditsLoading: videoCredits.isLoading,
                creditsRefreshing: videoCredits.isRefreshing,
                onRefreshCredits: videoCredits.refresh,
                activity: selectedScene
                  ? task?.sceneAnimationStatus[selectedScene.id]
                  : undefined,
                progress: selectedScene
                  ? task?.sceneAnimationProgress[selectedScene.id]
                  : undefined,
                error: selectedScene
                  ? task?.sceneAnimationErrors[selectedScene.id]
                  : undefined,
                plan: animationPlan,
                undo:
                  editor.selectedAnimationSceneCount > 0
                    ? {
                        sceneCount: editor.selectedAnimationSceneCount,
                        pending: editor.undoingSceneId !== null,
                        disabled:
                          busy ||
                          editor.savingChanges ||
                          creatingHere ||
                          audio.audioBusy ||
                          editor.selectedAnimationUndoPending,
                        reason: editor.selectedAnimationUndoPending
                          ? 'library.errors.animationUndoPending'
                          : undefined,
                        onUndo: () => {
                          if (selectedScene)
                            void editor.undoAnimation(selectedScene.id)
                        },
                      }
                    : undefined,
                onAnimate: () => {
                  void editor.editorTask.startAnimation(
                    projectId,
                    plannedSceneIds,
                    'kie',
                    true,
                  )
                },
              }}
            />
          </div>
        </div>

        <div className="shrink-0">
          <EditorTimeline
            timingBusy={busy}
            scenes={workingScenes}
            durationSeconds={durationSeconds}
            playheadSeconds={cursorSeconds}
            selectedSceneId={editor.selectedSceneId}
            sceneStatus={task?.sceneStatus ?? {}}
            sceneErrors={task?.sceneErrors ?? {}}
            sceneVersions={task?.sceneVersions ?? {}}
            sceneAnimationStatus={task?.sceneAnimationStatus ?? {}}
            sceneAnimationProgress={task?.sceneAnimationProgress ?? {}}
            sceneAnimationErrors={task?.sceneAnimationErrors ?? {}}
            sceneAvatarRendering={task?.sceneAvatarRendering ?? {}}
            plannedSceneIds={plannedSceneIds}
            narrationSrc={narrationSrc}
            musicSrc={musicSrc}
            layout={timelineLayout.layout}
            onReorderTracks={timelineLayout.reorderTracks}
            onToggleMuted={timelineLayout.toggleMuted}
            onToggleLocked={timelineLayout.toggleLocked}
            zoomIndex={zoomIndex}
            onZoomChange={setZoomIndex}
            onSelectScene={selectSceneFromTimeline}
            onSeek={(seconds) => playerRef.current?.seekWithPlay(seconds)}
            onScrub={(seconds) => playerRef.current?.seekTo(seconds)}
            onScrubStart={() => setScrubbing(true)}
            onScrubEnd={() => setScrubbing(false)}
            onBoundaryDrag={editor.dragBoundary}
            onBoundaryCommit={editor.commitBoundary}
            onOpenAudio={() => setMixOpen(true)}
            onOpenMusic={() => setMusicOpen(true)}
          />
        </div>

        <MusicDialog
          open={musicOpen}
          script={detail.script}
          hasMusic={hasMusic}
          busy={audio.audioBusy}
          musicPercent={audio.musicPercent}
          musicSrc={musicSrc}
          musicVolume={mix.musicVolume}
          onClose={() => setMusicOpen(false)}
          onSetMusic={audio.setMusic}
          onGenerate={(prompt, instrumental) =>
            audio.generateMusic({ prompt, instrumental })
          }
          onSuggestPrompt={() => audio.suggestMusicPrompt(detail.script)}
          onPickFile={audio.pickAudioFile}
        />

        <AnimationFailureDialog
          notice={task?.animationFailure ?? null}
          busy={busy}
          onClose={() => editor.editorTask.dismissAnimationFailure(projectId)}
          onRetry={editor.retryAnimation}
        />

        <AudioMixDialog
          open={mixOpen}
          value={mix}
          hasMusic={hasMusic}
          busy={audio.audioBusy}
          narrationLocked={demoProject}
          narrationPercent={audio.narrationPercent}
          narrationSrc={narrationSrc}
          musicSrc={musicSrc}
          onClose={() => setMixOpen(false)}
          onChange={setMix}
          onSaveMix={audio.updateMix}
          onReplaceNarration={audio.replaceNarration}
          onPickFile={audio.pickAudioFile}
        />
      </div>
    </>
  )
}
