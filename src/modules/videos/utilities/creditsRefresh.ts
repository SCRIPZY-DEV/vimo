import { queryClient } from '@/modules/common/queryClient'
import {
  CREDITS_REFRESH_DELAY_MS,
  videosQueryKeys,
} from '@/modules/videos/constants'

// Tras un job que generó imágenes, el proveedor tarda unos segundos en
// reflejar el gasto: la invalidación del saldo se difiere.
export function scheduleCreditsRefresh(): void {
  setTimeout(() => {
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.imageCredits,
    })
  }, CREDITS_REFRESH_DELAY_MS)
}
