import { useTranslation } from 'react-i18next'
import { buttonVariants } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { MuteButton } from '@/modules/videos/components/MuteButton'
import { PlayPauseButton } from '@/modules/videos/components/PlayPauseButton'
import { PLAYBACK_RATES } from '@/modules/videos/constants'
import { useVideoControls } from '@/modules/videos/hooks/useVideoControls'
import { isVertical } from '@/modules/videos/utilities/videoFormat'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface LibraryVideoPlayerProps {
  src: string
  videoFormat?: VideoFormat
}

// Reproductor del video final con velocidades (port del player del origen).
// Presentacional puro: recibe la URL ya resuelta (convertFileSrc + mtime).
export function LibraryVideoPlayer({
  src,
  videoFormat = '16:9',
}: LibraryVideoPlayerProps) {
  const { t } = useTranslation()
  const {
    playing,
    muted,
    rate,
    currentSeconds,
    durationSeconds,
    togglePlay,
    toggleMute,
    changeRate,
    seek,
    videoProps,
  } = useVideoControls()

  return (
    <div className="space-y-3">
      {/* Un short a w-full saldría gigante: se limita por alto y se centra. */}
      <video
        {...videoProps}
        src={src}
        onClick={togglePlay}
        className={cn(
          'cursor-pointer rounded-xl border border-border bg-black',
          isVertical(videoFormat) ? 'mx-auto max-h-[70vh]' : 'w-full',
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        <PlayPauseButton
          playing={playing}
          onClick={togglePlay}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'icon' }),
            'h-9 w-9 rounded-xl',
          )}
        />

        <span className="font-mono text-xs text-muted-foreground">
          {formatTime(currentSeconds)} / {formatTime(durationSeconds)}
        </span>

        <input
          type="range"
          min={0}
          max={durationSeconds}
          step={0.1}
          value={currentSeconds}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={t('library.player.seek')}
          className="min-w-32 flex-1 accent-saffron"
        />

        <div className="flex items-center gap-1">
          {PLAYBACK_RATES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={rate === option}
              onClick={() => changeRate(option)}
              className={cn(
                'rounded-lg px-2 py-1 font-display text-xs font-bold transition-colors',
                rate === option
                  ? 'bg-saffron text-white'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {option}×
            </button>
          ))}
        </div>

        <MuteButton
          muted={muted}
          onClick={toggleMute}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'h-9 w-9 rounded-xl text-muted-foreground',
          )}
        />
      </div>
    </div>
  )
}
