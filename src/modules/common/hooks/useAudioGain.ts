import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { clamp } from '@/modules/common/utilities/clamp'

interface AudioGraph {
  context: AudioContext
  gain: GainNode
}

// Volumen de un <audio> por encima de 1.0: HTMLMediaElement.volume topa en 1,
// así que amplificar exige Web Audio (elemento -> GainNode -> salida).
// El grafo se arma en el primer play, no en el montaje: un AudioContext por
// reproductor listado agotaría el límite del navegador.
export function useAudioGain(
  audioRef: RefObject<HTMLAudioElement | null>,
  volume: number | undefined,
) {
  const graphRef = useRef<AudioGraph | null>(null)

  useEffect(() => {
    if (volume === undefined) return

    const graph = graphRef.current
    if (graph) {
      graph.gain.gain.value = Math.max(volume, 0)
      return
    }

    // Todavía sin grafo (nunca se reprodujo): el elemento sostiene el nivel,
    // topado en 1.0 hasta que el primer play arme el gain.
    const audio = audioRef.current
    if (audio) audio.volume = clamp(volume, 0, 1)
  }, [volume, audioRef])

  useEffect(() => {
    return () => {
      void graphRef.current?.context.close()
      graphRef.current = null
    }
  }, [])

  // Se llama en el play: crea el grafo la primera vez y despierta el contexto,
  // que nace suspendido hasta que hay una interacción del usuario.
  const resume = () => {
    if (volume === undefined) return

    const existing = graphRef.current
    if (existing) {
      void existing.context.resume()
      return
    }

    const audio = audioRef.current
    if (!audio) return

    const context = new AudioContext()
    const gain = context.createGain()
    gain.gain.value = Math.max(volume, 0)
    context
      .createMediaElementSource(audio)
      .connect(gain)
      .connect(context.destination)
    graphRef.current = { context, gain }
    // A partir de acá el nivel lo pone el gain, no el elemento.
    audio.volume = 1
    void context.resume()
  }

  return { resume }
}
