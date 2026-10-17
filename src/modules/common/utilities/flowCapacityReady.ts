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
  if (capacity.canPrepare !== true) return false
  // El coordinador distingue configuración de cupos transitorios. Su informe
  // del plan decide la admisión, aunque otra cuenta esté comprobando un envío.
  if (capacity.configuredProfiles !== undefined)
    return (
      Number.isSafeInteger(capacity.configuredProfiles) &&
      capacity.configuredProfiles >= minimum
    )

  // Un puente anterior conserva el contrato de cinco disponibles.
  return status.readyProfiles >= minimum && capacity.readyProfiles >= minimum
}
