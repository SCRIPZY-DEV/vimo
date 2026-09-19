import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'

/**
 * Sugiere el prompt de la música de fondo a partir del guion, vía LLM
 * (DeepInfra, con la clave del usuario). Un fallo se avisa con un toast y
 * resuelve `null`, así quien lo llama no necesita try/catch.
 */
export function useSuggestBgmPrompt() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const mutation = useMutation({
    mutationFn: (script: string) => videosApi.suggestMusicPrompt(script),
    onError: (error) => {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
  })

  const suggestPrompt = async (script: string): Promise<string | null> => {
    try {
      return await mutation.mutateAsync(script)
    } catch {
      // El aviso ya lo dio `onError`.
      return null
    }
  }

  return { suggestPrompt, suggesting: mutation.isPending }
}
