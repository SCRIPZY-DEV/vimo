import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import type { ImageExtension } from '../../types/image-provider.ts'
import type { DecodedImage } from '../../types/images.ts'

// Validación y descarga de imágenes (port de descarga_imagen.ts + el decode de
// data URIs del origen). Regla que sostiene todo: un fallo de DESCARGA jamás
// crea trabajo nuevo en el proveedor — se reintenta la MISMA URL.
const DOWNLOAD_TIMEOUT_MS = 60_000
const DOWNLOAD_ATTEMPTS = 3
const DOWNLOAD_BACKOFF_MS = 1500

const DATA_URI_PATTERN = /^data:[^;,]+;base64,(.+)$/s

function extensionFromMagicBytes(bytes: Buffer): ImageExtension | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'png'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'webp'

  return null
}

function mimeFor(ext: ImageExtension): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/** Valida por magic bytes que el buffer sea una imagen que sabemos servir. */
export function validateImageBytes(bytes: Buffer): DecodedImage | null {
  const ext = extensionFromMagicBytes(bytes)
  if (!ext) return null

  return { bytes, ext, mime: mimeFor(ext) }
}

export function toDataUri(image: DecodedImage): string {
  return `data:${image.mime};base64,${image.bytes.toString('base64')}`
}

/**
 * Decodifica un data URI a bytes validados. Devuelve null ante cualquier
 * problema (formato, tamaño, contenido) — el caller decide si es error o si
 * simplemente ignora ese preview.
 */
export function decodeImageDataUri(
  dataUri: string,
  maxBytes: number,
): DecodedImage | null {
  const match = DATA_URI_PATTERN.exec(dataUri.trim())
  if (!match) return null

  let bytes: Buffer
  try {
    bytes = Buffer.from(match[1], 'base64')
  } catch {
    return null
  }
  if (!bytes.length || bytes.length > maxBytes) return null

  return validateImageBytes(bytes)
}

function requestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

// Una cancelación pedida debe salir como tal, no como error de red.
function rethrowIfCancelled(signal: AbortSignal | undefined, error: unknown) {
  if (signal?.aborted) throw error
}

/**
 * Descarga una imagen ya generada. Reintenta la MISMA URL: la imagen ya se
 * pagó, así que un problema de transporte nunca debe provocar un encargo nuevo
 * al proveedor (port de descargarConReintentos del origen).
 */
export async function downloadImage(
  url: string,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    if (attempt > 1)
      await delay(DOWNLOAD_BACKOFF_MS * attempt, undefined, { signal })

    let response: Response
    try {
      response = await fetch(url, {
        signal: requestSignal(DOWNLOAD_TIMEOUT_MS, signal),
      })
    } catch (error) {
      rethrowIfCancelled(signal, error)
      lastReason = 'network'
      continue
    }

    if (!response.ok) {
      lastReason = `status=${response.status}`
      continue
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      lastReason = `content-type=${contentType}`
      continue
    }

    const image = validateImageBytes(Buffer.from(await response.arrayBuffer()))
    if (!image) {
      lastReason = 'magic bytes did not match a known image format'
      continue
    }

    return image
  }

  throw new PipelineFailure(
    'image_download_failed',
    `image download failed after ${DOWNLOAD_ATTEMPTS} attempts (${lastReason})`,
  )
}
