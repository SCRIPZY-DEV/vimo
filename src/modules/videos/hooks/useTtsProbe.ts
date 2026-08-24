import { useState } from 'react'
import { videosApi } from '@/modules/videos/api'
import { PROBE_CACHE_TTL_MS } from '@/modules/videos/constants'
import type {
  ProbeCacheEntry,
  SelectedVoice,
} from '@/modules/videos/types/create'
import type { ProbeTtsResult } from '@pipeline/types/video-project.ts'

// Pre-flight del proveedor de voz antes de un pipeline largo. El cache vive a
// nivel módulo porque el sidecar es un proceso por job y no cachea entre
// llamadas.
const cache = new Map<string, ProbeCacheEntry>()

function cacheKey(voice: SelectedVoice): string {
  return `${voice.provider}:${voice.voiceId}`
}

export function useTtsProbe() {
  const [probing, setProbing] = useState(false)

  const probe = async (voice: SelectedVoice): Promise<ProbeTtsResult> => {
    const key = cacheKey(voice)
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now())
      return { ok: cached.ok, reason: cached.reason }

    setProbing(true)
    try {
      const result = await videosApi.probeTts({
        provider: voice.provider,
        voiceId: voice.voiceId,
      })
      cache.set(key, {
        ...result,
        expiresAt: Date.now() + PROBE_CACHE_TTL_MS,
      })
      return result
    } catch {
      // Un probe que no se pudo hacer no bloquea la generación: el pipeline
      // dará el error verdadero si el proveedor está caído.
      return { ok: true, reason: 'ok' }
    } finally {
      setProbing(false)
    }
  }

  return { probe, probing }
}
