import type {
  StyleCloneCardState,
  StyleCloneImageRef,
  StyleCloneModalStep,
  StyleCloneSession,
  StyleCloneWorkingStep,
} from '@/modules/videos/types/styleClone'
import type {
  StyleCloneMaterialItem,
  StyleCloneOrigin,
} from '@pipeline/types/style-clone.ts'

// Lo que la tarjeta y el modal de una clonación muestran de su sesión
// (ADR-0050). Puro, solo con `import type`: lo corre
// scripts/test/check-app-style-clone.mjs con Node pelado, por eso sus
// constantes viven acá y no en constants.ts.

// Espejo de STYLE_CLONE_IMAGE_LIMIT de constants.ts.
const IMAGE_LIMIT = 10
// Espejo de STYLE_CLONE_INVALID_IMAGES_CODE de styleCloneSessions.ts.
const INVALID_IMAGES_CODE = 'style_clone_invalid_images'
const NO_CREDITS_CODE = 'image_insufficient_credits'
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const VIDEO_PATH_PREFIXES = new Set(['shorts', 'live', 'embed', 'v'])

type CardSession = Pick<StyleCloneSession, 'status' | 'errorCode'>

// La etiqueta de la tarjeta de una sesión: qué está haciendo, o qué necesita.
export function styleCloneCardStateOf(
  session: CardSession,
): StyleCloneCardState {
  const { status } = session
  if (status === 'awaiting')
    return {
      labelKey: 'create.styleClone.status.awaiting',
      tone: 'attention',
      busy: false,
    }
  if (status === 'failed' && session.errorCode === NO_CREDITS_CODE)
    return {
      labelKey: 'create.styleClone.status.noCredits',
      tone: 'error',
      busy: false,
    }
  if (status === 'failed' || status === 'interrupted')
    return {
      labelKey: `create.styleClone.status.${status}`,
      tone: 'error',
      busy: false,
    }

  return {
    labelKey: `create.styleClone.status.${status}`,
    tone: 'working',
    busy: true,
  }
}

// En qué paso abre el modal de una sesión.
export function styleCloneModalStepOf(
  session: Pick<StyleCloneSession, 'status' | 'step' | 'errorCode'>,
): StyleCloneModalStep {
  if (session.status === 'failed' && session.errorCode === INVALID_IMAGES_CODE)
    return 'source'
  if (session.status === 'failed' || session.status === 'interrupted')
    return 'failed'
  if (session.status === 'awaiting' && session.step) return session.step

  return 'working'
}

// Los pasos que se ven mientras la sesión trabaja: los de la acción en curso,
// con el que está corriendo marcado.
export function styleCloneWorkingSteps(
  session: Pick<StyleCloneSession, 'action' | 'phase'>,
): StyleCloneWorkingStep[] {
  const { action, phase } = session
  if (!action || !phase) return []

  const keys: StyleCloneWorkingStep['key'][] =
    action.kind === 'redraw'
      ? ['drawing']
      : action.kind === 'approve'
        ? ['analysis', 'saving']
        : action.kind === 'analyze'
          ? ['material', 'analysis', 'drawing']
          : ['analysis', 'drawing']
  const running: StyleCloneWorkingStep['key'] =
    phase === 'prepare'
      ? 'material'
      : phase === 'turn'
        ? 'analysis'
        : phase === 'draw'
          ? 'drawing'
          : 'saving'
  const runningAt = keys.indexOf(running)

  return keys.map((key, index) => ({
    key,
    state: index < runningAt ? 'done' : index === runningAt ? 'active' : 'todo',
  }))
}

type CoverSession = Pick<
  StyleCloneSession,
  'source' | 'material' | 'designs' | 'scenes'
>

// La imagen de la tarjeta: la mejor que tiene la sesión hasta ahora. Una
// clonación ya dibujada dice más que el material; el mosaico es lo último.
export function styleCloneCoverOf(
  session: CoverSession,
): StyleCloneImageRef | null {
  const drawn = [...session.scenes, ...session.designs].find(
    (test) => test.path,
  )
  if (drawn?.path)
    return {
      path: drawn.path,
      ...(drawn.mtimeMs === undefined ? {} : { version: drawn.mtimeMs }),
    }

  const still =
    session.material.find((item) => item.kind !== 'mosaic') ??
    session.material[0]
  if (still) return { path: still.path }
  if (session.source.kind === 'images' && session.source.paths[0])
    return { path: session.source.paths[0] }

  return null
}

// La imagen del material que nombra un origen. De una celda de un mosaico, el
// mosaico entero con el recorte que deja ver solo esa celda (como fondo CSS).
// null = el origen no nombra una imagen que el material tenga.
export function styleCloneOriginImageOf(
  material: readonly StyleCloneMaterialItem[],
  origin: StyleCloneOrigin | null | undefined,
): StyleCloneImageRef | null {
  if (!origin || origin.kind === 'new') return null
  if (origin.kind !== 'mosaic') {
    const item = material.filter((entry) => entry.kind === origin.kind)[
      origin.number - 1
    ]
    return item ? { path: item.path } : null
  }

  const mosaic = material.filter((entry) => entry.kind === 'mosaic')[
    origin.mosaic - 1
  ]
  const rows = mosaic?.rows ?? 0
  const columns = mosaic?.columns ?? 0
  if (!mosaic || origin.row > rows || origin.column > columns) return null

  // El fondo mide `columnas × filas` veces la caja; la posición en porcentaje
  // reparte lo que sobra, así que la celda n de N queda en (n-1)/(N-1).
  const offset = (position: number, count: number) =>
    count > 1 ? ((position - 1) / (count - 1)) * 100 : 0
  return {
    path: mosaic.path,
    crop: {
      size: `${columns * 100}% ${rows * 100}%`,
      position: `${offset(origin.column, columns)}% ${offset(origin.row, rows)}%`,
    },
  }
}

// ¿El texto es el link de un video de YouTube? Es el filtro de la caja; el
// sidecar lo vuelve a validar (validateYouTubeUrl y youtubeVideoIdOf).
export function isYouTubeVideoLink(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false

  let url: URL
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    )
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return false

  const segments = url.pathname.split('/').filter(Boolean)
  const candidate =
    host === 'youtu.be'
      ? segments[0]
      : url.searchParams.get('v') ||
        (VIDEO_PATH_PREFIXES.has(segments[0]) ? segments[1] : undefined)
  return candidate !== undefined && VIDEO_ID_PATTERN.test(candidate)
}

// Suma imágenes a las ya elegidas: en su orden, sin repetir y hasta el tope.
// `dropped` = cuántas quedaron afuera por el tope.
export function addStyleCloneImages(
  current: readonly string[],
  added: readonly string[],
): { paths: string[]; dropped: number } {
  const fresh = added.filter(
    (path, index) => !current.includes(path) && added.indexOf(path) === index,
  )
  const room = Math.max(0, IMAGE_LIMIT - current.length)
  return {
    paths: [...current, ...fresh.slice(0, room)],
    dropped: Math.max(0, fresh.length - room),
  }
}
