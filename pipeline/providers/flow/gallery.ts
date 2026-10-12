import { createHash } from 'node:crypto'
import { lstat, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const SCOPE_DIRECTORY = /^[a-f0-9]{64}$/
const BATCH_ID = /^[a-f0-9-]{36}$/i
const MAX_RECEIPT_BYTES = 32 * 1024 * 1024

interface GalleryItem {
  imageJobId: string
  sourceKey: string
}
interface GalleryBatch {
  batchId: string
  kind: 'video' | 'style' | 'character' | 'images'
  title: string | null
  items: GalleryItem[]
}
function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function receiptAt(path: string): Promise<unknown> {
  const info = await lstat(path)
  if (!info.isFile() || info.size > MAX_RECEIPT_BYTES) return null
  const handle = await open(path, 'r')
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      opened.ino !== info.ino ||
      opened.dev !== info.dev ||
      opened.size > MAX_RECEIPT_BYTES
    )
      return null
    const bytes = await handle.readFile()
    if (bytes.length > MAX_RECEIPT_BYTES) return null
    return JSON.parse(bytes.toString('utf8'))
  } finally {
    await handle.close()
  }
}

function presentation(
  receipt: Record<string, unknown>,
  batchId: string,
  scope: string,
): GalleryBatch {
  const items: GalleryItem[] = []
  if (Array.isArray(receipt.requests)) {
    for (const request of receipt.requests) {
      if (
        !objectRecord(request) ||
        typeof request.imageJobId !== 'string' ||
        typeof request.key !== 'string'
      )
        continue
      items.push({
        imageJobId: request.imageJobId,
        sourceKey: request.key.slice(0, 160),
      })
    }
  }
  // Sólo derivamos un nombre del scope; nunca abrimos rutas de proyectos
  // recibidas de la UI ni devolvemos destinos, referencias o credenciales.
  if (scope.startsWith('scenes:')) {
    return {
      batchId,
      kind: 'video',
      title:
        scope
          .slice('scenes:'.length)
          .split(/[\\/]/)
          .filter(Boolean)
          .at(-1)
          ?.slice(0, 160) ?? null,
      items,
    }
  }
  if (scope.startsWith('style-samples:'))
    return { batchId, kind: 'style', title: null, items }
  if (scope.startsWith('character-preview:'))
    return { batchId, kind: 'character', title: null, items }
  return { batchId, kind: 'images', title: null, items }
}

export async function readFlowGallery(dataDir: string, batchIds: string[]) {
  const wanted = new Set(batchIds.filter((id) => BATCH_ID.test(id)))
  const batches: GalleryBatch[] = []
  if (!wanted.size) return { batches }
  const root = join(dataDir, 'vimo-intents')
  let directories
  try {
    directories = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { batches }
    throw new Error('flow_gallery_unavailable', { cause: error })
  }
  for (const directory of directories) {
    if (!directory.isDirectory() || !SCOPE_DIRECTORY.test(directory.name))
      continue
    const folder = join(root, directory.name)
    const files = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue
      const batchId = file.name.slice(0, -5)
      if (!wanted.has(batchId)) continue
      try {
        const receipt = await receiptAt(join(folder, file.name))
        if (
          !objectRecord(receipt) ||
          receipt.version !== 1 ||
          receipt.batchId !== batchId ||
          typeof receipt.scope !== 'string'
        )
          continue
        if (
          createHash('sha256').update(receipt.scope).digest('hex') !==
          directory.name
        )
          continue
        batches.push(presentation(receipt, batchId, receipt.scope))
        wanted.delete(batchId)
      } catch {
        // Un recibo antiguo o corrupto no impide consultar ni recuperar imágenes.
        // La UI conserva fecha, cantidad e identificador corto como alternativa.
      }
    }
    if (!wanted.size) break
  }
  return { batches }
}
