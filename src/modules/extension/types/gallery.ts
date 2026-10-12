export interface FlowGalleryItem {
  imageJobId: string
  sourceKey: string
}
export interface FlowGalleryBatch {
  batchId: string
  kind: 'video' | 'style' | 'character' | 'images'
  title: string | null
  items: FlowGalleryItem[]
}
export interface FlowGalleryResult {
  batches: FlowGalleryBatch[]
}
export interface FlowPreviewResult {
  type: 'job.preview'
  imageJobId: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  base64: string
  sha256: string
}

export interface FlowHistoryTarget {
  batchId: string
  title: string
  jobCount: number
}
export interface FlowBatchDeletionReceipt {
  type: 'batch.deleted'
  batchId: string
  imageJobIds: string[]
  cleanupPending: boolean
  workerCleanupPending: boolean
}
export interface FlowHistoryDeletionOutcome {
  target: FlowHistoryTarget
  status: 'deleted' | 'blocked' | 'failed'
  cleanupPending?: boolean
  imageJobIds?: string[]
  error?: unknown
}
export interface FlowHistoryDeletionResult {
  outcomes: FlowHistoryDeletionOutcome[]
}
