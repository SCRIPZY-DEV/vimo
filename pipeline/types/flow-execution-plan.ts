// Contrato compartido con la UI mediante import type. El plan nunca habilita
// por sí mismo la generación: requiere capability global y admisión por perfil.
export interface FlowToolsExecutionPlan {
  readonly version: 1
  readonly kind: 'flow-tools'
  readonly toolId: 'e42285e2-1038-4e24-adc1-ed30c690ab29'
  readonly seedMode: 'provider'
}

// El coordinador anuncia protocolo, no disponibilidad de cuentas.
export interface FlowToolsCoordinatorCapability {
  version: FlowToolsExecutionPlan['version']
  toolId: FlowToolsExecutionPlan['toolId']
  seedSupported: false
  requestHashVersion: 1
}

// Valor saneado en connections[].flowTools y profiles[].flowTools.
// ready no sustituye la admisión del lote, las pausas ni las reservas.
export interface FlowToolsCapability {
  version: FlowToolsExecutionPlan['version']
  toolId: FlowToolsExecutionPlan['toolId']
  ready: boolean
  seedSupported: false
}

// La ausencia de plan conserva RPC. Su semilla numérica sigue siendo obligatoria.
export interface FlowRpcExecutionParameters {
  executionPlan?: never
  seed: number
}

// Forma normalizada para una intención Tools durable: nunca inventar una seed.
export interface FlowToolsExecutionParameters {
  executionPlan: FlowToolsExecutionPlan
  seed: null
}

export type FlowExecutionParameters =
  FlowRpcExecutionParameters | FlowToolsExecutionParameters

// Sólo la entrada Tools puede omitir seed; la persistencia exige null explícito.
export type FlowExecutionInput =
  | FlowRpcExecutionParameters
  | (Omit<FlowToolsExecutionParameters, 'seed'> & { seed?: null })
