import type { FlowRunProgress } from '@/modules/common/types/flowRunProgress'

// Cada composición conserva un único dueño de los controles de generación.
export interface FlowConnectionControlsProps {
  showGenerationControls?: boolean
  progress?: FlowRunProgress
}
