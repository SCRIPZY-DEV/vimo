import { useRef, useState } from 'react'
import type { RefObject, SyntheticEvent } from 'react'
import type { PlaybackRate } from '@/modules/videos/constants'

type VideoEvent = SyntheticEvent<HTMLVideoElement>

export interface VideoElementProps {
  ref: RefObject<HTMLVideoElement | null>
  muted: boolean
  onPlay(): void
  onPause(): void
  onEnded(event: VideoEvent): void
  onTimeUpdate(event: VideoEvent): void
  onLoadedMetadata(event: VideoEvent): void
}

// Controles de un <video> con controles propios. El elemento es la fuente de
// verdad: el estado solo espeja sus eventos y las acciones escriben en él.
// `videoProps` se esparce en el <video> para que el hook lo observe.
export function useVideoControls() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState<PlaybackRate>(1)
  const [currentSeconds, setCurrentSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) return void video.play()
    video.pause()
  }

  const toggleMute = () => {
    setMuted((current) => !current)
  }

  const changeRate = (nextRate: PlaybackRate) => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = nextRate
    setRate(nextRate)
  }

  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setCurrentSeconds(seconds)
  }

  const videoProps: VideoElementProps = {
    ref: videoRef,
    // Controlado por React: sobrevive a un cambio de src.
    muted,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    // El último timeupdate puede quedar unas décimas antes del final.
    onEnded: (event) => setCurrentSeconds(event.currentTarget.duration),
    onTimeUpdate: (event) => setCurrentSeconds(event.currentTarget.currentTime),
    onLoadedMetadata: (event) => {
      const video = event.currentTarget
      // Un src nuevo resetea playbackRate a 1: se reaplica la velocidad elegida.
      video.playbackRate = rate
      // Algunos contenedores reportan Infinity/NaN hasta tener el índice.
      setDurationSeconds(Number.isFinite(video.duration) ? video.duration : 0)
    },
  }

  return {
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
  }
}
