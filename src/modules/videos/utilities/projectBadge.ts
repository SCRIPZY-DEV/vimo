import type { VideoProjectListItem } from '@pipeline/types/video-project.ts'
import { PROGRESS_BADGES } from '@/modules/videos/constants'
import type { ProjectBadge } from '@/modules/videos/types/library'

type ProjectBadgeInput = Pick<
  VideoProjectListItem,
  'state' | 'hasVideo' | 'videoOutdated'
>

// Estado visible de un proyecto, derivado del estado en disco.
// `hasLiveTask` distingue un `generating` real (job vivo en el store) de uno
// que murió con la app y se muestra como interrumpido. Solo presentacional:
// ningún comando de lectura reescribe el estado (ADR-0014).
export function projectBadge(
  project: ProjectBadgeInput,
  hasLiveTask: boolean,
): ProjectBadge {
  const { state } = project

  if (state === 'generating') return hasLiveTask ? 'generating' : 'interrupted'
  if (state === 'awaiting-confirmation') return 'awaitingConfirmation'
  if (state === 'paused') return 'paused'
  if (state === 'error') return 'error'
  if (state === 'completed' && project.hasVideo)
    return project.videoOutdated ? 'outdated' : 'ready'

  // Sin video final no hay nada que reproducir: se edita como borrador.
  return 'draft'
}

// Los estados que navegan a la pantalla de progreso (hay o hubo un job).
export function badgeNavigatesToProgress(badge: ProjectBadge): boolean {
  return PROGRESS_BADGES.has(badge)
}
