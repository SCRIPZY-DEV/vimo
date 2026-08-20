import { useSyncExternalStore } from 'react'
import { VOICE_FAVORITES_STORAGE_KEY } from '@/modules/voices/constants'
import type { VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceFavorite } from '@/modules/voices/types/voices'

/**
 * Favoritos de voces en localStorage, como store fuera de React para que
 * todas las tarjetas y la tab Favoritos se sincronicen al togglear.
 */
let favorites: VoiceFavorite[] = restoreFavorites()
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function restoreFavorites(): VoiceFavorite[] {
  try {
    const raw = localStorage.getItem(VOICE_FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as VoiceFavorite[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistFavorites(next: VoiceFavorite[]) {
  try {
    localStorage.setItem(VOICE_FAVORITES_STORAGE_KEY, JSON.stringify(next))
  } catch {
    console.log('No se pudo guardar la lista de favoritos en localStorage')
    // Storage lleno o deshabilitado: los favoritos siguen vivos en memoria.
  }
}

function favoriteKey(provider: string, voiceId: string): string {
  return `${provider}:${voiceId}`
}

function isFavorite(voice: VoiceSummary): boolean {
  return favorites.some(
    (favorite) =>
      favoriteKey(favorite.provider, favorite.voiceId) ===
      favoriteKey(voice.provider, voice.voiceId),
  )
}

function toggleFavorite(voice: VoiceSummary) {
  const key = favoriteKey(voice.provider, voice.voiceId)
  const next = isFavorite(voice)
    ? favorites.filter(
        (favorite) => favoriteKey(favorite.provider, favorite.voiceId) !== key,
      )
    : [...favorites, { ...voice, addedAt: Date.now() }]

  favorites = next
  persistFavorites(next)
  notify()
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): VoiceFavorite[] {
  return favorites
}

export function useVoiceFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot)

  return { favorites, isFavorite, toggleFavorite }
}
