// Piezas puras del material de una clonación de estilo (ADR-0050): qué video
// es, qué storyboard sirve, qué mosaicos se bajan y cuánto mide una imagen.
// Sin red ni disco: lo que baja y escribe vive en style-clone-prepare.

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
// Rutas de YouTube que llevan el id en el segundo tramo.
const VIDEO_PATH_PREFIXES = new Set(['shorts', 'live', 'embed', 'v'])

// El id del video de un link ya validado como de YouTube. null = el link no
// es de un video (un canal, una lista, la portada).
export function youtubeVideoIdOf(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const candidate =
    url.hostname.toLowerCase() === 'youtu.be'
      ? segments[0]
      : url.searchParams.get('v') ||
        (VIDEO_PATH_PREFIXES.has(segments[0]) ? segments[1] : undefined)
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null
}

// Hasta `count` posiciones de `total`, repartidas de punta a punta: así los
// mosaicos elegidos cubren todo el video y no solo su comienzo.
export function spreadIndexes(total: number, count: number): number[] {
  if (total <= 0 || count <= 0) return []
  if (total <= count) return Array.from({ length: total }, (_, index) => index)
  if (count === 1) return [0]

  const indexes = new Set<number>()
  for (let step = 0; step < count; step++)
    indexes.add(Math.round((step * (total - 1)) / (count - 1)))
  return [...indexes].sort((left, right) => left - right)
}

export interface StoryboardFragment {
  url: string
  // Segundos de video que cubre el mosaico.
  durationSeconds: number
}

export interface Storyboard {
  cellWidth: number
  cellHeight: number
  rows: number
  columns: number
  // Celdas por segundo de video (0 = YouTube no lo dijo).
  fps: number
  fragments: StoryboardFragment[]
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

function readStoryboard(format: unknown): Storyboard | null {
  if (!format || typeof format !== 'object') return null
  const record = format as Record<string, unknown>
  if (typeof record.format_id !== 'string' || !/^sb\d/.test(record.format_id))
    return null

  const cellWidth = positive(record.width)
  const cellHeight = positive(record.height)
  const rows = positive(record.rows)
  const columns = positive(record.columns)
  if (!cellWidth || !cellHeight || !rows || !columns) return null
  if (!Array.isArray(record.fragments)) return null

  const fps = positive(record.fps)
  const fragments: StoryboardFragment[] = []
  for (const fragment of record.fragments) {
    if (!fragment || typeof fragment !== 'object') continue
    const { url, duration } = fragment as { url?: unknown; duration?: unknown }
    if (typeof url !== 'string' || !url) continue
    fragments.push({
      url,
      // Sin duración declarada, la que da una cuadrícula llena.
      durationSeconds: positive(duration) || (fps ? (rows * columns) / fps : 0),
    })
  }
  if (fragments.length === 0) return null
  return { cellWidth, cellHeight, rows, columns, fps, fragments }
}

// El storyboard de celdas más grandes del JSON de `yt-dlp -J` (el formato
// `sb0`: mosaicos de 3×3 con celdas de 320×180). null = el video no trae.
export function pickStoryboard(info: unknown): Storyboard | null {
  if (!info || typeof info !== 'object') return null
  const formats = (info as { formats?: unknown }).formats
  if (!Array.isArray(formats)) return null

  let best: Storyboard | null = null
  for (const format of formats) {
    const storyboard = readStoryboard(format)
    if (!storyboard) continue
    if (!best || storyboard.cellWidth > best.cellWidth) best = storyboard
  }
  return best
}

export interface ImageSize {
  width: number
  height: number
}

// Marcadores SOF de JPEG: los que declaran el tamaño de la imagen (todos los
// 0xC0–0xCF menos DHT, JPG y DAC).
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  )
}

// El tamaño de un JPEG leído de sus bytes: con él se sabe cuántas filas trae
// de verdad un mosaico (el último de un video suele venir incompleto).
export function jpegSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    // Relleno entre segmentos.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (isStartOfFrame(marker))
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      }
    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  return null
}
