import { useTranslation } from 'react-i18next'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { MuteButton } from '@/modules/videos/components/MuteButton'
import { PlayPauseButton } from '@/modules/videos/components/PlayPauseButton'
import { useEditorPlayback } from '@/modules/videos/hooks/useEditorPlayback'
import { sceneAt } from '@/modules/videos/utilities/sceneAt'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
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
// él simula el video — imagen de la escena bajo el cursor + narración +
// música. La reproducción vive en useEditorPlayback; acá solo el markup.
export function EditorPreviewPlayer({
  scenes,
  sceneVersions,
  narrationSrc,
  musicSrc,
  videoSrc,
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
    scrubbing,
    onTimeChange,
    playerRef,
  })

  const currentScene = sceneAt(scenes, cursorSeconds)

  const renderStage = () => {
    if (videoMode) {
      return (
        <video
          ref={videoRef}
          src={videoSrc}
          muted={muted}
          onClick={handle.togglePlay}
          {...primaryMediaEvents}
          className="absolute inset-0 h-full w-full cursor-pointer object-contain"
        />
      )
    }
    if (currentScene?.imagePath) {
      return (
        <img
          src={sceneImageSource(currentScene, sceneVersions[currentScene.id])}
          alt=""
          onClick={handle.togglePlay}
          className="absolute inset-0 h-full w-full cursor-pointer object-contain"
        />
      )
    }
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
      </div>
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
          'relative mx-auto w-full overflow-hidden rounded-2xl border-2 border-border bg-black lg:w-[var(--stage-width)]',
          aspectClass(videoFormat),
        )}
      >
        {renderStage()}

        {!videoMode && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white/90">
            {t('library.editor.previewBadge')}
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

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
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
