import { useEffect, useRef, useState } from 'react'
import type { RefObject, SyntheticEvent } from 'react'
import { useAudioGain } from '@/modules/common/hooks/useAudioGain'
import { clamp } from '@/modules/common/utilities/clamp'
import { SEEK_TOLERANCE_SECONDS } from '@/modules/videos/constants'
import { ANIMATION_FPS } from '@pipeline/animation/timing.ts'
import type {
  AudioMixValue,
  EditorPlayerHandle,
} from '@/modules/videos/types/library'

interface UseEditorPlaybackOptions {
  // true: reproduce el mp4 renderizado; false: narración + música en loop
  // detrás de la imagen de la escena.
  videoMode: boolean
  durationSeconds: number
  mix: AudioMixValue
  // Mientras se arrastra el playhead se ignoran los timeupdate del media.
  scrubbing: boolean
  onTimeChange(seconds: number): void
  playerRef: RefObject<EditorPlayerHandle | null>
}

type MediaEvent = SyntheticEvent<HTMLMediaElement>

// Eventos que cablea el media "principal" (video o narración) para que el
// elemento sea la fuente de verdad de playing y del tiempo.
export interface PrimaryMediaEvents {
  onPlay(): void
  onPause(): void
  onTimeUpdate(event: MediaEvent): void
}

// Motor de reproducción del preview del editor. Publica un handle imperativo
// para atajos y timeline, y mantiene la música sincronizada con la narración
// (offset + loop) cuando no hay video renderizado.
export function useEditorPlayback({
  videoMode,
  durationSeconds,
  mix,
  scrubbing,
  onTimeChange,
  playerRef,
}: UseEditorPlaybackOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const narrationRef = useRef<HTMLAudioElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  // Guard anti-timeupdate-tardío: tras un seek, los ticks viejos con un
  // currentTime menor se descartan (saltaban el cursor a 0).
  const lastSeekRef = useRef(0)
  const onTimeChangeRef = useRef(onTimeChange)
  const cancelPendingSeekRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange
  }, [onTimeChange])

  // Un seek pendiente pertenece al medio actual, no al siguiente modo ni
  // a una instancia del editor que ya se desmontó.
  useEffect(() => {
    return () => cancelPendingSeekRef.current?.()
  }, [videoMode])

  // timeupdate puede llegar solo cuatro veces por segundo. El reloj del
  // medio sigue mandando, con muestreo por cuadro para cámara y fundidos.
  useEffect(() => {
    if (!playing || scrubbing) return
    let handle = 0
    let previousFrame = -1
    const sample = () => {
      const media = videoMode ? videoRef.current : narrationRef.current
      if (
        media &&
        !media.paused &&
        media.currentTime >= lastSeekRef.current - SEEK_TOLERANCE_SECONDS
      ) {
        const frame = Math.floor(media.currentTime * ANIMATION_FPS)
        if (frame !== previousFrame) {
          previousFrame = frame
          onTimeChangeRef.current(media.currentTime)
        }
      }
      handle = requestAnimationFrame(sample)
    }
    handle = requestAnimationFrame(sample)
    return () => cancelAnimationFrame(handle)
  }, [playing, scrubbing, videoMode])

  const primaryMedia = () => {
    return videoMode ? videoRef.current : narrationRef.current
  }

  // Volúmenes en vivo: la mezcla real ocurre en el render; esto la imita.
  // Por gain, no por element.volume: la mezcla admite hasta 2x y el elemento
  // topa en 1.
  const narrationGain = useAudioGain(narrationRef, {
    volume: mix.voiceVolume,
    muted,
  })
  const musicGain = useAudioGain(musicRef, { volume: mix.musicVolume, muted })

  // La música arranca en su offset y acompaña el tiempo de la narración.
  const syncMusic = (seconds: number) => {
    const music = musicRef.current
    if (!music || !Number.isFinite(music.duration) || music.duration === 0)
      return
    music.currentTime = (mix.bgmOffsetSeconds + seconds) % music.duration
  }

  // Seek atómico: con el media listo aplica ya; si no, solo la última
  // intención espera canplay. Jamás llama load(): resetearía currentTime.
  const applyWhenReady = (element: HTMLMediaElement, apply: () => void) => {
    const ready =
      element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      Number.isFinite(element.duration)
    if (ready) return apply()

    const source = element.src
    const cancel = () => {
      element.removeEventListener('canplay', applyPending)
      if (cancelPendingSeekRef.current === cancel)
        cancelPendingSeekRef.current = null
    }
    const applyPending = () => {
      if (cancelPendingSeekRef.current !== cancel) return
      cancel()
      if (element !== primaryMedia() || element.src !== source) return
      apply()
    }
    cancelPendingSeekRef.current = cancel
    element.addEventListener('canplay', applyPending, { once: true })
  }

  const seekTo = (seconds: number) => {
    cancelPendingSeekRef.current?.()
    const clamped = clamp(seconds, 0, durationSeconds)
    lastSeekRef.current = clamped
    onTimeChange(clamped)

    const media = primaryMedia()
    if (media) applyWhenReady(media, () => (media.currentTime = clamped))
    if (!videoMode) syncMusic(clamped)
  }

  const play = () => {
    narrationGain.resume()
    musicGain.resume()
    void primaryMedia()?.play()
    // La política de autoplay puede rechazar la música; la narración manda.
    if (!videoMode) void musicRef.current?.play().catch(() => null)
  }

  const pause = () => {
    primaryMedia()?.pause()
    if (!videoMode) musicRef.current?.pause()
  }

  const handle: EditorPlayerHandle = {
    togglePlay() {
      const media = primaryMedia()
      if (!media) return
      if (media.paused) play()
      else pause()
    },
    toggleMute() {
      setMuted((current) => !current)
    },
    seekTo,
    seekWithPlay(seconds) {
      seekTo(seconds)
      play()
    },
  }

  // Sin dependencias a propósito: el handle captura videoMode, duración y
  // mezcla del render actual, y debe publicarse fresco cada vez.
  useEffect(() => {
    playerRef.current = handle
    return () => {
      playerRef.current = null
    }
  })

  const primaryMediaEvents: PrimaryMediaEvents = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onTimeUpdate: (event) => {
      if (scrubbing) return
      const seconds = event.currentTarget.currentTime
      if (seconds < lastSeekRef.current - SEEK_TOLERANCE_SECONDS) return
      onTimeChange(seconds)
    },
  }

  // La narración terminó: la música loopea, hay que frenarla a mano.
  const onNarrationEnded = () => {
    musicRef.current?.pause()
  }

  return {
    videoRef,
    narrationRef,
    musicRef,
    playing,
    muted,
    handle,
    primaryMediaEvents,
    onNarrationEnded,
  }
}
