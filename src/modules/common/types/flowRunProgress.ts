export interface FlowRunControlsProps {
  progress: FlowRunProgress
}

export interface FlowRunProgress {
  total: number | null
  ready: number
  generating: number
  pending: number
}
