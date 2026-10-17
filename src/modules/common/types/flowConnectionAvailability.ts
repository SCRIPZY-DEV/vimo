import type { FlowConnection, FlowStatus } from '@/modules/common/types/flow'

export interface FlowConnectionAvailabilityProps {
  connection: FlowConnection
  status?: Pick<FlowStatus, 'manualPaused' | 'paused'> | null
}
