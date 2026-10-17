import { useMutation, useQuery } from '@tanstack/react-query'
import { useAccessFeature } from '@/modules/common/hooks/useAccessFeature'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import {
  CATALOG_SYNC_STALE_TIME_MS,
  videosQueryKeys,
} from '@/modules/videos/constants'
import {
  catalogSyncEnabled,
  catalogSyncStep,
  samplesOriginOf,
} from '@/modules/videos/utilities/catalogSync'
import type { CatalogCopyRequest } from '@/modules/videos/types/styles'
import type { CatalogListResult } from '@pipeline/types/catalog.ts'

interface UseCatalogStylesOptions {
  // Quien la lee de paso (Crear, para la tarjeta que la demo usa sin una
  // elegida) la pide solo cuando le hace falta: cada lectura es un proceso
  // del sidecar y la sincronización le pregunta a vimo.click.
  enabled?: boolean
}

// El catálogo de Vimo (Entrega 2): las gemas de la pestaña Catálogo, en su
// orden, y «Pasar a mi estilo». Con el catálogo remoto encendido (Entrega 3,
// ADR-0049) la lista es la sincronizada en `_catalog/` si la hay, y al montarse
// la pestaña se le pide a vimo.click el manifiesto con la versión conocida: si
// cambió, el sidecar sincroniza y la lista se vuelve a pedir. Un fallo de la
// sincronización no se muestra como error: sigue lo que había (o las 38 gemas
// empaquetadas). Todo lo del sidecar va al proceso local, que no depende de la
// red: con el `networkMode` por defecto, TanStack pausaría la lista y la copia
// apenas el webview avisa `offline` (ERRORES-CONOCIDOS:
// tanstack-mutacion-pausada-por-networkmode-online); la sincronización también
// va con `always` para que un `offline` equivocado no la deje colgada.
export function useCatalogStyles({
  enabled = true,
}: UseCatalogStylesOptions = {}) {
  const native = videosApi.isNative()
  const newCatalog = useAccessFeature('newCatalog')
  const remoteCatalog = useAccessFeature('remoteCatalog')
  const remote = catalogSyncEnabled({ newCatalog, remoteCatalog })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: catalogStylesQueryKey(remote),
    queryFn: () => videosApi.listCatalogStyles(remote ? { remote } : undefined),
    enabled: native && enabled,
    networkMode: 'always',
    staleTime: Infinity,
    retry: false,
  })

  // La sincronización: una query con efecto a propósito, para que cualquier
  // otro sitio (el admin al publicar) la vuelva a correr invalidando su clave.
  // Lee la versión sincronizada de la lista cacheada, no de `data`: así la
  // función no cambia con cada render.
  const sync = useQuery({
    queryKey: videosQueryKeys.catalogSync,
    queryFn: async () => {
      const listed = queryClient.getQueryData<CatalogListResult>(
        catalogStylesQueryKey(true),
      )
      const knownVersion = listed?.version ?? null
      const response = await videosApi.fetchCatalogManifest(knownVersion)
      const step = catalogSyncStep(knownVersion, response)
      if (step.kind === 'unchanged') return { synced: false }

      await videosApi.syncCatalogStyles({
        manifest: step.manifest,
        samplesOrigin: samplesOriginOf(step.manifest.samplesBaseUrl),
      })
      await queryClient.invalidateQueries({
        queryKey: videosQueryKeys.catalogStyles,
      })
      return { synced: true }
    },
    enabled: native && enabled && remote && data !== undefined,
    networkMode: 'always',
    staleTime: CATALOG_SYNC_STALE_TIME_MS,
    retry: false,
  })

  // La copia trae las muestras que tiene la app y crea la tarjeta en Mi
  // estilo. La lista de Mi estilo se invalida aunque la galería del catálogo
  // ya no esté: así la copia aparece en esa pestaña pase lo que pase. Con el
  // catálogo remoto, `remote` le dice al sidecar que busque la gema primero
  // en el catálogo sincronizado (la misma que muestra la pestaña).
  const copyMutation = useMutation({
    mutationFn: async ({ gem, name, character }: CatalogCopyRequest) => {
      const samples = await videosApi.catalogSampleUploads(gem)
      return videosApi.copyCatalogStyle({
        catalogStyleId: gem.id,
        name,
        character,
        samples,
        ...(remote ? { remote } : {}),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: videosQueryKeys.customStyles,
      })
    },
    networkMode: 'always',
  })

  return {
    gems: data?.entries ?? [],
    // El catálogo remoto está encendido para la persona (con o sin red).
    remote,
    // Hay una sincronización en curso: la pestaña muestra lo que hay mientras.
    syncing: sync.isFetching,
    isLoading: native && isLoading,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
    copyStyle: (request: CatalogCopyRequest) =>
      copyMutation.mutateAsync(request),
    copying: copyMutation.isPending,
    // La última copia: qué se pidió, la tarjeta que quedó en Mi estilo (la
    // galería lleva el formulario a ella) o si falló, con su porqué cuando el
    // texto sirve para la copia (si no, null).
    copyRequest: copyMutation.variables ?? null,
    copiedStyle: copyMutation.data?.entry ?? null,
    copyFailed: copyMutation.isError,
    copyErrorKey: copyMutation.isError
      ? videosApi.catalogCopyErrorKey(copyMutation.error)
      : null,
    // Olvida la última copia: el aviso de una fallida se puede cerrar.
    dismissCopyFailure: () => copyMutation.reset(),
  }
}

// La lista empaquetada y la sincronizada son dos entradas de caché: cambiar
// el interruptor no mezcla una con otra, e invalidar el prefijo las toca a las
// dos.
function catalogStylesQueryKey(remote: boolean) {
  return [...videosQueryKeys.catalogStyles, { remote }]
}
