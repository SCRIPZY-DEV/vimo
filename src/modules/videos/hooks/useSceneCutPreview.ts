import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Cuántas escenas salen del corte por segundos, en vivo mientras el usuario
// mueve el slider. El corte es determinístico (misma implementación que la
// Fase 3), así que cada valor se cachea para siempre; keepPreviousData evita
// que la cifra parpadee a «—» entre un valor y el siguiente.
export function useSceneCutPreview(options: {
  projectId: string
  secondsPerScene: number
  // false en el modo conteo del diálogo: ahí no hay slider que previsualizar.
  enabled: boolean
}) {
  const query = useQuery({
    queryKey: videosQueryKeys.sceneCutPreview(
      options.projectId,
      options.secondsPerScene,
    ),
    queryFn: () => {
      return videosApi.previewSceneCuts({
        projectId: options.projectId,
        secondsPerScene: options.secondsPerScene,
      })
    },
    enabled: options.enabled,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })

  return {
    sceneCount: query.data?.sceneCount ?? null,
    // false mientras la cifra sea la del valor anterior (placeholder) o no
    // haya llegado: el paso de segundos la muestra con «≈» hasta entonces.
    exact: query.data !== undefined && !query.isPlaceholderData,
  }
}
