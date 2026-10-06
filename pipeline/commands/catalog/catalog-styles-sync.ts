import { randomUUID } from 'node:crypto'
import { open, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { findCatalogGem } from '../../prompts/catalog-gems/catalog.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CatalogSyncResult } from '../../types/catalog.ts'
import {
  ensureDirectory,
  renameAtomic,
  writeFileAtomic,
} from '../../utils/atomic-fs.ts'
import {
  CATALOG_FILE,
  CATALOG_SUBDIRECTORY,
  catalogBatchDirectory,
  catalogGemsOf,
  catalogRoot,
  type StoredCatalog,
  type StoredCatalogEntry,
} from './catalog-cache.ts'
import {
  JPEG_SIGNATURE_LENGTH,
  MAX_CATALOG_SAMPLE_BYTES,
  assertCatalogGemFields,
  assertHttpsOrigin,
  failureReason,
  isCatalogEntryId,
  isCatalogSampleBytes,
  isCatalogSampleCount,
  isRecord,
  isSamplesRevision,
  parseUrl,
} from './catalog-store.ts'

// `catalog-styles-sync` (ADR-0049, plan E3 §5.4 y Review Focus 2): deja en
// `_catalog/` el catálogo publicado que la app le pidió a vimo.click. En este
// orden:
//
//  1. Valida TODO el payload antes de tocar el disco: el sobre que arma la
//     app (`invalid_payload`) y el contenido de cada estilo con las reglas del
//     servidor (`catalog_sync_failed`, como un catálogo vacío o unas muestras
//     que no son del origen permitido).
//  2. Baja, de a una, las muestras publicadas que faltan (tanda ≥ 1): un JPEG
//     de hasta 4 MiB, solo desde `samplesOrigin` y sin seguir redirecciones,
//     a una ruta temporal propia que se renombra al terminar. Una que falla
//     corta la corrida con `catalog_sync_failed`: el catalog.json anterior
//     queda intacto y lo ya bajado sirve a la corrida siguiente.
//  3. Escribe catalog.json al final y de forma atómica.
//  4. Recién entonces borra las tandas que ya no son la vigente y las carpetas
//     de los estilos que ya no están publicados. Nunca toca `_drafts/`.
//
// El resultado es la lista del catálogo sincronizado, como la devuelve
// `catalog-styles-list` con `remote`, más los archivos bajados.

// Por archivo (hasta 4 MiB): generoso para una conexión lenta.
const SAMPLE_DOWNLOAD_TIMEOUT_MS = 120_000
const FAILURE_PROVIDER = 'supabase'
const BATCH_DIRECTORY_PATTERN = /^s\d+$/
const TRAILING_SLASHES_REGEX = /\/+$/

/** Una muestra publicada que la corrida tiene que tener en disco. */
interface PublishedSample {
  id: string
  revision: number
  file: string
  url: string
}

/** El payload ya validado: lo que la corrida escribe y lo que baja. */
interface CatalogSyncPlan {
  version: string
  entries: StoredCatalogEntry[]
  samples: PublishedSample[]
}

export async function catalogStylesSync(
  context: PipelineContext,
): Promise<CatalogSyncResult> {
  const plan = assertCatalogSyncPayload(context.job.payload)
  const root = catalogRoot(context)

  let downloaded = 0
  for (const sample of plan.samples) {
    const destination = join(
      catalogBatchDirectory(root, sample.id, sample.revision),
      sample.file,
    )
    if (await isUsableSample(destination)) continue
    await downloadSample(sample, destination, context.signal)
    downloaded++
  }
  // Un job cancelado no cambia el catálogo.
  context.signal.throwIfAborted()

  const stored: StoredCatalog = {
    version: plan.version,
    syncedAt: new Date().toISOString(),
    entries: plan.entries,
  }
  await ensureDirectory(root)
  await writeFileAtomic(
    join(root, CATALOG_FILE),
    `${JSON.stringify(stored, null, 2)}\n`,
  )
  await removeStaleFolders(context, root, plan.entries)

  return {
    entries: await catalogGemsOf(root, plan.entries),
    version: plan.version,
    downloaded,
  }
}

// ─── 1. El payload ───

function invalidPayload(message: string): PipelineFailure {
  return new PipelineFailure('invalid_payload', message)
}

function syncFailure(message: string): PipelineFailure {
  return new PipelineFailure('catalog_sync_failed', message)
}

// Una descarga fallida queda en el log de diagnóstico como un fallo del
// bucket, con el status si hubo respuesta (ADR-0038).
function downloadFailure(
  message: string,
  httpStatus?: number,
): PipelineFailure {
  return new PipelineFailure('catalog_sync_failed', message, {
    provider: FAILURE_PROVIDER,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  })
}

function assertCatalogSyncPayload(value: unknown): CatalogSyncPlan {
  if (!isRecord(value)) throw invalidPayload('payload must be an object')
  const samplesOrigin = assertHttpsOrigin(
    value.samplesOrigin,
    'payload.samplesOrigin',
  )
  const manifest = value.manifest
  if (!isRecord(manifest))
    throw invalidPayload('payload.manifest must be an object')
  const { version, samplesBaseUrl, styles } = manifest
  if (typeof version !== 'string' || !version)
    throw invalidPayload('payload.manifest.version must be a non-empty string')
  if (typeof samplesBaseUrl !== 'string')
    throw invalidPayload('payload.manifest.samplesBaseUrl must be a string')
  if (!Array.isArray(styles))
    throw invalidPayload('payload.manifest.styles must be a list')
  const published = styles.map((style, index) => {
    if (!isRecord(style))
      throw invalidPayload(
        `payload.manifest.styles[${index}] must be an object`,
      )
    return style
  })

  // Desde acá, el contenido del catálogo: lo publicó el servidor.
  const base = samplesBase(samplesBaseUrl, samplesOrigin)
  if (published.length === 0)
    throw syncFailure('the manifest has no published style')
  const entries = published.map((style, index) =>
    syncedEntry(style, `payload.manifest.styles[${index}]`),
  )
  const ids = entries.map((entry) => entry.id)
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index)
  if (repeated !== undefined)
    throw syncFailure(`the manifest repeats the style ${repeated}`)

  return {
    version,
    entries,
    samples: entries.flatMap((entry) => publishedSamples(entry, base)),
  }
}

