import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CatalogManifestResponse } from '@/modules/videos/types/catalogRemote'
import type {
  CatalogGem,
  CatalogManifest,
  PublishedCatalogStyle,
} from '@pipeline/types/catalog.ts'

// La sincronización del catálogo remoto (Entrega 3, ADR-0049, plan E3 §5.6):
// cuándo se pide, qué se hace con la respuesta de vimo.click y de dónde sale
// cada muestra. Módulo puro, sin imports de runtime: lo corre
// scripts/test/check-app-catalog-sync.mjs con Node, sin bundler.

/** El catálogo remoto vale solo junto con el catálogo nuevo (plan E3, P2). */
export function catalogSyncEnabled(features: {
  newCatalog: boolean
  remoteCatalog: boolean
}): boolean {
  return features.newCatalog && features.remoteCatalog
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPublishedStyle(value: unknown): PublishedCatalogStyle | null {
  if (!isRecord(value)) return null
  const { id, position, version, content } = value
  if (typeof id !== 'string' || !id) return null
  if (typeof position !== 'number' || !Number.isInteger(position)) return null
  if (typeof version !== 'number' || !Number.isInteger(version)) return null
  if (!isRecord(content)) return null
  return {
    id,
    position,
    version,
    // El contenido lo valida entero el sidecar antes de tocar el disco.
    content: content as unknown as PublishedCatalogStyle['content'],
  }
}

/**
 * La respuesta de `GET /api/catalogo`, revisada antes de usarla (un servidor a
 * medio desplegar puede mandar otra cosa): la versión, y si no es «sin
 * cambios», la URL pública de las muestras (https) y la lista de estilos con su
 * forma. null = no se usa: la pestaña sigue con lo que tenía.
 */
export function readCatalogManifestResponse(
  body: unknown,
): CatalogManifestResponse | null {
  if (!isRecord(body)) return null
  const version = body.version
  if (typeof version !== 'string' || !version) return null
  if (body.sinCambios === true) return { version, sinCambios: true }

  const samplesBaseUrl = body.samplesBaseUrl
  if (typeof samplesBaseUrl !== 'string') return null
  if (!samplesBaseUrl.startsWith('https://')) return null
  if (!Array.isArray(body.styles)) return null

  const styles: PublishedCatalogStyle[] = []
  for (const entry of body.styles) {
    const style = readPublishedStyle(entry)
    if (!style) return null
    styles.push(style)
  }
  return { version, samplesBaseUrl, styles }
}

export type CatalogSyncStep =
  { kind: 'unchanged' } | { kind: 'sync'; manifest: CatalogManifest }

/**
 * Qué hacer con la respuesta: nada si el servidor dijo «sin cambios» o si la
 * versión que trae es la que ya está sincronizada; si no, sincronizar.
 */
export function catalogSyncStep(
  knownVersion: string | null,
  response: CatalogManifestResponse,
): CatalogSyncStep {
  if ('sinCambios' in response) return { kind: 'unchanged' }
  if (response.version === knownVersion) return { kind: 'unchanged' }
  return { kind: 'sync', manifest: response }
}

/**
 * El único origen del que el sidecar acepta bajar muestras (ADR-0010: le llega
 * en el payload): el de la URL pública del bucket.
 */
export function samplesOriginOf(samplesBaseUrl: string): string {
  return new URL(samplesBaseUrl).origin
}

/** De dónde sale cada muestra de una gema: empaquetada en la app o sincronizada en disco. */
export type CatalogSampleSource =
  | { kind: 'packaged'; url: string }
  | { kind: 'synced'; path: string; mtimeMs: number }

// Espejo de STYLE_REFERENCES_BASE_PATH (constants.ts): como en catalogSamples.ts.
const SAMPLES_BASE_PATH = '/style-references'
const SAMPLE_LIMIT = 4

/**
 * Las muestras de una gema, en orden: las sincronizadas si la gema las trae
 * (tanda ≥ 1 del catálogo remoto); si no, las empaquetadas de la app, de la 1
 * a `sampleCount` (nunca más de 4).
 */
export function catalogSampleSources(gem: CatalogGem): CatalogSampleSource[] {
  if (gem.samples !== undefined)
    return gem.samples.map((sample) => ({
      kind: 'synced',
      path: sample.path,
      mtimeMs: sample.mtimeMs,
    }))
  return Array.from(
    { length: Math.min(SAMPLE_LIMIT, gem.sampleCount) },
    (_, index) => ({
      kind: 'packaged',
      url: `${SAMPLES_BASE_PATH}/${gem.id}_${index + 1}.jpg`,
    }),
  )
}

/**
 * El estilo elegido sigue en el catálogo que se ve. Si se ocultó o se eliminó
 * mientras estaba elegido (Review Focus 5 del plan E3), el formulario se queda
 * con la copia que ya tiene (el proyecto viaja con su snapshot) y la pestaña
 * lo avisa; no se manda una gema fantasma porque la gema viaja entera.
 */
export function selectedCatalogStyleListed(
  selected: Pick<SelectedCustomStyle, 'catalogStyleId'> | null,
  gems: readonly Pick<CatalogGem, 'id'>[],
): boolean {
  if (!selected?.catalogStyleId) return true
  return gems.some((gem) => gem.id === selected.catalogStyleId)
}
