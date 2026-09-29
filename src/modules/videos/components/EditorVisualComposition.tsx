import type { RefObject } from 'react'
import { ANIMATION_FPS } from '@pipeline/animation/timing.ts'
import { EditorVisualFrame } from '@/modules/videos/components/EditorVisualFrame'
import { timelineBlocks } from '@/modules/videos/utilities/timelineBlocks'
import { timelineTransitionFrames } from '@/modules/videos/utilities/timelineTransitionFrames'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorVisualCompositionProps {
  scenes: SceneDetail[]
  versions: Record<number, number>
  seconds: number
  playing: boolean
  clockRef: RefObject<HTMLMediaElement | null>
  onClick(): void
}

// Fundido dentro del reloj existente: el último cuadro anterior se mezcla
// sobre el bloque entrante. No resta duración ni anticipa su narración.
export function EditorVisualComposition({
  scenes,
  versions,
  seconds,
  playing,
  clockRef,
  onClick,
}: EditorVisualCompositionProps) {
  const blocks = timelineBlocks(scenes, {})
  const found = blocks.findIndex(
    (block) => seconds >= block.startSeconds && seconds < block.endSeconds,
  )
  const index = found < 0 ? blocks.length - 1 : found
  const current = blocks[index]
  if (!current) return null

  const previous = blocks[index - 1]
  const elapsed = Math.max(0, seconds - current.startSeconds)
  const duration = current.endSeconds - current.startSeconds
  const transitionSeconds =
    timelineTransitionFrames(previous, current) / ANIMATION_FPS
  // Inspeccionar una escena debe mostrarla opaca: una transición congelada
  // a 0,05 s dejaba visible mayormente la escena anterior.
  const blending =
    playing && transitionSeconds > 0 && elapsed < transitionSeconds
  const layers = blending && previous ? [previous, current] : [current]

  return (
    <>
      {layers.map((block) => {
        const active = block === current
        const sceneId = block.kind === 'clip' ? block.lead.id : block.scene.id
        return (
          <div
            key={`${block.kind}-${block.startSeconds}`}
            className="absolute inset-0 overflow-hidden"
            style={{
              opacity: active && blending ? elapsed / transitionSeconds : 1,
            }}
          >
            <EditorVisualFrame
              block={block}
              clockRef={clockRef}
              sceneIndex={scenes.findIndex((scene) => scene.id === sceneId)}
              offsetSeconds={
                active
                  ? Math.min(elapsed, duration)
                  : Math.max(
                      0,
                      block.endSeconds - block.startSeconds - 1 / ANIMATION_FPS,
                    )
              }
              versions={versions}
              playing={active && playing}
              onClick={onClick}
            />
          </div>
        )
      })}
    </>
  )
}
