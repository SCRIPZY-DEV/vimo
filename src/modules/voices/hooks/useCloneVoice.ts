import { useMutation, useQueryClient } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'
import type { CloneVoicePayload } from '@pipeline/types/voices.ts'

/**
 * Clona una voz en la cuenta de ai33. Al terminar se refresca el catálogo de
 * ai33 para que la voz aparezca en «Mis clonadas».
 */
export function useCloneVoice() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (payload: CloneVoicePayload) => voicesApi.cloneVoice(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: voicesQueryKeys.listRoot('ai33'),
      })
    },
  })

  return {
    cloneVoice: mutation.mutateAsync,
    cloning: mutation.isPending,
    errorKey: mutation.isError
      ? voicesApi.errorMessageKey(mutation.error)
      : null,
    reset: mutation.reset,
  }
}
