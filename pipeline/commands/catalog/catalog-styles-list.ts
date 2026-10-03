import { CATALOG_GEMS } from '../../prompts/catalog-gems/catalog.ts'
import type { CatalogListResult } from '../../types/catalog.ts'

// La pestaña Catálogo de Crear (spec §8): las gemas de Vimo en el orden de la
// pestaña, tal cual. Puro: no toca el disco ni la red — las muestras viven en
// la app y `sampleCount` le dice cuántas tiene cada estilo (decisión P1 del
// plan E2).
export async function catalogStylesList(): Promise<CatalogListResult> {
  return { entries: [...CATALOG_GEMS] }
}
