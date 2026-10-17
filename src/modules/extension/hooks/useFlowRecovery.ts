import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import {
  canCancelFlowJob,
  canRetryFlowGeneration,
} from '@/modules/extension/utilities/flowJobActions'
import type { FlowRecoveryAction } from '@/modules/common/types/flow'

export function useFlowRecovery() {
  const flow = useFlowStatus()
  const client = useQueryClient()
  const retryIds = useRef(new Map<string, string>())
  const action = useMutation({
    retry: false,
    mutationFn: async (request: FlowRecoveryAction) => {
      if (request.type === 'download')
        return commonApi.downloadFlowImage(request.imageJobId)
      if (request.type === 'cancel')
        return commonApi.cancelFlowImage(request.imageJobId)
      const status = await commonApi.flowStatus()
      if (request.type === 'retry') {
        const current = status.jobs.find(
          (job) => job.imageJobId === request.job.imageJobId,
        )
        if (
          !current ||
          !canRetryFlowGeneration(current) ||
          current.attemptId !== request.job.attemptId ||
          !current.attemptId
        )
          throw new Error('flow_command_invalid')
        const key = `${current.imageJobId}:${current.attemptId}`
        const retryRequestId = retryIds.current.get(key) ?? crypto.randomUUID()
        retryIds.current.set(key, retryRequestId)
        await commonApi.retryFlowGeneration({
          imageJobId: current.imageJobId,
          expectedAttemptId: current.attemptId,
          retryRequestId,
          acknowledgeDuplicateRisk: true,
        })
        return
      }
      if (request.type === 'deleteImage') {
        if (
          !status.jobs.some(
            (job) =>
              job.imageJobId === request.imageJobId && job.localDeletable,
          )
        )
          throw new Error('flow_command_invalid')
        return commonApi.deleteFlowImage(request.imageJobId)
      }
      if (request.type === 'deleteBatch') {
        if (
          !status.batches.some(
            (batch) =>
              batch.batchId === request.batchId && batch.localDeletable,
          )
        )
          throw new Error('flow_command_invalid')
        return commonApi.deleteFlowBatch(request.batchId)
      }
      if (request.type !== 'cancelBatch')
        throw new Error('flow_command_invalid')
      // Primero cierra admisión; después cancela trabajos ya aceptados con una
      // foto nueva. Cancelar sólo la reserva dejaría trabajos ejecutándose.
      await commonApi.cancelFlowBatch(request.batchId)
      const fresh = await commonApi.flowStatus()
      let failed = false
      for (const job of fresh.jobs) {
        if (job.batchId !== request.batchId || !canCancelFlowJob(job)) continue
        try {
          await commonApi.cancelFlowImage(job.imageJobId)
        } catch {
          failed = true
        }
      }
      if (failed) throw new Error('flow_cancel_incomplete')
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: commonQueryKeys.flowStatus }),
  })
  return {
    status: flow.status,
    busy: action.isPending,
    errorKey: action.isError ? flowErrorKey(action.error) : null,
    execute: action.mutate,
  }
}
