import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../runner/failure.ts'
import { ensureDirectory, writeFileAtomic } from '../utils/atomic-fs.ts'

// Descarga del clip ya generado. Misma regla que las imágenes: la tarea YA
// está completa y cobrada, así que un fallo acá reintenta la MISMA URL y
// jamás crea otra tarea. Las URLs de los dos proveedores expiran a las 24 h:
// se descarga apenas termina.
const DOWNLOAD_TIMEOUT_MS = 180_000
const DOWNLOAD_ATTEMPTS = 3
const DOWNLOAD_BACKOFF_MS = 2000
// Un clip de 6 s a 720p pesa unos pocos MB; el tope solo frena una respuesta
// absurda (una página HTML de error gigante, un archivo equivocado).
const MAX_CLIP_BYTES = 200 * 1024 * 1024

// Caja `ftyp` en el offset 4: la firma de todo MP4/MOV (ISO BMFF).
function looksLikeMp4(bytes: Buffer): boolean {
  return bytes.length > 12 && bytes.toString('latin1', 4, 8) === 'ftyp'
}

export async function saveClipToFile(
  url: string,
  clipPath: string,
  signal: AbortSignal,
): Promise<void> {
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    if (attempt > 1)
      await delay(DOWNLOAD_BACKOFF_MS * attempt, undefined, { signal })

    let bytes: Buffer
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        ]),
      })
      if (!response.ok) {
        lastReason = `status=${response.status}`
        continue
      }
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      // Una cancelación pedida sale como tal, no como error de red.
      if (signal.aborted) throw error
      lastReason = 'network'
      continue
    }

    if (bytes.length === 0 || bytes.length > MAX_CLIP_BYTES) {
      lastReason = `size=${bytes.length}`
      continue
    }
    if (!looksLikeMp4(bytes)) {
      lastReason = 'magic bytes did not match an mp4'
      continue
    }

    await ensureDirectory(dirname(clipPath))
    await writeFileAtomic(clipPath, bytes)
    return
  }

  throw new PipelineFailure(
    'animation_download_failed',
    `clip download failed after ${DOWNLOAD_ATTEMPTS} attempts (${lastReason})`,
  )
}
