import { useMutation } from '@tanstack/react-query'
import { charactersApi } from '@/modules/characters/api'
import type {
  SuggestCharacterProfilePayload,
  SuggestCharacterProfileResult,
} from '@pipeline/types/characters.ts'

export function useSuggestCharacterProfile() {
  const mutation = useMutation<
    SuggestCharacterProfileResult,
    unknown,
    SuggestCharacterProfilePayload
  >({
    mutationFn: (payload) => charactersApi.suggestProfile(payload),
  })

  return {
    suggestProfile: mutation.mutateAsync,
    suggesting: mutation.isPending,
    errorKey: mutation.isError
      ? charactersApi.errorMessageKey(mutation.error)
      : null,
  }
}
