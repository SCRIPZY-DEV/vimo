import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { SceneChange, SceneDetail } from '@pipeline/types/video-project.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

export interface GalleryImageRequest {
  id: number
  description: string
}

export interface GalleryActionAvailability {
  disabled: boolean
  reason?: string
}

export interface GalleryActionsOptions {
  projectId: string
  scenes: SceneDetail[]
  videoFormat: VideoFormat
  durationSeconds?: number
  locked: boolean
  imageProvider: ImageProviderId
  executionPlan?: FlowToolsExecutionPlan
  onRegenerateImages(
    requests: GalleryImageRequest[],
    executionPlan?: FlowToolsExecutionPlan,
    imageProvider?: ImageProviderId,
  ): Promise<boolean>
  onUndoAnimation(sceneId: number): Promise<boolean>
  undoingSceneId: number | null
}

export interface UndoGalleryAnimation {
  projectId: string
  sceneId: number
}

export interface GallerySceneUpdate {
  projectId: string
  changes: SceneChange[]
}
