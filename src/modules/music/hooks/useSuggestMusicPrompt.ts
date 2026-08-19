import { useMutation } from '@tanstack/react-query'
import { musicApi } from '@/modules/music/api'

/** Sugiere un prompt de música a partir del guion, vía LLM (DeepInfra). */
export function useSuggestMusicPrompt() {
  const mutation = useMutation({
    mutationFn: (script: string) => musicApi.suggestPrompt(script),
  })

  return {
    suggestPrompt: (script: string) => mutation.mutateAsync(script),
    suggesting: mutation.isPending,
    errorKey: mutation.isError
      ? musicApi.errorMessageKey(mutation.error)
      : null,
  }
}
