import type { PaidImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

export interface FlowPaidCompletionButtonProps {
  count: number
  format: VideoFormat
  onConfirm(provider: PaidImageProviderId): void
}
