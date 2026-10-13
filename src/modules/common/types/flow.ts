import type {
  FlowAutoRecovery,
  FlowAutoRecoveryCapability,
} from '@pipeline/types/flow-auto-recovery.ts'
import type {
  FlowToolsCapability,
  FlowToolsCoordinatorCapability,
  FlowToolsExecutionPlan,
} from '@pipeline/types/flow-execution-plan.ts'

export interface FlowIdentity {
  verified: boolean
  accountKey: string
  maskedEmail: string
  email?: string
}

export interface FlowConnection {
  flowTools?: FlowToolsCapability | null
  connectionId: string
  alias: string
  connected: boolean
  revoked: boolean
  paused: boolean
  sessionObservedAt?: number | null
  binding: { projectId: string; alias?: string; ready: boolean } | null
  identity: FlowIdentity | null
  // Referencia visual histórica; nunca habilita capacidad ni vinculación.
  lastVerifiedIdentity?: FlowIdentity | null
  identityConflict: boolean
  profileAvailability: {
    state: 'ready' | 'cooldown' | 'checking' | 'manual'
    reason?: string
    nextCheckAt?: number | null
    checkingJobId?: string | null
  }
  accountPolicy: {
    unlimited?: boolean
    limit: number | null
    used: number | null
    remaining: number | null
    nextCapacityAt?: number | null
  } | null
  scheduling: { activeCount: number; maxInFlight: number } | null
}

export interface FlowStatus {
  nativeImport?: {
    instanceId: string
    running: boolean
    pending: number
    imported: number
    failed: number
    lastErrorCode: string | null
  }
  capabilities?: {
    flowTools?: FlowToolsCoordinatorCapability
    autoRecovery?: FlowAutoRecoveryCapability
  }
  paused: boolean
  manualPaused: boolean
  minimumProfiles: number
  readyProfiles: number
  maxConnections: number
  linkedCount: number
  connections: FlowConnection[]
  jobs: FlowImageJob[]
  batches: FlowBatch[]
}

export interface FlowDiscovery {
  discoveryId: string
  alias: string
  identity: FlowIdentity | null
  hasFlowTab: boolean
  linked: boolean
  trusted: boolean
  duplicateAccount: boolean
  canLink: boolean
}

export interface FlowDiscoveryResult {
  profiles: FlowDiscovery[]
  maxConnections: number
  linkedCount: number
}

export interface FlowPairing {
  pairingCode: string
  port: number
}

export interface FlowCapacityProfile {
  flowTools?: FlowToolsCapability | null
  connectionId: string
  alias: string
  identity?: Partial<FlowIdentity> | null
  profileAvailability: FlowConnection['profileAvailability'] | null
  unlimited?: boolean
  quotaRemaining: number | null
  historySlots: number
  available: number
  reasons?: string[]
  localReserved?: number
  bridgeReserved?: number
  legacyReserved?: number
}

export interface FlowCapacity {
  executionPlan?: FlowToolsExecutionPlan
  canPrepare: boolean
  linkedCount?: number
  blockedReason?: string
  available: number
  deficit: number
  requiredAdditionalProfiles: number
  profiles?: FlowCapacityProfile[]
  readyProfiles: number
  minimumProfiles: number
}

export interface FlowJobError {
  code?: string
  submission?: string
  rpcCode?: number
  responseKind?: string
  operation?: string
  phase?: string
  operationSubmission?: string
  retryAfterMs?: number
  retryAfter?: number
}

export interface FlowImageJob {
  autoRecoveryVersion?: 1
  autoRecovery?: FlowAutoRecovery | null
  executionPlan?: FlowToolsExecutionPlan
  prompt?: string
  createdAt?: string
  aspectRatio?: string
  imageJobId: string
  batchId: string
  promptIndex: number | null
  state: string
  attemptId: string | null
  localDeletable: boolean
  cancelRequested: boolean
  result: { mediaId: string } | null
  error: FlowJobError | null
  generationRetry: { status: string } | null
  generationRetryCount: number
}

export interface FlowBatch {
  executionPlan?: FlowToolsExecutionPlan
  createdAt?: string
  batchId: string
  status: string
  requestedCount: number
  submittedCount: number
  remainingCount: number
  localDeletable: boolean
}

export interface FlowRetryRequest {
  imageJobId: string
  expectedAttemptId: string
  retryRequestId: string
  acknowledgeDuplicateRisk: true
}

export type FlowRecoveryAction =
  | { type: 'retry'; job: FlowImageJob }
  | { type: 'download' | 'cancel' | 'deleteImage'; imageJobId: string }
  | { type: 'cancelBatch' | 'deleteBatch'; batchId: string }

export interface FlowRestartRequest {
  flowRestartRequestId: string
  flowAcknowledgeDuplicateRisk: true
}

export interface FlowRestartConsent {
  scope: string
  request: FlowRestartRequest
}

export interface FlowRefreshResult {
  changed: boolean
  checkedAt: number
}

export interface FlowCapacityOptions {
  executionPlan?: FlowToolsExecutionPlan
}

export interface FlowCapacityRequest extends FlowCapacityOptions {
  requestedCount: number
}

export interface FlowCapacitySnapshot extends FlowCapacityRequest {
  capacity: FlowCapacity | undefined
}
