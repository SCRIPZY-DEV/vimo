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
  onRegenerateImages(requests: GalleryImageRequest[]): Promise<boolean>
}

export interface GallerySceneUpdate {
  projectId: string
  changes: SceneChange[]
}
