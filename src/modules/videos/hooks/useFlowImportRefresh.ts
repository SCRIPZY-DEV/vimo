import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { videosQueryKeys } from '@/modules/videos/constants'

// The service may finish an existing intent after its editor observer exits.
// Refresh disk-backed views only when a new import is reported, not every poll.
export function useFlowImportRefresh() {
  const flow = useFlowStatus()
  const queryClient = useQueryClient()
  const lastImport = useRef<{ instanceId?: string; imported: number } | null>(
    null,
  )
  const instanceId = flow.status?.nativeImport?.instanceId
  const imported = flow.status?.nativeImport?.imported

  useEffect(() => {
    if (
      !Number.isSafeInteger(imported) ||
      imported === undefined ||
      imported < 0
    )
      return
    const previous = lastImport.current
    lastImport.current = { instanceId, imported }
    // A restart may import before the UI observes zero, even to the same count.
    if (
      imported === 0 ||
      (previous !== null &&
        previous.instanceId === instanceId &&
        imported <= previous.imported)
    )
      return
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'videos' && query.queryKey[1] === 'project',
    })
  }, [instanceId, imported, queryClient])
}
