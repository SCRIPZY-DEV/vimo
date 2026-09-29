import {
  ANIMATION_PROVIDER_BLOCK_DURATION_MS,
  ANIMATION_PROVIDER_BLOCKS_STORAGE_KEY,
} from '@/modules/common/constants'
import type { AnimationProviderBlock } from '@/modules/common/types/animationProviderBlocks'
import {
  VIDEO_PROVIDER_IDS,
  type VideoProviderId,
} from '@pipeline/types/video-provider.ts'

// Bloqueos temporales de proveedores de animación (ADR-0047), como store
// fuera de React: lo escribe el store del editor al recibir
// `animation-provider-trouble` (sin árbol de React) y lo lee el selector del
// panel. Mismo patrón que promptModelBlocks.
let blocks: AnimationProviderBlock[] = restoreBlocks()
const subscribers = new Set<() => void>()
let expiryTimer: ReturnType<typeof setTimeout> | null = null

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function isActive(block: AnimationProviderBlock, now: number): boolean {
  return block.blockedUntil > now
}

function isBlockShape(value: unknown): value is AnimationProviderBlock {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AnimationProviderBlock>
  return (
    typeof candidate.providerId === 'string' &&
    VIDEO_PROVIDER_IDS.includes(candidate.providerId as VideoProviderId) &&
    typeof candidate.code === 'string' &&
    typeof candidate.blockedUntil === 'number' &&
    Number.isFinite(candidate.blockedUntil)
  )
}

// Nunca confía en lo persistido: sanea el shape y descarta los vencidos.
function restoreBlocks(): AnimationProviderBlock[] {
  try {
    const raw = localStorage.getItem(ANIMATION_PROVIDER_BLOCKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter(
      (item): item is AnimationProviderBlock =>
        isBlockShape(item) && isActive(item, now),
    )
  } catch {
    return []
  }
}

function persistBlocks(next: AnimationProviderBlock[]) {
  try {
    if (next.length === 0) {
      localStorage.removeItem(ANIMATION_PROVIDER_BLOCKS_STORAGE_KEY)
      return
    }
    localStorage.setItem(
      ANIMATION_PROVIDER_BLOCKS_STORAGE_KEY,
      JSON.stringify(next),
    )
  } catch {
    // Storage lleno o deshabilitado: el bloqueo sigue vivo en memoria.
  }
}

function setBlocks(next: AnimationProviderBlock[]) {
  blocks = next
  persistBlocks(next)
  scheduleExpiry()
  notify()
}

function purgeExpired() {
  const now = Date.now()
  const alive = blocks.filter((block) => isActive(block, now))
  if (alive.length === blocks.length) return
  setBlocks(alive)
}

// Un solo timer hasta el vencimiento más próximo: al dispararse purga y
// avisa, así el proveedor reaparece solo sin recargar la app.
function scheduleExpiry() {
  if (expiryTimer !== null) clearTimeout(expiryTimer)
  expiryTimer = null
  if (blocks.length === 0) return

  const soonest = Math.min(...blocks.map((block) => block.blockedUntil))
  expiryTimer = setTimeout(purgeExpired, Math.max(0, soonest - Date.now()))
}

scheduleExpiry()

export function blockAnimationProvider(
  providerId: VideoProviderId,
  code: string,
) {
  const block: AnimationProviderBlock = {
    providerId,
    code,
    blockedUntil: Date.now() + ANIMATION_PROVIDER_BLOCK_DURATION_MS,
  }
  const others = blocks.filter((item) => item.providerId !== providerId)
  setBlocks([...others, block])
}

// Desbloqueo manual: la persona sabe algo que el bloqueo no (el proveedor
// ya volvió, quiere probar igual).
export function unblockAnimationProvider(providerId: VideoProviderId) {
  const next = blocks.filter((block) => block.providerId !== providerId)
  if (next.length === blocks.length) return
  setBlocks(next)
}

export function subscribeAnimationProviderBlocks(
  listener: () => void,
): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export function getAnimationProviderBlocksSnapshot(): AnimationProviderBlock[] {
  return blocks
}
