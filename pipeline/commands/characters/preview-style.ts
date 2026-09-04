import { isCharacterStyleId } from '../../prompts/visual-styles.ts'
import { STYLE_ID_PATTERN } from '../styles/style-store.ts'

// Clave válida para guardar o buscar un preview: un id del catálogo o un id
// de galería de estilo propio. Los ids de galería nacen como `st-<ts>-<rand>`
// (newCustomStyleId en la UI), así que no chocan con el catálogo, y el patrón
// además garantiza un nombre de archivo seguro (`preview.<clave>.<ext>`).
export function isPreviewStyleKey(value: unknown): value is string {
  if (isCharacterStyleId(value)) return true
  return typeof value === 'string' && STYLE_ID_PATTERN.test(value)
}
