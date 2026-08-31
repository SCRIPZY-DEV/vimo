import {
  STYLE_REFERENCE_SAMPLE_COUNT,
  STYLE_REFERENCES_BASE_PATH,
} from '@/modules/videos/constants'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'

// Las muestras siguen la convención <id>_1..4.jpg, así que las rutas se
// derivan y no hace falta un manifest.
export function styleReferenceImages(styleId: CharacterStyleId): string[] {
  return Array.from(
    { length: STYLE_REFERENCE_SAMPLE_COUNT },
    (_, index) => `${STYLE_REFERENCES_BASE_PATH}/${styleId}_${index + 1}.jpg`,
  )
}
