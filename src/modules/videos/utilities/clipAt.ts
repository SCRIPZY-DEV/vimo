import { videosApi } from '@/modules/videos/api'
import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import {
  avatarSpansOf,
  readyAvatarClips,
} from '@/modules/videos/utilities/avatarClips'
import { overlapsAnySpan } from '@/modules/videos/utilities/spanOverlap'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

export interface ClipAtCursor {
  lead: SceneDetail
  clipSrc: string
  offsetSeconds: number
  slotSeconds: number
}

// El archivo activo sigue el reloj absoluto, incluidos varios clips dentro
// de la misma escena. Fuera de su intervalo se muestra la imagen de respaldo.
// Un avatar listo manda en su tramo (spec §10.1); uno desactualizado, fallido
// o planeado no cuenta: se ve la vista previa del look, como en el render. Un
// clip de Kie que pisa el tramo de cualquier avatar no se reproduce, con la
// misma regla que la pista (`timelineBlocks`).
export function clipAt(
  scenes: SceneDetail[],
  seconds: number,
): ClipAtCursor | undefined {
  const avatarClip = readyAvatarClips(scenes).find(
    (candidate) =>
      seconds >= candidate.startSeconds && seconds < candidate.endSeconds,
  )
  if (avatarClip) {
    return {
      lead: avatarClip.lead,
      clipSrc: videosApi.videoSource(
        avatarClip.clipPath,
        avatarClip.avatar.clipMtimeMs,
      ),
      offsetSeconds: seconds - avatarClip.startSeconds,
      slotSeconds: avatarClip.endSeconds - avatarClip.startSeconds,
    }
  }

  const avatarSpans = avatarSpansOf(scenes)
  const clip = readyAnimationClips(scenes)
    .filter((candidate) => {
      return !overlapsAnySpan(
        avatarSpans,
        candidate.startSeconds,
        candidate.endSeconds,
      )
    })
    .find(
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
