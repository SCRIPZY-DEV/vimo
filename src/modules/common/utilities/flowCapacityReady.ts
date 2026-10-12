import { flowMinimumProfiles } from '@/modules/common/utilities/flowMinimumProfiles'
import {
  flowExecutionPlansEqual,
  supportsFlowToolsCoordinator,
} from '@/modules/common/utilities/flowExecutionPlan'
import type { FlowCapacity, FlowStatus } from '@/modules/common/types/flow'
import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'

export function flowCapacityReady(
  status: FlowStatus | null,
  capacity: FlowCapacity | undefined,
  executionPlan?: FlowToolsExecutionPlan,
): boolean {
  if (!status || !capacity || status.paused || status.manualPaused) return false
  if (
    executionPlan !== undefined &&
    !supportsFlowToolsCoordinator(status.capabilities?.flowTools)
  )
    return false
  if (!flowExecutionPlansEqual(capacity.executionPlan, executionPlan))
    return false
  const minimum = flowMinimumProfiles(
    status.minimumProfiles,
    capacity.minimumProfiles,
  )
  return (
    status.readyProfiles >= minimum &&
    capacity.canPrepare &&
    capacity.readyProfiles >= minimum
  )
}
