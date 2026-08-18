import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'
import { REQUIRED_CATEGORIES } from '../constants'
import { useApiKeys } from './useApiKeys'
import type { ApiKeyCategory } from '../types/provider'

/**
 * Contrato para el resto de los módulos (Create, Music, Voices...): qué
 * categorías de clave faltan para poder generar. Cuando falte alguna, la
 * pantalla bloquea con CTA hacia `ApiKeysRoutes.apiKeys`.
 */
export function useRequiredApiKeys() {
  const { isNative, statuses, isLoading } = useApiKeys()

  const configured = new Set(
    statuses.filter((status) => status.configured).map((s) => s.providerId),
  )
  const missingCategories: ApiKeyCategory[] = REQUIRED_CATEGORIES.filter(
    (category) =>
      !API_KEY_PROVIDERS.some(
        (provider) =>
          provider.category === category && configured.has(provider.id),
      ),
  )

  return {
    isNative,
    isLoading,
    missingCategories,
    ready: !isLoading && missingCategories.length === 0,
  }
}
