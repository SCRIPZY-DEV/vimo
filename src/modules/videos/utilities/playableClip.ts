import { CLIP_PREVIEW_DRIFT_SECONDS } from '@/modules/videos/constants'
import { AVATAR_PREVIEW_RESYNC_SECONDS } from '@pipeline/types/avatar.ts'
import type { TimelineBlock } from '@/modules/videos/utilities/timelineBlocks'

// El clip que el visor reproduce en un bloque y cómo (spec §10.2):
// el de Kie se puede acelerar para que entre en su hueco y se reajusta
// pasados 0,3 s; el del avatar llega normalizado al tramo exacto, corre a
// velocidad 1 (la narración manda, §7.3) y se reajusta pasados 0,12 s, que es
// lo que se nota en los labios.
export interface PlayableClip {
  path: string
  mtimeMs?: number
  slotSeconds: number
  resyncSeconds: number
  retime: boolean
}

export function playableClip(block: TimelineBlock): PlayableClip | null {
  if (block.kind === 'scene') return null
  if (block.kind === 'clip') {
    if (!block.animation?.clipPath) return null
    return {
      path: block.animation.clipPath,
      mtimeMs: block.animation.clipMtimeMs,
      slotSeconds:
        block.animation.normalizedSeconds ??
        block.endSeconds - block.startSeconds,
      resyncSeconds: CLIP_PREVIEW_DRIFT_SECONDS,
      retime: true,
    }
  }
  if (block.state !== 'ready' || !block.avatar.clipPath) return null

  return {
    path: block.avatar.clipPath,
    mtimeMs: block.avatar.clipMtimeMs,
    slotSeconds: block.endSeconds - block.startSeconds,
    resyncSeconds: AVATAR_PREVIEW_RESYNC_SECONDS,
    retime: false,
  }
}
