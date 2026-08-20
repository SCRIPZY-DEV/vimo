import { useSyncExternalStore } from 'react'

/**
 * Reproductor de previews compartido (port de audioUnico del origen): un solo
 * HTMLAudioElement a nivel módulo, así escuchar una voz pausa la anterior y
 * todas las tarjetas reflejan cuál está sonando.
 */
let audio: HTMLAudioElement | null = null
let playingUrl: string | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function setPlayingUrl(url: string | null) {
  playingUrl = url
  notify()
}

function stopPreview() {
  audio?.pause()
  setPlayingUrl(null)
}

function togglePreview(url: string) {
  if (playingUrl === url) {
    stopPreview()
    return
  }

  if (!audio) {
    audio = new Audio()
    audio.addEventListener('ended', () => setPlayingUrl(null))
    audio.addEventListener('error', () => setPlayingUrl(null))
  }

  audio.pause()
  audio.src = url
  setPlayingUrl(url)
  void audio.play().catch(() => setPlayingUrl(null))
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): string | null {
  return playingUrl
}

export function useVoicePreview() {
  const playingUrl = useSyncExternalStore(subscribe, getSnapshot)

  return { playingUrl, togglePreview, stopPreview }
}
