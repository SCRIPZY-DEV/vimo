import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'

// Marca del proveedor por id; el id crudo si no está en el catálogo.
export function providerLabel(providerId: string): string {
  return (
    API_KEY_PROVIDERS.find((provider) => provider.id === providerId)?.label ??
    providerId
  )
}
