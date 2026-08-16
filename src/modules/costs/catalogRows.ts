import { IMAGE_PROVIDERS, VOICE_PROVIDERS } from './catalog'
import type { ImageOptionRow, ImageVoiceComboRow } from './types/costs'

/**
 * Filas derivadas del catálogo para las tablas de /costs. Acá vive una sola
 * vez lo que comparten ImageCostTable y FullVideoCostTable: qué combinaciones
 * son visibles y los criterios de orden comunes.
 */

/** Aplana proveedor × modelo × opción, saltando las hiddenInCosts. */
export function flattenImageOptions(): ImageOptionRow[] {
  const rows: ImageOptionRow[] = []
  for (const provider of IMAGE_PROVIDERS) {
    for (const model of provider.models) {
      for (const option of model.options) {
        if (option.hiddenInCosts) continue
        rows.push({
          key: `${provider.id}_${model.id}_${option.id}`,
          providerLabel: provider.label,
          modelId: model.id,
          modelLabel: model.label,
          optionId: option.id,
          qualityLabel: option.label,
          notesKey: option.notesKey,
          priceUsd: option.priceUsd,
          credits: option.credits,
          concurrency: provider.concurrency,
        })
      }
    }
  }
  return rows
}

/** Cruza cada opción de imagen visible con cada proveedor de voz. */
export function flattenImageVoiceCombos(): ImageVoiceComboRow[] {
  const rows: ImageVoiceComboRow[] = []
  for (const imageRow of flattenImageOptions()) {
    for (const voice of VOICE_PROVIDERS) {
      rows.push({
        ...imageRow,
        key: `${imageRow.key}_${voice.id}`,
        voiceLabel: voice.label,
        voicePricePerCharUsd: voice.pricePerCharUsd,
      })
    }
  }
  return rows
}

/** El peso mayor de gpt-image-2 en «calidad» refleja su fidelidad de prompt. */
export function qualityWeight(
  row: Pick<ImageOptionRow, 'modelId' | 'optionId'>,
): number {
  if (row.modelId === 'gpt-image-2' && row.optionId.includes('high')) return 0
  if (row.modelId === 'gpt-image-2' && row.optionId.includes('medium')) return 1
  if (row.modelId === 'gpt-image-1.5' && row.optionId.includes('high')) return 2
  if (row.modelId === 'gpt-image-1.5' && row.optionId.includes('medium'))
    return 3
  if (row.modelId === 'gpt-image-2') return 4
  if (row.modelId === 'gpt-image-1.5') return 5
  return 9
}

/** Orden «rápido»: más concurrencia primero; a igualdad, el más barato. */
export function compareByFastest(
  a: Pick<ImageOptionRow, 'concurrency' | 'priceUsd'>,
  b: Pick<ImageOptionRow, 'concurrency' | 'priceUsd'>,
): number {
  return b.concurrency - a.concurrency || a.priceUsd - b.priceUsd
}
