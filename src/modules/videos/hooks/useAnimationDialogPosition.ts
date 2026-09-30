import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import {
  ANIMATION_DIALOG_KEY_STEP_PX,
  ANIMATION_DIALOG_MARGIN_PX,
} from '@/modules/videos/constants'
import type { AnimationDialogPosition } from '@/modules/videos/types/animationDialog'

// La posición vive en el viewport, también sobre el sidebar. Los listeners
// del gesto leen coordenadas locales y no capturan el estado de un render viejo.
export function useAnimationDialogPosition() {
  const panelRef = useRef<HTMLDivElement>(null)
  const stopDrag = useRef<(() => void) | null>(null)
  const [position, setPosition] = useState<AnimationDialogPosition | null>(null)

  const fit = (next: AnimationDialogPosition) => {
    const bounds = panelRef.current?.getBoundingClientRect()
    if (!bounds) return next
    const margin = ANIMATION_DIALOG_MARGIN_PX
    return {
      x: Math.min(
        Math.max(margin, window.innerWidth - bounds.width - margin),
        Math.max(margin, next.x),
      ),
      y: Math.min(
        Math.max(margin, window.innerHeight - bounds.height - margin),
        Math.max(margin, next.y),
      ),
    }
  }

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const keepVisible = () => {
      const bounds = panel.getBoundingClientRect()
      const margin = ANIMATION_DIALOG_MARGIN_PX
      const x = Math.min(
        Math.max(margin, window.innerWidth - bounds.width - margin),
        Math.max(margin, bounds.x),
      )
      const y = Math.min(
        Math.max(margin, window.innerHeight - bounds.height - margin),
        Math.max(margin, bounds.y),
      )
      setPosition((previous) => {
        if (previous?.x === x && previous.y === y) return previous

        return { x, y }
      })
    }
    keepVisible()
    const observer = new ResizeObserver(keepVisible)
    observer.observe(panel)
    window.addEventListener('resize', keepVisible)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', keepVisible)
    }
  }, [])

  useEffect(() => () => stopDrag.current?.(), [])

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return
    const bounds = panelRef.current?.getBoundingClientRect()
    if (!bounds) return
    stopDrag.current?.()
    event.preventDefault()
    event.currentTarget.focus()
    const pointerId = event.pointerId
    const origin = { x: event.clientX, y: event.clientY }
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return
      setPosition(
        fit({
          x: bounds.x + next.clientX - origin.x,
          y: bounds.y + next.clientY - origin.y,
        }),
      )
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
      stopDrag.current = null
    }
    stopDrag.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const bounds = panelRef.current?.getBoundingClientRect()
    if (!bounds) return
    const step = ANIMATION_DIALOG_KEY_STEP_PX
    const offset = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }[event.key]
    if (!offset) return
    event.preventDefault()
    setPosition(fit({ x: bounds.x + offset.x, y: bounds.y + offset.y }))
  }

  return { panelRef, position, onPointerDown, onKeyDown }
}
