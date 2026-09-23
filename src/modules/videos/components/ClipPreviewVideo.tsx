import { useEffect, useRef } from 'react'
import { normalizeClipToSlot } from '@pipeline/animation/normalization.ts'
import { CLIP_PREVIEW_DRIFT_SECONDS } from '@/modules/videos/constants'

interface ClipPreviewVideoProps {
  src: string
  // Cuánto lleva el hueco al instante del cursor, y el largo del hueco.
  offsetSeconds: number
  slotSeconds: number
  playing: boolean
  onClick(): void
  onUnavailable?(): void
}

// El clip de animación dentro del preview simulado del editor (ADR-0041).
// La narración sigue siendo el reloj: este video va mudo y se mantiene
// alineado al cursor, reproducido con la MISMA velocidad con la que el render
// lo normaliza al hueco (cámara lenta o acelerado; cortado a velocidad
// normal), así lo que se ve es lo que va a salir en el mp4. Mientras suena
// solo se corrige la deriva grande, para no trabar el video con un seek por
// cada tick del audio; en pausa o al arrastrar se busca el cuadro exacto.
export function ClipPreviewVideo({
  src,
  offsetSeconds,
  slotSeconds,
  playing,
  onClick,
  onUnavailable,
}: ClipPreviewVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const sync = () => {
      video.muted = true
      video.defaultMuted = true
      if (!Number.isFinite(video.duration) || video.duration === 0) return
      const fit = normalizeClipToSlot(video.duration, slotSeconds)
      const rate = fit.fit === 'speed' ? fit.rate : 1
      video.playbackRate = rate
      const target = Math.min(offsetSeconds * rate, video.duration)
      const drift = Math.abs(video.currentTime - target)
      if (!playing || drift > CLIP_PREVIEW_DRIFT_SECONDS)
        video.currentTime = target
      if (playing && video.paused) void video.play().catch(() => null)
      if (!playing && !video.paused) video.pause()
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      sync()
      return
    }
    video.addEventListener('loadedmetadata', sync, { once: true })
    return () => video.removeEventListener('loadedmetadata', sync)
  }, [src, offsetSeconds, slotSeconds, playing])

  return (
    <video
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
