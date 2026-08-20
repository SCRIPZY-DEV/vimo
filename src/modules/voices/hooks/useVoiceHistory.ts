import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'

export function useVoiceHistory() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const native = voicesApi.isNative()

  const {
    data: entries,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: voicesQueryKeys.history,
    queryFn: () => voicesApi.listHistory(),
    enabled: native,
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => voicesApi.deleteHistoryEntry(id),
    onSuccess: () => {
      toast({ description: t('voices.historial.eliminada') })
      void queryClient.invalidateQueries({ queryKey: voicesQueryKeys.history })
    },
    onError: (error) => {
      toast({
        description: t(voicesApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
  })

  return {
    isNative: native,
    entries: entries ?? [],
    isLoading: native && isLoading,
    isFetching,
    errorKey: isError ? voicesApi.errorMessageKey(error) : null,
    refresh: () => {
      void refetch()
    },
    deleteEntry: deleteMutation.mutate,
    deleting: deleteMutation.isPending,
  }
}
