import type { FlowConnection } from '@/modules/common/types/flow'

// Describe el modo anunciado; no acredita presupuesto ni decide admisión.
export function flowCheckingState(
  availability: FlowConnection['profileAvailability'] | null | undefined,
) {
  if (availability?.state !== 'checking') return null
  if (availability.checkingJobId === null) return 'limited'
  if (
    typeof availability.checkingJobId === 'string' &&
    availability.checkingJobId.length > 0
  )
    return 'running'
  return 'unconfirmed'
}
