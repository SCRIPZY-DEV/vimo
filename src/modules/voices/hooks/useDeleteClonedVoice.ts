import { useMutation, useQueryClient } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'
import type { VoiceSummary } from '@pipeline/types/voices.ts'

/**
 * Borra una voz clonada de la cuenta de ai33 y refresca su catálogo para que
 * desaparezca de «Mis clonadas».
 */
export function useDeleteClonedVoice() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (voice: VoiceSummary) =>
      voicesApi.deleteClonedVoice({
        voiceId: voice.voiceId,
        voiceName: voice.name,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: voicesQueryKeys.listRoot('ai33'),
      })
    },
  })

  return {
    deleteClonedVoice: mutation.mutateAsync,
    deleting: mutation.isPending,
    errorKey: mutation.isError
      ? voicesApi.errorMessageKey(mutation.error)
      : null,
    reset: mutation.reset,
  }
}
