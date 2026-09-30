import {
  CREDITS_REFRESH_DELAY_MS,
  commonQueryKeys,
} from '@/modules/common/constants'
import { queryClient } from '@/modules/common/queryClient'

// Tras un job que generó imágenes o clips, el proveedor tarda unos segundos
// en reflejar el gasto: la invalidación del saldo se difiere. Se invalidan
// los dos saldos: quien no tenga la query montada no paga nada.
export function scheduleCreditsRefresh(): void {
  setTimeout(() => {
    void queryClient.invalidateQueries({
      queryKey: commonQueryKeys.imageCredits,
    })
    void queryClient.invalidateQueries({
      queryKey: commonQueryKeys.videoCredits,
    })
  }, CREDITS_REFRESH_DELAY_MS)
}
