import {
  VOICE_LIST_CACHE_MAX_VOICES,
  VOICE_LIST_CACHE_PREFIX,
  VOICE_LIST_CACHE_TTL_MS,
} from '../constants'
import type { VoiceProviderId, VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceListSnapshot } from '../types/voices'

// Snapshot en localStorage de los catálogos completos (Minimax ~674 voces
// llega tras hasta 50 requests paginados: no se repite en cada montaje).
// Clave versionada por provider; ElevenLabs no pasa por acá (pagina server-side).
function cacheKey(provider: VoiceProviderId): string {
  return `${VOICE_LIST_CACHE_PREFIX}${provider}:v1`
}

export function readVoiceListSnapshot(
  provider: VoiceProviderId,
): VoiceListSnapshot | null {
  try {
    const raw = localStorage.getItem(cacheKey(provider))
    if (!raw) return null

    const snapshot = JSON.parse(raw) as VoiceListSnapshot
    if (Date.now() - snapshot.savedAt > VOICE_LIST_CACHE_TTL_MS) return null
    if (!Array.isArray(snapshot.voices)) return null

    return snapshot
  } catch {
    return null
  }
}

export function writeVoiceListSnapshot(
  provider: VoiceProviderId,
  voices: VoiceSummary[],
): void {
  const snapshot: VoiceListSnapshot = {
    savedAt: Date.now(),
    // Cap para no reventar la cuota de localStorage (~5-10 MB).
    voices: voices.slice(0, VOICE_LIST_CACHE_MAX_VOICES),
  }
  try {
    localStorage.setItem(cacheKey(provider), JSON.stringify(snapshot))
  } catch {
    console.log('No se pudo guardar el snapshot de voces en localStorage')
    // Storage lleno o deshabilitado: el snapshot es solo una optimización.
  }
}
