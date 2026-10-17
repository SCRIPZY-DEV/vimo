import type { PaidImageProviderId } from './image-provider.ts'

export interface FlowPaidCompletionRequest {
  requestId: string
  provider: PaidImageProviderId
}

export interface FlowPaidCompletion extends FlowPaidCompletionRequest {
  confirmedAt: string
  sceneIds: number[]
  batchId: string | null
}
