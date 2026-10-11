import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { avatarsApi } from '@/modules/avatars/api'
import {
  AVATAR_LOOK_NOT_LISTED_CODE,
  avatarsQueryKeys,
  BALANCE_RECHECK_MS,
  GENERATE_LOOK_ERROR_MESSAGE_KEYS,
  LOOK_NOT_LISTED_RECHECK_MS,
} from '@/modules/avatars/constants'
import { useToast } from '@/modules/common/hooks/useToast'
import type {
  AvatarAddPayload,
  AvatarCreatePhotoPayload,
  AvatarGenerateLookPayload,
  AvatarSetMainLookPayload,
  AvatarStockGroupsResult,
  AvatarSummary,
  HeyGenAvatarGroup,
} from '@pipeline/types/avatar.ts'

// Las páginas de avatares de `useStockGroups` sin un grupo; el cursor de cada
// una queda igual.
function withoutGroup(
  data: InfiniteData<AvatarStockGroupsResult, string> | undefined,
  groupId: string,
) {
  if (!data) return data

  return {
    ...data,
    pages: data.pages.map((page) => {
      return {
        ...page,
        groups: page.groups.filter((group) => group.groupId !== groupId),
      }
    }),
  }
}

// Todas van al sidecar local, que sin red responde `avatar_network` por su
// cuenta: con el `networkMode` por defecto (`online`), TanStack pausaría la
// mutación apenas el webview avisa `offline` (el diálogo queda trabado
// esperando y, al volver la red, el pedido que cobra sale solo). Por eso
// `networkMode: 'always'` en cada una (ERRORES-CONOCIDOS:
// tanstack-mutacion-pausada-por-networkmode-online).
export function useAvatarMutations() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // `overrideKeys`: textos propios de un flujo para algunos códigos (por
  // ejemplo, las imágenes de referencia de «Crear escenario»).
  const showError = (
    error: unknown,
    overrideKeys: Record<string, string> = {},
  ) => {
    const code = avatarsApi.errorCode(error)
    const overrideKey = code ? overrideKeys[code] : undefined
    toast({
      description: t(overrideKey ?? avatarsApi.errorMessageKey(error)),
      variant: 'destructive',
    })
  }

  // Devuelve la promesa para que cada mutación espere la relectura de la
  // lista: así `mutateAsync` resuelve con la tarjeta ya actualizada en
  // pantalla.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: avatarsQueryKeys.list })

  // Tras algo que cobra, el saldo de la cabecera se relee al instante y otra
  // vez a los BALANCE_RECHECK_MS: HeyGen puede descontar con retraso. También
  // tras un fallo, que pudo cobrar igual (es una lectura gratis).
  const recheckBalance = () => {
    const refetchBalance = () =>
      void queryClient.invalidateQueries({ queryKey: avatarsQueryKeys.balance })
    refetchBalance()
    // No se limpia a propósito: el diálogo que cobró ya se desmontó y esto
    // solo marca vieja una consulta del `queryClient` global.
    setTimeout(refetchBalance, BALANCE_RECHECK_MS)
  }

  // HeyGen aceptó (y cobró) un look pero su grupo todavía no lo mostraba
  // (`avatar_look_not_listed`): el avatar sigue listo y sin nada en proceso,
  // así que el sondeo no lo vuelve a mirar. A los LOOK_NOT_LISTED_RECHECK_MS
  // se refresca ese avatar una sola vez (el refresco suma los looks nuevos
  // del grupo) y al terminar se relee la lista. Si el refresco falla no se
  // avisa: el aviso del pedido ya se mostró. No se limpia a propósito, como la
  // relectura del saldo: el diálogo puede haberse cerrado.
  const recheckUnlistedLook = (id: string) => {
    setTimeout(() => {
      void avatarsApi
        .refresh(id)
        .catch(() => null)
        .then(() => invalidate())
    }, LOOK_NOT_LISTED_RECHECK_MS)
  }

  const addMutation = useMutation({
    mutationFn: (payload: AvatarAddPayload) => avatarsApi.addAvatar(payload),
    onSuccess: async () => {
      toast({ description: t('avatars.toasts.agregado') })
      await invalidate()
    },
    onError: (error) => showError(error),
    networkMode: 'always',
  })

  const createMutation = useMutation({
    mutationFn: (payload: AvatarCreatePhotoPayload) =>
      avatarsApi.createFromPhoto(payload),
    onSuccess: async () => {
      toast({ description: t('avatars.toasts.creado') })
      await invalidate()
    },
    onError: (error) => showError(error),
    onSettled: recheckBalance,
    networkMode: 'always',
  })

  const setMainMutation = useMutation({
    mutationFn: (payload: AvatarSetMainLookPayload) =>
      avatarsApi.setMainLook(payload),
    onSuccess: async () => {
      toast({ description: t('avatars.toasts.lookPrincipal') })
      await invalidate()
    },
    onError: (error) => showError(error),
    networkMode: 'always',
  })

  const generateMutation = useMutation({
    mutationFn: (payload: AvatarGenerateLookPayload) =>
      avatarsApi.generateLook(payload),
    onSuccess: async () => {
      toast({ description: t('avatars.toasts.lookGenerando') })
      await invalidate()
    },
    onError: (error, payload) => {
      showError(error, GENERATE_LOOK_ERROR_MESSAGE_KEYS)
      if (avatarsApi.errorCode(error) === AVATAR_LOOK_NOT_LISTED_CODE)
        recheckUnlistedLook(payload.id)
    },
    onSettled: recheckBalance,
    networkMode: 'always',
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => avatarsApi.remove(id),
    networkMode: 'always',
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

  // Eliminar un avatar propio de HeyGen, de verdad (entrega 2c): el grupo con
  // todos sus looks y sus entradas de la biblioteca. No se deshace: la tarjeta
  // lo confirma antes. Al lograrlo, la tarjeta sale de «Mis avatares» en el
  // acto (HeyGen ya no lo tiene) y, sin esperar, se releen los avatares de la
  // cuenta y la biblioteca: la mutación termina con la tarjeta afuera. Si
  // falla, avisa y nada cambia: la tarjeta vuelve.
  // El nombre solo viaja para la fila del log de soporte («Avatar: <nombre>»).
  const heygenDeleteMutation = useMutation({
    mutationFn: (group: HeyGenAvatarGroup) =>
      avatarsApi.deleteFromHeyGen({ groupId: group.groupId, name: group.name }),
    networkMode: 'always',
    onSuccess: (_result, group) => {
      // Los avatares de la cuenta: la misma clave que usa `useStockGroups`.
      const privateGroupsKey = avatarsQueryKeys.stockGroupsOf('private')
      queryClient.setQueryData<InfiniteData<AvatarStockGroupsResult, string>>(
        privateGroupsKey,
        (data) => withoutGroup(data, group.groupId),
      )
      toast({
        description: t('avatars.toasts.eliminadoHeygen', { name: group.name }),
      })
      void queryClient.invalidateQueries({ queryKey: privateGroupsKey })
      void invalidate()
    },
    onError: (error) => showError(error),
  })

  return {
    addAvatar: addMutation.mutateAsync,
    createFromPhoto: createMutation.mutateAsync,
    setMainLook: setMainMutation.mutateAsync,
    generateLook: generateMutation.mutateAsync,
    deleteAvatar: deleteMutation.mutate,
    deleteFromHeyGen: heygenDeleteMutation.mutateAsync,
    saving:
      addMutation.isPending ||
      createMutation.isPending ||
      setMainMutation.isPending ||
      generateMutation.isPending,
  }
}
