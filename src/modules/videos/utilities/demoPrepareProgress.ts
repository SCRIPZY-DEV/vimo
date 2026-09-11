import type { DemoPrepareProgress } from '@/modules/videos/types/demo'
import type { ProgressEvent } from '@pipeline/runner/events.ts'

// Lee la fase que demo-prepare manda en `progress.detail` (JsonValue): fuera
// de las dos fases conocidas el evento se ignora.
export function demoPrepareProgress(
  event: ProgressEvent,
): DemoPrepareProgress | null {
  const detail = event.detail
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail))
    return null
  const phase = detail.phase
  if (phase !== 'download' && phase !== 'install') return null
  return { phase, percent: event.percent ?? 0 }
}
