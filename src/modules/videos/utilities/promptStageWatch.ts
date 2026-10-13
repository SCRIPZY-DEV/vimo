import type { CreateTask } from '@/modules/videos/types/create'

// ¿Vigila ahora el watchdog al modelo de prompts (ADR-0028)? Solo con estilo
// propio (carril verbatim), el job generando y la fase `scene-prompts` en curso
// —desde la entrega 2h puede haber otra fase en curso a la vez, así que se
// mira que esté entre las que corren—, sin una pasada de recuperación ni un
// cambio de modelo en marcha, con actividad registrada y sin el aviso a la
// vista (silenciado con «seguir esperando» sí se vigila). Pura: el watchdog
// la evalúa en cada render.
export function isPromptStageWatched(
  task: Pick<
    CreateTask,
    | 'usesCustomStyle'
    | 'status'
    | 'activeStages'
    | 'imagesRecovery'
    | 'promptModelSwitch'
    | 'promptsStageActivity'
    | 'promptModelIssue'
  >,
): boolean {
  if (!task.usesCustomStyle || task.status !== 'generating') return false

  if (!task.activeStages.includes('scene-prompts')) return false

  if (task.imagesRecovery !== null || task.promptModelSwitch !== null)
    return false

  if (task.promptsStageActivity === null) return false

  return (
    task.promptModelIssue === null ||
    task.promptModelIssue.snoozedUntil !== null
  )
}
