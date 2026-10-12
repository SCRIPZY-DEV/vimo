import { commonQueryKeys } from '@/modules/common/constants'
import { normalizeFlowExecutionPlan } from '@/modules/common/utilities/flowExecutionPlan'
import type { FlowCapacityRequest } from '@/modules/common/types/flow'

// Recupera el plan de la clave completa, sin colapsar Tools en la cuenta RPC.
export function flowCapacityRequestFromKey(
  queryKey: readonly unknown[],
): FlowCapacityRequest | null {
  if (
    !commonQueryKeys.flowCapacityRoot.every(
      (part, index) => queryKey[index] === part,
    ) ||
    (queryKey.length !== 3 && queryKey.length !== 4) ||
    typeof queryKey[2] !== 'number' ||
    !Number.isSafeInteger(queryKey[2]) ||
    queryKey[2] <= 0
  )
    return null
  if (queryKey.length === 3) return { requestedCount: queryKey[2] }
  try {
    const executionPlan = normalizeFlowExecutionPlan(queryKey[3])
    if (!executionPlan) return null
    return { requestedCount: queryKey[2], executionPlan }
  } catch {
    return null
  }
}
