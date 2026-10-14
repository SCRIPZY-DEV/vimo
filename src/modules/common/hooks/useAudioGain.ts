import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { clamp } from '@/modules/common/utilities/clamp'

interface AudioGraph {
  context: AudioContext
  gain: GainNode
  // El <audio> que hoy entra al gain y su nodo fuente (ver bindElement).
  element: HTMLAudioElement
  source: MediaElementAudioSourceNode
}

interface UseAudioGainOptions {
  volume: number | undefined
  muted?: boolean
}

function resolveGainLevel(volume: number, muted: boolean) {
  if (muted) return 0

  return Math.max(volume, 0)
}

// El grafo sigue al <audio> que hay hoy en el ref: un cambio de modo del
// visor del editor (mp4 <-> simulación) desmonta los <audio> y monta otros, y
// uno que no entra al gain suena directo a la salida con volume 1, aunque la
// pista esté silenciada. createMediaElementSource admite una sola llamada por
// elemento en toda su vida: el nodo se crea solo para un elemento nuevo,
// sobre el mismo contexto y el mismo gain, y el del anterior se desconecta.
function bindElement(graph: AudioGraph, audio: HTMLAudioElement) {
  if (graph.element === audio) return

  const source = graph.context.createMediaElementSource(audio)
  source.connect(graph.gain)
  graph.source.disconnect()
  graph.element = audio
  graph.source = source
  // El nivel lo pone el gain, no el elemento.
  audio.volume = 1
}

// Volumen de un <audio> por encima de 1.0: HTMLMediaElement.volume topa en 1,
// así que amplificar exige Web Audio (elemento -> GainNode -> salida).
// El grafo se arma en el primer play, no en el montaje: un AudioContext por
// reproductor listado agotaría el límite del navegador.
// Con el grafo armado, volumen Y mute los pone el gain: el muted del elemento
// ya no corta lo que sale por el grafo.
// El contexto y el gain duran lo que el componente; el <audio> puede cambiar
// en el camino y el grafo lo sigue (bindElement).
export function useAudioGain(
  audioRef: RefObject<HTMLAudioElement | null>,
  { volume, muted = false }: UseAudioGainOptions,
) {
  const graphRef = useRef<AudioGraph | null>(null)

  useEffect(() => {
    if (volume === undefined) return

    const audio = audioRef.current
    const graph = graphRef.current
    if (graph) {
      // Un <audio> montado después del grafo entra al gain antes de fijar el
      // nivel: con un render vigente, silenciar una pista monta los <audio>
      // nuevos en el mismo commit que baja su volumen.
      if (audio) bindElement(graph, audio)
      graph.gain.gain.value = resolveGainLevel(volume, muted)
      return
    }

    // Todavía sin grafo (nunca se reprodujo): el elemento actual sostiene el
    // nivel, topado en 1.0 hasta que el primer play arme el gain. Ahí el mute
    // lo sigue cubriendo el atributo muted del elemento.
    if (audio) audio.volume = clamp(volume, 0, 1)
  }, [volume, muted, audioRef])

  useEffect(() => {
    return () => {
      void graphRef.current?.context.close()
      graphRef.current = null
    }
  }, [])

  // Se llama en el play: crea el grafo la primera vez (las siguientes conecta
  // el <audio> si es otro) y despierta el contexto, que nace suspendido hasta
  // que hay una interacción del usuario.
  const resume = () => {
    if (volume === undefined) return

    const audio = audioRef.current
    const existing = graphRef.current
    if (existing) {
      if (audio) bindElement(existing, audio)
      void existing.context.resume()
      return
    }

    if (!audio) return

    const context = new AudioContext()
    const gain = context.createGain()
    // Nace ya con el mute aplicado: mutear antes del primer play también vale.
    gain.gain.value = resolveGainLevel(volume, muted)
    const source = context.createMediaElementSource(audio)
    source.connect(gain).connect(context.destination)
    graphRef.current = { context, gain, element: audio, source }
    // A partir de acá el nivel lo pone el gain, no el elemento.
    audio.volume = 1
    void context.resume()
  }

  return { resume }
}
