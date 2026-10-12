// An execution plan is part of the immutable image intent, never a profile
// preference that can silently migrate an existing RPC job.
export const FLOW_TOOLS_PLAN = Object.freeze({
  version: 1,
  kind: 'flow-tools',
  toolId: 'e42285e2-1038-4e24-adc1-ed30c690ab29',
  seedMode: 'provider',
})
// Protocol support only. Per-profile readiness is a separate, ephemeral claim.
export const FLOW_TOOLS_COORDINATOR_CAPABILITY = Object.freeze({
  version: 1,
  toolId: FLOW_TOOLS_PLAN.toolId,
  seedSupported: false,
  requestHashVersion: 1,
})

export function supportsFlowToolsCoordinator(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(FLOW_TOOLS_COORDINATOR_CAPABILITY).every(
      ([key, expected]) => Object.hasOwn(value, key) && value[key] === expected,
    ),
  )
}

export function normalizeExecutionPlan(value) {
  if (value === undefined) return undefined
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    Object.entries(FLOW_TOOLS_PLAN).some(
      ([key, expected]) =>
        !Object.hasOwn(value, key) || value[key] !== expected,
    )
  ) {
    throw new Error('execution_plan_invalid')
  }
  return { ...FLOW_TOOLS_PLAN }
}

export function resolveExecutionSeed(inputSeed, plan, legacyFactory) {
  const canonical = normalizeExecutionPlan(plan)
  if (canonical) {
    if (inputSeed !== undefined && inputSeed !== null)
      throw new Error('seed_invalid')
    return null
  }
  const seed = inputSeed ?? legacyFactory()
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)
    throw new Error('seed_invalid')
  return seed
}

export function executionHashInput({
  prompt,
  model,
  aspectRatio,
  seed,
  references,
  executionPlan,
}) {
  const plan = normalizeExecutionPlan(executionPlan)
  if (plan && seed !== null) throw new Error('seed_invalid')
  const input = [
    prompt,
    model,
    aspectRatio,
    seed,
    references.map((reference) => [
      reference.id,
      reference.name,
      reference.mimeType,
      reference.sha256,
    ]),
  ]
  if (plan) input.push(plan)
  return input
}

export function executionPlansEqual(left, right) {
  return (
    JSON.stringify(normalizeExecutionPlan(left)) ===
    JSON.stringify(normalizeExecutionPlan(right))
  )
}

export function safeFlowToolsCapability(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    value.toolId !== FLOW_TOOLS_PLAN.toolId ||
    typeof value.ready !== 'boolean' ||
    value.seedSupported !== false
  )
    return null
  return {
    version: 1,
    toolId: FLOW_TOOLS_PLAN.toolId,
    ready: value.ready,
    seedSupported: false,
  }
}

export function executionCompatible(
  executionPlan,
  { binding, flowTools } = {},
) {
  try {
    const plan = normalizeExecutionPlan(executionPlan)
    const boundPlan = normalizeExecutionPlan(binding?.executionPlan)
    if (!plan) return !boundPlan
    const capability = safeFlowToolsCapability(flowTools)
    return (
      capability?.ready === true &&
      (!boundPlan || executionPlansEqual(plan, boundPlan))
    )
  } catch {
    return false
  }
}
