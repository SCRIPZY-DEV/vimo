import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { extensionApi } from '@/modules/extension/api'
import { extensionQueryKeys } from '@/modules/extension/constants'
import { isNative } from '@/modules/common/utilities/isNative'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'
import { extensionReleaseState } from '@/modules/extension/utilities/extensionReleaseState'
import type {
  ExtensionRelease,
  ExtensionReleaseCheckResult,
} from '@/modules/extension/types/release'

export function useExtensionRelease() {
  const native = isNative()
  const client = useQueryClient()
  const busy = useIsMutating({ mutationKey: extensionQueryKeys.download }) > 0
  const checking = useIsMutating({ mutationKey: extensionQueryKeys.check }) > 0
  const openingFolder =
    useIsMutating({ mutationKey: extensionQueryKeys.openFolder }) > 0
  const release = useQuery({
    queryKey: extensionQueryKeys.release,
    queryFn: extensionApi.checkRelease,
    enabled: native,
    // El transporte nativo informa sus propios errores; el webview no debe encolarlo.
    networkMode: 'always',
    retry: false,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
  const available =
    release.isFetchedAfterMount && !release.isError ? release.data : undefined
  const downloadedFile = useQuery({
    queryKey: extensionQueryKeys.downloadedFile(
      available?.version ?? '',
      available?.sha256 ?? '',
    ),
    queryFn: () => {
      if (!available) return Promise.resolve(null)
      return extensionApi.findDownload(available)
    },
    enabled: native && !!available && !release.isFetching && !busy,
    networkMode: 'always',
    retry: false,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
    refetchOnWindowFocus: 'always',
  })
  const checkUpdates = useMutation({
    mutationKey: extensionQueryKeys.check,
    networkMode: 'always',
    retry: false,
    async mutationFn(): Promise<ExtensionReleaseCheckResult> {
      const result = await release.refetch()
      if (!result.data || result.isError)
        throw result.error ?? { code: 'unavailable' }
      const latest = result.data
      const queryKey = extensionQueryKeys.downloadedFile(
        latest.version,
        latest.sha256,
      )
      // Un descriptor idéntico también exige releer el ZIP, sin depender de un render intermedio.
      await client.cancelQueries({ queryKey, exact: true })
      const path = await client.fetchQuery({
        queryKey,
        queryFn: () => extensionApi.findDownload(latest),
        staleTime: 0,
        retry: false,
        networkMode: 'always',
      })
      // Un ZIP válido basta: no esperar al bridge para confirmar una descarga local.
      if (path?.trim()) return { release: latest, current: true }
      // Otro lector puede haber pausado esta clave compartida por el estado de red
      // del webview. Cancelar ese retryer antes de consultar el bridge local.
      await client.cancelQueries({
        queryKey: commonQueryKeys.flowStatus,
        exact: true,
      })
      const profiles = await client
        .fetchQuery({
          queryKey: commonQueryKeys.flowStatus,
          queryFn: () => commonApi.flowStatus(),
          staleTime: 0,
          retry: false,
          networkMode: 'always',
        })
        .then(
          (status) => status.connections,
          () => null,
        )
      const state = extensionReleaseState({
        release: latest,
        downloadedPath: path,
        connections: profiles ?? [],
        statusFailed: profiles === null,
      })
      return { release: latest, current: state.current || state.downloaded }
    },
  })
  const openFolder = useMutation({
    mutationKey: extensionQueryKeys.openFolder,
    mutationFn: extensionApi.openDownloadFolder,
    networkMode: 'always',
    retry: false,
    onError(_error, release) {
      // Si el ZIP se borró entre la consulta y el clic, vuelve a ofrecer Descargar.
      return client.invalidateQueries({
        queryKey: extensionQueryKeys.downloadedFile(
          release.version,
          release.sha256,
        ),
        exact: true,
      })
    },
  })
  const openDownloadFolder = (release: ExtensionRelease) => {
    if (client.isMutating({ mutationKey: extensionQueryKeys.openFolder }) > 0)
      return
    openFolder.mutate(release)
  }
  const download = useMutation({
    mutationKey: extensionQueryKeys.download,
    mutationFn: extensionApi.downloadRelease,
    networkMode: 'always',
    retry: false,
    async onMutate(release) {
      // Una lectura previa no puede borrar el éxito al terminar más tarde.
      await client.cancelQueries({
        queryKey: extensionQueryKeys.downloadedFile(
          release.version,
          release.sha256,
        ),
        exact: true,
      })
    },
    onSuccess(result, release) {
      // El archivo ya está verificado; persistir el recibo es independiente.
      client.setQueryData(
        extensionQueryKeys.downloadedFile(release.version, release.sha256),
        result.path,
      )
      client.setQueryData(extensionQueryKeys.downloadReceipt, {
        version: result.version,
        downloadedAt: result.downloadedAt,
      })
    },
  })
  return {
    native,
    release,
    downloadedFile,
    download,
    busy,
    checkUpdates,
    checking,
    openFolder,
    openingFolder,
    openDownloadFolder,
  }
}
