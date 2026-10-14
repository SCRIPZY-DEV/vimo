import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { EditorVisualComposition } from '@/modules/videos/components/EditorVisualComposition'
import { sceneAt } from '@/modules/videos/utilities/sceneAt'
import { clipAt } from '@/modules/videos/utilities/clipAt'
import { hasTimelineTransitionAt } from '@/modules/videos/utilities/timelineTransitionFrames'
import { MuteButton } from '@/modules/videos/components/MuteButton'
import { PlayPauseButton } from '@/modules/videos/components/PlayPauseButton'
import { useEditorPlayback } from '@/modules/videos/hooks/useEditorPlayback'
import {
  aspectClass,
  exactWidthInContainer,
} from '@/modules/videos/utilities/videoFormat'
import type {
  AudioMixValue,
  EditorPlayerHandle,
} from '@/modules/videos/types/library'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { CSSProperties, RefObject } from 'react'

interface EditorPreviewPlayerProps {
  scenes: SceneDetail[]
  sceneVersions: Record<number, number>
  narrationSrc: string | null
  musicSrc: string | null
  // Solo con render vigente (mp4 válido y NO desactualizado).
  videoSrc: string | null
  // true cuando una pista silenciada obliga a simular aunque haya render
  // vigente (el mp4 trae su mezcla): la insignia dice por qué.
  mutedPreview: boolean
  durationSeconds: number
  // Relación del proyecto: el visor la respeta para no letterboxear.
  videoFormat: VideoFormat
  mix: AudioMixValue
  // Cursor CONTROLADO por la vista: al clickear el timeline la imagen de la
  // escena cambia al instante, sin esperar al audio.
  cursorSeconds: number
  scrubbing: boolean
  onTimeChange(seconds: number): void
  playerRef: RefObject<EditorPlayerHandle | null>
}

// Preview del editor, doble modo: con render vigente reproduce el mp4; sin
// él simula el video — imagen de la escena bajo el cursor (o el clip de
// animación que la cubre, mudo y al ritmo de la narración, ADR-0041) +
// narración + música. La reproducción vive en useEditorPlayback; acá solo
// el markup.
export function EditorPreviewPlayer({
  scenes,
  sceneVersions,
  narrationSrc,
  musicSrc,
  videoSrc,
  mutedPreview,
  durationSeconds,
  videoFormat,
  mix,
  cursorSeconds,
  scrubbing,
  onTimeChange,
  playerRef,
}: EditorPreviewPlayerProps) {
  const { t } = useTranslation()
  const videoMode = videoSrc !== null
  const {
    videoRef,
    narrationRef,
    musicRef,
    playing,
    muted,
    handle,
    primaryMediaEvents,
    onNarrationEnded,
  } = useEditorPlayback({
    videoMode,
    durationSeconds,
    mix,
    cursorSeconds,
    scrubbing,
    onTimeChange,
    playerRef,
  })

  const renderStage = () => {
    if (videoMode) {
      const inspectAsset =
        (!playing || scrubbing) &&
        hasTimelineTransitionAt(scenes, cursorSeconds) &&
        Boolean(
          sceneAt(scenes, cursorSeconds)?.imagePath ||
          clipAt(scenes, cursorSeconds),
        )
      return (
        <>
          <video
            ref={videoRef}
            src={videoSrc}
            muted={muted}
            onClick={handle.togglePlay}
            {...primaryMediaEvents}
            style={{ visibility: inspectAsset ? 'hidden' : undefined }}
            className="absolute inset-0 h-full w-full cursor-pointer object-contain"
          />
          {inspectAsset && (
            <EditorVisualComposition
              scenes={scenes}
              versions={sceneVersions}
              seconds={cursorSeconds}
              playing={false}
              clockRef={videoRef}
              onClick={handle.togglePlay}
            />
          )}
        </>
      )
    }
    return (
      <EditorVisualComposition
        scenes={scenes}
        versions={sceneVersions}
        seconds={cursorSeconds}
        playing={playing && !scrubbing}
        clockRef={narrationRef}
        onClick={handle.togglePlay}
      />
    )
  }

  // El wrapper solo ocupa el hueco del layout (sin fondo): el negro vive en el
  // stage, que toma la relación exacta del proyecto. Desde lg el ancho sale de
  // container queries: llena alto o ancho, el que ate primero, sin bandas.
  return (
    <div className="relative w-full lg:flex lg:h-full lg:min-h-0 lg:items-center lg:justify-center lg:[container-type:size]">
      <div
        style={
          {
            '--stage-width': exactWidthInContainer(videoFormat),
          } as CSSProperties
        }
        className={cn(
          'relative isolate mx-auto w-full overflow-hidden rounded-2xl border-2 border-border bg-black lg:w-[var(--stage-width)]',
          aspectClass(videoFormat),
        )}
      >
        {renderStage()}

        {!videoMode && (
          <span className="absolute right-2 top-2 z-10 transform-gpu rounded bg-black/60 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white/90">
            {t(
              mutedPreview
                ? 'library.editor.previewBadgeMuted'
                : 'library.editor.previewBadge',
            )}
          </span>
        )}

        {!videoMode && narrationSrc && (
          <audio
            ref={narrationRef}
            src={narrationSrc}
            muted={muted}
            crossOrigin="anonymous"
            onEnded={onNarrationEnded}
            {...primaryMediaEvents}
            className="hidden"
          />
        )}
        {!videoMode && musicSrc && (
          <audio
            ref={musicRef}
            src={musicSrc}
            muted={muted}
            crossOrigin="anonymous"
            loop
            className="hidden"
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 transform-gpu bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
          <div className="pointer-events-auto flex items-center gap-3">
            <PlayPauseButton
              playing={playing}
              onClick={handle.togglePlay}
              iconClassName="h-5 w-5"
              className="h-10 w-10 rounded-full bg-saffron text-charcoal transition-transform hover:scale-105"
            />
            <MuteButton
              muted={muted}
              onClick={handle.toggleMute}
              className="h-9 w-9 rounded-full bg-white/15 text-white hover:bg-white/25"
            />
            <span className="font-mono text-xs tabular-nums text-white/80">
              {formatTime(cursorSeconds)} / {formatTime(durationSeconds)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
