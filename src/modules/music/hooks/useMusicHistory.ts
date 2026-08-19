import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { musicApi } from '@/modules/music/api'
import { musicQueryKeys } from '../constants'

export function useMusicHistory() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const native = musicApi.isNative()

  const {
    data: entries,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: musicQueryKeys.history,
    queryFn: () => musicApi.listHistory(),
    enabled: native,
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => musicApi.deleteHistoryEntry(id),
    onSuccess: () => {
      toast({ description: t('music.historial.eliminada') })
      void queryClient.invalidateQueries({ queryKey: musicQueryKeys.history })
    },
    onError: (error) => {
      toast({
        description: t(musicApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
  })

  return {
    isNative: native,
    entries: entries ?? [],
    isLoading: native && isLoading,
    isFetching,
    errorKey: isError ? musicApi.errorMessageKey(error) : null,
    refresh: () => {
      void refetch()
    },
    deleteEntry: deleteMutation.mutate,
    deleting: deleteMutation.isPending,
  }
}
