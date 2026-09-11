import { useEffect, useState, useSyncExternalStore } from 'react'
import { PROMPT_MODEL_BLOCK_TICK_MS } from '@/modules/common/constants'
import {
  getPromptModelBlocksSnapshot,
  subscribePromptModelBlocks,
} from '@/modules/common/utilities/promptModelBlocks'

// Los modelos de prompts bloqueados ahora mismo (ADR-0028). Configuración
// global: se lee directo desde el componente que lo necesita, no viaja por
// props. El snapshot ya viene sin vencidos (el store los purga con un timer y
// avisa), así que acá no se mira el reloj; con bloqueos vigentes se fuerza un
// render por minuto para que el «vuelve en N min» de las tarjetas avance.
export function usePromptModelBlocks() {
  const blocks = useSyncExternalStore(
    subscribePromptModelBlocks,
    getPromptModelBlocksSnapshot,
  )
  const [, setTick] = useState(0)
  const hasBlocks = blocks.length > 0

  useEffect(() => {
    if (!hasBlocks) return undefined
    const timer = setInterval(
      () => setTick((current) => current + 1),
      PROMPT_MODEL_BLOCK_TICK_MS,
    )
    return () => clearInterval(timer)
  }, [hasBlocks])

  const blockedIds = new Set(blocks.map((block) => block.modelId))

  return {
    blocks,
    blockedIds,
    isBlocked: (modelId: string) => blockedIds.has(modelId),
    blockedUntil: (modelId: string): number | null =>
      blocks.find((block) => block.modelId === modelId)?.blockedUntil ?? null,
  }
}
