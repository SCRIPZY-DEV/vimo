import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CatalogDraftSamplesUploadResult,
  CatalogSampleUploadTarget,
} from '../../types/catalog.ts'
import { catalogDraftDirectory } from './catalog-cache.ts'
import {
  CATALOG_SAMPLE_COUNT,
  MAX_CATALOG_SAMPLE_BYTES,
  assertHttpsOrigin,
  failureReason,
  isCatalogEntryId,
  isCatalogSampleBytes,
  isCatalogSampleFile,
  isRecord,
  parseUrl,
} from './catalog-store.ts'

// `catalog-style-samples-upload` (ADR-0049, plan E3 §5.4): sube las muestras
// que el admin generó para un borrador (`_catalog/_drafts/<id>/`) a la tanda
// que el servidor le reservó en el bucket, con las URLs firmadas que pidió la
// app. Todo se valida antes del primer `PUT`: el payload (cada archivo es una
// muestra `sample-<n>.jpg`, n = 1..4, y cada URL es https y exactamente del
// origen permitido) y los archivos (existen y son JPEG de hasta 4 MiB: una
// muestra que no lo es dejaría sin sincronizar a todos los usuarios). Después
// sube de a uno, en el orden del payload, con `content-type: image/jpeg`; un
// error de red o una respuesta que no es 2xx es `catalog_upload_failed` con el
// archivo y corta la corrida. Sin reintentos: una URL firmada sirve una sola
// vez (el bucket responde que el objeto ya existe), y volver a subir es pedir
// una tanda nueva desde la app.

// Por archivo (hasta 4 MiB): generoso para una conexión lenta.
const SAMPLE_UPLOAD_TIMEOUT_MS = 120_000
const FAILURE_PROVIDER = 'supabase'
// Cuánto del cuerpo de un rechazo viaja en el mensaje de diagnóstico.
const ERROR_BODY_MESSAGE_CHARS = 200

/** Una muestra del borrador lista para subir. */
interface DraftSampleUpload extends CatalogSampleUploadTarget {
  bytes: Buffer
}

export async function catalogStyleSamplesUpload(
  context: PipelineContext,
): Promise<CatalogDraftSamplesUploadResult> {
  const { catalogStyleId, uploads } = assertUploadPayload(context.job.payload)
  const directory = catalogDraftDirectory(context, catalogStyleId)

  const ready: DraftSampleUpload[] = []
  for (const upload of uploads)
    ready.push({ ...upload, bytes: await readDraftSample(directory, upload) })

  let uploaded = 0
  for (const sample of ready) {
    context.signal.throwIfAborted()
    await putSample(sample, context.signal)
    uploaded++
  }
  return { uploaded }
}

function invalidPayload(message: string): PipelineFailure {
  return new PipelineFailure('invalid_payload', message)
}

function uploadFailure(message: string, httpStatus?: number): PipelineFailure {
  return new PipelineFailure('catalog_upload_failed', message, {
    provider: FAILURE_PROVIDER,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  })
}

function assertUploadPayload(value: unknown): {
  catalogStyleId: string
  uploads: CatalogSampleUploadTarget[]
} {
  if (!isRecord(value)) throw invalidPayload('payload must be an object')
  if (!isCatalogEntryId(value.catalogStyleId))
    throw invalidPayload(
      'payload.catalogStyleId is not a valid catalog style id',
    )
  const uploadOrigin = assertHttpsOrigin(
    value.uploadOrigin,
    'payload.uploadOrigin',
  )

  const list = value.uploads
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.length > CATALOG_SAMPLE_COUNT
  )
    throw invalidPayload(
      `payload.uploads must list 1 to ${CATALOG_SAMPLE_COUNT} samples`,
    )
  const uploads = list.map((upload, index) =>
    assertUploadTarget(upload, `payload.uploads[${index}]`, uploadOrigin),
  )
  const files = uploads.map((upload) => upload.file)
  const repeated = files.find((file, index) => files.indexOf(file) !== index)
  if (repeated) throw invalidPayload(`payload.uploads repeats ${repeated}`)
  return { catalogStyleId: value.catalogStyleId, uploads }
}

// Una subida firmada: la URL se compara por su origen ya parseado (nunca como
// texto) y sin credenciales.
function assertUploadTarget(
  value: unknown,
  field: string,
  uploadOrigin: string,
): CatalogSampleUploadTarget {
  if (!isRecord(value)) throw invalidPayload(`${field} must be an object`)
  if (!isCatalogSampleFile(value.file))
    throw invalidPayload(
      `${field}.file must be one of sample-1.jpg to sample-${CATALOG_SAMPLE_COUNT}.jpg`,
    )
  const url = typeof value.url === 'string' ? parseUrl(value.url) : undefined
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.origin !== uploadOrigin ||
    url.username ||
    url.password
  )
    throw invalidPayload(`${field}.url must be an https URL on ${uploadOrigin}`)
  return { file: value.file, url: url.href }
}

// El archivo del borrador tal como va a subir: tiene que existir y ser un JPEG
// de hasta 4 MiB (el tamaño se mira antes de leerlo).
async function readDraftSample(
  directory: string,
  upload: CatalogSampleUploadTarget,
): Promise<Buffer> {
  const path = join(directory, upload.file)
  let bytes: Buffer
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_CATALOG_SAMPLE_BYTES)
      throw uploadFailure(
        `the draft sample ${upload.file} is not a file of at most ${MAX_CATALOG_SAMPLE_BYTES} bytes`,
      )
    bytes = await readFile(path)
  } catch (error) {
    if (error instanceof PipelineFailure) throw error
    throw uploadFailure(
      `the draft sample ${upload.file} cannot be read (${failureReason(error)})`,
    )
  }
  if (!isCatalogSampleBytes(bytes))
    throw uploadFailure(
      `the draft sample ${upload.file} is not a JPEG of at most ${MAX_CATALOG_SAMPLE_BYTES} bytes`,
    )
  return bytes
}

// Un `PUT` sin seguir redirecciones (el cuerpo iría a otro lado) y con la
// cancelación del job por encima de todo: sale tal cual, nunca como
// `catalog_upload_failed`.
async function putSample(
  sample: DraftSampleUpload,
  signal: AbortSignal,
): Promise<void> {
  const requestSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(SAMPLE_UPLOAD_TIMEOUT_MS),
  ])

  let response: Response
  try {
    response = await fetch(sample.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: sample.bytes,
      signal: requestSignal,
      redirect: 'error',
    })
  } catch (error) {
    signal.throwIfAborted()
    throw uploadFailure(
      `${sample.file}: the upload failed (${failureReason(error)})`,
    )
  }

  // El cuerpo se lee aparte: un corte ahí no es un error sin clasificar.
  const answer = await response.text().catch(() => '')
  signal.throwIfAborted()
  if (response.ok) return
  throw uploadFailure(
    `${sample.file}: the storage answered ${response.status} ${answer.slice(0, ERROR_BODY_MESSAGE_CHARS)}`.trim(),
    response.status,
  )
}
