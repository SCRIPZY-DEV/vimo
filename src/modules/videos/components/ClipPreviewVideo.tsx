import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { normalizeClipToSlot } from '@pipeline/animation/normalization.ts'
import { ANIMATION_FPS } from '@pipeline/animation/timing.ts'
import { clipDriftAction } from '@/modules/videos/utilities/clipDriftAction'

interface ClipPreviewVideoProps {
  src: string
  offsetSeconds: number
  slotSeconds: number
  startSeconds: number
  // Desfase con la narración a partir del cual se reajusta el clip: 0,3 s en
  // uno de Kie, 0,12 s en uno de avatar (los labios lo delatan antes).
  resyncSeconds: number
  // false = nunca cambia la velocidad: el clip de avatar llega normalizado al
  // tramo exacto y la narración manda (spec §7.3).
  retime: boolean
  clockRef: RefObject<HTMLMediaElement | null>
  playing: boolean
  onClick(): void
  onUnavailable?(): void
}

// La narración es el reloj. Durante reproducción se lee directamente del
// medio, no de una muestra de React que pudo quedar atrasada. Un clip
// adelantado espera al audio; corregirlo hacia atrás repetiría la acción.
export function ClipPreviewVideo({
  src,
  offsetSeconds,
  slotSeconds,
  startSeconds,
  resyncSeconds,
  retime,
  clockRef,
  playing,
  onClick,
  onUnavailable,
}: ClipPreviewVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const offsetRef = useRef(offsetSeconds)
  const synchronizeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    offsetRef.current = offsetSeconds
    if (!playing) synchronizeRef.current?.()
  }, [offsetSeconds, playing])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const clock = clockRef.current
    let frame = 0
    let disposed = false
    let positionRequested = true
    let holdingAhead = false
    let previousClockSeconds: number | null = null
    let playPending = false
    const frameSeconds = 1 / ANIMATION_FPS

    const pause = () => {
      if (!video.paused) video.pause()
    }
    const canAdvance = () => {
      return (
        playing &&
        clock !== null &&
        !clock.paused &&
        !clock.seeking &&
        clock.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      )
    }
    const sync = () => {
      if (disposed) return
      video.muted = true
      video.defaultMuted = true
      if (!Number.isFinite(video.duration) || video.duration <= 0) return
      const fit = normalizeClipToSlot(video.duration, slotSeconds)
      const rate = retime && fit.fit === 'speed' ? fit.rate : 1
      if (video.playbackRate !== rate) video.playbackRate = rate

      const clockSeconds =
        clock?.currentTime ?? startSeconds + offsetRef.current
      if (
        playing &&
        previousClockSeconds !== null &&
        clockSeconds < previousClockSeconds - frameSeconds
      )
        positionRequested = true
      previousClockSeconds = clockSeconds
      const offset =
        playing && clock ? clockSeconds - startSeconds : offsetRef.current
      const target = Math.max(0, Math.min(offset * rate, video.duration))
      const difference = target - video.currentTime
      const advancing = canAdvance() && offset >= 0 && offset < slotSeconds
      if (!advancing) pause()

      // Solo una entrada, una inspección pausada o un seek explícito pueden
      // volver a un cuadro anterior. Los ajustes de deriva nunca lo hacen.
      if (positionRequested || !playing) {
        if (Math.abs(difference) > frameSeconds / 2) video.currentTime = target
        positionRequested = false
        holdingAhead = false
      } else if (!video.seeking && advancing) {
        const action = clipDriftAction(difference, resyncSeconds)
        if (action === 'seek') video.currentTime = target
        if (action === 'hold') holdingAhead = true
      }
      if (holdingAhead && difference >= -frameSeconds) holdingAhead = false
      // play() sobre un medio terminado puede reiniciarlo en 0: se conserva
      // el último cuadro hasta salir del bloque o recibir un seek explícito.
      if (!advancing || holdingAhead || video.seeking || video.ended) {
        pause()
        return
      }
      if (!video.paused || playPending) return
      playPending = true
      void video
        .play()
        .then(() => {
          if (disposed || synchronizeRef.current !== sync) return
          if (!canAdvance() || holdingAhead) pause()
        })
        .catch(() => undefined)
        .finally(() => {
          playPending = false
        })
    }
    const seek = () => {
      positionRequested = true
      holdingAhead = false
      pause()
      sync()
    }
    const sample = () => {
      sync()
      if (!disposed) frame = requestAnimationFrame(sample)
    }
    synchronizeRef.current = sync
    video.addEventListener('loadedmetadata', sync)
    video.addEventListener('seeked', sync)
    clock?.addEventListener('seeking', seek)
    clock?.addEventListener('waiting', pause)
    sync()
    if (playing) frame = requestAnimationFrame(sample)
    return () => {
      disposed = true
      synchronizeRef.current = null
      cancelAnimationFrame(frame)
      video.removeEventListener('loadedmetadata', sync)
      video.removeEventListener('seeked', sync)
      clock?.removeEventListener('seeking', seek)
      clock?.removeEventListener('waiting', pause)
      pause()
    }
  }, [src, slotSeconds, startSeconds, resyncSeconds, retime, playing, clockRef])

  return (
    <video
      key={src}
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="auto"
      onClick={onClick}
      onError={onUnavailable}
      className="absolute inset-0 h-full w-full cursor-pointer object-contain"
    />
  )
}
