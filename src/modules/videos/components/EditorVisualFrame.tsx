import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { ANIMATION_FPS, slotFrames } from '@pipeline/animation/timing.ts'
import { videosApi } from '@/modules/videos/api'
import { ClipPreviewVideo } from '@/modules/videos/components/ClipPreviewVideo'
import { previewCameraStyle } from '@/modules/videos/utilities/previewCameraStyle'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import type { TimelineBlock } from '@/modules/videos/utilities/timelineBlocks'

interface EditorVisualFrameProps {
  block: TimelineBlock
  sceneIndex: number
  offsetSeconds: number
  versions: Record<number, number>
  playing: boolean
  onClick(): void
}

export function EditorVisualFrame({
  block,
  sceneIndex,
  offsetSeconds,
  versions,
  playing,
  onClick,
}: EditorVisualFrameProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const scene = block.kind === 'clip' ? block.lead : block.scene
  const animation = block.kind === 'clip' ? block.animation : undefined
  const source = animation?.clipPath
    ? videosApi.videoSource(animation.clipPath, animation.clipMtimeMs)
    : null

  if (source && failedSource !== source) {
    return (
      <ClipPreviewVideo
        src={source}
        offsetSeconds={offsetSeconds}
        slotSeconds={
          animation?.normalizedSeconds ?? block.endSeconds - block.startSeconds
        }
        playing={playing}
        onClick={onClick}
        onUnavailable={() => setFailedSource(source)}
      />
    )
  }

  if (scene.imagePath) {
    const frames = Math.max(1, slotFrames(block.startSeconds, block.endSeconds))
    const progress =
      Math.min(
        frames - 1,
        Math.floor(Math.max(0, offsetSeconds) * ANIMATION_FPS),
      ) / frames
    return (
      <img
        src={sceneImageSource(scene, versions[scene.id])}
        alt=""
        onClick={onClick}
        style={previewCameraStyle(sceneIndex, progress)}
        className="absolute inset-0 h-full w-full cursor-pointer object-cover"
      />
    )
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      onClick={onClick}
    >
      <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
    </div>
  )
}
