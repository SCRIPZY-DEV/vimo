import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { useAudioGain } from '@/modules/common/hooks/useAudioGain'
import { Button } from '@/modules/common/ui/button'
import { formatTime } from '@/modules/common/utilities/formatTime'

interface AudioPlayerProps {
  src: string
  // Admite valores > 1 (se amplifica por Web Audio). Sin valor, no se toca.
  volume?: number
  loop?: boolean
  // Punto de arranque de la pista (offset de la música de fondo).
  startSeconds?: number
}

let activeAudio: HTMLAudioElement | null = null

// Reproductor de audio compartido: play/pausa, posición y tiempo. Con `volume`
// aplica el nivel en vivo, para escuchar una mezcla antes de guardarla.
export function AudioPlayer({
  src,
  volume,
  loop,
  startSeconds,
}: AudioPlayerProps) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const { resume } = useAudioGain(audioRef, { volume })
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)

  // Mover el offset salta a la nueva posición aunque esté sonando.
  useEffect(() => {
    if (startSeconds === undefined) return

    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = startSeconds
    setPosition(startSeconds)
  }, [startSeconds])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      if (activeAudio && activeAudio !== audio) activeAudio.pause()
      activeAudio = audio
      resume()
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
        loop={loop}
        // El grafo de Web Audio enmudece un media cross-origin sin CORS, y las
        // pistas locales llegan por el protocolo asset:// de Tauri.
        crossOrigin={volume === undefined ? undefined : 'anonymous'}
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
          playing ? t('common.player.pause') : t('common.player.play')
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
        aria-label={t('common.player.position')}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-saffron"
      />
      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(position)} / {formatTime(duration)}
      </span>
    </div>
  )
}
