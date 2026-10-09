import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { avatarsApi } from '@/modules/avatars/api'
import { avatarsQueryKeys } from '@/modules/avatars/constants'
import { useToast } from '@/modules/common/hooks/useToast'
import type {
  AvatarAddPayload,
  AvatarCreatePhotoPayload,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'

export function useAvatarMutations() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const showError = (error: unknown) => {
    toast({
      description: t(avatarsApi.errorMessageKey(error)),
      variant: 'destructive',
    })
  }

  // Devuelve la promesa para que alta y creación esperen la relectura de la
  // lista: así `mutateAsync` resuelve con la tarjeta nueva ya en pantalla.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: avatarsQueryKeys.list })

  const addMutation = useMutation({
    mutationFn: (payload: AvatarAddPayload) => avatarsApi.addLook(payload),
    onSuccess: async () => {
      toast({ description: t('avatars.toasts.agregado') })
      await invalidate()
    },
    onError: showError,
  })

  const createMutation = useMutation({
    mutationFn: (payload: AvatarCreatePhotoPayload) =>
      avatarsApi.createFromPhoto(payload),
    onSuccess: async () => {
      toast({ description: t('avatars.toasts.creado') })
      await invalidate()
    },
    onError: showError,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => avatarsApi.remove(id),
    async onMutate(id: string) {
      await queryClient.cancelQueries({ queryKey: avatarsQueryKeys.list })
      const previous = queryClient.getQueryData<AvatarSummary[]>(
        avatarsQueryKeys.list,
      )
      queryClient.setQueryData<AvatarSummary[]>(
        avatarsQueryKeys.list,
        (entries) => (entries ?? []).filter((entry) => entry.id !== id),
      )
      return { previous }
    },
    onSuccess: () => {
      toast({ description: t('avatars.toasts.eliminado') })
    },
    onError: (error, _id, context) => {
      // La tarjeta vuelve: el avatar sigue en disco.
      if (context?.previous)
        queryClient.setQueryData(avatarsQueryKeys.list, context.previous)
      showError(error)
    },
    onSettled: invalidate,
  })

  return {
    addLook: addMutation.mutateAsync,
    createFromPhoto: createMutation.mutateAsync,
    deleteAvatar: deleteMutation.mutate,
    saving: addMutation.isPending || createMutation.isPending,
  }
}
