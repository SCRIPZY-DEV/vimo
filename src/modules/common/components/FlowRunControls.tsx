import { FlowConnectionBadge } from '@/modules/common/components/FlowConnectionBadge'
import type { FlowRunControlsProps } from '@/modules/common/types/flowRunProgress'

export function FlowRunControls({ progress }: FlowRunControlsProps) {
  return (
    <FlowConnectionBadge showGenerationControls={false} progress={progress} />
  )
}
