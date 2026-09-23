import { videosApi } from '@/modules/videos/api'
import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

export interface ClipAtCursor {
  lead: SceneDetail
  clipSrc: string
  offsetSeconds: number
  slotSeconds: number
}

// El archivo activo sigue el reloj absoluto, incluidos varios clips dentro
// de la misma escena. Fuera de su intervalo se muestra la imagen de respaldo.
export function clipAt(
  scenes: SceneDetail[],
  seconds: number,
): ClipAtCursor | undefined {
  const clip = readyAnimationClips(scenes).find(
    (candidate) =>
      seconds >= candidate.startSeconds && seconds < candidate.endSeconds,
  )
  if (!clip?.animation.clipPath) return undefined

  return {
    lead: clip.lead,
    clipSrc: videosApi.videoSource(
      clip.animation.clipPath,
      clip.animation.clipMtimeMs,
    ),
    offsetSeconds: seconds - clip.startSeconds,
    slotSeconds: clip.endSeconds - clip.startSeconds,
  }
}
