import { createHash } from 'node:crypto'

import { PipelineFailure } from '../../runner/failure.ts'
import type {
  FlowExecutionParameters,
  FlowToolsCoordinatorCapability,
  FlowToolsExecutionPlan,
} from '../../types/flow-execution-plan.ts'

// Equivalente tipado del helper de extensión; procedencia y vectores en el handoff.
// No importar dinámicamente otra carpeta ni modificar el vendor para este guard.
export const FLOW_TOOLS_PLAN: FlowToolsExecutionPlan = Object.freeze({
  version: 1,
  kind: 'flow-tools',
  toolId: 'e42285e2-1038-4e24-adc1-ed30c690ab29',
  seedMode: 'provider',
})
const FLOW_TOOLS_COORDINATOR_CAPABILITY: FlowToolsCoordinatorCapability = {
  version: 1,
  toolId: FLOW_TOOLS_PLAN.toolId,
  seedSupported: false,
  requestHashVersion: 1,
}
const MAX_RPC_SEED = 2147483647

interface FlowHashReference {
  id: string
  name: string
  mimeType: string
  sha256: string
}
interface FlowHashRequest {
  prompt: string
  model: string
  aspectRatio: string
  seed: number | null
  references: FlowHashReference[]
  executionPlan?: FlowToolsExecutionPlan
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeFlowExecutionPlan(
  value: unknown,
): FlowToolsExecutionPlan | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    Object.entries(FLOW_TOOLS_PLAN).some(
      ([key, expected]) =>
        !Object.hasOwn(value, key) || value[key] !== expected,
    )
  )
    throw new PipelineFailure(
      'execution_plan_invalid',
      'Invalid Flow execution plan',
    )
  return { ...FLOW_TOOLS_PLAN }
}

export function assertFlowPlanProvider(value: unknown, provider: unknown) {
  const plan = normalizeFlowExecutionPlan(value)
  if (plan && provider !== 'flow')
    throw new PipelineFailure(
      'execution_plan_invalid',
      'Flow Tools cannot use another image provider',
    )
  return plan
}

export function resolveFlowExecutionSeed(
  inputSeed: unknown,
  executionPlan: unknown,
  legacyFactory: () => number,
): number | null {
  const plan = normalizeFlowExecutionPlan(executionPlan)
  if (plan) {
    if (inputSeed !== undefined && inputSeed !== null)
      throw new PipelineFailure(
        'seed_invalid',
        'Flow Tools uses a provider-selected seed',
      )
    return null
  }
  return resolveRpcSeed(inputSeed, legacyFactory)
}

function resolveRpcSeed(
  inputSeed: unknown,
  legacyFactory: () => number,
): number {
  const seed = inputSeed ?? legacyFactory()
  if (
    typeof seed !== 'number' ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > MAX_RPC_SEED
  )
    throw new PipelineFailure('seed_invalid', 'Invalid RPC seed')
  return seed
}

export function flowExecutionParameters(
  executionPlan: unknown,
  legacyFactory: () => number,
): FlowExecutionParameters {
  const plan = normalizeFlowExecutionPlan(executionPlan)
  if (plan) return { executionPlan: plan, seed: null }
  return { seed: resolveRpcSeed(undefined, legacyFactory) }
}

export function flowExecutionHashInput(request: FlowHashRequest): unknown[] {
  const plan = normalizeFlowExecutionPlan(request.executionPlan)
  if (plan && request.seed !== null)
    throw new PipelineFailure(
      'seed_invalid',
      'Flow Tools requires a null seed in a durable intent',
    )
  const input: unknown[] = [
    request.prompt,
    request.model,
    request.aspectRatio,
    request.seed,
    request.references.map((reference) => [
      reference.id,
      reference.name,
      reference.mimeType,
      reference.sha256,
    ]),
  ]
  if (plan) input.push(plan)
  return input
}

export function flowExecutionPlansEqual(
  left: unknown,
  right: unknown,
): boolean {
  return (
    JSON.stringify(normalizeFlowExecutionPlan(left)) ===
    JSON.stringify(normalizeFlowExecutionPlan(right))
  )
}

export function flowExecutionRevision(
  revision: string,
  executionPlan: unknown,
): string {
  const plan = normalizeFlowExecutionPlan(executionPlan)
  if (!plan) return revision
  return createHash('sha256')
    .update(JSON.stringify([revision, plan]))
    .digest('hex')
}

export function supportsFlowToolsCoordinator(
  value: unknown,
): value is FlowToolsCoordinatorCapability {
  return (
    isRecord(value) &&
    Object.entries(FLOW_TOOLS_COORDINATOR_CAPABILITY).every(
      ([key, expected]) => Object.hasOwn(value, key) && value[key] === expected,
    )
  )
}

// Sólo estos comandos pueden admitir una intención nueva. Recuperar, cancelar
// o importar un resultado existente conserva su recibo sin exigir readiness.
export function flowCommandExecutionPlan(
  command: object,
): FlowToolsExecutionPlan | undefined {
  if (!isRecord(command)) return undefined
  if (command.type === 'capacity.check' || command.type === 'batch.prepare')
    return normalizeFlowExecutionPlan(command.executionPlan)
  if (command.type !== 'submit') return undefined
  if (Object.hasOwn(command, 'executionPlan'))
    throw new PipelineFailure(
      'execution_plan_invalid',
      'Submit carries execution plans on each job',
    )
  if (!Array.isArray(command.jobs)) return undefined
  const plans = command.jobs.map((job: unknown) => {
    if (!isRecord(job))
      throw new PipelineFailure('invalid_payload', 'Invalid Flow job')
    return normalizeFlowExecutionPlan(job.executionPlan)
  })
  const plan = plans[0]
  if (plans.some((candidate) => !flowExecutionPlansEqual(candidate, plan)))
    throw new PipelineFailure(
      'batch_execution_plan_mixed',
      'A Flow submission page cannot mix execution plans',
    )
  return plan
}
