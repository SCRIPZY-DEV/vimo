export interface FlowPauseTarget {
  connectionId: string
  observedAt: number
}

export interface FlowPauseResult {
  requestId: string
  paused: boolean
  targets: FlowPauseTarget[]
}

export interface FlowPauseConfirmation {
  confirmed: boolean
  pendingCount: number
}

export interface FlowPauseMutationSnapshot {
  status: 'idle' | 'pending' | 'success' | 'error'
  variables: boolean | undefined
  data: FlowPauseResult | undefined
  error: unknown
}

export interface FlowPauseCommandState extends FlowPauseResult {
  confirmed: boolean
  pending: boolean
  error: unknown
}

export type FlowPauseDeadlineResult<Value> =
  | { status: 'fulfilled'; value: Value }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' }

export interface FlowGenerationControlsProps {
  disabled?: boolean
  size?: 'default' | 'sm'
}

export interface FlowPauseButtonProps extends FlowGenerationControlsProps {
  manualPaused: boolean
  pending: boolean
  pendingPaused: boolean | undefined
  onPauseChange: (paused: boolean) => void
}
