import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'
import { REQUIRED_CATEGORIES } from '../constants'
import { useApiKeys } from './useApiKeys'
import type {
  ApiKeyCategory,
  ApiKeyRequirement,
  RequiredApiKeysOptions,
} from '../types/provider'

// Contrato para el resto de los módulos (Create, Music, Voices, Characters):
// qué claves faltan para poder generar. Cuando `missingKeys` es true la vista
// monta `MissingApiKeysNotice` con los mismos `requirements`.
//
// Sin opciones exige una clave por categoría (el pipeline completo). Un módulo
// pasa los requisitos registrados en `MODULE_API_KEY_REQUIREMENTS`.
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
  const requirements: ApiKeyRequirement[] =
    options.requirements ??
    REQUIRED_CATEGORIES.map((category) =>
      API_KEY_PROVIDERS.filter(
        (provider) => provider.category === category,
      ).map((provider) => provider.id),
    )
  const missingRequirements = requirements.filter(
    (alternatives) => !alternatives.some((id) => configured.has(id)),
  )
  // En web no hay keychain: nada que reclamar.
  const missingKeys = isNative && !isLoading && missingRequirements.length > 0
  const ready = !isLoading && missingRequirements.length === 0

  return {
    isNative,
    isLoading,
    missingCategories,
    missingRequirements,
    missingKeys,
    ready,
  }
}
