import { useEffect, useRef, useState } from 'react'
import type { RefObject, SyntheticEvent } from 'react'
import { LOOK_PLAYER_RATES } from '@/modules/avatars/constants'
import type { LookPlayerRate } from '@/modules/avatars/constants'

type VideoEvent = SyntheticEvent<HTMLVideoElement>

// La reproducción del video de un look en su reproductor (LookPlayer). El
// `<video>` es la fuente de verdad: el estado solo espeja sus eventos y las
// acciones escriben en él (como los controles del video final, que viven en
// otro módulo). El video tiene sonido, así que `play()` sale siempre del
// manejador de un clic o de una tecla de la persona, nunca de un efecto: es
// la activación del usuario que pide WebKit para arrancar con sonido.
// `stageRef` es la caja del escenario, la que pasa a pantalla completa.
export function useLookPlayback(stageRef: RefObject<HTMLElement | null>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [failed, setFailed] = useState(false)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState<LookPlayerRate>(1)
  const [currentSeconds, setCurrentSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  // La pantalla completa la cambia también el navegador (Escape la cierra):
  // el estado escucha al documento.
  useEffect(() => {
    const sync = () => {
      setFullscreen(
        document.fullscreenElement !== null &&
          document.fullscreenElement === stageRef.current,
      )
    }
    document.addEventListener('fullscreenchange', sync)

    return () => document.removeEventListener('fullscreenchange', sync)
  }, [stageRef])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) {
      video.pause()
      return
    }

    // Se rechaza si el video no carga o si se pausa antes de arrancar: el
    // botón vuelve solo, porque el estado espeja los eventos.
    void video.play().catch(() => null)
  }

  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video) return

    const end = Number.isFinite(video.duration) ? video.duration : seconds
    const target = Math.min(Math.max(seconds, 0), end)
    video.currentTime = target
    setCurrentSeconds(target)
  }

  const skip = (deltaSeconds: number) => {
    const video = videoRef.current
    if (!video) return

    seek(video.currentTime + deltaSeconds)
  }

  const toggleMute = () => setMuted((current) => !current)

  const cycleRate = () => {
    const index = LOOK_PLAYER_RATES.indexOf(rate)
    const next = LOOK_PLAYER_RATES[(index + 1) % LOOK_PLAYER_RATES.length]
    if (videoRef.current) videoRef.current.playbackRate = next
    setRate(next)
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => null)
      return
    }

    void stageRef.current?.requestFullscreen().catch(() => null)
  }

  const videoProps = {
    ref: videoRef,
    // Controlado por React: lo aplica como propiedad del elemento.
    muted,
    onPlay: () => setPlaying(true),
    onPause: () => {
      setPlaying(false)
      setBuffering(false)
    },
    onWaiting: () => setBuffering(true),
    onPlaying: () => setBuffering(false),
    // El último `timeupdate` puede quedar unas décimas antes del final.
    onEnded: (event: VideoEvent) => {
      setPlaying(false)
      setCurrentSeconds(event.currentTarget.duration)
    },
    onTimeUpdate: (event: VideoEvent) =>
      setCurrentSeconds(event.currentTarget.currentTime),
    onLoadedMetadata: (event: VideoEvent) => {
      const video = event.currentTarget
      // Un src nuevo vuelve a velocidad 1: se reaplica la elegida.
      video.playbackRate = rate
      // Algunos contenedores informan Infinity o NaN hasta tener el índice.
      setDurationSeconds(Number.isFinite(video.duration) ? video.duration : 0)
    },
    onError: () => {
      setFailed(true)
      setPlaying(false)
      setBuffering(false)
    },
  }

  return {
    playing,
    buffering,
    failed,
    muted,
    rate,
    currentSeconds,
    durationSeconds,
    fullscreen,
    togglePlay,
    seek,
    skip,
    toggleMute,
    cycleRate,
    toggleFullscreen,
    videoProps,
  }
}
