import { LazyStore } from '@tauri-apps/plugin-store'
import { extensionVersionParts } from '@/modules/extension/utilities/extensionReleaseState'
import type {
  ExtensionRelease,
  ExtensionDownloadReceipt,
  ExtensionDownloadResult,
  ExtensionDownloadResponse,
} from '@/modules/extension/types/release'
import { invoke } from '@tauri-apps/api/core'
import { commonApi } from '@/modules/common/api'
import {
  EXTENSION_RELEASE_STORE_FILE,
  EXTENSION_DOWNLOAD_RECEIPT_KEY,
  FLOW_PREVIEW_MAX_BASE64_LENGTH,
  FLOW_PREVIEW_MIME_TYPES,
} from '@/modules/extension/constants'
import type {
  FlowBatchDeletionReceipt,
  FlowHistoryDeletionOutcome,
  FlowHistoryDeletionResult,
  FlowHistoryTarget,
  FlowGalleryResult,
  FlowPreviewResult,
} from '@/modules/extension/types/gallery'

const releaseStore = new LazyStore(EXTENSION_RELEASE_STORE_FILE)

export const extensionApi = {
  async checkRelease(): Promise<ExtensionRelease> {
    return invoke('check_extension_release')
  },
  async findDownload(release: ExtensionRelease): Promise<string | null> {
    return invoke('find_extension_download', { release })
  },
  async openDownloadFolder(release: ExtensionRelease): Promise<void> {
    return invoke('open_extension_download_folder', { release })
  },
  async lastDownload(): Promise<ExtensionDownloadReceipt | null> {
    const receipt = await releaseStore.get<ExtensionDownloadReceipt>(
      EXTENSION_DOWNLOAD_RECEIPT_KEY,
    )
    if (
      !receipt ||
      !extensionVersionParts(receipt.version) ||
      typeof receipt.downloadedAt !== 'string' ||
      !Number.isFinite(Date.parse(receipt.downloadedAt))
    )
      return null
    return receipt
  },
  async downloadRelease(
    release: ExtensionRelease,
  ): Promise<ExtensionDownloadResult> {
    const result = await invoke<ExtensionDownloadResponse>(
      'download_extension_release',
      {
        release,
      },
    )
    if (
      !result ||
      typeof result.path !== 'string' ||
      !result.path.trim() ||
      typeof result.cleanupIncomplete !== 'boolean'
    )
      throw { code: 'save_failed' }
    const { path, cleanupIncomplete } = result
    const receipt = {
      version: release.version,
      downloadedAt: new Date().toISOString(),
    }
    let receiptSaved = true
    try {
      await releaseStore.set(EXTENSION_DOWNLOAD_RECEIPT_KEY, receipt)
      await releaseStore.save()
    } catch {
      // El ZIP ya está guardado: fallar al recordar la descarga no la revierte.
      receiptSaved = false
    }
    return { ...receipt, path, cleanupIncomplete, receiptSaved }
  },
  async deleteHistory(
    confirmedTargets: readonly FlowHistoryTarget[],
  ): Promise<FlowHistoryDeletionResult> {
    // La autorización pertenece a esta foto de IDs, nunca a una consulta futura.
    const targets = [
      ...new Map(
        confirmedTargets.map((target) => [target.batchId, { ...target }]),
      ).values(),
    ]
    const outcomes: FlowHistoryDeletionOutcome[] = []
    for (const target of targets) {
      try {
        const status = await commonApi.flowStatus()
        const current = status.batches.find(
          (batch) => batch.batchId === target.batchId,
        )
        if (current && current.localDeletable !== true) {
          outcomes.push({ target, status: 'blocked' })
          continue
        }
        // Si ya desapareció, batch.delete es idempotente y permite completar
        // una limpieza pendiente. Un ID desconocido falla sin borrar otro lote.
        const receipt = await invoke<FlowBatchDeletionReceipt>('flow_command', {
          command: { type: 'batch.delete', batchId: target.batchId },
        })
        if (
          receipt?.type !== 'batch.deleted' ||
          receipt.batchId !== target.batchId ||
          !Array.isArray(receipt.imageJobIds) ||
          !receipt.imageJobIds.every((id) => typeof id === 'string') ||
          typeof receipt.cleanupPending !== 'boolean' ||
          typeof receipt.workerCleanupPending !== 'boolean'
        )
          throw new Error('flow_result_invalid')
        outcomes.push({
          target,
          status: 'deleted',
          cleanupPending:
            receipt.cleanupPending || receipt.workerCleanupPending,
          imageJobIds: receipt.imageJobIds,
        })
      } catch (error) {
        outcomes.push({ target, status: 'failed', error })
      }
    }
    return { outcomes }
  },
  async gallery(): Promise<FlowGalleryResult> {
    return invoke('flow_command', { command: { type: 'gallery.list' } })
  },
  async preview(imageJobId: string): Promise<FlowPreviewResult> {
    const result = await invoke<FlowPreviewResult>('flow_command', {
      command: { type: 'preview.read', imageJobId },
    })
    if (
      !result ||
      result.type !== 'job.preview' ||
      result.imageJobId !== imageJobId ||
      !FLOW_PREVIEW_MIME_TYPES.includes(result.mimeType) ||
      typeof result.base64 !== 'string' ||
      !result.base64.length ||
      result.base64.length > FLOW_PREVIEW_MAX_BASE64_LENGTH ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(result.base64) ||
      !/^[a-f0-9]{64}$/.test(result.sha256)
    ) {
      throw new Error('flow_result_invalid')
    }
    return result
  },
}
