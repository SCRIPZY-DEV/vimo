import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { writePrivateFile } from './storage.js'

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export function assertImageUrl(value, mediaId) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('image_url_invalid')
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'flow-content.google' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('image_url_not_allowed')
  }
  if (
    mediaId !== undefined &&
    (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      mediaId,
    ) ||
      url.pathname.toLowerCase() !== `/image/${mediaId.toLowerCase()}` ||
      !/^\d{9,12}$/.test(url.searchParams.get('Expires') ?? '') ||
      !url.searchParams.get('Signature') ||
      !url.searchParams.get('KeyName') ||
      ['Expires', 'Signature', 'KeyName'].some(
        (name) => url.searchParams.getAll(name).length !== 1,
      ))
  ) {
    throw new Error('image_media_mismatch')
  }
  return url.href
}

export function imageFormat(bytes) {
  if (bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES)
    throw new Error('image_bytes_invalid')
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    validatePng(bytes)
    return { extension: 'png', mimeType: 'image/png' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    validateJpeg(bytes)
    return { extension: 'jpg', mimeType: 'image/jpeg' }
  }
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    validateWebp(bytes)
    return { extension: 'webp', mimeType: 'image/webp' }
  }
  throw new Error('image_bytes_invalid')
}

const invalidImage = () => {
  throw new Error('image_bytes_invalid')
}
const validDimensions = (width, height) =>
  width > 0 &&
  height > 0 &&
  width <= 32768 &&
  height <= 32768 &&
  width * height <= 100_000_000
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes, start, end) {
  let crc = 0xffffffff
  for (let i = start; i < end; i++)
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// Validate the container before committing a receipt as a usable local image.
// This does not replace pixel decoding in the UI, which has its own recovery path.
function validatePng(bytes) {
  let offset = 8,
    dataBytes = 0,
    seenHeader = false
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length
    if (end > bytes.length) invalidImage()
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (
      !/^[a-zA-Z]{4}$/.test(type) ||
      crc32(bytes, offset + 4, end - 4) !== bytes.readUInt32BE(end - 4)
    )
      invalidImage()
    if (!seenHeader && type !== 'IHDR') invalidImage()
    if (type === 'IHDR') {
      if (
        seenHeader ||
        length !== 13 ||
        !validDimensions(
          bytes.readUInt32BE(offset + 8),
          bytes.readUInt32BE(offset + 12),
        )
      )
        invalidImage()
      const depths = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      }
      if (
        !depths[bytes[offset + 17]]?.includes(bytes[offset + 16]) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] > 1
      )
        invalidImage()
      seenHeader = true
    } else if (type === 'IDAT') dataBytes += length
    else if (type === 'IEND') {
      if (length !== 0 || dataBytes === 0 || end !== bytes.length)
        invalidImage()
      return
    }
    offset = end
  }
  invalidImage()
}

function validateJpeg(bytes) {
  let offset = 2,
    seenFrame = false,
    seenScan = false,
    entropy = false
  while (offset < bytes.length) {
    if (entropy) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset++
    }
    if (bytes[offset++] !== 0xff) invalidImage()
    while (bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) invalidImage()
    const marker = bytes[offset++]
    if (entropy && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)))
      continue
    entropy = false
    if (marker === 0xd9) {
      if (!seenFrame || !seenScan || offset !== bytes.length) invalidImage()
      return
    }
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7))
      invalidImage()
    if (marker === 0x01) continue
    if (offset + 2 > bytes.length) invalidImage()
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) invalidImage()
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (
        length < 8 ||
        !validDimensions(
          bytes.readUInt16BE(offset + 5),
          bytes.readUInt16BE(offset + 3),
        ) ||
        !bytes[offset + 7] ||
        length !== 8 + 3 * bytes[offset + 7]
      )
        invalidImage()
      seenFrame = true
    }
    if (marker === 0xda) {
      if (
        !seenFrame ||
        length < 6 ||
        !bytes[offset + 2] ||
        length !== 6 + 2 * bytes[offset + 2]
      )
        invalidImage()
      seenScan = true
      entropy = true
    }
    offset += length
  }
  invalidImage()
}

function validateWebp(bytes, frameOnly = false) {
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) invalidImage()
  let offset = 12,
    seenImage = false,
    animated = false
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4),
      length = bytes.readUInt32LE(offset + 4)
    const start = offset + 8,
      end = start + length
    if (end + (length & 1) > bytes.length) invalidImage()
    if (type === 'VP8 ') {
      if (
        length < 10 ||
        bytes[start] & 1 ||
        bytes.toString('hex', start + 3, start + 6) !== '9d012a' ||
        !validDimensions(
          bytes.readUInt16LE(start + 6) & 0x3fff,
          bytes.readUInt16LE(start + 8) & 0x3fff,
        )
      )
        invalidImage()
      seenImage = true
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[start] !== 0x2f || bytes[start + 4] >>> 5)
        invalidImage()
      const bits = bytes.readUInt32LE(start + 1)
      if (!validDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1))
        invalidImage()
      seenImage = true
    } else if (type === 'VP8X') {
      if (
        frameOnly ||
        length !== 10 ||
        !validDimensions(
          bytes.readUIntLE(start + 4, 3) + 1,
          bytes.readUIntLE(start + 7, 3) + 1,
        )
      )
        invalidImage()
      animated = Boolean(bytes[start] & 2)
    } else if (type === 'ANMF') {
      if (
        frameOnly ||
        !animated ||
        length < 24 ||
        !validDimensions(
          bytes.readUIntLE(start + 6, 3) + 1,
          bytes.readUIntLE(start + 9, 3) + 1,
        )
      )
        invalidImage()
      const frame = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WEBP'),
        bytes.subarray(start + 16, end),
      ])
      frame.writeUInt32LE(frame.length - 8, 4)
      validateWebp(frame, true)
      seenImage = true
    }
    offset = end + (length & 1)
  }
  if (offset !== bytes.length || !seenImage) invalidImage()
}

// La URL firmada es una capacidad temporal. Nunca agregar cookies, Authorization ni registrar la URL.
export async function downloadImage({
  imageJobId,
  imageUrl,
  mediaId,
  directory,
  fetchImpl = fetch,
}) {
  if (
    typeof imageJobId !== 'string' ||
    !/^(?!__proto__$|constructor$|prototype$)[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(
      imageJobId,
    )
  )
    throw new Error('job_id_invalid')
  let url = assertImageUrl(imageUrl, mediaId)
  const signal = AbortSignal.timeout(60_000)
  let response
  for (let redirect = 0; redirect <= 3; redirect++) {
    response = await fetchImpl(url, {
      redirect: 'manual',
      credentials: 'omit',
      signal,
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirect === 3) throw new Error('image_redirect_invalid')
    url = assertImageUrl(new URL(location, url).href, mediaId)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      response.status === 403
        ? 'image_url_expired_or_denied'
        : 'image_download_http_error',
    )
  }
  if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) {
    await response.body?.cancel()
    throw new Error('image_too_large')
  }
  if (!response.body) throw new Error('image_body_missing')
  const chunks = []
  let total = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) throw new Error('image_too_large')
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  const format = imageFormat(bytes)
  const declared = response.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase()
  if (declared !== format.mimeType)
    throw new Error('image_content_type_mismatch')
  const path = join(directory, 'results', `${imageJobId}.${format.extension}`)
  await writePrivateFile(path, bytes)
  return {
    imagePath: path,
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...format,
  }
}
