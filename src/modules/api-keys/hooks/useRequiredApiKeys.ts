import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'
import { REQUIRED_CATEGORIES } from '../constants'
import { useApiKeys } from './useApiKeys'
import type { ApiKeyCategory, RequiredApiKeysOptions } from '../types/provider'

/**
 * Contrato para el resto de los módulos (Create, Music, Voices...): qué
 * claves faltan para poder generar. Cuando falte alguna, la pantalla bloquea
 * con CTA hacia `ApiKeysRoutes.apiKeys`.
 *
 * Sin opciones exige una clave por categoría (el pipeline completo). Un módulo
 * que usa proveedores puntuales pasa `providers` y `ready` se decide por esos
 * (ej. Music: `useRequiredApiKeys({ providers: ['evolink'] })`).
 */
export function useRequiredApiKeys(options: RequiredApiKeysOptions = {}) {
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
  const missingProviders = (options.providers ?? []).filter(
    (providerId) => !configured.has(providerId),
  )
  const ready =
    !isLoading &&
    (options.providers
      ? missingProviders.length === 0
      : missingCategories.length === 0)

  return {
    isNative,
    isLoading,
    missingCategories,
    missingProviders,
    ready,
  }
}
