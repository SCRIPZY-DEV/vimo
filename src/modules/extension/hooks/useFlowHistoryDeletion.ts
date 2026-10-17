import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { commonQueryKeys } from '@/modules/common/constants'
import { extensionApi } from '@/modules/extension/api'
import { extensionQueryKeys } from '@/modules/extension/constants'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import type { FlowHistoryTarget } from '@/modules/extension/types/gallery'

export function useFlowHistoryDeletion() {
  const client = useQueryClient()
  const running = useRef(false)
  const deletion = useMutation({
    retry: false,
    mutationFn: (targets: readonly FlowHistoryTarget[]) =>
      extensionApi.deleteHistory(targets),
    onSettled: async (result) => {
      for (const outcome of result?.outcomes ?? []) {
        if (outcome.status !== 'deleted') continue
        for (const imageJobId of outcome.imageJobIds ?? [])
          client.removeQueries({
            queryKey: extensionQueryKeys.preview(imageJobId),
            exact: true,
          })
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: commonQueryKeys.flowStatus }),
        client.invalidateQueries({ queryKey: extensionQueryKeys.galleryRoot }),
      ])
    },
  })
  const execute = async (targets: readonly FlowHistoryTarget[]) => {
    if (running.current || targets.length === 0) return
    running.current = true
    try {
      await deletion.mutateAsync(targets)
    } catch {
      // La mutación conserva el error inesperado para mostrarlo en la vista.
    } finally {
      running.current = false
    }
  }
  return {
    busy: deletion.isPending,
    result: deletion.data ?? null,
    errorKey: deletion.isError ? flowErrorKey(deletion.error) : null,
    execute,
    reset: deletion.reset,
  }
}
