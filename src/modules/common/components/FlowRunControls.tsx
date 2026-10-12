import { FlowConnectionBadge } from '@/modules/common/components/FlowConnectionBadge'
import { FlowGenerationControls } from '@/modules/common/components/FlowGenerationControls'

export function FlowRunControls() {
  return (
    <div className="space-y-3">
      <FlowConnectionBadge showGenerationControls={false} />
      <FlowGenerationControls size="sm" />
    </div>
  )
}
