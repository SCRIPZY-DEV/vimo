import { transitionFramesFor } from '@pipeline/animation/transitions.ts'
import { ANIMATION_FPS } from '@pipeline/animation/timing.ts'
import { timelineBlocks } from '@/modules/videos/utilities/timelineBlocks'
import type { TimelineBlock } from '@/modules/videos/utilities/timelineBlocks'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

function transitionBlock(block: TimelineBlock) {
  return {
    startSeconds: block.startSeconds,
    endSeconds: block.endSeconds,
    animated:
      block.kind === 'clip' &&
      block.state === 'ready' &&
      Boolean(block.animation?.clipPath),
    staticTransitionIn:
      block.kind === 'scene' ? block.scene.staticTransitionIn : undefined,
  }
}

export function timelineTransitionFrames(
  previous: TimelineBlock | undefined,
  current: TimelineBlock,
): number {
  return transitionFramesFor(
    previous ? transitionBlock(previous) : undefined,
    transitionBlock(current),
  )
}

export function hasTimelineTransitionAt(
  scenes: SceneDetail[],
  seconds: number,
): boolean {
  const blocks = timelineBlocks(scenes, {})
  const index = blocks.findIndex(
    (block) => seconds >= block.startSeconds && seconds < block.endSeconds,
  )
  const current = blocks[index]
  if (!current) return false

  const frames = timelineTransitionFrames(blocks[index - 1], current)
  return seconds - current.startSeconds < frames / ANIMATION_FPS
}
