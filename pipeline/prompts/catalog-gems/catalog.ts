import type { CatalogGem } from '../../types/catalog.ts'
import { cartoon } from './cartoon.ts'
import { fantasia } from './fantasia.ts'
import { normal } from './normal.ts'
import { povStickman } from './pov-stickman.ts'
import { terror } from './terror.ts'

// El catálogo de Vimo en el orden de la pestaña (spec §8, plan E2 §5.2): las
// gemas de la casa primero y después las de Imperio Pro en el orden de su
// README. Un archivo por gema; el guard `check-catalog-gems.mjs` fija las
// reglas de contenido (ids, límites, modos, etiquetas y muestras).
export const CATALOG_GEMS: readonly CatalogGem[] = [
  normal,
  povStickman,
  cartoon,
  fantasia,
  terror,
]

// Mapa por id para la búsqueda. Se consulta como propiedad PROPIA: con `in`,
// `toString` o `constructor` pasarían por ids del catálogo.
const GEMS_BY_ID: Record<string, CatalogGem> = Object.fromEntries(
  CATALOG_GEMS.map((gem) => [gem.id, gem]),
)

export function findCatalogGem(id: string): CatalogGem | undefined {
  return Object.hasOwn(GEMS_BY_ID, id) ? GEMS_BY_ID[id] : undefined
}
