import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import type { SceneAnimationProgress } from '@/modules/videos/types/library'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'
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

export type TimelineBlock = TimelineClipBlock | TimelineSceneBlock

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

// Segmentos visuales reales: una misma escena puede tener clip y resto estático.
// Los clips que cubren varias escenas se dibujan una sola vez.
export function timelineBlocks(
  timedScenes: SceneDetail[],
  progress: Record<number, SceneAnimationProgress>,
): TimelineBlock[] {
  const pending = generatingBlocks(timedScenes, progress)
  const ready: TimelineClipBlock[] = readyAnimationClips(timedScenes)
    .filter(
      (clip) =>
        !pending.some(
          (other) =>
            other.startSeconds < clip.endSeconds &&
            other.endSeconds > clip.startSeconds,
        ),
    )
    .map((clip) => ({ ...clip, kind: 'clip', state: 'ready' }))
  const clips = [...ready, ...pending].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  )
  const blocks: TimelineBlock[] = []
  const included = new Set<string>()

  for (const scene of timedScenes) {
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