// La URL base de las muestras, sin barras al final, solo si es del origen
// permitido; sin consulta, fragmento ni credenciales, que romperían las rutas
// que se le pegan.
function samplesBase(samplesBaseUrl: string, samplesOrigin: string): string {
  const url = parseUrl(samplesBaseUrl)
  if (
    !url ||
    url.origin !== samplesOrigin ||
    /[?#]/.test(samplesBaseUrl) ||
    url.username ||
    url.password
  )
    throw syncFailure(
      `payload.manifest.samplesBaseUrl is not a plain URL on ${samplesOrigin}`,
    )
  return `${url.origin}${url.pathname.replace(TRAILING_SLASHES_REGEX, '')}`
}

// Un estilo publicado como entrada de catalog.json: los campos de la gema con
// las reglas de la sección 5.2 del plan E3 y su tanda. La revisión 0 son las
// muestras que trae la app: cuenta las de la gema empaquetada del mismo id,
// o ninguna si es un id nuevo.
function syncedEntry(
  style: Record<string, unknown>,
  field: string,
): StoredCatalogEntry {
  if (!isCatalogEntryId(style.id))
    throw syncFailure(`${field}.id is not a valid catalog style id`)
  if (!Number.isInteger(style.position))
    throw syncFailure(`${field}.position must be an integer`)
  if (!Number.isInteger(style.version))
    throw syncFailure(`${field}.version must be an integer`)

  const content = style.content
  const gem = assertCatalogGemFields(style.id, content, `${field}.content`)
  const batch = isRecord(content) ? content.samples : undefined
  if (
    !isRecord(batch) ||
    !isSamplesRevision(batch.revision) ||
    !isCatalogSampleCount(batch.count)
  )
    throw syncFailure(
      `${field}.content.samples must be { revision, count } with a count of at most 4`,
    )

  const sampleCount =
    batch.revision === 0
      ? (findCatalogGem(gem.id)?.sampleCount ?? 0)
      : batch.count
  return { ...gem, sampleCount, samplesRevision: batch.revision }
}

function publishedSamples(
  entry: StoredCatalogEntry,
  base: string,
): PublishedSample[] {
  if (entry.samplesRevision === 0) return []
  return Array.from({ length: entry.sampleCount }, (_, index) => {
    const file = `sample-${index + 1}.jpg`
    return {
      id: entry.id,
      revision: entry.samplesRevision,
      file,
      url: `${base}/${entry.id}/s${entry.samplesRevision}/${file}`,
    }
  })
}

// ─── 2. Las muestras ───

// Una muestra ya bajada que sirve: un archivo de hasta 4 MiB que empieza como
// un JPEG. Lo demás (no está, quedó vacía, es otra cosa) se vuelve a bajar.
async function isUsableSample(path: string): Promise<boolean> {
  let handle
  try {
    handle = await open(path, 'r')
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_CATALOG_SAMPLE_BYTES) return false
    const header = Buffer.alloc(JPEG_SIGNATURE_LENGTH)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    return isCatalogSampleBytes(header.subarray(0, bytesRead))
  } catch {
    return false
  } finally {
    await handle?.close()
  }
}

