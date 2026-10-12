import { invoke } from '@tauri-apps/api/core'
import { commonApi } from '@/modules/common/api'
import {
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

export const extensionApi = {
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
