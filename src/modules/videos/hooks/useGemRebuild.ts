import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Brand } from '@/modules/common/brand/brand'
import { videosApi } from '@/modules/videos/api'
import { gemRebuildRequest } from '@/modules/videos/utilities/gemTemplate'
import { createSingleFlight } from '@/modules/videos/utilities/singleFlight'
import type {
  GemRebuildOrigin,
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'

// Una sola reconstrucción en vuelo por clave: un doble clic en «Preparar con
// IA» recibe la MISMA promesa y al agente le llega un solo pedido (cada pedido
// gasta cupo diario y deja una fila en gem_rebuild_logs).
const rebuildFlights = createSingleFlight<GemRebuildResponse>()

// Manda una gema completa al agente reconstructor de vimo.click (ADR-0048),
// con la versión de la app (Brand.version, de package.json) y su idioma, en el
// que el agente escribe los avisos. Devuelve null si falla: el error queda en
// `error` para mostrarlo y el texto pegado lo conserva quien llama.
export function useGemRebuild() {
  const { i18n } = useTranslation()
  const mutation = useMutation({
    mutationFn: (request: GemRebuildRequest) => videosApi.rebuildGem(request),
    // El pedido va a un servidor remoto y gasta cupo: sin red tiene que fallar
    // enseguida con `network`. Con el modo por defecto (`online`) TanStack
    // pausa la mutación apenas el webview avisa `offline`, no llama a
    // `mutationFn` y la dispara sola al volver la conexión, sin que la persona
    // lo espere ni vea el error.
    networkMode: 'always',
  })

  const rebuild = async (
    flightKey: string,
    text: string,
    origin: GemRebuildOrigin,
  ): Promise<GemRebuildResponse | null> => {
    const request = gemRebuildRequest(
      text,
      origin,
      Brand.version,
      i18n.resolvedLanguage,
    )
    try {
      return await rebuildFlights.run(flightKey, () =>
        mutation.mutateAsync(request),
      )
    } catch {
      return null
    }
  }

  return {
    rebuild,
    pending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
