import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

export interface ImageCreditsBadgesProps {
  credits: ImageCreditsResult | null
  // Primera carga: las pills muestran un spinner en vez del saldo.
  loading: boolean
  // Refetch con saldo previo en pantalla: solo gira el botón de refrescar.
  refreshing: boolean
  // Pista visual: el proveedor elegido (en el formulario, para la escena o
  // para las muestras de un estilo); null = ninguno resaltado.
  active: ImageProviderId | null
  // Solo la pill del proveedor activo (el panel del editor, donde el resto
  // sería ruido); por defecto se ven las dos.
  onlyActive?: boolean
  showFlowGenerationControls?: boolean
  onRefresh: () => void
}
