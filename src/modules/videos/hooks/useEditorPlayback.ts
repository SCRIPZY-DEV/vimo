import { useEffect, useEffectEvent, useRef, useState } from 'react'
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
  // Cursor del editor: al cambiar de modo, el maestro nuevo queda ahí.
  cursorSeconds: number
  // Mientras se arrastra el playhead se ignoran los timeupdate del media.
  scrubbing: boolean
  onTimeChange(seconds: number): void
  playerRef: RefObject<EditorPlayerHandle | null>
}

type MediaEvent = SyntheticEvent<HTMLMediaElement>

// Guarda de los seeks: con datos del cuadro actual y la duración conocida, el
// medio acepta currentTime ya; si no, hay que esperar a canplay.
function isMediaReady(element: HTMLMediaElement) {
  return (
    element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Number.isFinite(element.duration)
  )
}

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
  cursorSeconds,
  scrubbing,
  onTimeChange,
  playerRef,
}: UseEditorPlaybackOptions) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const narrationRef = useRef<HTMLAudioElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  // Modo en el que vale `playing` (ver el cambio de modo, abajo).
  const [playingMode, setPlayingMode] = useState(videoMode)
  // Si se venía reproduciendo cuando cambió el modo. Se escribe en el mismo
  // render de cada cambio y solo lo lee el efecto que asienta ese cambio, así
  // que nunca hace falta volverlo a false.
  const [resumeAfterSwitch, setResumeAfterSwitch] = useState(false)
  // Guard anti-timeupdate-tardío: tras un seek, los ticks viejos con un
  // currentTime menor se descartan (saltaban el cursor a 0).
  const lastSeekRef = useRef(0)
  const onTimeChangeRef = useRef(onTimeChange)
  const cancelPendingSeekRef = useRef<(() => void) | null>(null)
  // Último modo cuyos medios quedaron en el cursor: distingue el montaje de
  // un cambio de modo.
  const settledModeRef = useRef(videoMode)
  // Reproducción que espera a que el maestro nuevo quede en el cursor tras un
  // cambio de modo. Sobrevive a un seek y a otro cambio de modo que lleguen
  // antes (dos clics seguidos en silenciar); un play o una pausa de la
  // persona la reemplazan.
  const resumePendingRef = useRef(false)

  // Un cambio de modo (terminó un render, el video quedó desactualizado o se
  // silenció una pista) cambia el reloj maestro: el medio que sonaba se
  // desmonta sin que React reciba su pause y el nuevo nace pausado en 0. La
  // reproducción se da por frenada en este mismo render, pero se recuerda si
  // venía sonando: como en VidRush, silenciar una pista no la corta. Pausar
  // los medios que se van, llevar el maestro nuevo al cursor y retomar desde
  // ahí queda para el efecto del cambio de modo.
  if (playingMode !== videoMode) {
    setPlayingMode(videoMode)
    setResumeAfterSwitch(playing)
    setPlaying(false)
  }

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
    if (isMediaReady(element)) return apply()

    const source = element.src
    const cancel = () => {
      element.removeEventListener('canplay', applyPending)
      if (cancelPendingSeekRef.current === cancel)
        cancelPendingSeekRef.current = null
    }
    const applyPending = () => {
      if (cancelPendingSeekRef.current !== cancel) return
      cancel()
      // El maestro cambió de elemento o de fuente antes de quedar listo: este
      // seek ya no vale, y la reanudación de un cambio de modo tampoco. Si
      // quedara armada, un seek posterior (J/L, Inicio/Fin, elegir una
      // escena) arrancaría la reproducción sin que nadie la pidiera.
      if (element !== primaryMedia() || element.src !== source) {
        resumePendingRef.current = false
        return
      }

      apply()
    }
    cancelPendingSeekRef.current = cancel
    element.addEventListener('canplay', applyPending, { once: true })
  }

  const play = () => {
    resumePendingRef.current = false
    narrationGain.resume()
    musicGain.resume()
    // Sin un gesto de la persona (un render que termina mientras suena la
    // simulación) la política de autoplay puede rechazar el play: el medio
    // queda en pausa, no llega su onPlay y `playing` sigue en false.
    void primaryMedia()
      ?.play()
      .catch(() => null)
    // La política de autoplay puede rechazar la música; la narración manda.
    if (!videoMode) void musicRef.current?.play().catch(() => null)
  }

  const pause = () => {
    resumePendingRef.current = false
    primaryMedia()?.pause()
    if (!videoMode) musicRef.current?.pause()
  }

  const seekTo = (seconds: number) => {
    cancelPendingSeekRef.current?.()
    const clamped = clamp(seconds, 0, durationSeconds)
    lastSeekRef.current = clamped
    onTimeChange(clamped)

    const media = primaryMedia()
    if (media) {
      applyWhenReady(media, () => {
        media.currentTime = clamped
        // La reproducción de un cambio de modo sigue recién acá, con el
        // maestro ya en su lugar: nunca arranca en 0 para saltar después.
        if (resumePendingRef.current) play()
      })
    }

    if (!videoMode) syncMusic(clamped)
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

  // La música del modo simulado nace sin duración y seekTo no puede
  // alinearla: se alinea cuando tenga datos, con el cursor de ese momento.
  const alignMusicToCursor = useEffectEvent(() => syncMusic(cursorSeconds))

  // Lo que el cambio de modo no hace en el render: el maestro nuevo queda en
  // el cursor (seekTo respeta la guarda de readyState y nunca llama load()) y
  // la música se alinea en cuanto pueda. Devuelve cómo cancelar esa espera.
  const settleNewMode = useEffectEvent(() => {
    // Si venía sonando, el mismo seek retoma la reproducción cuando el
    // maestro queda en el cursor. Si el cambio anterior todavía no había
    // retomado, su intención sigue en pie; en pausa no se toca nada.
    if (resumeAfterSwitch) resumePendingRef.current = true
    seekTo(cursorSeconds)

    const music = musicRef.current
    if (!music || isMediaReady(music)) return undefined

    const alignMusic = () => alignMusicToCursor()
    music.addEventListener('canplay', alignMusic, { once: true })
    return () => music.removeEventListener('canplay', alignMusic)
  })

  // Los medios del último commit. Cuando corre la limpieza del cambio de modo,
  // React ya desmontó los del modo que se va y los refs apuntan a los del
  // modo nuevo (o a null): esta foto todavía tiene a los que se van, incluida
  // una música montada después de entrar al modo.
  const committedMediaRef = useRef<(HTMLMediaElement | null)[]>([])
  useEffect(() => {
    committedMediaRef.current = [
      videoRef.current,
      narrationRef.current,
      musicRef.current,
    ]
  })

  useEffect(() => {
    const switched = settledModeRef.current !== videoMode
    settledModeRef.current = videoMode
    const cancelMusicAlignment = switched ? settleNewMode() : undefined

    return () => {
      cancelMusicAlignment?.()
      // Al cambiar de modo o desmontar se pausan los medios que había justo
      // antes (la foto del último commit), aunque React ya los haya
      // desmontado sin que su pause le llegue.
      for (const element of committedMediaRef.current) element?.pause()
    }
  }, [videoMode])

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
