import type { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

export interface ImageProviderPickerProps {
  // El proveedor elegido; null hasta que haya una clave configurada.
  provider: ImageProviderId | null
  disabled: boolean
  // Saldo por proveedor (la misma query que Crear y el editor).
  credits: ReturnType<typeof useImageCredits>
  showFlowGenerationControls?: boolean
  onChoose: (provider: ImageProviderId) => void
}
