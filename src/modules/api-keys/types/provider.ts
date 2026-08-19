export type ApiKeyProviderId =
  'deepinfra' | 'fal' | 'evolink' | 'dubvoice' | 'elevenlabs' | 'deepgram'

export type ApiKeyCategory = 'llm' | 'image' | 'voice' | 'transcription'

/** Opciones de useRequiredApiKeys: sin providers, exige las 4 categorías. */
export interface RequiredApiKeysOptions {
  providers?: ApiKeyProviderId[]
}

export interface ApiKeyProvider {
  id: ApiKeyProviderId
  category: ApiKeyCategory
  /** Marca ('Fal.ai'): idéntica en los 3 idiomas, mismo criterio que ADR-0008. */
  label: string
  /** Página donde el usuario crea/copia su clave. */
  getKeyUrl: string
  /** Hint técnico del formato ('id:secret'): idéntico en los 3 idiomas. */
  keyFormatHint: string
  /** Clave i18n (apiKeys.descripcion.*) con la descripción del servicio. */
  descriptionKey: string
  /** Clave i18n con un requisito especial (ej. clave Admin de Fal). */
  badgeKey?: string
  /** Proveedor por defecto de su categoría: se lista en Obligatorias. */
  recommended: boolean
}
