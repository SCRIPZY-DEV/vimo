import { ZOOM_MAX, ZOOM_PAN } from '@pipeline/animation/timing.ts'
import type { CSSProperties } from 'react'

// Espejo visual del catálogo Ken Burns del render, sobre el mismo índice original.
export function previewCameraStyle(
  sceneIndex: number,
  progress: number,
): CSSProperties {
  const position = Math.max(0, Math.min(1, progress))
  const movement = (sceneIndex * 3) % 8
  const zoomIn = 1 + (ZOOM_MAX - 1) * position
  if (movement === 0) return { transform: `scale(${zoomIn})` }
  if (movement === 1)
    return { transform: `scale(${ZOOM_MAX - (ZOOM_MAX - 1) * position})` }
  if (movement === 2)
    return { transform: `scale(${zoomIn})`, transformOrigin: '0% 0%' }
  if (movement === 3)
    return { transform: `scale(${zoomIn})`, transformOrigin: '100% 100%' }

  const direction = movement === 4 || movement === 6 ? 1 : -1
  const travel = (ZOOM_PAN - 1) * (0.5 - position) * 100 * direction
  const horizontal = movement === 4 || movement === 5
  return {
    transform: `translate(${horizontal ? travel : 0}%, ${horizontal ? 0 : travel}%) scale(${ZOOM_PAN})`,
  }
}
