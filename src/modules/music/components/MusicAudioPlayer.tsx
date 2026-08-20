import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { formatTime } from '@/modules/common/utilities/formatTime'

interface MusicAudioPlayerProps {
  src: string
}

let activeAudio: HTMLAudioElement | null = null

export function MusicAudioPlayer({ src }: MusicAudioPlayerProps) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause()
      activeAudio = audio
      void audio.play()
      return
    }
    audio.pause()
  }

  const seek = (value: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value
    setPosition(value)
  }

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />
      <Button
        variant="outline"
        size="icon"
        onClick={togglePlay}
        aria-label={
          playing ? t('music.player.pausar') : t('music.player.reproducir')
        }
        className="h-8 w-8 shrink-0 rounded-full"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(position, duration || 0)}
        onChange={(event) => seek(Number(event.target.value))}
        aria-label={t('music.player.posicion')}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-saffron"
      />
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(position)} / {formatTime(duration)}
      </span>
    </div>
  )
}
