import {
  CREDITS_REFRESH_DELAY_MS,
  commonQueryKeys,
} from '@/modules/common/constants'
import { queryClient } from '@/modules/common/queryClient'

// Tras un job que generó imágenes, el proveedor tarda unos segundos en
// reflejar el gasto: la invalidación del saldo se difiere.
export function scheduleCreditsRefresh(): void {
  setTimeout(() => {
    void queryClient.invalidateQueries({
      queryKey: commonQueryKeys.imageCredits,
    })
  }, CREDITS_REFRESH_DELAY_MS)
}
