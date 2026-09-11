import {
  PROMPT_MODEL_BLOCK_DURATION_MS,
  PROMPT_MODEL_BLOCKS_STORAGE_KEY,
} from '@/modules/common/constants'
import type {
  PromptModelBlock,
  PromptModelBlockReason,
} from '@/modules/common/types/promptModelBlocks'

// Bloqueos temporales de modelos de prompts (ADR-0028), como store fuera de
// React: lo escribe el store de la tarea de creación (sin árbol de React) y lo
// leen el selector, Crear y Ajustes. Mismo patrón que useVoiceFavorites.
let blocks: PromptModelBlock[] = restoreBlocks()
const subscribers = new Set<() => void>()
let expiryTimer: ReturnType<typeof setTimeout> | null = null

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function isActive(block: PromptModelBlock, now: number): boolean {
  return block.blockedUntil > now
}

function isBlockShape(value: unknown): value is PromptModelBlock {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PromptModelBlock>
  return (
    typeof candidate.modelId === 'string' &&
    (candidate.reason === 'stalled' || candidate.reason === 'error') &&
    typeof candidate.blockedUntil === 'number' &&
    Number.isFinite(candidate.blockedUntil)
  )
}

// Nunca confía en lo persistido: sanea el shape y descarta los vencidos.
function restoreBlocks(): PromptModelBlock[] {
  try {
    const raw = localStorage.getItem(PROMPT_MODEL_BLOCKS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter(
      (item): item is PromptModelBlock =>
        isBlockShape(item) && isActive(item, now),
    )
  } catch {
    return []
  }
}

function persistBlocks(next: PromptModelBlock[]) {
  try {
    if (next.length === 0) {
      localStorage.removeItem(PROMPT_MODEL_BLOCKS_STORAGE_KEY)
      return
    }
    localStorage.setItem(PROMPT_MODEL_BLOCKS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage lleno o deshabilitado: el bloqueo sigue vivo en memoria.
  }
}

function setBlocks(next: PromptModelBlock[]) {
  blocks = next
  persistBlocks(next)
  scheduleExpiry()
  notify()
}

// Saca los vencidos del snapshot. Solo cambia la identidad si algo venció:
// useSyncExternalStore compara por referencia.
function purgeExpired() {
  const now = Date.now()
  const alive = blocks.filter((block) => isActive(block, now))
  if (alive.length === blocks.length) return
  setBlocks(alive)
}

// Un solo timer hasta el vencimiento más próximo: al dispararse purga y
// avisa, así las tarjetas se rehabilitan solas sin recargar la app.
function scheduleExpiry() {
  if (expiryTimer !== null) clearTimeout(expiryTimer)
  expiryTimer = null
  if (blocks.length === 0) return

  const soonest = Math.min(...blocks.map((block) => block.blockedUntil))
  const delay = Math.max(0, soonest - Date.now())
  expiryTimer = setTimeout(purgeExpired, delay)
}

scheduleExpiry()

// Bloquea (o renueva) un modelo por PROMPT_MODEL_BLOCK_DURATION_MS.
export function blockPromptModel(
  modelId: string,
  reason: PromptModelBlockReason,
) {
  const block: PromptModelBlock = {
    modelId,
    reason,
    blockedUntil: Date.now() + PROMPT_MODEL_BLOCK_DURATION_MS,
  }
  const others = blocks.filter((item) => item.modelId !== modelId)
  setBlocks([...others, block])
}

// Desbloqueo manual desde Ajustes: la persona sabe algo que el bloqueo no
// (el proveedor ya volvió, era su red, quiere probar igual).
export function unblockPromptModel(modelId: string) {
  const next = blocks.filter((block) => block.modelId !== modelId)
  if (next.length === blocks.length) return
  setBlocks(next)
}

export function clearPromptModelBlocks() {
  if (blocks.length === 0) return
  setBlocks([])
}

export function isPromptModelBlocked(modelId: string): boolean {
  const now = Date.now()
  return blocks.some(
    (block) => block.modelId === modelId && isActive(block, now),
  )
}

export function blockedPromptModelIds(): ReadonlySet<string> {
  const now = Date.now()
  return new Set(
    blocks
      .filter((block) => isActive(block, now))
      .map((block) => block.modelId),
  )
}

export function subscribePromptModelBlocks(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export function getPromptModelBlocksSnapshot(): PromptModelBlock[] {
  return blocks
}
