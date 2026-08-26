import { useEffect } from 'react'
import {
  EDITOR_SEEK_STEP_SECONDS,
  FRAME_SECONDS,
} from '@/modules/videos/constants'

interface EditorShortcuts {
  onTogglePlay(): void
  onToggleMute(): void
  onSeekBy(deltaSeconds: number): void
  onSeekToStart(): void
  onSeekToEnd(): void
  onDeselect(): void
  onZoomIn(): void
  onZoomOut(): void
  onZoomReset(): void
}

// Atajos del editor (paridad con el origen): Space/K play-pausa, M mute,
// J/L ∓5s, flechas ±1 frame (Shift = ±1s), Home/End, Esc deseleccionar,
// +/−/0 zoom. Se ignoran con el foco en un campo de texto o con
// meta/ctrl/alt apretados (esas combinaciones son del sistema).
export function useEditorShortcuts({
  onTogglePlay,
  onToggleMute,
  onSeekBy,
  onSeekToStart,
  onSeekToEnd,
  onDeselect,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: EditorShortcuts) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const frameStep = event.shiftKey ? 1 : FRAME_SECONDS

      switch (event.code) {
        case 'Space':
        case 'KeyK':
          event.preventDefault()
          onTogglePlay()
          return
        case 'KeyM':
          event.preventDefault()
          onToggleMute()
          return
        case 'KeyJ':
          event.preventDefault()
          onSeekBy(-EDITOR_SEEK_STEP_SECONDS)
          return
        case 'KeyL':
          event.preventDefault()
          onSeekBy(EDITOR_SEEK_STEP_SECONDS)
          return
        case 'ArrowLeft':
          event.preventDefault()
          onSeekBy(-frameStep)
          return
        case 'ArrowRight':
          event.preventDefault()
          onSeekBy(frameStep)
          return
        case 'Home':
          event.preventDefault()
          onSeekToStart()
          return
        case 'End':
          event.preventDefault()
          onSeekToEnd()
          return
        case 'Escape':
          onDeselect()
          return
        default:
          break
      }

      // El zoom va por event.key: +/= y −/_ cambian de code según el layout.
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        onZoomIn()
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        onZoomOut()
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        onZoomReset()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    onTogglePlay,
    onToggleMute,
    onSeekBy,
    onSeekToStart,
    onSeekToEnd,
    onDeselect,
    onZoomIn,
    onZoomOut,
    onZoomReset,
  ])
}
