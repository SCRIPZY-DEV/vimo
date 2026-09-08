import { useMutation, useQueryClient } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'
import type { AddLibraryVoicePayload } from '@pipeline/types/voices.ts'

/**
 * Añade una voz de la biblioteca pública de ElevenLabs a la cuenta del
 * usuario (idempotente en el sidecar). Al terminar, «Mis voces» se refresca
 * para que aparezca.
 */
export function useAddLibraryVoice() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (payload: AddLibraryVoicePayload) =>
      commonApi.addLibraryVoice(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: voicesQueryKeys.listRoot('elevenlabs-direct'),
      })
    },
  })

  return {
    addLibraryVoice: mutation.mutateAsync,
    adding: mutation.isPending,
    errorKey: mutation.isError
      ? voicesApi.errorMessageKey(mutation.error)
      : null,
    reset: mutation.reset,
  }
}
