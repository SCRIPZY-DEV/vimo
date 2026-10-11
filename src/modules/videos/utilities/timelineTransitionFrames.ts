import { transitionFramesFor } from '@pipeline/animation/transitions.ts'
import { ANIMATION_FPS } from '@pipeline/animation/timing.ts'
import { timelineBlocks } from '@/modules/videos/utilities/timelineBlocks'
import type { TimelineBlock } from '@/modules/videos/utilities/timelineBlocks'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// ¿El bloque se ve como video? El clip de Kie listo y el avatar listo y al
// día (spec §10.1: el fundido de 8 cuadros aplica igual); un avatar planeado,
// fallido o desactualizado se ve estático con la vista previa del look, como
// una imagen.
function isAnimated(block: TimelineBlock): boolean {
  if (block.kind === 'clip')
    return block.state === 'ready' && Boolean(block.animation?.clipPath)
  if (block.kind === 'avatar') return block.state === 'ready'

  return false
}

function transitionBlock(block: TimelineBlock) {
  return {
    startSeconds: block.startSeconds,
    endSeconds: block.endSeconds,
    animated: isAnimated(block),
    staticTransitionIn:
      block.kind === 'clip' ? undefined : block.scene.staticTransitionIn,
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
