import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import {
  avatarBlockState,
  avatarSpansOf,
} from '@/modules/videos/utilities/avatarClips'
import { overlapsAnySpan } from '@/modules/videos/utilities/spanOverlap'
import { avatarSceneSpan } from '@pipeline/types/avatar.ts'
import type { TimelineAvatarState } from '@/modules/videos/utilities/avatarClips'
import type {
  SceneAnimationProgress,
  SceneAvatarRendering,
} from '@/modules/videos/types/library'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'
import type {
  AvatarSceneSpan,
  SceneAvatarView,
} from '@pipeline/types/avatar.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

export interface TimelineClipBlock {
  kind: 'clip'
  id: string
  lead: SceneDetail
  scenes: SceneDetail[]
  animation?: SceneAnimationView
  startSeconds: number
  endSeconds: number
  state: 'ready' | 'generating'
}

export interface TimelineSceneBlock {
  kind: 'scene'
  scene: SceneDetail
  startSeconds: number
  endSeconds: number
}

// Una escena de avatar (spec §10.3): un bloque del largo de la escena entera,
// con su estado. Es una escena más de la pista, no un clip encima de otras.
export interface TimelineAvatarBlock {
  kind: 'avatar'
  id: string
  scene: SceneDetail
  avatar: SceneAvatarView
  startSeconds: number
  endSeconds: number
  state: TimelineAvatarState
}

export type TimelineBlock =
  TimelineClipBlock | TimelineSceneBlock | TimelineAvatarBlock

function generatingBlocks(
  scenes: SceneDetail[],
  progress: Record<number, SceneAnimationProgress>,
): TimelineClipBlock[] {
  const blocks: TimelineClipBlock[] = []
  for (const lead of scenes) {
    const pending = progress[lead.id]
    if (!pending || pending.leadId !== lead.id) continue
    const covered = scenes.filter(
      (scene) => progress[scene.id]?.leadId === lead.id,
    )
    const startSeconds = pending.startSeconds ?? lead.startSeconds ?? 0
    const endSeconds =
      pending.endSeconds ??
      covered[covered.length - 1]?.endSeconds ??
      startSeconds
    if (endSeconds <= startSeconds) continue
    blocks.push({
      kind: 'clip',
      id: pending.animationId ?? `pending-${lead.id}`,
      lead,
      scenes: covered,
      startSeconds,
      endSeconds,
      state: 'generating',
    })
  }
  return blocks
}

function avatarBlock(
  scene: SceneDetail,
  avatar: SceneAvatarView,
  span: AvatarSceneSpan,
  rendering: boolean,
): TimelineAvatarBlock {
  return {
    kind: 'avatar',
    id: `avatar-${scene.id}`,
    scene,
    avatar,
    startSeconds: span.startSeconds,
    endSeconds: span.endSeconds,
    state: avatarBlockState(avatar, rendering),
  }
}

// Segmentos visuales reales: una misma escena puede tener clip y resto
// estático. Los clips que cubren varias escenas se dibujan una sola vez y una
// escena de avatar con tramo es siempre un bloque propio (§10.3); sin tramo
// (`avatarSceneSpan`) no tiene bloque, como una escena normal de largo cero.
// Un clip de Kie que pisa el tramo de un avatar (listo o no) no se dibuja: no
// debería existir (§7.4) y, si un proyecto trae uno, manda el avatar, como en
// el render (§10.1). `avatarRendering` trae los renders de HeyGen en curso
// desde el editor (entrega 3); sin él, ninguno.
export function timelineBlocks(
  timedScenes: SceneDetail[],
  progress: Record<number, SceneAnimationProgress>,
  avatarRendering: Record<number, SceneAvatarRendering> = {},
): TimelineBlock[] {
  const avatarSpans = avatarSpansOf(timedScenes)
  const pending = generatingBlocks(timedScenes, progress).filter((block) => {
    return !overlapsAnySpan(avatarSpans, block.startSeconds, block.endSeconds)
  })
  const ready: TimelineClipBlock[] = readyAnimationClips(timedScenes)
    .filter((clip) => {
      return !overlapsAnySpan(pending, clip.startSeconds, clip.endSeconds)
    })
    .filter((clip) => {
      return !overlapsAnySpan(avatarSpans, clip.startSeconds, clip.endSeconds)
    })
    .map((clip) => ({ ...clip, kind: 'clip', state: 'ready' }))
  const clips = [...ready, ...pending].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  )
  const blocks: TimelineBlock[] = []
  const included = new Set<string>()

  for (const scene of timedScenes) {
    if (scene.avatar) {
      const span = avatarSceneSpan(scene)
      if (span) {
        blocks.push(
          avatarBlock(
            scene,
            scene.avatar,
            span,
            avatarRendering[scene.id] !== undefined,
          ),
        )
      }
      continue
    }

    const startSeconds = scene.startSeconds ?? 0
    const endSeconds = scene.endSeconds ?? startSeconds
    let cursor = startSeconds
    for (const clip of clips) {
      if (clip.endSeconds <= cursor || clip.startSeconds >= endSeconds) continue
      if (clip.startSeconds > cursor) {
        blocks.push({
          kind: 'scene',
          scene,
          startSeconds: cursor,
          endSeconds: clip.startSeconds,
        })
      }
      if (!included.has(clip.id)) {
        blocks.push(clip)
        included.add(clip.id)
      }
      cursor = Math.min(endSeconds, clip.endSeconds)
    }
    if (cursor < endSeconds)
      blocks.push({ kind: 'scene', scene, startSeconds: cursor, endSeconds })
  }
  return blocks
}

export function lastSceneOf(block: TimelineBlock): SceneDetail {
  return block.kind === 'clip'
    ? block.scenes[block.scenes.length - 1]
    : block.scene
}

export function firstSceneOf(block: TimelineBlock): SceneDetail {
  return block.kind === 'clip' ? block.scenes[0] : block.scene
}

// Clave estable de un bloque en la pista (`key` de React): el id del clip o
// de la escena de avatar, o la escena con el clip que precede a su trozo
// estático. Los tiempos cambian al recortar: no forman parte de la identidad.
export function timelineBlockKey(
  block: TimelineBlock,
  previous?: TimelineBlock,
): string {
  if (block.kind === 'clip') return `clip-${block.id}`
  if (block.kind === 'avatar') return block.id

  return `scene-${block.scene.id}-${previous?.kind === 'clip' ? previous.id : 'start'}`
}
