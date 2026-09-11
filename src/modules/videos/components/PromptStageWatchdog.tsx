import { useEffect, useRef } from 'react'
import {
  PROMPT_STAGE_STALL_MS,
  PROMPT_STAGE_WATCHDOG_TICK_MS,
} from '@/modules/videos/constants'
import type { CreateTask } from '@/modules/videos/types/create'

interface PromptStageWatchdogProps {
  task: CreateTask
  // Pasó PROMPT_STAGE_STALL_MS sin un prompt nuevo del modelo elegido.
  onStall: () => void
}

// Vigila la fase de prompts del carril verbatim (ADR-0028): sin markup, solo
// un tick que compara el último avance con el reloj. El intervalo depende de
// las marcas de tiempo y no de `task` (mismo criterio que ElapsedTimer): cada
// evento del sidecar crea una tarea nueva y reiniciaría el tick.
export function PromptStageWatchdog({
  task,
  onStall,
}: PromptStageWatchdogProps) {
  const lastProgressAt = task.promptsStageActivity?.lastProgressAt ?? null
  const issueVisible =
    task.promptModelIssue !== null &&
    task.promptModelIssue.snoozedUntil === null
  const snoozedUntil = task.promptModelIssue?.snoozedUntil ?? null
  const watching =
    task.usesCustomStyle &&
    task.status === 'generating' &&
    task.stage === 'scene-prompts' &&
    task.imagesRecovery === null &&
    task.promptModelSwitch === null &&
    lastProgressAt !== null &&
    !issueVisible

  // El callback cambia de identidad en cada render del padre: se guarda por
  // ref (fuera del render) para no reiniciar el intervalo.
  const onStallRef = useRef(onStall)
  useEffect(() => {
    onStallRef.current = onStall
  }, [onStall])

  useEffect(() => {
    if (!watching || lastProgressAt === null) return undefined
    const timer = setInterval(() => {
      const now = Date.now()
      if (now - lastProgressAt < PROMPT_STAGE_STALL_MS) return
      // Silenciado con «seguir esperando»: se respeta hasta que venza.
      if (snoozedUntil !== null && now < snoozedUntil) return
      onStallRef.current()
    }, PROMPT_STAGE_WATCHDOG_TICK_MS)
    return () => clearInterval(timer)
  }, [watching, lastProgressAt, snoozedUntil])

  return null
}