// Una muestra publicada, con la cancelación del job por encima de todo (sale
// tal cual, nunca como `catalog_sync_failed`). Se escribe en una ruta temporal
// propia y se renombra entera: con el nombre final solo queda una muestra
// completa, aunque dos corridas bajen la misma.
async function downloadSample(
  sample: PublishedSample,
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  const label = `${sample.id}/s${sample.revision}/${sample.file}`
  const requestSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(SAMPLE_DOWNLOAD_TIMEOUT_MS),
  ])

  let response: Response
  try {
    response = await fetch(sample.url, {
      signal: requestSignal,
      redirect: 'error',
    })
  } catch (error) {
    signal.throwIfAborted()
    throw downloadFailure(
      `${label}: the download failed (${failureReason(error)})`,
    )
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    throw downloadFailure(
      `${label}: the bucket answered ${response.status}`,
      response.status,
    )
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (declaredLength > MAX_CATALOG_SAMPLE_BYTES) {
    await response.body.cancel().catch(() => undefined)
    throw downloadFailure(
      `${label}: declares ${declaredLength} bytes, over ${MAX_CATALOG_SAMPLE_BYTES}`,
    )
  }

  const bytes = await readCappedBody(response.body, label, signal)
  if (!isCatalogSampleBytes(bytes))
    throw downloadFailure(`${label}: the sample is not a JPEG`)

  await ensureDirectory(dirname(destination))
  const temporary = `${destination}.${randomUUID()}.download`
  try {
    await writeFile(temporary, bytes)
    await renameAtomic(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

// El cuerpo, con el tope mientras se lee: apenas pasa los 4 MiB se corta la
// descarga en vez de seguir bajando. Un corte de la conexión a mitad es una
// descarga fallida; la cancelación sale tal cual.
async function readCappedBody(
  body: ReadableStream<Uint8Array>,
  label: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks)
      received += value.length
      if (received > MAX_CATALOG_SAMPLE_BYTES)
        throw downloadFailure(
          `${label}: the sample exceeds ${MAX_CATALOG_SAMPLE_BYTES} bytes`,
        )
      chunks.push(value)
    }
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof PipelineFailure) throw error
    throw downloadFailure(
      `${label}: the download was cut after ${received} bytes (${failureReason(error)})`,
    )
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

// ─── 4. La limpieza ───

// Después de escribir catalog.json: las carpetas de los estilos que ya no
// están publicados (o que volvieron a las muestras de la app) y, en los que
// siguen, las tandas que no son la vigente. Solo carpetas con nombre de
// estilo o de tanda: `_drafts/` y lo ajeno no se tocan. Un fallo acá no
// deshace la sincronización: queda en el log y lo repite la corrida siguiente.
async function removeStaleFolders(
  context: PipelineContext,
  root: string,
  entries: StoredCatalogEntry[],
): Promise<void> {
  const current = new Map(
    entries.map((entry) => [entry.id, entry.samplesRevision]),
  )
  for (const folder of await directoriesIn(root)) {
    if (!isCatalogEntryId(folder)) continue
    const revision = current.get(folder) ?? 0
    if (revision === 0) {
      await removeQuietly(context, root, [folder])
      continue
    }

    for (const batch of await directoriesIn(join(root, folder))) {
      if (!BATCH_DIRECTORY_PATTERN.test(batch)) continue
      if (batch === `s${revision}`) continue
      await removeQuietly(context, root, [folder, batch])
    }
  }
}

async function directoriesIn(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

async function removeQuietly(
  context: PipelineContext,
  root: string,
  segments: string[],
): Promise<void> {
  try {
    await rm(join(root, ...segments), { recursive: true, force: true })
  } catch (error) {
    // Sin la ruta absoluta: el log de diagnóstico no lleva rutas del usuario.
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `could not remove ${CATALOG_SUBDIRECTORY}/${segments.join('/')} (${failureReason(error)}): the next sync retries`,
    })
  }
}
