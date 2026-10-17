import { useEffect, useRef } from 'react'
import { SoundEffectScheduler } from '@/modules/videos/utilities/soundEffectPlayback'
import type { SoundEffectInstance } from '@pipeline/types/sound-effects.ts'

import type { UseSoundEffectPlaybackOptions } from '@/modules/videos/types/library'

export function useSoundEffectPlayback({
  clockRef,
  instances,
  source,
  durationSeconds,
  enabled,
}: UseSoundEffectPlaybackOptions) {
  const contextRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const schedulerRef = useRef<SoundEffectScheduler | null>(null)
  // La identidad de un array nuevo durante un tick no vuelve a disparar
  // un click que ya está sonando. Sólo un cambio de contenido lo rearma.
  const instancesKey = JSON.stringify(instances)

  useEffect(() => {
    if (!source) return
    const context = new AudioContext()
    contextRef.current = context
    let disposed = false
    // El catálogo sólo entrega el asset embebido como data URI: no hay red
    // ni lectura fuera del sidecar para reproducir un efecto.
    const decode = async () => {
      const encoded = source.slice(source.indexOf(',') + 1)
      const bytes = Uint8Array.from(atob(encoded), (value) =>
        value.charCodeAt(0),
      )
      return context.decodeAudioData(bytes.buffer)
    }
    void decode()
      .then((buffer) => {
        if (!disposed) bufferRef.current = buffer
      })
      .catch((error: unknown) => {
        if (!disposed)
          console.warn('No se pudo cargar el efecto de sonido', error)
      })
    return () => {
      disposed = true
      schedulerRef.current?.stop()
      schedulerRef.current = null
      bufferRef.current = null
      contextRef.current = null
      void context.close().catch(() => null)
    }
  }, [source])

  useEffect(() => {
    const currentInstances = JSON.parse(instancesKey) as SoundEffectInstance[]
    if (!enabled || !source || currentInstances.length === 0) return
    let frame = 0
    let previousSeconds = -1
    // waiting puede detener el reloj después de haber programado un click;
    // se cancela en ese mismo evento y se rearma cuando el medio sigue.
    let waiting = false
    const media = clockRef.current
    const stop = () => {
      schedulerRef.current?.stop()
      previousSeconds = -1
    }
    const onWaiting = () => {
      waiting = true
      stop()
    }
    const onPlaying = () => {
      waiting = false
    }
    media?.addEventListener('waiting', onWaiting)
    media?.addEventListener('playing', onPlaying)
    for (const event of ['pause', 'seeking', 'ended', 'ratechange'])
      media?.addEventListener(event, stop)

    const sample = () => {
      const context = contextRef.current
      const buffer = bufferRef.current
      if (!schedulerRef.current && context && buffer)
        schedulerRef.current = new SoundEffectScheduler(
          context,
          buffer,
          currentInstances,
          durationSeconds,
        )
      if (
        media &&
        !media.paused &&
        !media.ended &&
        !media.seeking &&
        !waiting
      ) {
        const seconds = media.currentTime
        if (previousSeconds >= 0 && seconds < previousSeconds) stop()
        schedulerRef.current?.sample(seconds, media.playbackRate)
        previousSeconds = seconds
      } else stop()
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)
    return () => {
      cancelAnimationFrame(frame)
      media?.removeEventListener('waiting', onWaiting)
      media?.removeEventListener('playing', onPlaying)
      for (const event of ['pause', 'seeking', 'ended', 'ratechange'])
        media?.removeEventListener(event, stop)
      stop()
      schedulerRef.current = null
    }
  }, [clockRef, durationSeconds, enabled, instancesKey, source])

  return {
    // Se llama dentro del gesto que arranca el medio, igual que los gains de
    // voz y música: Safari no permite desbloquear AudioContext desde un RAF.
    resume() {
      void contextRef.current?.resume().catch(() => null)
    },
    stop() {
      schedulerRef.current?.stop()
    },
  }
}
