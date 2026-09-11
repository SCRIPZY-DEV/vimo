import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Music2, SlidersHorizontal, X } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { clamp } from '@/modules/common/utilities/clamp'
import { videosApi } from '@/modules/videos/api'
import { AudioMixDialog } from '@/modules/videos/components/AudioMixDialog'
import { EditorPreviewPlayer } from '@/modules/videos/components/EditorPreviewPlayer'
import { MissingImagesBanner } from '@/modules/videos/components/MissingImagesBanner'
import { EditorScenePanel } from '@/modules/videos/components/EditorScenePanel'
import { EditorTimeline } from '@/modules/videos/components/EditorTimeline'
import { ExportClipsButton } from '@/modules/videos/components/ExportClipsButton'
import { LibraryViewHeader } from '@/modules/videos/components/LibraryViewHeader'
import { MusicDialog } from '@/modules/videos/components/MusicDialog'
import { RenderVideoButton } from '@/modules/videos/components/RenderVideoButton'
import {
  AUDIO_MIX_DEFAULTS,
  DEFAULT_TIMELINE_ZOOM_INDEX,
  TIMELINE_ZOOM_LEVELS,
  UNKNOWN_CREATE_ERROR_KEY,
  VideosRoutes,
  libraryProgressPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useEditorShortcuts } from '@/modules/videos/hooks/useEditorShortcuts'
import { useImageCredits } from '@/modules/videos/hooks/useImageCredits'
import { useLibraryEditor } from '@/modules/videos/hooks/useLibraryEditor'
import { useProjectAudio } from '@/modules/videos/hooks/useProjectAudio'
import { isTaskLiveFor } from '@/modules/videos/utilities/isTaskLiveFor'
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
  const {
    credits,
    isLoading: creditsLoading,
    isRefreshing: creditsRefreshing,
    refresh: refreshCredits,
  } = useImageCredits()
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

  if (isLoading || (!detail && !errorKey)) return <ViewSpinner />

  if (!detail) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-8 py-10">
        <ErrorMessage>{t(errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}</ErrorMessage>
        <Button asChild variant="ghost" className="rounded-lg font-display">
          <Link to={VideosRoutes.library}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t('library.player.backToLibrary')}
          </Link>
        </Button>
      </div>
    )
  }

  const metadata = detail.metadata
  const videoFormat = metadata.options.videoFormat ?? '16:9'
  const isShort = videoFormat === '9:16'
  // Modo demo (ADR-0027): las imágenes y la narración vienen del pack; el
  // sidecar rechaza regenerarlas (demo_project) y acá ni se ofrece.
  const demoProject = metadata.options.demo === true
  const creatingHere = isTaskLiveFor(createTask, projectId)
  if (metadata.state === 'generating' && creatingHere)
    return <Navigate to={libraryProgressPath(projectId)} replace />

  const task = editor.editorTask.task
  const videoState = renderedVideoState(
    Boolean(detail.videoPath),
    metadata.videoOutdated === true,
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

  const selectSceneFromTimeline = (sceneId: number) => {
    editor.setSelectedSceneId(sceneId)
    const scene = workingScenes.find((item) => item.id === sceneId)
    // Seleccionar lleva el cursor al arranque de la escena (con un pelito de
    // margen), sin cambiar el estado de reproducción.
    if (scene?.startSeconds !== undefined)
      playerRef.current?.seekTo(scene.startSeconds + 0.05)
  }

  const generateDraft = async () => {
    const started = await startPipelineForProject(projectId, metadata.name, {
      videoFormat: metadata.options.videoFormat,
    })
    if (started) void navigate(libraryProgressPath(projectId))
  }

  // Proyecto sin escenas (borrador): no hay nada que editar todavía.
  if (workingScenes.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-8 py-10">
        <LibraryViewHeader title={metadata.name} />
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
    )
  }

  return (
    <div className="flex flex-col gap-5 px-6 py-6 lg:h-full">
      <LibraryViewHeader title={metadata.name}>
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
        {!isShort && (
          <RenderVideoButton
            render={task?.render ?? null}
            videoState={videoState}
            busy={busy}
            onRender={() => void editor.editorTask.startRender(projectId)}
            onCancel={() => editor.editorTask.cancelActiveJob(projectId)}
          />
        )}
      </LibraryViewHeader>

      {/* En shorts el botón de render flota sobre el timeline: el layout
          vertical aleja el header del visor (port del `flotante` del origen). */}
      {isShort && (
        <div className="fixed bottom-6 right-6 z-40">
          <RenderVideoButton
            render={task?.render ?? null}
            videoState={videoState}
            busy={busy}
            onRender={() => void editor.editorTask.startRender(projectId)}
            onCancel={() => editor.editorTask.cancelActiveJob(projectId)}
          />
        </div>
      )}

      <MissingImagesBanner
        sceneIds={workingScenes
          .filter((scene) => !scene.imagePath)
          .map((scene) => scene.id)}
      />

      {task?.errorKey && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="font-body text-sm text-destructive">
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

      {/* Fila superior: desde lg toma toda la altura libre (≈70/30 entre visor
          y panel); el panel scrollea por dentro si se pasa. */}
      <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1 lg:min-h-0">
          <EditorPreviewPlayer
            scenes={workingScenes}
            sceneVersions={task?.sceneVersions ?? {}}
            narrationSrc={narrationSrc}
            musicSrc={musicSrc}
            videoSrc={videoSrc}
            durationSeconds={durationSeconds}
            videoFormat={videoFormat}
            mix={mix}
            cursorSeconds={cursorSeconds}
            scrubbing={scrubbing}
            onTimeChange={handleTimeChange}
            playerRef={playerRef}
          />
        </div>

        <div className="lg:min-h-0 lg:w-[30%] lg:max-w-[420px] lg:shrink-0">
          <EditorScenePanel
            scene={selectedScene}
            characters={options?.characters ?? []}
            imageChoice={editor.imageChoice}
            videoFormat={videoFormat}
            credits={credits}
            creditsLoading={creditsLoading}
            creditsRefreshing={creditsRefreshing}
            onRefreshCredits={refreshCredits}
            busy={busy}
            regenerateLocked={demoProject}
            userPromptDirty={editor.userPromptDirty}
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
            onRegenerate={editor.regenerateSelected}
          />
        </div>
      </div>

      <div className="shrink-0">
        <EditorTimeline
          scenes={workingScenes}
          durationSeconds={durationSeconds}
          playheadSeconds={cursorSeconds}
          selectedSceneId={editor.selectedSceneId}
          sceneStatus={task?.sceneStatus ?? {}}
          sceneErrors={task?.sceneErrors ?? {}}
          sceneVersions={task?.sceneVersions ?? {}}
          narrationSrc={narrationSrc}
          musicSrc={musicSrc}
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
  )
}
