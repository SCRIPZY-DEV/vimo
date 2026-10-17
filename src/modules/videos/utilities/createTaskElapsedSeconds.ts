import type { CreateTaskTiming } from '@/modules/videos/types/create'

// El reloj sólo mide intervalos conocidos. Una pausa abierta ya fija el
// extremo del tramo activo, incluso si la confirmación terminó con error.
export function createTaskElapsedSeconds(
  timing: CreateTaskTiming,
  now: number,
): number | null {
  if (timing.timingUnknown || !Number.isFinite(timing.startedAt)) return null

  const end = timing.pausedAt ?? timing.finishedAt ?? now
  return Math.max(
    0,
    Math.floor((end - timing.startedAt - timing.pausedMs) / 1000),
  )
}
