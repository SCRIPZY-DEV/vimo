import { useEffect, useState } from 'react'

// Picos de amplitud de un audio local para pintar su forma de onda.
// Decodifica UNA vez por URL con Web Audio y cachea los buckets: la URL ya
// viaja con `?v=<mtime>`, así que un audio reemplazado invalida el cache solo.

export interface AudioPeaks {
  peaks: Float32Array
  // Duración real del audio decodificado (la música loopea sobre esta).
  seconds: number
}

const PEAK_BUCKETS = 4096

// Cache module-level: sobrevive a montajes/desmontajes del editor.
const peaksCache = new Map<string, AudioPeaks>()
const pendingLoads = new Map<string, Promise<AudioPeaks | null>>()

async function loadPeaks(src: string): Promise<AudioPeaks | null> {
  try {
    // fetch directo: es un asset local del webview, no la API del sidecar.
    const response = await fetch(src)
    if (!response.ok) return null
    const encoded = await response.arrayBuffer()

    const audioContext = new AudioContext()
    try {
      const decoded = await audioContext.decodeAudioData(encoded)
      const samples = decoded.getChannelData(0)
      const buckets = Math.min(PEAK_BUCKETS, samples.length)
      const bucketSize = samples.length / buckets

      const peaks = new Float32Array(buckets)
      for (let bucket = 0; bucket < buckets; bucket++) {
        const start = Math.floor(bucket * bucketSize)
        const end = Math.min(
          samples.length,
          Math.floor((bucket + 1) * bucketSize),
        )
        let peak = 0
        for (let index = start; index < end; index++) {
          const value = Math.abs(samples[index])
          if (value > peak) peak = value
        }
        peaks[bucket] = peak
      }
      return { peaks, seconds: decoded.duration }
    } finally {
      void audioContext.close()
    }
  } catch {
    // Audio indecodificable o inaccesible: la pista cae a la barra plana.
    return null
  }
}

export function useAudioPeaks(src: string | null): AudioPeaks | null {
  const [audioPeaks, setAudioPeaks] = useState<AudioPeaks | null>(() =>
    src ? (peaksCache.get(src) ?? null) : null,
  )
  const [syncedSrc, setSyncedSrc] = useState(src)

  // Cambio de fuente: mostrar al instante lo cacheado (o nada) sin esperar
  // al efecto — ajuste durante el render.
  if (src !== syncedSrc) {
    setSyncedSrc(src)
    setAudioPeaks(src ? (peaksCache.get(src) ?? null) : null)
  }

  useEffect(() => {
    if (!src || peaksCache.has(src)) return

    let cancelled = false
    const pending = pendingLoads.get(src) ?? loadPeaks(src)
    pendingLoads.set(src, pending)

    void pending.then((loaded) => {
      pendingLoads.delete(src)
      if (loaded) peaksCache.set(src, loaded)
      if (!cancelled && loaded) setAudioPeaks(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  return audioPeaks
}
