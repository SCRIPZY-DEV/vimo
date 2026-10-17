import type { DemoPrepareProgress } from '@/modules/videos/types/demo'
import type { ProgressEvent } from '@pipeline/runner/events.ts'

// Lee lo que demo-prepare manda en `progress.detail` (JsonValue): la fase y
// la parte en curso de N. Fuera de las dos fases conocidas el evento se
// ignora; sin parte, el avance queda sin ella.
export function demoPrepareProgress(
  event: ProgressEvent,
): DemoPrepareProgress | null {
  const detail = event.detail
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail))
    return null
  const phase = detail.phase
  if (phase !== 'download' && phase !== 'install') return null

  const { part, parts } = detail
  const hasPart = typeof part === 'number' && typeof parts === 'number'
  return {
    percent: event.percent ?? 0,
    phase,
    part: hasPart ? part : null,
    parts: hasPart ? parts : null,
  }
}
