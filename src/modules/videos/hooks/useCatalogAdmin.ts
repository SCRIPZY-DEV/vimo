import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import {
  CATALOG_ADMIN_STALE_TIME_MS,
  videosQueryKeys,
} from '@/modules/videos/constants'
import type {
  AdminCatalogListResponse,
  AdminCatalogStyle,
  CatalogAdminAction,
  CatalogSamplesReserveRequest,
  CatalogSamplesReserveResponse,
  CatalogStyleCreateRequest,
  CatalogStyleUpdateRequest,
  CatalogTranslateResponse,
} from '@/modules/videos/types/catalogRemote'

/** El último pedido del admin, para el aviso de la galería. */
export interface CatalogAdminNotice {
  action: CatalogAdminAction
  // El nombre del estilo como lo ve el admin.
  name: string
  status: 'working' | 'done' | 'failed'
  errorKey: string | null
  // El `detalle` del servidor (qué campo), para `estilo-invalido`.
  errorDetail: string
}

// Lo que hace el admin con el catálogo remoto (Entrega 3, ADR-0049, plan E3
// tarea C2): la lista de todos los estilos (borrador, publicado y estado,
// archivados incluidos) y las acciones: crear, guardar, reservar una tanda de
// muestras, publicar, ocultar, eliminar (= archivar 30 días), restaurar y
// traducir. Van a vimo.click de verdad, así que con `networkMode: 'always'`:
// un corte de conexión se muestra como error y no queda una mutación en pausa
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online). Cada
// respuesta se pone en la lista cacheada al toque, y lo que cambia lo que ven
// los usuarios (publicar, ocultar, eliminar, restaurar) vuelve a correr la
// sincronización de la pestaña. Un estilo sale de la lista solo cuando el
// servidor lo purga (la lista se vuelve a pedir al montarse o al refrescar).
export function useCatalogAdmin(enabled: boolean) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: videosQueryKeys.catalogAdmin,
    queryFn: () => videosApi.listCatalogAdmin(),
    enabled,
    networkMode: 'always',
    staleTime: CATALOG_ADMIN_STALE_TIME_MS,
    retry: false,
  })
  const [notice, setNotice] = useState<CatalogAdminNotice | null>(null)

  const showStyle = (style: AdminCatalogStyle) => {
    queryClient.setQueryData<AdminCatalogListResponse>(
      videosQueryKeys.catalogAdmin,
      (current) => {
        if (!current) return current
        const listed = current.styles.some((entry) => entry.id === style.id)
        const styles = listed
          ? current.styles.map((entry) =>
              entry.id === style.id ? style : entry,
            )
          : [...current.styles, style]
        return { ...current, styles: sortedByPosition(styles) }
      },
    )
  }

  // Lo publicado cambió: la pestaña vuelve a pedir el manifiesto y sincroniza.
  const resyncUsers = () => {
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.catalogSync,
    })
  }

  // Cada acción deja su aviso: en curso, hecha o fallida con el porqué.
  const noticed = async <T>(
    action: CatalogAdminAction,
    name: string,
    work: () => Promise<T>,
  ): Promise<T> => {
    setNotice({
      action,
      name,
      status: 'working',
      errorKey: null,
      errorDetail: '',
    })
    try {
      const result = await work()
      setNotice({
        action,
        name,
        status: 'done',
        errorKey: null,
        errorDetail: '',
      })
      return result
    } catch (failure) {
      setNotice({
        action,
        name,
        status: 'failed',
        errorKey: videosApi.catalogServerErrorKey(failure),
        errorDetail: videosApi.catalogServerErrorDetail(failure),
      })
      throw failure
    }
  }

  const createMutation = useMutation({
    mutationFn: ({
      request,
    }: {
      request: CatalogStyleCreateRequest
      name: string
    }) => videosApi.createCatalogStyle(request),
    onSuccess: showStyle,
    networkMode: 'always',
  })
  const saveMutation = useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string
      request: CatalogStyleUpdateRequest
      name: string
    }) => videosApi.updateCatalogStyle(id, request),
    onSuccess: showStyle,
    networkMode: 'always',
  })
  const reserveMutation = useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string
      request: CatalogSamplesReserveRequest
    }) => videosApi.reserveCatalogSamples(id, request),
    onSuccess: (response) => showStyle(response.style),
    networkMode: 'always',
  })
  const publishMutation = useMutation({
    mutationFn: ({ style }: { style: AdminCatalogStyle; name: string }) =>
      videosApi.publishCatalogStyle(style.id, { revision: style.revision }),
    onSuccess: (style) => {
      showStyle(style)
      resyncUsers()
    },
    networkMode: 'always',
  })
  const hideMutation = useMutation({
    mutationFn: ({ style }: { style: AdminCatalogStyle; name: string }) =>
      videosApi.hideCatalogStyle(style.id, { revision: style.revision }),
    onSuccess: (style) => {
      showStyle(style)
      resyncUsers()
    },
    networkMode: 'always',
  })
  // Eliminar archiva: el estilo sigue en la lista, en Archivados, hasta que el
  // servidor lo purgue o el admin lo restaure.
  const deleteMutation = useMutation({
    mutationFn: ({ style }: { style: AdminCatalogStyle; name: string }) =>
      videosApi.deleteCatalogStyle(style.id),
    onSuccess: (style) => {
      showStyle(style)
      resyncUsers()
    },
    networkMode: 'always',
  })
  const restoreMutation = useMutation({
    mutationFn: ({ style }: { style: AdminCatalogStyle; name: string }) =>
      videosApi.restoreCatalogStyle(style.id, { revision: style.revision }),
    onSuccess: (style) => {
      showStyle(style)
      resyncUsers()
    },
    networkMode: 'always',
  })
  const translateMutation = useMutation({
    mutationFn: (name: string) => videosApi.translateCatalogName({ name }),
    networkMode: 'always',
  })

  const busy =
    createMutation.isPending ||
    saveMutation.isPending ||
    reserveMutation.isPending ||
    publishMutation.isPending ||
    hideMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending

  return {
    samplesBaseUrl: data?.samplesBaseUrl ?? null,
    styles: data?.styles ?? [],
    isLoading: enabled && isLoading,
    // La lista no se pudo cargar: el admin ve el catálogo como cualquier usuario.
    isError,
    errorKey: isError ? videosApi.catalogServerErrorKey(error) : null,
    notice,
    dismissNotice: () => setNotice(null),
    busy,
    // Trae la lista de nuevo y devuelve ESE estilo con su revisión de ahora
    // (para volver a intentar tras un `borrador-cambio` sin perder lo escrito).
    refreshStyle: async (id: string): Promise<AdminCatalogStyle | null> => {
      const { data: fresh } = await refetch()
      return fresh?.styles.find((style) => style.id === id) ?? null
    },
    createStyle: (request: CatalogStyleCreateRequest, name: string) =>
      noticed('create', name, () =>
        createMutation.mutateAsync({ request, name }),
      ),
    saveStyle: (id: string, request: CatalogStyleUpdateRequest, name: string) =>
      noticed('save', name, () =>
        saveMutation.mutateAsync({ id, request, name }),
      ),
    reserveSamples: (
      id: string,
      request: CatalogSamplesReserveRequest,
    ): Promise<CatalogSamplesReserveResponse> =>
      reserveMutation.mutateAsync({ id, request }),
    publishStyle: (style: AdminCatalogStyle, name: string) =>
      noticed('publish', name, () =>
        publishMutation.mutateAsync({ style, name }),
      ),
    hideStyle: (style: AdminCatalogStyle, name: string) =>
      noticed('hide', name, () => hideMutation.mutateAsync({ style, name })),
    deleteStyle: (style: AdminCatalogStyle, name: string) =>
      noticed('delete', name, () =>
        deleteMutation.mutateAsync({ style, name }),
      ),
    restoreStyle: (style: AdminCatalogStyle, name: string) =>
      noticed('restore', name, () =>
        restoreMutation.mutateAsync({ style, name }),
      ),
    translateName: (name: string): Promise<CatalogTranslateResponse> =>
      translateMutation.mutateAsync(name),
    translating: translateMutation.isPending,
  }
}

// El orden de la pestaña: posición y, en empate, id (plan E3, P15).
function sortedByPosition(styles: AdminCatalogStyle[]): AdminCatalogStyle[] {
  return [...styles].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  )
}
