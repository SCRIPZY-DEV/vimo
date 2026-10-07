import { CATALOG_GEMS } from '../../prompts/catalog-gems/catalog.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type { CatalogListResult } from '../../types/catalog.ts'
import { listSyncedCatalog } from './catalog-cache.ts'
import { wantsRemoteCatalog } from './catalog-store.ts'

// La pestaña Catálogo de Crear (spec §8 y ADR-0049). Sin `remote` (el
// interruptor `remoteCatalog` apagado): las gemas empaquetadas en el orden de
// la pestaña, tal cual y sin tocar el disco ni la red — sus muestras viven en
// la app y `sampleCount` le dice cuántas tiene cada estilo (P1 del plan E2) —,
// con `version: null`. Con `remote: true`, el catálogo sincronizado en
// `_catalog/`, con las rutas de sus muestras y su versión; si nunca se
// sincronizó o la caché no sirve, también las empaquetadas: la app nunca se
// queda sin estilos (Review Focus 1 del plan E3).
export async function catalogStylesList(
  context: PipelineContext,
): Promise<CatalogListResult> {
  if (!wantsRemoteCatalog(context.job.payload)) return packagedCatalog()
  return (await listSyncedCatalog(context)) ?? packagedCatalog()
}

function packagedCatalog(): CatalogListResult {
  return { entries: [...CATALOG_GEMS], version: null }
}
