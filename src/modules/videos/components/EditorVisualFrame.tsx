import { useState } from 'react'
import type { RefObject } from 'react'
import { ImageIcon } from 'lucide-react'
import { ANIMATION_FPS, slotFrames } from '@pipeline/animation/timing.ts'
import { videosApi } from '@/modules/videos/api'
import { ClipPreviewVideo } from '@/modules/videos/components/ClipPreviewVideo'
import { playableClip } from '@/modules/videos/utilities/playableClip'
import { previewCameraStyle } from '@/modules/videos/utilities/previewCameraStyle'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import type { TimelineBlock } from '@/modules/videos/utilities/timelineBlocks'

interface EditorVisualFrameProps {
  block: TimelineBlock
  sceneIndex: number
  offsetSeconds: number
  versions: Record<number, number>
  playing: boolean
  clockRef: RefObject<HTMLMediaElement | null>
  onClick(): void
}

// Un bloque del visor: su clip si tiene uno que se pueda reproducir (el de
// Kie o el del avatar listo y al día, mudos y al ritmo de la narración) y, si
// no, la imagen de la escena con el movimiento de cámara del render. Un avatar
// sin clip válido muestra su imagen fija —la vista previa del look, que el
// sidecar le pone como `imagePath`—, como en el video exportado (spec §10.1).
export function EditorVisualFrame({
  block,
  sceneIndex,
  offsetSeconds,
  versions,
  playing,
  clockRef,
  onClick,
}: EditorVisualFrameProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const scene = block.kind === 'clip' ? block.lead : block.scene
  const clip = playableClip(block)
  const source = clip ? videosApi.videoSource(clip.path, clip.mtimeMs) : null

  if (clip && source && failedSource !== source) {
    return (
      <ClipPreviewVideo
        src={source}
        clockRef={clockRef}
        startSeconds={block.startSeconds}
        offsetSeconds={offsetSeconds}
        slotSeconds={clip.slotSeconds}
        resyncSeconds={clip.resyncSeconds}
        retime={clip.retime}
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
