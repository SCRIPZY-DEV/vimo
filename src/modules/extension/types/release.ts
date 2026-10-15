import type { FlowConnection } from '@/modules/common/types/flow'

export interface ExtensionRelease {
  schemaVersion: 1
  version: string
  publishedAt: string
  notes: { es: string; en: string; pt: string }
  downloadUrl: string
  sha256: string
  sizeBytes: number
}

export interface ExtensionDownloadReceipt {
  version: string
  downloadedAt: string
}

export interface ExtensionDownloadResult extends ExtensionDownloadReceipt {
  path: string
  receiptSaved: boolean
}

export interface ExtensionReleaseCheckResult {
  release: ExtensionRelease
  current: boolean
}

export interface ExtensionReleaseSectionProps {
  connections: readonly FlowConnection[]
  statusLoading: boolean
  statusFailed: boolean
}

export interface ExtensionReleaseStateOptions {
  release: ExtensionRelease
  connections: readonly FlowConnection[]
  downloadedPath: string | null | undefined
  statusFailed: boolean
}
