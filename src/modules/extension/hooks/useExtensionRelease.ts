import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { extensionApi } from '@/modules/extension/api'
import { extensionQueryKeys } from '@/modules/extension/constants'
import { isNative } from '@/modules/common/utilities/isNative'

export function useExtensionRelease() {
  const native = isNative()
  const client = useQueryClient()
  const release = useQuery({
    queryKey: extensionQueryKeys.release,
    queryFn: extensionApi.checkRelease,
    enabled: native,
    retry: false,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
  const receipt = useQuery({
    queryKey: extensionQueryKeys.downloadReceipt,
    queryFn: extensionApi.lastDownload,
    enabled: native,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const download = useMutation({
    mutationKey: extensionQueryKeys.download,
    mutationFn: extensionApi.downloadRelease,
    onSuccess(result) {
      if (!result) return
      client.setQueryData(extensionQueryKeys.downloadReceipt, {
        version: result.version,
        downloadedAt: result.downloadedAt,
      })
    },
  })
  return { native, release, receipt, download }
}
