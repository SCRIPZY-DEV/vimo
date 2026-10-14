import type {
  FlowAutoRecovery,
  FlowAutoRecoveryCapability,
} from '../../types/flow-auto-recovery.ts'
import type {
  FlowExecutionParameters,
  FlowToolsExecutionPlan,
  FlowToolsCoordinatorCapability,
} from '../../types/flow-execution-plan.ts'
import type { VideoFormat } from '../../types/video-format.ts'

export interface FlowReference {
  id: string
  name: string
  mimeType: string
  base64: string
  sha256: string
}

export interface FlowImageRequest {
  executionPlan?: FlowToolsExecutionPlan
  key: string
  prompt: string
  aspectRatio: VideoFormat
  references?: FlowReference[]
  // Revisión/destino privados de Vimo: nunca se transmiten al worker.
  destination?: string
  revision?: string
  previousHash?: string | null
}

export type FlowSavedRequest = Omit<
  FlowImageRequest,
  'references' | 'executionPlan'
> &
  FlowExecutionParameters & {
    autoRecoveryVersion?: 1
    references: Omit<FlowReference, 'base64'>[]
    imageJobId: string
    batchId: string
    promptIndex: number
    model: 'HARBOR_SEAL'
    requestHash: string
    imported?: boolean
    // Hash del JPEG ya validado en el destino nativo; no viaja al worker.
    importedHash?: string
    safeTerminal?: boolean
  }

export interface FlowBatch {
  autoRecoveryVersion?: 1
  executionPlan?: FlowToolsExecutionPlan
  version: 1
  scope: string
  revision: string
  batchId: string
  requests: FlowSavedRequest[]
  createdAt: string
  completed?: boolean
  restartRequestId?: string
  // Incluye clics que recuperaron este mismo intento durante un resultado incierto.
  regenerationRequestIds?: string[]
}

export interface FlowJobStatus {
  autoRecoveryVersion?: 1
  autoRecovery?: FlowAutoRecovery | null
  executionPlan?: FlowToolsExecutionPlan
  imageJobId: string
  batchId: string
  promptIndex: number
  requestHash: string
  state: string
  attemptId?: string | null
  imagePath?: string | null
  result?: { mediaId?: string; width?: number; height?: number } | null
  error?: {
    code?: string
    phase?: string
    submission?: string
    operationSubmission?: string
    recoveryReason?:
      'ACTIVITY_BLOCKED' | 'CAPTCHA_REQUIRED' | 'SESSION_REQUIRED'
  } | null
}

export interface FlowStatus {
  type: 'bridge.status'
  capabilities?: {
    flowTools?: FlowToolsCoordinatorCapability | null
    autoRecovery?: FlowAutoRecoveryCapability | null
  }
  paused: boolean
  jobs: FlowJobStatus[]
  batches?: { batchId: string; executionPlan?: FlowToolsExecutionPlan }[]
  deletedImageIds?: string[]
  deletedBatchIds?: string[]
}

export interface FlowBatchOptions {
  executionPlan?: FlowToolsExecutionPlan
  // Identidad del pedido explícito: el editor usa el clic y el clonador la
  // tarjeta/ronda. Un reintento incierto recupera siempre el recibo anterior.
  explicitRegenerationRequestId?: string
  // Reintento de rechazo confirmado: si pasó a incierto, no crear un alias.
  terminalRetry?: boolean
  scope: string
  revision: string
  requests: FlowImageRequest[]
  onState?(request: FlowSavedRequest, state: string): void
  onFailed?(request: FlowSavedRequest, code: string): void
  restoreImported?(request: FlowSavedRequest): Promise<boolean>
  onReady(request: FlowSavedRequest, bytes: Buffer): Promise<void | string>
}
