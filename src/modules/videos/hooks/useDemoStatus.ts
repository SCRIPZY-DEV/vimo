import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// ¿El pack de la demo está listo en esta máquina? Se consulta en cada visita
// a la puerta (lectura de disco, barata) y no se cachea entre visitas: el
// pack pudo borrarse o cambiar de carpeta raíz.
export function useDemoStatus() {
  return useQuery({
    queryKey: videosQueryKeys.demoStatus,
    queryFn: () => videosApi.demoStatus(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}
