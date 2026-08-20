import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { charactersApi } from '@/modules/characters/api'
import { charactersQueryKeys } from '../constants'
import type {
  CharacterCreatePayload,
  CharacterSummary,
  CharacterUpdatePayload,
} from '@pipeline/types/characters.ts'

export function useCharacterMutations() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const showError = (error: unknown) => {
    toast({
      description: t(charactersApi.errorMessageKey(error)),
      variant: 'destructive',
    })
  }

  const createMutation = useMutation({
    mutationFn: (payload: CharacterCreatePayload) =>
      charactersApi.create(payload),
    onSuccess: () => {
      toast({ description: t('characters.toasts.creado') })
      void queryClient.invalidateQueries({ queryKey: charactersQueryKeys.list })
    },
    onError: showError,
  })

  const updateMutation = useMutation({
    mutationFn: (payload: CharacterUpdatePayload) =>
      charactersApi.update(payload),
    onSuccess: () => {
      toast({ description: t('characters.toasts.actualizado') })
      void queryClient.invalidateQueries({ queryKey: charactersQueryKeys.list })
    },
    onError: showError,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => charactersApi.remove(id),
    async onMutate(id: string) {
      await queryClient.cancelQueries({ queryKey: charactersQueryKeys.list })
      const previous = queryClient.getQueryData<CharacterSummary[]>(
        charactersQueryKeys.list,
      )
      queryClient.setQueryData<CharacterSummary[]>(
        charactersQueryKeys.list,
        (entries) => (entries ?? []).filter((entry) => entry.id !== id),
      )
      return { previous }
    },
    onSuccess: () => {
      toast({ description: t('characters.toasts.eliminado') })
    },
    onError: (error, _id, context) => {
      // La tarjeta vuelve: el personaje sigue en disco.
      if (context?.previous)
        queryClient.setQueryData(charactersQueryKeys.list, context.previous)
      showError(error)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: charactersQueryKeys.list })
    },
  })

  return {
    createCharacter: createMutation.mutateAsync,
    updateCharacter: updateMutation.mutateAsync,
    deleteCharacter: deleteMutation.mutate,
    saving: createMutation.isPending || updateMutation.isPending,
  }
}
