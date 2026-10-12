import {
  FLOW_TOOLS_COORDINATOR_CAPABILITY,
  FLOW_TOOLS_EXECUTION_PLAN,
} from '@/modules/common/constants'
import type {
  FlowToolsCoordinatorCapability,
  FlowToolsExecutionPlan,
} from '@pipeline/types/flow-execution-plan.ts'

// undefined conserva RPC; null, campos extra o valores desconocidos se rechazan.
export function normalizeFlowExecutionPlan(
  value: unknown,
): FlowToolsExecutionPlan | undefined {
  if (value === undefined) return undefined
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !==
      Object.keys(FLOW_TOOLS_EXECUTION_PLAN).length ||
    !Object.entries(FLOW_TOOLS_EXECUTION_PLAN).every(
      ([key, expected]) =>
        Object.hasOwn(value, key) && Reflect.get(value, key) === expected,
    )
  )
    throw new Error('execution_plan_invalid')
  return { ...FLOW_TOOLS_EXECUTION_PLAN }
}

export function flowExecutionPlansEqual(
  left: unknown,
  right: unknown,
): boolean {
  try {
    return (
      JSON.stringify(normalizeFlowExecutionPlan(left)) ===
      JSON.stringify(normalizeFlowExecutionPlan(right))
    )
  } catch {
    return false
  }
}

// La señal global no tiene ready: sólo acredita el protocolo del coordinador.
export function supportsFlowToolsCoordinator(
  value: unknown,
): value is FlowToolsCoordinatorCapability {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(FLOW_TOOLS_COORDINATOR_CAPABILITY).every(
      ([key, expected]) =>
        Object.hasOwn(value, key) && Reflect.get(value, key) === expected,
    )
  )
}
