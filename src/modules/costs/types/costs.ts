export type ImageModelId = 'gpt-image-1.5' | 'gpt-image-2'

export interface QualityOption {
  id: string
  /** Especificación técnica ('1920×1080 · High'): idéntica en los 3 idiomas. */
  label: string
  priceUsd: number
  /** Solo Evolink: costo en créditos además del equivalente en USD. */
  credits?: number
  widthPx: number
  heightPx: number
  /** Clave i18n (costs.catalogo.*) con la nota user-visible de la opción. */
  notesKey?: string
  /** No se muestra en /costs; sí en el editor avanzado (fase videos). */
  hiddenInCosts?: boolean
}

export interface ImageModel {
  id: ImageModelId
  label: string
  defaultOptionId: string
  options: QualityOption[]
}

export type ImageProviderId = 'fal' | 'evolink'

export interface ImageProvider {
  id: ImageProviderId
  label: string
  /** Imágenes que puede generar en paralelo. */
  concurrency: number
  models: ImageModel[]
}

export type VoiceProviderId = 'dubvoice-minimax'

export interface VoiceProvider {
  id: VoiceProviderId
  label: string
  pricePerCharUsd: number
}

export interface MusicProvider {
  id: string
  label: string
  defaultModel: string
  variations: number
  estimatedCreditsKey: string
  notesKey: string
}

/** Fila aplanada del catálogo: proveedor × modelo × opción visible en /costs. */
export interface ImageOptionRow {
  key: string
  providerLabel: string
  modelId: ImageModelId
  modelLabel: string
  optionId: string
  qualityLabel: string
  notesKey?: string
  priceUsd: number
  credits?: number
  concurrency: number
}

/** Fila del producto cartesiano opción de imagen × proveedor de voz. */
export interface ImageVoiceComboRow extends ImageOptionRow {
  voiceLabel: string
  voicePricePerCharUsd: number
}

export type CostFilter = 'cheapest' | 'fastest' | 'quality'

export type CostTab = 'video' | 'images' | 'voices' | 'music'
