import type {
  ApiKeyProviderId,
  ApiKeyRequirement,
} from '@/modules/common/types/apiKeys'
export type {
  ApiKeyProviderId,
  ApiKeyRequirement,
} from '@/modules/common/types/apiKeys'

export type ApiKeyCategory =
  'llm' | 'image' | 'voice' | 'transcription' | 'animation'

// Un requisito: lista de proveedores alternativos, basta uno configurado.

// Opciones de useRequiredApiKeys: sin requirements, exige las 4 categorías.
export interface RequiredApiKeysOptions {
  requirements?: ApiKeyRequirement[]
}

export interface ApiKeyProvider {
  id: ApiKeyProviderId
  category: ApiKeyCategory
  /** Marca ('Fal.ai'): idéntica en los 3 idiomas, mismo criterio que ADR-0008. */
  label: string
  /** Página donde el usuario crea/copia su clave. */
  getKeyUrl: string
  /** Página donde el usuario recarga saldo (solo la UI la usa; Rust no). */
  billingUrl: string
  /** Hint técnico del formato ('id:secret'): idéntico en los 3 idiomas. */
  keyFormatHint: string
  /** Clave i18n (apiKeys.descripcion.*) con la descripción del servicio. */
  descriptionKey: string
  /** Clave i18n con un requisito especial (ej. clave Admin de Fal). */
  badgeKey?: string
  /** Proveedor por defecto de su categoría: se lista en Obligatorias. */
  recommended: boolean
  /** Conservado para proyectos históricos, sin tarjeta ni enlace de compra. */
  hidden?: boolean
}
