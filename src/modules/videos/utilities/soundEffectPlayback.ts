import type { SoundEffectInstance } from '@pipeline/types/sound-effects.ts'

// Un efecto siempre cabe entero en el video. Su duración pertenece al asset,
// nunca al clip del timeline: moverlo no recorta ni alarga el proyecto.
export function boundSoundEffectStart(
  seconds: number,
  durationSeconds: number,
  effectDurationSeconds: number,
): number {
  return Math.min(
    Math.max(0, durationSeconds - effectDurationSeconds),
    Math.max(0, seconds),
  )
}

// La narración es el reloj. Una ventana pequeña programa los clicks con el
// reloj de audio, sin depender de la frecuencia baja de timeupdate. Un seek,
// pausa o cambio de mezcla destruye lo programado y retoma desde el offset
// del efecto que contiene el nuevo cursor, sin repetir efectos anteriores.
export class SoundEffectScheduler {
  private context: AudioContext
  private buffer: AudioBuffer
  private instances: readonly SoundEffectInstance[]
  private durationSeconds: number
  private scheduled = new Set<string>()
  private active = new Map<AudioBufferSourceNode, GainNode>()

  constructor(
    context: AudioContext,
    buffer: AudioBuffer,
    instances: readonly SoundEffectInstance[],
    durationSeconds: number,
  ) {
    this.context = context
    this.buffer = buffer
    this.instances = instances
    this.durationSeconds = Math.min(durationSeconds, buffer.duration)
  }

  sample(seconds: number, playbackRate = 1): void {
    if (this.context.state !== 'running' || playbackRate <= 0) return
    for (const effect of this.instances) {
      if (this.scheduled.has(effect.id)) continue
      const offset = Math.max(0, seconds - effect.startSeconds)
      if (offset >= this.durationSeconds) continue
      const wait = (effect.startSeconds - seconds) / playbackRate
      if (wait > 0.1) continue

      const source = this.context.createBufferSource()
      const gain = this.context.createGain()
      source.buffer = this.buffer
      source.playbackRate.value = playbackRate
      gain.gain.value = Math.min(2, Math.max(0, effect.volume ?? 1))
      source.connect(gain)
      gain.connect(this.context.destination)
      source.onended = () => {
        source.disconnect()
        gain.disconnect()
        this.active.delete(source)
      }
      this.scheduled.add(effect.id)
      this.active.set(source, gain)
      source.start(
        this.context.currentTime + Math.max(0, wait),
        offset,
        this.durationSeconds - offset,
      )
    }
  }

  stop(): void {
    for (const [source, gain] of this.active) {
      source.onended = null
      source.stop()
      source.disconnect()
      gain.disconnect()
    }
    this.active.clear()
    this.scheduled.clear()
  }
}
