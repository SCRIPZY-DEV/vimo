import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { findCatalogGem } from '../../prompts/catalog-gems/catalog.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CatalogGem, CatalogListResult } from '../../types/catalog.ts'
import type { StyleSample } from '../../types/styles.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import {
  readStyleSamples,
  type SampleUploadBytes,
} from '../styles/style-store.ts'
import {
  assertCatalogGemFields,
  catalogSampleNumber,
  isCatalogSampleBytes,
  isCatalogSampleCount,
  isRecord,
  isSamplesRevision,
} from './catalog-store.ts'

// La caché del catálogo remoto (ADR-0049, plan E3 §5.5), dentro de la carpeta
// raíz:
//
//   _catalog/catalog.json                     { version, syncedAt, entries }
//   _catalog/<id>/s<revision>/sample-<n>.jpg  las muestras publicadas (tanda ≥ 1)
//   _catalog/_drafts/<id>/sample-<n>.jpg      las recién generadas de un borrador
//
// La escribe catalog-styles-sync (y generate-style-samples, los borradores).
// catalog.json no guarda rutas absolutas: las muestras se derivan al listar,
// así la carpeta raíz puede moverse sin romper nada. `_drafts` no choca con
// un id porque los ids empiezan con letra o número.
export const CATALOG_SUBDIRECTORY = '_catalog'
export const CATALOG_FILE = 'catalog.json'
export const CATALOG_DRAFTS_SUBDIRECTORY = '_drafts'

/**
 * Una entrada de catalog.json: la gema sin rutas ni muestras, con la tanda de
 * la que salen (`samplesRevision`: 0 = las que trae la app; ≥ 1 =
 * `<id>/s<revision>/`). `sampleCount` es el de esa tanda, o el de la gema
 * empaquetada del mismo id si es la 0.
 */
export interface StoredCatalogEntry extends Omit<CatalogGem, 'samples'> {
  samplesRevision: number
}

export interface StoredCatalog {
  version: string
  syncedAt: string
  entries: StoredCatalogEntry[]
}

/** La caché leída y validada, con la carpeta de la que se derivan las rutas. */
interface CatalogCache {
  root: string
  catalog: StoredCatalog
}

export function catalogRoot(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )
  return join(projectsRoot, CATALOG_SUBDIRECTORY)
}

export function catalogBatchDirectory(
  root: string,
  id: string,
  revision: number,
): string {
  return join(root, id, `s${revision}`)
}

export function catalogDraftDirectory(
  context: PipelineContext,
  id: string,
): string {
  return join(catalogRoot(context), CATALOG_DRAFTS_SUBDIRECTORY, id)
}

// null = no hay caché que usar: el job no trae carpeta raíz, nunca se
// sincronizó, o catalog.json está roto o no pasa la validación. Un archivo que
// existe y no sirve queda en el log de diagnóstico sin romper nada: quien
// lista cae a las gemas empaquetadas (Review Focus 1 del plan E3).
async function readCatalogCache(
  context: PipelineContext,
): Promise<CatalogCache | null> {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot) return null
  const root = join(projectsRoot, CATALOG_SUBDIRECTORY)

  let text: string
  try {
    text = await readTextWithRetry(join(root, CATALOG_FILE))
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT')
      warnUnusableCache(context, error)
    return null
  }

  try {
    return { root, catalog: assertStoredCatalog(JSON.parse(text)) }
  } catch (error) {
    warnUnusableCache(context, error)
    return null
  }
}

function warnUnusableCache(context: PipelineContext, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message: `the synced catalog is unusable (${reason}): the packaged one is used`,
  })
}

// catalog.json entero o nada: una entrada que no pasa invalida la caché.
function assertStoredCatalog(value: unknown): StoredCatalog {
  if (!isRecord(value)) throw invalidCache('catalog.json must be an object')
  const { version, syncedAt, entries } = value
  if (typeof version !== 'string' || !version)
    throw invalidCache('version must be a non-empty string')
  if (typeof syncedAt !== 'string')
    throw invalidCache('syncedAt must be a string')
  if (!Array.isArray(entries) || entries.length === 0)
    throw invalidCache('entries must be a non-empty list')

  const stored = entries.map((entry, index) =>
    assertStoredEntry(entry, `entries[${index}]`),
  )
  const ids = stored.map((entry) => entry.id)
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index)
  if (repeated !== undefined)
    throw invalidCache(`entries repeat the style ${repeated}`)
  return { version, syncedAt, entries: stored }
}

