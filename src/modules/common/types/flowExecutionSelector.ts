import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'

export interface FlowExecutionSelectorProps {
  executionPlan?: FlowToolsExecutionPlan
  onChange: (plan?: FlowToolsExecutionPlan) => void
  disabled?: boolean
}