// Cada entrada se vuelve a validar como una gema del catálogo remoto (las
// mismas reglas que al sincronizar) más su tanda: lo que lee la app sale de
// acá, aunque el archivo lo haya tocado otro.
function assertStoredEntry(value: unknown, field: string): StoredCatalogEntry {
  if (!isRecord(value)) throw invalidCache(`${field} must be an object`)
  const gem = assertCatalogGemFields(value.id, value, field)
  if (!isCatalogSampleCount(value.sampleCount))
    throw invalidCache(`${field}.sampleCount is not a sample count`)
  if (!isSamplesRevision(value.samplesRevision))
    throw invalidCache(`${field}.samplesRevision is not a samples revision`)
  return {
    ...gem,
    sampleCount: value.sampleCount,
    samplesRevision: value.samplesRevision,
  }
}

function invalidCache(message: string): PipelineFailure {
  return new PipelineFailure('catalog_sync_failed', message)
}

// ─── Lo que ve la app ───

// Las gemas como las lista la app: una tanda ≥ 1 trae sus muestras del disco
// (rutas absolutas derivadas al listar, con mtimeMs, como la galería de Mi
// estilo); la revisión 0 usa las de la app y no lleva `samples`.
export function catalogGemsOf(
  root: string,
  entries: StoredCatalogEntry[],
): Promise<CatalogGem[]> {
  return Promise.all(entries.map((entry) => catalogGemOf(root, entry)))
}

async function catalogGemOf(
  root: string,
  entry: StoredCatalogEntry,
): Promise<CatalogGem> {
  const { samplesRevision, ...gem } = entry
  if (samplesRevision === 0) return gem

  const directory = catalogBatchDirectory(root, entry.id, samplesRevision)
  return { ...gem, samples: await batchSamples(directory, entry.sampleCount) }
}

// Solo las muestras que declara la tanda: un archivo ajeno o un número de más
// no se lista.
async function batchSamples(
  directory: string,
  count: number,
): Promise<StyleSample[]> {
  const samples = await readStyleSamples(directory)
  return samples.filter((sample) => {
    const number = catalogSampleNumber(sample.file)
    return number !== undefined && number <= count
  })
}

/** El catálogo sincronizado como lo lista la app; null = no hay caché usable. */
export async function listSyncedCatalog(
  context: PipelineContext,
): Promise<CatalogListResult | null> {
  const cache = await readCatalogCache(context)
  if (!cache) return null
  return {
    entries: await catalogGemsOf(cache.root, cache.catalog.entries),
    version: cache.catalog.version,
  }
}

// Una gema del catálogo por su id (ADR-0049). Con `remote`, primero la del
// catálogo sincronizado, que es la publicada más reciente que vio este
// equipo, y si no está, la empaquetada; sin carpeta raíz o sin caché usable,
// solo las empaquetadas. Sin `remote` (el interruptor `remoteCatalog` apagado
// para esta persona, aunque haya sincronizado antes), solo las empaquetadas:
// con el interruptor apagado nada cambia.
export async function resolveCatalogGem(
  context: PipelineContext,
  id: string,
  remote: boolean,
): Promise<CatalogGem | undefined> {
  if (!remote) return findCatalogGem(id)
  const cache = await readCatalogCache(context)
  const entry = cache?.catalog.entries.find((candidate) => candidate.id === id)
  if (cache && entry) return catalogGemOf(cache.root, entry)
  return findCatalogGem(id)
}

// Las muestras sincronizadas de una gema, para la copia de «Pasar a mi
// estilo». Una que ya no está o que no es un JPEG de hasta 4 MiB se salta,
// como la que la app no pudo bajar: las demás conservan su número.
export async function readCatalogSampleBytes(
  samples: StyleSample[],
): Promise<SampleUploadBytes[]> {
  const read = await Promise.all(
    samples.map(async (sample) => {
      try {
        const bytes = await readFile(sample.path)
        if (!isCatalogSampleBytes(bytes)) return []
        return [{ file: sample.file, bytes }]
      } catch {
        return []
      }
    }),
  )
  return read.flat()
}
