import { createServer } from 'node:http'
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { readFile, lstat, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { openStore, writePrivateFile } from './storage.js'
import {
  assertImageUrl,
  downloadImage,
  imageFormat,
  MAX_IMAGE_BYTES,
} from './download.js'
import {
  allocateCapacity,
  capacityReport,
  safeCapacity,
  validPolicy,
  CAPACITY_FRESH_MS,
} from './capacity.js'
import {
  MAX_LINKED_PROFILES,
  MIN_LINKED_PROFILES,
  DISCOVERY_TTL_MS,
  safeIdentity,
  safeAvailability,
  safeScheduling,
  linkedCount,
  canLink,
  identityConflict,
  profileEligible,
  profileScopedRejection,
} from './profiles.js'
import {
  safeAttemptStats,
  mergeAttemptStats,
} from '../extension/attempt-audit.js'
import {
  persistentTemporaryRejection,
  persistentAttemptReusable,
  automaticRecoveryEligible,
  isSettledInternalGenerationError,
} from '../extension/generation-errors.js'
import {
  normalizeExecutionPlan,
  resolveExecutionSeed,
  executionHashInput,
  executionPlansEqual,
  safeFlowToolsCapability,
  executionCompatible,
  FLOW_TOOLS_COORDINATOR_CAPABILITY,
} from '../extension/execution-plan.js'

import {
  persistentRecoveryChain,
  persistentRecoveryHistoryValid,
  AUTO_RECOVERY_CAPABILITY,
  UNKNOWN_RECONCILE_MS,
  STALLED_ATTEMPT_MS,
  RECOVERY_BACKOFF_MS,
  DOWNLOAD_BACKOFF_MS,
  normalizeAutoRecoveryVersion,
  newAutoRecovery,
  automaticJob,
  archivedAttempts,
  attemptSnapshot,
  recoveryCapacityJobs,
  recoverySummary,
  observeRecoveryProgress,
  uncertainAutomaticAttempt,
} from './automatic-recovery.js'
import {
  safeRecoveryPermit,
  mergeRecoveryPermit,
  currentRecoveryPermit,
  freeRecoveryPermit,
  reserveRecoveryPermit,
  recoveryDispatchAllowed,
  consumeRecoveryPermit,
  recoveryInFlightCount,
} from '../extension/recovery-permit.js'

const MAX_FRAME_BYTES = 20 * 1024 * 1024
const MAX_REFERENCE_TOTAL = 12 * 1024 * 1024
const JOB_ID =
  /^(?!__proto__$|constructor$|prototype$)[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
const RETRY_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const MAX_GENERATION_RETRIES = 2
const URL_REFRESH_TIMEOUT_MS = 5 * 60 * 1000
const MAX_LINK_REQUESTS_PER_INSTALLATION = 128
const MAX_LINK_REQUESTS = 12_800
const ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/
const REMOTE_ACTIVE = new Set([
  'dispatching',
  'received',
  'uploading',
  'generating',
  'unknown',
  'completed',
])
const remoteActive = (job) =>
  (REMOTE_ACTIVE.has(job.state) || uncertainAutomaticAttempt(job)) &&
  !(job.state === 'unknown' && isSettledInternalGenerationError(job.error))
const EXTENSION_STATES = new Set([
  'queued',
  'uploading',
  'dispatching',
  'generating',
  'completed',
  'unknown',
  'failed',
  'canceled',
])
const PANEL_COMMANDS = new Set([
  'image.delete',
  'batch.delete',
  'generation.retry',
  'status',
  'capacity.check',
  'batch.prepare',
  'batch.cancel',
  'submit',
  'pause',
  'cancel',
  'download',
  'preview.read',
])
const LOCAL_DELETE_STATES = new Set([
  'ready',
  'failed',
  'canceled',
  'download_failed',
])
const MODELS = new Set(['HARBOR_SEAL', 'NARWHAL', 'GEM_PIX_2'])
const ASPECTS = new Set(['1:1', '16:9', '9:16', '3:4', '4:3'])
const ATTENTION_CODES = new Set([
  'RATE_LIMITED',
  'ACTIVITY_BLOCKED',
  'QUOTA_EXCEEDED',
  'RESOURCE_EXHAUSTED',
  'PERMISSION_DENIED',
  'CAPTCHA_REQUIRED',
  'SESSION_REQUIRED',
  'ACCOUNT_MISMATCH',
  'PROJECT_CHANGED',
  'UPLOAD_SCHEMA_UNVERIFIED',
])
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const secret = () => randomBytes(32).toString('base64url')
const validId = (value) => typeof value === 'string' && JOB_ID.test(value)
const safeCode = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)
    ? value
    : 'bridge_operation_failed'
const sameSecret = (value, hash) =>
  typeof value === 'string' &&
  typeof hash === 'string' &&
  hash.length === 64 &&
  timingSafeEqual(Buffer.from(sha256(value), 'hex'), Buffer.from(hash, 'hex'))

const planFields = (value) =>
  value.executionPlan ? { executionPlan: value.executionPlan } : {}
function assertReceiptPlan(job, receipt) {
  if (!executionPlansEqual(job.executionPlan, receipt.executionPlan))
    throw new Error('execution_plan_mismatch')
}

// Dato informativo: no participa en autenticación, admisión ni capacidades.
function safeExtensionVersion(value) {
  if (
    typeof value !== 'string' ||
    value.length > 23 ||
    !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(value)
  )
    return null
  const parts = value.split('.').map(Number)
  return parts.every((part) => part <= 65535) && parts.some((part) => part > 0)
    ? value
    : null
}

function retrySummary(retry) {
  if (!retry) return null
  return {
    retryRequestId: retry.retryRequestId,
    previousAttemptId: retry.previousAttemptId,
    attemptId: retry.attemptId,
    status: retry.status,
    requestedAt: retry.requestedAt,
    acknowledgedAt: retry.acknowledgedAt ?? null,
    rejectedAt: retry.rejectedAt ?? null,
    ...(retry.error ? { error: { code: safeCode(retry.error.code) } } : {}),
  }
}

function baseJobSummary(job, includeContent = false) {
  return {
    imageJobId: job.imageJobId,
    batchId: job.batchId,
    state: job.state,
    ...planFields(job),
    connectionId: job.connectionId ?? null,
    requestHash: job.requestHash,
    requestId: job.imageJobId,
    attemptId: job.attemptId ?? null,
    promptIndex: job.promptIndex ?? null,
    ...(includeContent === true ? { prompt: job.prompt } : {}),
    model: job.model,
    aspectRatio: job.aspectRatio,
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    attemptStats: safeAttemptStats(job.attemptStats),
    generationRetry: retrySummary(job.generationRetry),
    generationRetryCount: job.generationRetryHistory?.length ?? 0,
    ...(automaticJob(job)
      ? { autoRecoveryVersion: 1, autoRecovery: recoverySummary(job) }
      : {}),
    result: job.result
      ? {
          mediaId: job.result.mediaId,
          width: job.result.width,
          height: job.result.height,
        }
      : null,
    mediaId: job.result?.mediaId ?? null,
    imagePath: job.file?.imagePath ?? null,
    error: job.error ?? null,
    cancelRequested: Boolean(job.cancelRequested),
  }
}

function refreshAutomaticStats(job) {
  if (!automaticJob(job)) return
  const values = [
    ...archivedAttempts(job).map((attempt) =>
      safeAttemptStats(attempt.attemptStats),
    ),
    safeAttemptStats(job.autoRecovery.currentAttemptStats),
  ]
  if (values.some((value) => !value)) {
    job.attemptStats = null
    return
  }
  const sum = (key) => values.reduce((total, value) => total + value[key], 0)
  const starts = sum('starts')
  job.attemptStats = safeAttemptStats({
    version: 1,
    starts,
    retries: Math.max(0, starts - 1),
    confirmedSubmissions: sum('confirmedSubmissions'),
    notSent: sum('notSent'),
    uncertain: sum('uncertain'),
    rewrites: 0,
  })
}
function updateAttemptStats(job, input) {
  const previous = JSON.stringify(job.attemptStats ?? null)
  if (automaticJob(job)) {
    job.autoRecovery.currentAttemptStats = mergeAttemptStats(
      job.autoRecovery.currentAttemptStats,
      input,
    )
    refreshAutomaticStats(job)
  } else job.attemptStats = mergeAttemptStats(job.attemptStats, input)
  return JSON.stringify(job.attemptStats ?? null) !== previous
}

function safeError(error) {
  const result = {
    code: safeCode(error?.code ?? error?.message),
    submission: 'unknown',
  }
  const submission =
    error?.submission === 'not_sent' ? 'not-sent' : error?.submission
  if (['not-sent', 'rejected', 'accepted', 'unknown'].includes(submission))
    result.submission = submission
  if (
    ['model', 'account', 'quota-pool', 'connection', 'unknown'].includes(
      error?.scope,
    )
  )
    result.scope = error.scope
  if (Number.isSafeInteger(error?.retryAfter) && error.retryAfter >= 0)
    result.retryAfter = error.retryAfter
  if (Number.isSafeInteger(error?.retryAfterMs) && error.retryAfterMs >= 0)
    result.retryAfterMs = error.retryAfterMs
  if (error?.phase === 'upload') result.phase = 'upload'
  if (
    Number.isInteger(error?.rpcCode) &&
    error.rpcCode >= 0 &&
    error.rpcCode <= 16
  )
    result.rpcCode = error.rpcCode
  if (
    Number.isInteger(error?.httpStatus) &&
    error.httpStatus >= 100 &&
    error.httpStatus <= 599
  )
    result.httpStatus = error.httpStatus
  if (error?.responseKind === 'rpc_error') result.responseKind = 'rpc_error'
  if (
    [
      'generate',
      'upload',
      'createProject',
      'listProjects',
      'mediaDetail',
    ].includes(error?.operation)
  )
    result.operation = error.operation
  if (
    ['not_sent', 'not-sent', 'rejected', 'accepted', 'unknown'].includes(
      error?.operationSubmission,
    )
  )
    result.operationSubmission = error.operationSubmission
  // A Tools restriction hint never changes submission certainty or retry eligibility.
  if (
    result.code === 'TOOLS_SUBMISSION_UNKNOWN' &&
    (result.submission === 'unknown' ||
      (result.phase === 'upload' &&
        result.operationSubmission === 'unknown')) &&
    ['ACTIVITY_BLOCKED', 'CAPTCHA_REQUIRED', 'SESSION_REQUIRED'].includes(
      error?.recoveryReason,
    )
  )
    result.recoveryReason = error.recoveryReason
  // Dropping malformed fields must never create stronger evidence than the
  // worker sent (for example an unrecognized phase or fractional provider wait).
  if (
    isSettledInternalGenerationError(result) &&
    !isSettledInternalGenerationError(error)
  )
    delete result.responseKind
  return result
}

function attentionIncident(job) {
  if (job.state === 'unknown' && isSettledInternalGenerationError(job.error))
    return null
  if (
    job.state !== 'unknown' &&
    !ATTENTION_CODES.has(job.error?.code?.toUpperCase())
  )
    return null
  // Stable across duplicate job.state/job.error and snapshots; provider delays do
  // not create another incident every time the same receipt is replayed.
  return sha256(
    JSON.stringify([
      job.imageJobId,
      job.error?.code ?? 'result_unknown',
      job.error?.submission ?? 'unknown',
      job.error?.phase ?? null,
      job.error?.operationSubmission ?? null,
    ]),
  )
}

function safePolicy(input) {
  if (!input || typeof input !== 'object') return null
  const result = {}
  for (const key of [
    'limit',
    'used',
    'remaining',
    'windowMs',
    'nextCapacityAt',
    'retryAt',
    'autoResumeAt',
  ]) {
    result[key] =
      Number.isSafeInteger(input[key]) && input[key] >= 0 ? input[key] : null
  }
  if (
    input.unlimited === true &&
    input.limit === null &&
    input.remaining === null
  )
    result.unlimited = true
  result.pauseReason = ['budget', 'activity', 'activity_manual'].includes(
    input.pauseReason,
  )
    ? input.pauseReason
    : null
  return result
}

function normalizeJob(input, previous) {
  if (!input || !validId(input.imageJobId) || !validId(input.batchId))
    throw new Error('job_id_invalid')
  if (
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 50_000
  )
    throw new Error('prompt_invalid')
  const model = input.model ?? 'HARBOR_SEAL'
  const aspectRatio = input.aspectRatio ?? '16:9'
  const executionPlan = normalizeExecutionPlan(input.executionPlan)
  if (
    executionPlan &&
    (model !== 'HARBOR_SEAL' || !['16:9', '9:16'].includes(aspectRatio))
  )
    throw new Error('flow_tools_model_or_aspect_invalid')
  const seed = resolveExecutionSeed(
    input.seed,
    executionPlan,
    () => previous?.seed ?? randomInt(0, 2147483647),
  )
  if (!MODELS.has(model) || !ASPECTS.has(aspectRatio))
    throw new Error('model_or_aspect_invalid')
  if (input.references !== undefined && !Array.isArray(input.references))
    throw new Error('references_invalid')
  const references = input.references ?? []
  if (references.length > 10) throw new Error('references_too_many')
  const ids = new Set()
  const assets = []
  let referenceBytes = 0
  const normalized = references.map((reference) => {
    if (
      !reference ||
      !validId(reference.id) ||
      ids.has(reference.id) ||
      (reference.name !== undefined && typeof reference.name !== 'string') ||
      typeof reference.base64 !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(reference.base64) ||
      reference.base64.length > Math.ceil((10 * 1024 * 1024) / 3) * 4
    )
      throw new Error('reference_invalid')
    ids.add(reference.id)
    const bytes = Buffer.from(reference.base64, 'base64')
    if (
      bytes.toString('base64') !== reference.base64 ||
      bytes.length > 10 * 1024 * 1024
    )
      throw new Error('reference_invalid')
    referenceBytes += bytes.length
    if (referenceBytes > MAX_REFERENCE_TOTAL)
      throw new Error('references_too_large')
    const format = imageFormat(bytes)
    if (format.mimeType !== reference.mimeType)
      throw new Error('reference_mime_mismatch')
    const hash = sha256(bytes)
    if (reference.sha256 !== undefined && reference.sha256 !== hash)
      throw new Error('reference_hash_mismatch')
    assets.push({ hash, bytes })
    return {
      id: reference.id,
      name: (reference.name ?? reference.id).slice(0, 160),
      mimeType: format.mimeType,
      sha256: hash,
      byteLength: bytes.length,
    }
  })
  if (
    input.promptIndex !== undefined &&
    (!Number.isSafeInteger(input.promptIndex) ||
      input.promptIndex < 1 ||
      input.promptIndex > 10_000)
  )
    throw new Error('prompt_index_invalid')
  const job = {
    imageJobId: input.imageJobId,
    batchId: input.batchId,
    prompt: input.prompt.trim(),
    ...(input.promptIndex !== undefined
      ? { promptIndex: input.promptIndex }
      : previous?.promptIndex
        ? { promptIndex: previous.promptIndex }
        : {}),
    model,
    aspectRatio,
    seed,
    references: normalized,
    ...(executionPlan ? { executionPlan } : {}),
  }
  job.requestHash = sha256(JSON.stringify(executionHashInput(job)))
  if (input.requestHash !== undefined && input.requestHash !== job.requestHash)
    throw new Error('job_hash_mismatch')
  return { job, assets }
}

/** Prototipo nativo independiente; no importa ni modifica Vimo. onEvent jamás recibe credenciales Google/URLs. */
function automaticLinkScope(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    Object.keys(value).length !== 4 ||
    !RETRY_ID.test(value.bindingId ?? '') ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value.projectId ?? '',
    ) ||
    !/^[a-f0-9]{64}$/.test(value.accountKey ?? '')
  )
    return null
  return {
    version: 1,
    bindingId: value.bindingId,
    projectId: value.projectId,
    accountKey: value.accountKey,
  }
}
function sameAutomaticLink(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

export async function createBridge({
  port = 43127,
  dataDir,
  onEvent = () => {},
  downloader = downloadImage,
  trustedExtensionOrigins = [],
  allowExtensionLinkRequests = false,
  allowAutomaticLinks = false,
} = {}) {
  if (
    !dataDir ||
    !Number.isInteger(port) ||
    (port !== 0 && port < 1024) ||
    port > 65535
  )
    throw new Error('bridge_options_invalid')
  if (
    typeof allowExtensionLinkRequests !== 'boolean' ||
    typeof allowAutomaticLinks !== 'boolean' ||
    (allowAutomaticLinks && !allowExtensionLinkRequests) ||
    !Array.isArray(trustedExtensionOrigins) ||
    trustedExtensionOrigins.some((origin) => !ORIGIN.test(origin))
  )
    throw new Error('bridge_options_invalid')
  const configuredOrigins = new Set(trustedExtensionOrigins)
  const discoveries = new Map()
  const discoveryPairs = new Map()
  // No expulsar IDs vencidos: hacerlo permitiría convertir un replay en un gesto.
  // Sólo viven durante este proceso; nunca contienen el token de canje.
  const extensionLinkRequests = new Map()
  const extensionLinkRequestCounts = new Map()
  const store = await openStore(resolve(dataDir))
  let startupServer, startupWebSockets, startupHeartbeat
  try {
    const state = store.state
    // IDs are dictionary keys, never properties inherited from Object.prototype.
    state.jobs = Object.assign(Object.create(null), state.jobs)
    state.connections = Object.assign(Object.create(null), state.connections)
    const invalidRecord = (value) =>
      !value || typeof value !== 'object' || Array.isArray(value)
    if (
      Object.entries(state.jobs).some(
        ([id, job]) =>
          !validId(id) ||
          invalidRecord(job) ||
          job.imageJobId !== id ||
          (job.state === 'deleted' &&
            (!RETRY_ID.test(job.deletionId ?? '') ||
              !Number.isFinite(Date.parse(job.deletedAt)))) ||
          (job.generationRetryHistory !== undefined &&
            (!Array.isArray(job.generationRetryHistory) ||
              job.generationRetryHistory.length > MAX_GENERATION_RETRIES ||
              job.generationRetryHistory.some(
                (item) =>
                  invalidRecord(item) ||
                  !RETRY_ID.test(item.retryRequestId ?? '') ||
                  !RETRY_ID.test(item.attemptId ?? ''),
              ))),
      ) ||
      Object.entries(state.connections).some(
        ([id, connection]) =>
          !validId(id) ||
          invalidRecord(connection) ||
          connection.connectionId !== id ||
          (connection.linkedAccountKey !== undefined &&
            !/^[a-f0-9]{64}$/.test(connection.linkedAccountKey)),
      )
    ) {
      throw new Error('store_schema_invalid')
    }
    if (
      state.providerHolds !== undefined &&
      (!state.providerHolds ||
        typeof state.providerHolds !== 'object' ||
        Array.isArray(state.providerHolds))
    ) {
      await store.close()
      throw new Error('store_schema_invalid')
    }
    state.providerHolds = Object.assign(
      Object.create(null),
      state.providerHolds ?? {},
    )
    if (
      Object.entries(state.providerHolds).some(
        ([id, hold]) =>
          !validId(id) ||
          invalidRecord(hold) ||
          !Number.isSafeInteger(hold.notBefore) ||
          hold.notBefore < 0 ||
          typeof hold.incident !== 'string',
      )
    )
      throw new Error('store_schema_invalid')
    if (
      state.batches !== undefined &&
      (!state.batches ||
        typeof state.batches !== 'object' ||
        Array.isArray(state.batches))
    ) {
      await store.close()
      throw new Error('store_schema_invalid')
    }
    state.batches = Object.assign(Object.create(null), state.batches ?? {})
    for (const [id, batch] of Object.entries(state.batches)) {
      if (
        !validId(id) ||
        batch?.batchId !== id ||
        !Number.isSafeInteger(batch.requestedCount) ||
        batch.requestedCount < 1 ||
        batch.requestedCount > 10_000 ||
        !['prepared', 'canceled', 'deleted'].includes(batch.status) ||
        (batch.status === 'deleted' &&
          (!RETRY_ID.test(batch.deletionId ?? '') ||
            !Number.isFinite(Date.parse(batch.deletedAt)))) ||
        !Array.isArray(batch.allocations) ||
        !batch.allocations.length ||
        batch.allocations.some(
          (item) =>
            !validId(item?.connectionId) ||
            !Number.isSafeInteger(item.count) ||
            item.count < 1 ||
            !Number.isSafeInteger(item.submitted) ||
            item.submitted < 0 ||
            item.submitted > item.count,
        ) ||
        new Set(batch.allocations.map((item) => item.connectionId)).size !==
          batch.allocations.length ||
        batch.allocations.reduce((sum, item) => sum + item.count, 0) !==
          batch.requestedCount
      ) {
        await store.close()
        throw new Error('store_schema_invalid')
      }
    }
    try {
      for (const batch of Object.values(state.batches))
        normalizeExecutionPlan(batch.executionPlan)
      for (const job of Object.values(state.jobs)) {
        const plan = normalizeExecutionPlan(job.executionPlan)
        if (
          plan &&
          (job.seed !== null ||
            job.model !== 'HARBOR_SEAL' ||
            !['16:9', '9:16'].includes(job.aspectRatio))
        )
          throw new Error()
        const batch = state.batches[job.batchId]
        if (batch && !executionPlansEqual(plan, batch.executionPlan))
          throw new Error()
      }
    } catch {
      throw new Error('store_execution_plan_invalid')
    }
    for (const batch of Object.values(state.batches)) {
      normalizeAutoRecoveryVersion(batch.autoRecoveryVersion)
      if (
        batch.autoRecoveryVersion === 1 &&
        (!batch.connectionProjects ||
          Array.isArray(batch.connectionProjects) ||
          Object.entries(batch.connectionProjects).some(
            ([connectionId, projectId]) =>
              !validId(connectionId) || !validId(projectId),
          ))
      )
        throw new Error('store_auto_recovery_invalid')
    }
    for (const job of Object.values(state.jobs)) {
      normalizeAutoRecoveryVersion(job.autoRecoveryVersion)
      if (!job.autoRecoveryVersion) continue
      const recovery = job.autoRecovery
      if (
        (recovery?.maxReplacements !== undefined &&
          ![2, 4].includes(recovery.maxReplacements)) ||
        !automaticJob(job) ||
        state.batches[job.batchId]?.autoRecoveryVersion !== 1 ||
        !Number.isSafeInteger(job.automaticRetryCount) ||
        job.automaticRetryCount < 0 ||
        (job.automaticRetryCount > (recovery.maxReplacements ?? 2) &&
          job.persistentRecoveryVersion !== 1) ||
        !Number.isSafeInteger(recovery.replacementCount) ||
        recovery.replacementCount < 0 ||
        (recovery.replacementCount > (recovery.maxReplacements ?? 2) &&
          job.persistentRecoveryVersion !== 1) ||
        !Array.isArray(recovery.attempts) ||
        recovery.attempts.length !== recovery.replacementCount ||
        ![
          'pending',
          'reconciling',
          'backoff',
          'exhausted',
          'completed',
          'canceled',
        ].includes(recovery.status) ||
        !Number.isInteger(recovery.downloadAttempts) ||
        recovery.downloadAttempts < 0 ||
        recovery.downloadAttempts > 3 ||
        (recovery.stoppedReason !== undefined &&
          ![
            'project_changed',
            'reference_file_unavailable',
            'all_accounts_exhausted',
          ].includes(recovery.stoppedReason)) ||
        ['nextAttemptAt', 'lastProgressAt', 'unknownSince'].some(
          (key) =>
            recovery[key] !== null &&
            (!Number.isSafeInteger(recovery[key]) || recovery[key] < 0),
        ) ||
        [job, ...recovery.attempts].some(
          (attempt) =>
            !Number.isSafeInteger(attempt.automaticRetryCount) ||
            attempt.automaticRetryCount < 0 ||
            (attempt.automaticRetryCount > (recovery.maxReplacements ?? 2) &&
              attempt.persistentRecoveryVersion !== 1) ||
            (attempt.automaticRetryCount > 0 &&
              (!RETRY_ID.test(attempt.retryRequestId ?? '') ||
                !RETRY_ID.test(attempt.previousAttemptId ?? '') ||
                !validId(attempt.previousConnectionId))),
        ) ||
        recovery.attempts.some(
          (attempt) =>
            !RETRY_ID.test(attempt.attemptId ?? '') ||
            !validId(attempt.connectionId) ||
            attempt.imageJobId !== job.imageJobId ||
            attempt.requestHash !== job.requestHash ||
            !executionPlansEqual(attempt.executionPlan, job.executionPlan),
        ) ||
        !persistentRecoveryHistoryValid(job)
      )
        throw new Error('store_auto_recovery_invalid')
    }
    if (
      state.generationNotBefore !== undefined &&
      (!Number.isSafeInteger(state.generationNotBefore) ||
        state.generationNotBefore < 0)
    ) {
      await store.close()
      throw new Error('store_schema_invalid')
    }
    state.generationNotBefore ??= 0
    // Existing terminal receipts have already been presented to the user. Do not
    // reintroduce their resolved pause on the first snapshot after upgrading.
    for (const job of Object.values(state.jobs)) {
      if (!job.attentionIncident) job.attentionIncident = attentionIncident(job)
    }
    const sockets = new Map()
    const downloads = new Map()
    const urlRefreshes = new Map()
    const retrySentAt = new Map()
    const deletionSentAt = new Map()
    let pairing
    let stopped = false
    let stopping = false
    let closePromise
    let persistenceFailed = false
    let actualPort
    let cadenceTimer
    let operations = Promise.resolve()
    const emit = (event) =>
      onEvent({ ...event, timestamp: new Date().toISOString() })
    const run = (operation) => {
      const next = operations.then(async () => {
        if (stopped) throw new Error('bridge_closed')
        if (persistenceFailed) throw new Error('bridge_storage_failed')
        return operation()
      })
      operations = next.catch(() => {})
      return next
    }
    async function persist() {
      try {
        await store.save()
      } catch {
        persistenceFailed = true
        emit({ type: 'bridge.error', error: { code: 'bridge_storage_failed' } })
        for (const socket of sockets.values())
          socket.close(1011, 'storage unavailable')
        throw new Error('bridge_storage_failed')
      }
    }
    function providerHeld() {
      return Object.keys(state.providerHolds).length > 0
    }
    function effectivelyPaused() {
      return (
        state.paused ||
        providerHeld() ||
        linkedCount(state.connections) > MAX_LINKED_PROFILES
      )
    }
    function publicHolds() {
      return Object.entries(state.providerHolds).map(
        ([connectionId, hold]) => ({
          connectionId,
          code: hold.code,
          notBefore: hold.notBefore,
        }),
      )
    }
    function broadcastProviderHold() {
      for (const socket of sockets.values())
        send(socket, {
          type: 'queue.pause',
          paused: stopping || providerHeld(),
          reason: 'provider',
        })
    }
    async function pauseForAttention(job) {
      const incident = attentionIncident(job)
      if (!incident || incident === job.attentionIncident) return
      job.attentionIncident = incident
      const connection = state.connections[job.connectionId]
      if (!connection) return
      if (profileScopedRejection(job) || job.autoRecoveryVersion === 1) {
        // Persist the owner's quarantine before scheduling another profile. The
        // worker owns its recovery deadline and one-pending-job check state.
        connection.profileIncident = {
          incident,
          notBefore: Math.max(
            connection.providerNotBefore ?? 0,
            connection.profileAvailability?.nextCheckAt ?? 0,
            Date.now(),
          ),
          sessionRevision: connection.sessionRevision ?? 0,
        }
        await persist()
        emit({
          type: 'connection.paused',
          ...connectionSummary(connection),
          reason: 'account_usage',
        })
        return
      }
      const providerDelay = Number.isSafeInteger(job.error?.retryAfterMs)
        ? job.error.retryAfterMs
        : 0
      // The worker already converted Retry-After to an absolute persisted deadline.
      // Re-basing the same duration on message arrival would extend it and could
      // strand an owner that announced recovery at its correct deadline.
      const providerDeadline =
        connection.providerNotBefore > 0
          ? connection.providerNotBefore
          : Math.min(Number.MAX_SAFE_INTEGER, Date.now() + providerDelay)
      const previous = state.providerHolds[job.connectionId]
      state.providerHolds[job.connectionId] = {
        incident,
        code: job.error?.code ?? 'result_unknown',
        notBefore: Math.max(
          previous?.notBefore ?? 0,
          connection.providerNotBefore ?? 0,
          connection.accountPolicy?.autoResumeAt ?? 0,
          providerDeadline,
        ),
        sessionRevision: connection.sessionRevision ?? 0,
        recoveryPermitSequence: connection.recoveryPermit?.sequence ?? 0,
      }
      await persist()
      broadcastProviderHold()
      emit({
        type: 'bridge.paused',
        paused: true,
        manualPaused: state.paused,
        reason: job.error?.code ?? 'result_unknown',
        providerHolds: publicHolds(),
      })
    }
    function reconcileInternalErrorHold(job, previousIncident, previousError) {
      // A crash can persist the upgraded receipt before removing its legacy hold.
      // Its exact old incident remains the authority across that intermediate state.
      if (
        (previousError?.code !== 'SUBMISSION_UNKNOWN' &&
          !isSettledInternalGenerationError(previousError)) ||
        !isSettledInternalGenerationError(job.error)
      )
        return false
      const hold = state.providerHolds[job.connectionId]
      if (
        !hold ||
        hold.incident !== previousIncident ||
        hold.code !== 'SUBMISSION_UNKNOWN' ||
        hold.notBefore > Date.now()
      )
        return false
      const connection = state.connections[job.connectionId]
      if (connection?.providerNotBefore > Date.now()) return false
      // A connection has one hold slot. Another unresolved incident must keep the
      // bridge paused even if the old RPC13 happened to be the last writer.
      if (
        Object.values(state.jobs).some(
          (other) =>
            other !== job &&
            other.connectionId === job.connectionId &&
            attentionIncident(other) &&
            other.attentionIncident === attentionIncident(other),
        )
      )
        return false
      delete state.providerHolds[job.connectionId]
      job.attentionIncident = null
      return true
    }
    async function releaseProviderHold(connection) {
      const hold = state.providerHolds[connection.connectionId]
      if (
        !hold ||
        !profileEligible(state.connections, connection) ||
        !connection.reconciled ||
        !connection.binding?.ready ||
        connection.paused ||
        connection.revoked ||
        !sockets.has(connection.connectionId) ||
        (connection.sessionRevision ?? 0) <= hold.sessionRevision ||
        Math.max(
          hold.notBefore,
          connection.providerNotBefore ?? 0,
          connection.accountPolicy?.autoResumeAt ?? 0,
        ) > Date.now()
      )
        return
      if (
        connection.scheduling?.recoveryPermitVersion === 1 &&
        Object.values(state.jobs).some(
          (job) =>
            job.connectionId === connection.connectionId &&
            job.state === 'unknown' &&
            remoteActive(job),
        )
      ) {
        const permit = freeRecoveryPermit(connection)
        if (!permit || permit.sequence <= (hold.recoveryPermitSequence ?? 0))
          return
      }
      delete state.providerHolds[connection.connectionId]
      await persist()
      broadcastProviderHold()
      emit({
        type: 'bridge.paused',
        paused: effectivelyPaused(),
        manualPaused: state.paused,
        reason: 'provider_session_ready',
        providerHolds: publicHolds(),
      })
    }
    const send = (socket, frame) => {
      if (socket?.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify(frame))
      return true
    }
    function canDeleteJob(job) {
      return Boolean(
        job &&
        !job.deletedAt &&
        LOCAL_DELETE_STATES.has(job.state) &&
        !downloads.has(job.imageJobId) &&
        !archivedAttempts(job).some(
          (attempt) =>
            remoteActive(attempt) ||
            attempt.error?.operationSubmission === 'unknown',
        ) &&
        job.generationRetry?.status !== 'pending' &&
        job.error?.submission !== 'unknown' &&
        job.error?.operationSubmission !== 'unknown',
      )
    }
    function jobSummary(job, includeContent = false) {
      return {
        ...baseJobSummary(job, includeContent),
        localDeletable: canDeleteJob(job),
      }
    }
    function deletedJobSummary(job) {
      return {
        imageJobId: job.imageJobId,
        batchId: job.batchId,
        promptIndex: job.promptIndex ?? null,
        ...planFields(job),
        deletionId: job.deletionId,
        deletedAt: job.deletedAt,
        cleanupPending: Boolean(job.localCleanupPending),
        workerCleanupPending:
          Boolean(job.connectionId && !job.workerDeletedAt) ||
          archivedAttempts(job).some((attempt) => !attempt.workerDeletedAt),
        ...(job.localCleanupError
          ? { cleanupError: job.localCleanupError }
          : {}),
        ...(job.workerDeletionError
          ? { workerCleanupError: job.workerDeletionError }
          : {}),
      }
    }
    function canDeleteBatch(batch) {
      return Boolean(
        batch &&
        !batch.deletedAt &&
        (batch.status === 'canceled' ||
          batch.allocations.every((item) => item.count === item.submitted)) &&
        Object.values(state.jobs)
          .filter((job) => job.batchId === batch.batchId)
          .every((job) => job.deletedAt || canDeleteJob(job)),
      )
    }
    function markDeleted(job, deletedAt) {
      if (job.deletedAt) return
      job.deletionId = randomUUID()
      job.deletedAt = deletedAt
      job.previousState = job.state
      job.state = 'deleted'
      job.localCleanupPending = true
      job.attentionIncident = null
      // Keep only identity, order and audit information needed to fence replays.
      for (const key of [
        'prompt',
        'references',
        'result',
        'file',
        'error',
        'binding',
        'urlRefreshRequested',
        'cancelRequested',
      ])
        delete job[key]
      for (const attempt of archivedAttempts(job))
        markDeleted(attempt, deletedAt)
      retrySentAt.delete(job.generationRetry?.retryRequestId)
    }
    async function cleanupDeletedJob(job, commit = true) {
      if (!job.deletedAt || !job.localCleanupPending) return
      let failure
      for (const extension of ['png', 'jpg', 'webp']) {
        try {
          await unlink(
            join(store.directory, 'results', `${job.imageJobId}.${extension}`),
          )
        } catch (error) {
          if (error.code !== 'ENOENT') failure ??= safeCode(error.code)
        }
      }
      job.localCleanupPending = Boolean(failure)
      if (failure) job.localCleanupError = failure
      else delete job.localCleanupError
      if (commit) await persist()
    }
    function sendDeletedJob(
      job,
      socket = sockets.get(job.connectionId),
      force = false,
    ) {
      for (const attempt of archivedAttempts(job))
        sendDeletedJob(attempt, sockets.get(attempt.connectionId), force)
      if (
        stopping ||
        !job.deletedAt ||
        job.workerDeletedAt ||
        !job.connectionId ||
        state.connections[job.connectionId]?.localDeletionSupported !== true ||
        (!force &&
          (job.workerDeletionError ||
            Date.now() - (deletionSentAt.get(job.deletionId) ?? 0) < 20_000))
      )
        return
      if (
        send(socket, {
          type: 'job.delete',
          imageJobId: job.imageJobId,
          requestHash: job.requestHash,
          ...planFields(job),
          attemptId: job.attemptId ?? null,
          deletionId: job.deletionId,
          deletedAt: job.deletedAt,
        })
      )
        deletionSentAt.set(job.deletionId, Date.now())
    }
    function acknowledgeDeletion(job, receipt) {
      if (
        !job.deletedAt ||
        receipt.deletionId !== job.deletionId ||
        receipt.requestHash !== job.requestHash ||
        (receipt.attemptId ?? null) !== (job.attemptId ?? null)
      )
        throw new Error('deletion_identity_mismatch')
      if (job.workerDeletedAt) return false
      job.workerDeletedAt = new Date().toISOString()
      delete job.workerDeletionError
      deletionSentAt.delete(job.deletionId)
      return true
    }
    function trustedOrigin(origin) {
      return (
        configuredOrigins.has(origin) ||
        Object.values(state.connections).some(
          (connection) => !connection.revoked && connection.origin === origin,
        )
      )
    }
    function removeDiscovery(socket) {
      if (!socket.discoveryId) return
      discoveries.delete(socket.discoveryId)
      discoveryPairs.delete(socket.discoveryId)
      delete socket.discoveryId
    }
    function discoveryList() {
      const profiles = []
      for (const [id, entry] of discoveries) {
        if (
          entry.expiresAt <= Date.now() ||
          entry.socket.readyState !== WebSocket.OPEN
        ) {
          removeDiscovery(entry.socket)
          entry.socket.close(1000, 'presence expired')
          continue
        }
        const existing = Object.values(state.connections).find(
          (connection) =>
            connection.installationId === entry.installationId &&
            !connection.revoked,
        )
        const duplicateAccount = Object.values(state.connections).some(
          (connection) =>
            !connection.revoked &&
            connection.installationId !== entry.installationId &&
            entry.identity.verified &&
            ((connection.identity?.verified &&
              connection.identity.accountKey === entry.identity.accountKey) ||
              connection.linkedAccountKey === entry.identity.accountKey),
        )
        const trusted = trustedOrigin(entry.origin)
        profiles.push({
          discoveryId: id,
          installationId: entry.installationId,
          alias: entry.alias,
          extensionVersion: safeExtensionVersion(entry.extensionVersion),
          identity: entry.identity,
          hasFlowTab: entry.hasFlowTab,
          panelOpen: entry.panelOpen,
          expiresAt: entry.expiresAt,
          linked: Boolean(existing),
          trusted,
          duplicateAccount,
          canLink:
            !existing &&
            !duplicateAccount &&
            entry.identity.verified &&
            entry.hasFlowTab &&
            trusted &&
            canLink(state.connections, entry.installationId),
        })
      }
      return {
        type: 'discovery.list',
        profiles,
        maxConnections: MAX_LINKED_PROFILES,
        linkedCount: linkedCount(state.connections),
      }
    }
    function announceDiscovery(socket, frame, origin) {
      const automaticLink = automaticLinkScope(frame.automaticLink)
      if (frame.automaticLink !== undefined && !automaticLink)
        throw new Error('automatic_link_invalid')
      if (
        !validId(frame.installationId) ||
        (frame.panelOpen !== true && !automaticLink)
      )
        throw new Error('discovery_invalid')
      if (
        automaticLink &&
        (!allowAutomaticLinks ||
          !allowExtensionLinkRequests ||
          !configuredOrigins.has(origin))
      )
        throw new Error('automatic_link_disabled')
      if (
        automaticLink &&
        (!safeIdentity(frame.identity).verified ||
          automaticLink.accountKey !== safeIdentity(frame.identity).accountKey)
      )
        throw new Error('discovery_link_request_mismatch')
      if (
        automaticLink &&
        Object.values(state.connections).some(
          (value) =>
            value.installationId === frame.installationId && value.revoked,
        )
      )
        throw new Error('automatic_link_revoked')
      if (!socket.discoveryId && discoveries.size >= 100)
        throw new Error('discovery_full')
      const previous = socket.discoveryId
        ? discoveries.get(socket.discoveryId)
        : null
      if (
        previous &&
        (previous.installationId !== frame.installationId ||
          previous.origin !== origin)
      )
        throw new Error('discovery_identity_changed')
      for (const entry of discoveries.values()) {
        if (
          entry.socket !== socket &&
          entry.installationId === frame.installationId &&
          entry.origin === origin
        ) {
          removeDiscovery(entry.socket)
          entry.socket.close(1000, 'presence replaced')
        }
      }
      socket.discoveryId ??= randomUUID()
      const entry = {
        socket,
        origin,
        discoveryId: socket.discoveryId,
        installationId: frame.installationId,
        extensionVersion: safeExtensionVersion(frame.extensionVersion),
        alias:
          typeof frame.alias === 'string'
            ? frame.alias.slice(0, 80)
            : 'Perfil de Chrome',
        identity: safeIdentity(frame.identity),
        hasFlowTab: frame.hasFlowTab === true,
        panelOpen: frame.panelOpen === true,
        automaticLink,
        expiresAt: Date.now() + DISCOVERY_TTL_MS,
      }
      // A -> B -> A no puede revivir el nonce de A; los requestId consumidos
      // siguen en el ledger aunque la presencia o la preparación cambie.
      if (
        previous &&
        (previous.identity.verified !== entry.identity.verified ||
          previous.identity.accountKey !== entry.identity.accountKey ||
          previous.hasFlowTab !== entry.hasFlowTab ||
          !sameAutomaticLink(previous.automaticLink, entry.automaticLink))
      )
        discoveryPairs.delete(socket.discoveryId)
      discoveries.set(socket.discoveryId, entry)
      clearTimeout(socket.authTimeout)
      socket.authTimeout = setTimeout(() => {
        removeDiscovery(socket)
        socket.close(1000, 'presence expired')
      }, DISCOVERY_TTL_MS)
      send(socket, {
        type: 'discovery.ready',
        discoveryId: entry.discoveryId,
        expiresAt: entry.expiresAt,
        ...(allowExtensionLinkRequests
          ? {
              capabilities: {
                extensionLinkRequest: true,
                ...(allowAutomaticLinks ? { automaticLinkVersion: 1 } : {}),
              },
            }
          : {}),
      })
      emit({
        type: 'discovery.changed',
        profiles: discoveryList().profiles,
        maxConnections: MAX_LINKED_PROFILES,
        linkedCount: linkedCount(state.connections),
      })
    }
    function linkDiscovery(discoveryId) {
      if (!validId(discoveryId)) throw new Error('discovery_invalid')
      const profile = discoveryList().profiles.find(
        (item) => item.discoveryId === discoveryId,
      )
      if (!profile) throw new Error('discovery_expired')
      if (!profile.trusted) throw new Error('discovery_origin_untrusted')
      if (profile.linked) throw new Error('discovery_already_linked')
      if (profile.duplicateAccount) throw new Error('account_already_linked')
      if (!profile.identity.verified || !profile.hasFlowTab)
        throw new Error('discovery_not_ready')
      if (!canLink(state.connections, profile.installationId))
        throw new Error('connection_limit_reached')
      const entry = discoveries.get(discoveryId)
      if (
        entry.automaticLink &&
        Object.values(state.connections).some(
          (value) =>
            value.installationId === entry.installationId && value.revoked,
        )
      )
        throw new Error('automatic_link_revoked')
      const pending = discoveryPairs.get(discoveryId)
      if (
        pending &&
        pending.socket === entry.socket &&
        pending.origin === entry.origin &&
        pending.installationId === entry.installationId &&
        pending.accountKey === entry.identity.accountKey &&
        sameAutomaticLink(pending.automaticLink, entry.automaticLink) &&
        pending.expiresAt > Date.now()
      ) {
        return { type: 'discovery.linking', discoveryId }
      }
      const token = secret()
      discoveryPairs.set(discoveryId, {
        socket: entry.socket,
        origin: entry.origin,
        installationId: entry.installationId,
        accountKey: entry.identity.accountKey,
        automaticLink: entry.automaticLink,
        tokenHash: sha256(token),
        expiresAt: Date.now() + 30_000,
      })
      if (
        !send(entry.socket, { type: 'discovery.pair', token, port: actualPort })
      )
        throw new Error('discovery_expired')
      return { type: 'discovery.linking', discoveryId }
    }
    function requestDiscoveryLink(socket, frame, origin) {
      if (!allowExtensionLinkRequests)
        throw new Error('discovery_link_request_disabled')
      if (
        typeof frame.requestId !== 'string' ||
        !RETRY_ID.test(frame.requestId) ||
        !validId(frame.discoveryId) ||
        !validId(frame.installationId) ||
        Object.keys(frame).some(
          (key) =>
            ![
              'type',
              'requestId',
              'discoveryId',
              'installationId',
              'identity',
              'automaticLink',
            ].includes(key),
        )
      )
        throw new Error('discovery_link_request_invalid')
      if (!configuredOrigins.has(origin))
        throw new Error('discovery_origin_untrusted')
      const entry = discoveries.get(socket.discoveryId)
      const identity = safeIdentity(frame.identity)
      const automaticLink = automaticLinkScope(frame.automaticLink)
      if (
        (frame.automaticLink !== undefined && !automaticLink) ||
        !sameAutomaticLink(automaticLink, entry?.automaticLink)
      )
        throw new Error('discovery_link_request_mismatch')
      if (
        automaticLink &&
        (!allowAutomaticLinks ||
          Object.values(state.connections).some(
            (value) =>
              value.installationId === frame.installationId && value.revoked,
          ))
      )
        throw new Error('automatic_link_revoked')
      if (
        !entry ||
        entry.socket !== socket ||
        entry.discoveryId !== frame.discoveryId ||
        entry.installationId !== frame.installationId ||
        entry.origin !== origin ||
        !entry.identity.verified ||
        !identity.verified ||
        identity.accountKey !== entry.identity.accountKey
      )
        throw new Error('discovery_link_request_mismatch')
      if (entry.expiresAt <= Date.now() || socket.readyState !== WebSocket.OPEN)
        throw new Error('discovery_expired')
      const requestId = frame.requestId.toLowerCase()
      const previous = extensionLinkRequests.get(requestId)
      const pending = discoveryPairs.get(entry.discoveryId)
      if (previous) {
        if (
          previous.discoveryId !== entry.discoveryId ||
          previous.installationId !== entry.installationId ||
          previous.origin !== origin ||
          previous.expiresAt <= Date.now() ||
          !pending ||
          previous.tokenHash !== pending.tokenHash
        )
          throw new Error('discovery_link_request_expired')
      } else {
        const count = extensionLinkRequestCounts.get(entry.installationId) ?? 0
        if (
          count >= MAX_LINK_REQUESTS_PER_INSTALLATION ||
          extensionLinkRequests.size >= MAX_LINK_REQUESTS
        )
          throw new Error('discovery_link_request_limit')
        // linkDiscovery vuelve a validar origen, cuenta duplicada, preparación
        // y límite de vínculos; un doble clic comparte el canje aún vigente.
        linkDiscovery(entry.discoveryId)
        const pairing = discoveryPairs.get(entry.discoveryId)
        extensionLinkRequests.set(requestId, {
          discoveryId: entry.discoveryId,
          installationId: entry.installationId,
          origin,
          expiresAt: pairing.expiresAt,
          tokenHash: pairing.tokenHash,
        })
        extensionLinkRequestCounts.set(entry.installationId, count + 1)
      }
      send(socket, {
        type: 'discovery.linking',
        requestId: frame.requestId,
        discoveryId: entry.discoveryId,
      })
    }
    function pairingCode() {
      pairing = { token: secret(), expiresAt: Date.now() + 300_000 }
      return `vimo-flow:v1:${Buffer.from(JSON.stringify({ port: actualPort, token: pairing.token })).toString('base64url')}`
    }
    function rememberVerifiedIdentity(connection, value = connection.identity) {
      const identity = safeIdentity(value)
      if (identity.verified) {
        connection.lastVerifiedIdentity = identity
        return
      }
      const previous = safeIdentity(connection.lastVerifiedIdentity)
      connection.lastVerifiedIdentity = previous.verified ? previous : null
    }
    function connectionSummary(connection) {
      // Metadato de presentación: jamás participa en admisión ni autenticación.
      const lastVerifiedIdentity = safeIdentity(connection.lastVerifiedIdentity)
      return {
        connectionId: connection.connectionId,
        installationId: connection.installationId,
        alias: connection.alias,
        extensionVersion: safeExtensionVersion(connection.extensionVersion),
        connected: sockets.has(connection.connectionId),
        revoked: Boolean(connection.revoked),
        paused: Boolean(connection.paused),
        binding: connection.binding ?? null,
        providerNotBefore: connection.providerNotBefore ?? 0,
        accountPolicy: connection.accountPolicy ?? null,
        capacity: connection.capacity ?? null,
        sessionObservedAt: connection.sessionObservedAt ?? null,
        generationRetrySupported: connection.generationRetrySupported === true,
        localDeletionSupported: connection.localDeletionSupported === true,
        flowTools: connection.flowTools ?? null,
        generationNotBefore: connection.generationNotBefore ?? 0,
        scheduling: connection.scheduling ?? null,
        identity: connection.identity ?? safeIdentity(null),
        lastVerifiedIdentity: lastVerifiedIdentity.verified
          ? lastVerifiedIdentity
          : null,
        identityConflict: identityConflict(state.connections, connection),
        profileAvailability:
          connection.profileAvailability ?? safeAvailability(null),
      }
    }
    function status() {
      const deletedJobs = Object.values(state.jobs)
        .filter((job) => job.deletedAt)
        .map(deletedJobSummary)
      const deletedBatches = Object.values(state.batches)
        .filter((batch) => batch.deletedAt)
        .map((batch) => ({
          batchId: batch.batchId,
          deletionId: batch.deletionId,
          deletedAt: batch.deletedAt,
        }))
      return {
        type: 'bridge.status',
        capabilities: {
          localDeletion: true,
          autoRecovery: { ...AUTO_RECOVERY_CAPABILITY },
          flowTools: { ...FLOW_TOOLS_COORDINATOR_CAPABILITY },
        },
        paused: effectivelyPaused(),
        manualPaused: state.paused,
        providerHolds: publicHolds(),
        generationNotBefore: state.generationNotBefore,
        minimumProfiles: MIN_LINKED_PROFILES,
        configuredProfiles: reportCapacity(1, null, undefined, 1)
          .configuredProfiles,
        readyProfiles: Object.values(state.connections).filter(
          (connection) =>
            sockets.has(connection.connectionId) &&
            connection.reconciled &&
            connection.binding?.ready &&
            !connection.paused &&
            dispatchCapacityReady(connection),
        ).length,
        maxConnections: MAX_LINKED_PROFILES,
        linkedCount: linkedCount(state.connections),
        discoveries: discoveryList().profiles,
        connections: Object.values(state.connections).map(connectionSummary),
        jobs: Object.values(state.jobs)
          .filter((job) => !job.deletedAt)
          .sort((a, b) =>
            a.batchId === b.batchId
              ? (a.promptIndex ?? 0) - (b.promptIndex ?? 0)
              : String(a.createdAt).localeCompare(String(b.createdAt)),
          )
          .map((job) => jobSummary(job, true)),
        batches: Object.values(state.batches)
          .filter((batch) => !batch.deletedAt)
          .map(batchSummary),
        deletedJobs,
        deletedBatches,
        deletedImageIds: deletedJobs.map((job) => job.imageJobId),
        deletedBatchIds: deletedBatches.map((batch) => batch.batchId),
      }
    }
    function selectedConnections(command) {
      if (
        command.connectionId !== undefined &&
        (command.connectionIds !== undefined || !validId(command.connectionId))
      )
        throw new Error('connection_invalid')
      const ids =
        command.connectionIds ??
        (command.connectionId ? [command.connectionId] : null)
      if (ids === null) return null
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 1000 ||
        ids.some(
          (id) =>
            !validId(id) ||
            !state.connections[id] ||
            state.connections[id].revoked,
        )
      )
        throw new Error('connection_invalid')
      return [...new Set(ids)].sort()
    }
    function reportCapacity(
      requestedCount,
      connectionIds,
      executionPlan,
      autoRecoveryVersion,
    ) {
      const report = capacityReport({
        connections: state.connections,
        jobs: state.jobs,
        batches: state.batches,
        connectedIds: new Set(sockets.keys()),
        requestedCount,
        connectionIds,
        executionPlan,
        autoRecoveryVersion,
      })
      report.maxConnections = MAX_LINKED_PROFILES
      report.linkedCount = linkedCount(state.connections)
      report.linkSlotsRemaining = Math.max(
        0,
        MAX_LINKED_PROFILES - report.linkedCount,
      )
      if (report.requiredAdditionalProfiles > report.linkSlotsRemaining) {
        report.message += ` El máximo es ${MAX_LINKED_PROFILES} vinculaciones; recupera capacidad o libera una vinculación antes de añadir otra.`
      }
      // A provider incident of unknown scope never becomes an account rotation.
      if (providerHeld())
        Object.assign(report, {
          canPrepare: false,
          blockedReason: 'provider_hold',
          message:
            'Flow requiere esperar o revisar una alerta. Resuelve esa alerta antes de preparar otro lote; conectar perfiles no levanta esta pausa.',
        })
      return report
    }
    function batchSummary(batch) {
      const submittedCount = batch.allocations.reduce(
        (sum, item) => sum + item.submitted,
        0,
      )
      const deleted = Object.values(state.jobs).filter(
        (job) => job.batchId === batch.batchId && job.deletedAt,
      )
      return {
        ...(batch.autoRecoveryVersion
          ? { autoRecoveryVersion: batch.autoRecoveryVersion }
          : {}),
        batchId: batch.batchId,
        requestedCount: batch.requestedCount,
        status: batch.status,
        ...planFields(batch),
        submittedCount,
        remainingCount:
          batch.status === 'prepared'
            ? batch.requestedCount - submittedCount
            : 0,
        localDeletable: canDeleteBatch(batch),
        deletedCount: deleted.length,
        deletedPromptIndexes: deleted
          .map((job) => job.promptIndex)
          .filter((index) => Number.isSafeInteger(index) && index > 0),
        allocations: batch.allocations.map((item) => ({ ...item })),
        connectionIds: batch.connectionIds,
        createdAt: batch.createdAt,
      }
    }
    function prepareBatch(
      batchId,
      requestedCount,
      connectionIds,
      inputPlan,
      inputRecoveryVersion,
    ) {
      const executionPlan = normalizeExecutionPlan(inputPlan)
      const autoRecoveryVersion =
        normalizeAutoRecoveryVersion(inputRecoveryVersion)
      if (!validId(batchId)) throw new Error('batch_id_invalid')
      const previous = state.batches[batchId]
      if (previous) {
        if (previous.deletedAt) throw new Error('batch_deleted')
        if (
          previous.requestedCount !== requestedCount ||
          JSON.stringify(previous.connectionIds) !==
            JSON.stringify(connectionIds) ||
          !executionPlansEqual(previous.executionPlan, executionPlan) ||
          previous.autoRecoveryVersion !== autoRecoveryVersion
        )
          throw new Error('batch_id_conflict')
        if (previous.status !== 'prepared') throw new Error('batch_canceled')
        return { batch: previous }
      }
      if (
        Object.values(state.batches).filter(
          (batch) =>
            batch.status === 'prepared' &&
            batch.allocations.some((item) => item.count > item.submitted),
        ).length >= 100
      )
        throw new Error('batch_plans_full')
      const report = reportCapacity(
        requestedCount,
        connectionIds,
        executionPlan,
        autoRecoveryVersion,
      )
      if (!report.canPrepare)
        return {
          event: { type: 'batch.capacity_required', batchId, ...report },
        }
      return {
        batch: {
          batchId,
          requestedCount,
          connectionIds,
          ...(autoRecoveryVersion
            ? {
                autoRecoveryVersion,
                connectionProjects: Object.fromEntries(
                  report.profiles
                    .filter((profile) => profile.available > 0)
                    .map((profile) => [
                      profile.connectionId,
                      profile.projectId,
                    ]),
                ),
              }
            : {}),
          ...(executionPlan ? { executionPlan } : {}),
          allocations: allocateCapacity(report),
          status: 'prepared',
          createdAt: new Date().toISOString(),
        },
      }
    }
    function reserveBatchRecovery(
      batch,
      isNew = !state.batches[batch.batchId],
    ) {
      if (!isNew) return // Durable batch replay never claims a later permission cycle.
      // Validate the whole reservation before staging any claim. The caller commits
      // these claims with its batch/jobs, including the inline-submit path.
      const claims = batch.allocations
        .filter((item) => item.recoveryPermitId)
        .map((item) => {
          const owner = state.connections[item.connectionId]
          if (
            !Number.isSafeInteger(item.count) ||
            item.count < 1 ||
            (item.count !== 1 &&
              (batch.autoRecoveryVersion !== 1 ||
                owner?.autoRecoveryVersion !== 1 ||
                owner.scheduling?.recoveryPermitVersion !== 1))
          ) {
            throw new Error('recovery_permit_capacity_invalid')
          }
          if (
            owner?.recoveryPermit?.id === item.recoveryPermitId &&
            owner.recoveryPermit.reservedBatchId === batch.batchId
          )
            return [owner, owner.recoveryPermit]
          return [
            owner,
            reserveRecoveryPermit(owner, item.recoveryPermitId, batch.batchId),
          ]
        })
      for (const [owner, permit] of claims) owner.recoveryPermit = permit
    }
    function armCadence() {
      clearTimeout(cadenceTimer)
      const wait = state.generationNotBefore - Date.now()
      if (wait > 0) {
        cadenceTimer = setTimeout(
          () => run(schedule).catch(() => {}),
          Math.min(wait + 1, 2_147_483_647),
        )
        cadenceTimer.unref?.()
      }
    }
    function dispatchCapacityReady(connection) {
      return (
        connection.scheduling?.protocolVersion === 2 &&
        profileEligible(state.connections, connection) &&
        !connection.profileIncident &&
        connection.capacity &&
        validPolicy(connection.accountPolicy) &&
        connection.providerNotBefore <= Date.now() &&
        (connection.accountPolicy.unlimited === true ||
          connection.accountPolicy.remaining >
            connection.capacity.localReserved) &&
        connection.capacity.historySlots > 0 &&
        connection.sessionObservedAt <= Date.now() &&
        Date.now() - connection.sessionObservedAt <= CAPACITY_FRESH_MS
      )
    }
    function ownedJob(connection, imageJobId, attemptId) {
      const job = state.jobs[imageJobId]
      if (
        !validId(imageJobId) ||
        !job ||
        job.connectionId !== connection.connectionId
      )
        throw new Error('job_not_owned')
      if (job.attemptId && attemptId !== job.attemptId)
        throw new Error('attempt_mismatch')
      return job
    }
    function remoteCount(connectionId) {
      return Object.values(recoveryCapacityJobs(state.jobs)).filter(
        (job) => job.connectionId === connectionId && remoteActive(job),
      ).length
    }
    function connectionReady(connection, executionPlan) {
      return (
        connection &&
        !connection.revoked &&
        !connection.paused &&
        connection.reconciled &&
        connection.binding?.ready &&
        sockets.has(connection.connectionId) &&
        dispatchCapacityReady(connection) &&
        executionCompatible(executionPlan, connection)
      )
    }
    function hasDispatchSlot(connection, job = null) {
      const checking = connection?.profileAvailability?.state === 'checking'
      const explicit = checking && connection.announcedRecoveryPermitId
      const limit =
        checking && !explicit ? 1 : connection?.scheduling?.maxInFlight
      const occupied = explicit
        ? recoveryInFlightCount(connection, recoveryCapacityJobs(state.jobs))
        : remoteCount(connection?.connectionId)
      return (
        Number.isInteger(limit) &&
        occupied < limit &&
        recoveryDispatchAllowed(connection, job)
      )
    }
    function automaticCheckingDispatch(owner, job) {
      if (
        !automaticJob(job) ||
        owner?.profileAvailability?.state !== 'checking' ||
        owner.autoRecoveryVersion !== 1 ||
        !connectionReady(owner, job.executionPlan)
      )
        return null
      let available = freeRecoveryPermit(owner)
      if (!available) {
        const reserved = currentRecoveryPermit(owner)
        // The first staged intention may be canceled or fail locally before any
        // dispatch. Its same-batch, unspent reservation can authorize the next
        // queued intention; never take authority from a live or physical holder.
        if (
          job.state !== 'queued' ||
          job.connectionId ||
          job.dispatchedAt ||
          job.attemptId ||
          job.generationRetry ||
          !reserved ||
          reserved.reservedBatchId !== job.batchId ||
          reserved.consumedJobId !== null
        )
          return null
        const holders = Object.values(state.jobs).filter(
          (other) => other.recoveryPermitId === reserved.id,
        )
        if (
          !holders.length ||
          holders.some(
            (other) =>
              other.batchId !== job.batchId ||
              !automaticJob(other) ||
              !['failed', 'canceled'].includes(
                other.state === 'deleted' ? other.previousState : other.state,
              ) ||
              other.connectionId ||
              other.dispatchedAt ||
              other.attemptId ||
              other.generationRetry ||
              other.result ||
              archivedAttempts(other).length,
          )
        )
          return null
        available = reserved
      }
      // This is a private reservation preview. Only the eventual dispatch commits
      // and consumes it with that attempt; capacity reads never create authority.
      const permit = reserveRecoveryPermit(owner, available.id, job.batchId)
      const dispatchJob = { ...job, recoveryPermitId: available.id }
      if (!hasDispatchSlot({ ...owner, recoveryPermit: permit }, dispatchJob))
        return null
      return { permit, recoveryPermitId: available.id }
    }
    function dispatchWithClaimAllowed(owner, job, claim) {
      return (
        connectionReady(owner, job.executionPlan) &&
        hasDispatchSlot(
          claim ? { ...owner, recoveryPermit: claim.permit } : owner,
          claim ? { ...job, recoveryPermitId: claim.recoveryPermitId } : job,
        )
      )
    }
    function acknowledgeRetry(
      job,
      retryRequestId = job.generationRetry?.retryRequestId,
    ) {
      const retry = job.generationRetry
      if (
        !retry ||
        retry.status !== 'pending' ||
        retry.retryRequestId !== retryRequestId ||
        job.attemptId !== retry.attemptId
      )
        return false
      retry.status = 'accepted'
      retry.acknowledgedAt = new Date().toISOString()
      retrySentAt.delete(retry.retryRequestId)
      return true
    }
    function sendPendingRetry(job, socket, force = false) {
      const retry = job.generationRetry
      if (
        stopping ||
        !retry ||
        retry.status !== 'pending' ||
        retry.attemptId !== job.attemptId ||
        job.result ||
        !state.connections[job.connectionId]?.reconciled ||
        socket !== sockets.get(job.connectionId) ||
        !executionCompatible(
          job.executionPlan,
          state.connections[job.connectionId],
        )
      )
        return false
      if (
        !force &&
        Date.now() - (retrySentAt.get(retry.retryRequestId) ?? 0) < 10000
      )
        return false
      if (
        !send(socket, {
          type: 'job.retry',
          imageJobId: job.imageJobId,
          ...planFields(job),
          previousAttemptId: retry.previousAttemptId,
          attemptId: retry.attemptId,
          requestHash: job.requestHash,
          retryRequestId: retry.retryRequestId,
          cancelRequested: Boolean(job.cancelRequested),
        })
      )
        return false
      retrySentAt.set(retry.retryRequestId, Date.now())
      return true
    }
    function moveUnsentReservation(
      job,
      target,
      recoveryClaim = null,
      retireAuthority = false,
    ) {
      if (
        (job.recoveryPermitId && !retireAuthority) ||
        (target.profileAvailability?.state === 'checking' && !recoveryClaim)
      )
        return false
      if (
        job.state !== 'queued' ||
        job.connectionId ||
        job.dispatchedAt ||
        job.attemptId ||
        job.generationRetry
      )
        return false
      const batch = state.batches[job.batchId]
      if (!batch || batch.status !== 'prepared') return false
      const old = batch.allocations.find(
        (item) => item.connectionId === job.preferredConnectionId,
      )
      if (!old || old.submitted < 1 || old.count < 1) return false
      let next = batch.allocations.find(
        (item) => item.connectionId === target.connectionId,
      )
      if (!next) {
        next = { connectionId: target.connectionId, count: 0, submitted: 0 }
        batch.allocations.push(next)
      }
      old.count--
      old.submitted--
      next.count++
      next.submitted++
      batch.allocations = batch.allocations.filter((item) => item.count > 0)
      job.previousPreferredConnectionId = job.preferredConnectionId
      job.preferredConnectionId = target.connectionId
      return true
    }
    function planAutomaticRecovery(job, now = Date.now()) {
      if (!automaticJob(job)) return
      const recovery = job.autoRecovery
      if (
        job.cancelRequested ||
        state.batches[job.batchId]?.status !== 'prepared'
      ) {
        recovery.status = 'canceled'
        recovery.nextAttemptAt = null
        recovery.reason = 'canceled'
        return
      }
      if (job.result) return
      if (recovery.stoppedReason) {
        recovery.status = 'exhausted'
        recovery.reason = recovery.stoppedReason
        recovery.nextAttemptAt = null
        return
      }
      observeRecoveryProgress(job, now)
      const uncertain = uncertainAutomaticAttempt(job)
      const known = job.state === 'failed' && recovery.retryEligible === true
      if (!uncertain && !known) {
        recovery.status = ['failed', 'canceled'].includes(job.state)
          ? 'exhausted'
          : 'pending'
        recovery.nextAttemptAt = null
        recovery.reason =
          recovery.status === 'exhausted'
            ? (job.error?.code ?? 'not_recoverable')
            : null
        return
      }
      if (
        recovery.replacementCount >= (recovery.maxReplacements ?? 2) &&
        !persistentRecoveryChain(job)
      ) {
        recovery.status = 'exhausted'
        recovery.nextAttemptAt = null
        recovery.reason = 'replacement_limit'
        return
      }
      if (uncertain)
        recovery.eligibleAt = Math.max(
          recovery.eligibleAt ?? 0,
          recovery.unknownSince + UNKNOWN_RECONCILE_MS,
        )
      else
        recovery.eligibleAt ??=
          now +
          (recovery.replacementCount >= (recovery.maxReplacements ?? 2)
            ? Math.min(
                1_800_000,
                120_000 *
                  2 **
                    Math.min(
                      4,
                      Math.max(
                        0,
                        Math.floor(
                          (recovery.replacementCount -
                            (recovery.maxReplacements ?? 2)) /
                            5,
                        ),
                      ),
                    ),
              )
            : RECOVERY_BACKOFF_MS[recovery.replacementCount])
      recovery.status =
        uncertain && now < recovery.eligibleAt ? 'reconciling' : 'backoff'
      recovery.nextAttemptAt ??= recovery.eligibleAt
      if (recovery.reason !== 'healthy_owner_unavailable')
        recovery.reason = uncertain
          ? 'receipt_unconfirmed'
          : 'confirmed_not_sent'
    }
    function recoveryMetadata(job) {
      if (!automaticJob(job)) return {}
      return {
        autoRecoveryVersion: 1,
        automaticRetryCount: job.automaticRetryCount,
        ...(job.persistentRecoveryVersion === 1
          ? { persistentRecoveryVersion: 1 }
          : {}),
        ...(job.previousLocalAttemptId
          ? { previousLocalAttemptId: job.previousLocalAttemptId }
          : {}),
        ...(job.automaticRetryCount
          ? {
              previousAttemptId: job.previousAttemptId,
              previousConnectionId: job.previousConnectionId,
              retryRequestId: job.retryRequestId,
            }
          : {}),
      }
    }
    async function jobReferences(job) {
      const references = []
      for (const reference of job.references) {
        const bytes = await readFile(
          join(store.directory, 'references', `${reference.sha256}.bin`),
        )
        if (sha256(bytes) !== reference.sha256)
          throw new Error('reference_hash_mismatch')
        references.push({ ...reference, base64: bytes.toString('base64') })
      }
      return references
    }
    function wireJob(job, references) {
      return {
        imageJobId: job.imageJobId,
        batchId: job.batchId,
        prompt: job.prompt,
        promptIndex: job.promptIndex,
        attemptId: job.attemptId,
        model: job.model,
        aspectRatio: job.aspectRatio,
        seed: job.seed,
        references,
        requestHash: job.requestHash,
        binding: job.binding,
        ...(job.recoveryPermitId
          ? { recoveryPermitId: job.recoveryPermitId }
          : {}),
        ...planFields(job),
        ...recoveryMetadata(job),
      }
    }
    async function replaceAutomaticAttempt(job, owner, references) {
      const claim = automaticCheckingDispatch(owner, job)
      if (
        owner.profileAvailability?.state === 'checking'
          ? !claim
          : !connectionReady(owner, job.executionPlan) ||
            !hasDispatchSlot(owner)
      )
        return false
      const recovery = job.autoRecovery
      const priorLocal = [job, ...archivedAttempts(job).slice().reverse()].find(
        (attempt) => attempt.connectionId === owner.connectionId,
      )
      if (
        priorLocal &&
        (owner.persistentRecoveryVersion !== 1 || !persistentRecoveryChain(job))
      )
        return false
      if (
        job.persistentRecoveryVersion === 1 &&
        owner.persistentRecoveryVersion !== 1
      )
        return false
      recovery.attempts.push(attemptSnapshot(job))
      recovery.replacementCount++
      const previous = recovery.attempts.at(-1)
      job.automaticRetryCount = recovery.replacementCount
      delete job.previousLocalAttemptId
      if (priorLocal) job.previousLocalAttemptId = priorLocal.attemptId
      job.retryRequestId = randomUUID()
      job.previousAttemptId = previous.attemptId
      job.previousConnectionId = previous.connectionId
      recovery.currentAttemptStats = null
      recovery.status = 'pending'
      recovery.reason = null
      recovery.nextAttemptAt = null
      recovery.eligibleAt = null
      recovery.unknownSince = null
      recovery.progressRank = 0
      recovery.lastProgressAt = Date.now()
      recovery.retryEligible = false
      delete job.recoveryPermitId // Never repurpose a permission spent by an earlier attempt.
      if (claim) {
        job.recoveryPermitId = claim.recoveryPermitId
        owner.recoveryPermit = consumeRecoveryPermit(
          { ...owner, recoveryPermit: claim.permit },
          job,
        )
      }
      job.previousPreferredConnectionId = job.preferredConnectionId
      job.preferredConnectionId = owner.connectionId
      job.connectionId = owner.connectionId
      job.binding = { ...owner.binding }
      job.attemptId = randomUUID()
      job.state = 'dispatching'
      job.error = null
      job.attentionIncident = null
      job.dispatchedAt = new Date().toISOString()
      owner.lastAssignedAt = Date.now()
      observeRecoveryProgress(job, Date.now())
      refreshAutomaticStats(job)
      // Crash before commit sends nothing; crash after commit retains this exact
      // attempt. A lost ACK can only enter reconciliation, never replay generation.
      await persist()
      if (
        !send(sockets.get(owner.connectionId), {
          type: 'job.submit',
          job: wireJob(job, references),
        })
      ) {
        job.state = 'unknown'
        observeRecoveryProgress(job, Date.now())
        planAutomaticRecovery(job)
        await persist()
      }
      emit({ type: 'job.state', ...jobSummary(job) })
    }
    async function recoverAutomatically() {
      const now = Date.now()
      for (const job of Object.values(state.jobs)) {
        if (!automaticJob(job) || job.deletedAt) continue
        const recovery = job.autoRecovery
        const batch = state.batches[job.batchId]
        const selectedProfiles = Object.keys(
          batch?.connectionProjects ?? {},
        ).map((id) => state.connections[id])
        if (
          !job.result &&
          job.state === 'queued' &&
          !job.attemptId &&
          selectedProfiles.length &&
          selectedProfiles.every(
            (profile) =>
              profile &&
              ['TOOLS_MODELS_EXHAUSTED', 'TOOLS_MODELS_UNAVAILABLE'].includes(
                profile.profileAvailability?.reason,
              ),
          )
        ) {
          job.state = 'failed'
          job.error = { code: 'TOOLS_MODELS_EXHAUSTED', submission: 'not-sent' }
          recovery.status = 'exhausted'
          recovery.reason = recovery.stoppedReason = 'all_accounts_exhausted'
          recovery.nextAttemptAt = null
          await persist()
          emit({ type: 'job.state', ...jobSummary(job) })
          continue
        }
        if (job.result) {
          // The durable receipt survives a crash, but the in-memory request/timer
          // does not. Recover only this exact medium; never restart generation.
          if (
            job.state === 'awaiting_url' &&
            !urlRefreshes.has(job.imageJobId)
          ) {
            job.state = 'download_failed'
            job.error = {
              code: 'media_refresh_interrupted',
              submission: 'accepted',
            }
            automaticDownloadFailure(job)
            await persist()
            emit({ type: 'job.error', ...jobSummary(job) })
          }
          if (
            job.state === 'download_failed' &&
            recovery.downloadAttempts < DOWNLOAD_BACKOFF_MS.length &&
            !job.cancelRequested &&
            !state.paused &&
            now >= (recovery.downloadNextAt ?? Infinity)
          ) {
            const owner = state.connections[job.connectionId]
            if (!owner?.reconciled || !sockets.has(job.connectionId)) continue
            recovery.downloadAttempts++
            recovery.downloadNextAt = null
            recovery.nextAttemptAt = null
            recovery.status = 'pending'
            await persist()
            try {
              if (
                !job.result.imageUrl ||
                job.error?.code === 'image_url_expired_or_denied'
              )
                await requestDownloadUrl(job, sockets.get(job.connectionId))
              else await startDownload(job)
            } catch {
              /* The exact receipt stays durable; the next status explains failure. */
            }
          }
          continue
        }
        if (
          [
            'dispatching',
            'received',
            'uploading',
            'generating',
            'completed',
          ].includes(job.state) &&
          recovery.lastProgressAt !== null &&
          now - recovery.lastProgressAt >= STALLED_ATTEMPT_MS
        ) {
          job.state = 'unknown'
          job.error = {
            code: 'ATTEMPT_PROGRESS_TIMEOUT',
            submission: 'unknown',
          }
        }
        // Upgrade an old opted-in, exhausted logical image only after observing
        // the new receiver contract. Every historical attempt must be finally
        // rejected/unsent; unknown, results and human/global pauses never migrate.
        const previousOwnerForUpgrade = state.connections[job.connectionId]
        if (
          job.persistentRecoveryVersion === undefined &&
          !effectivelyPaused() &&
          batch?.status === 'prepared' &&
          !recovery.stoppedReason &&
          previousOwnerForUpgrade?.persistentRecoveryVersion === 1 &&
          ['ready', 'checking'].includes(
            previousOwnerForUpgrade.profileAvailability?.state,
          ) &&
          connectionReady(previousOwnerForUpgrade, job.executionPlan) &&
          previousOwnerForUpgrade.binding?.projectId ===
            job.binding?.projectId &&
          persistentAttemptReusable(job, recovery.currentAttemptStats) &&
          archivedAttempts(job).every((attempt) =>
            persistentAttemptReusable(attempt),
          )
        ) {
          job.persistentRecoveryVersion = 1
          recovery.retryEligible = true
          await persist()
        }
        const before = JSON.stringify(recovery)
        planAutomaticRecovery(job, now)
        if (before !== JSON.stringify(recovery)) await persist()
        if (
          recovery.status !== 'backoff' ||
          now < recovery.eligibleAt ||
          now < recovery.nextAttemptAt ||
          effectivelyPaused() ||
          job.cancelRequested ||
          state.batches[job.batchId]?.status !== 'prepared'
        )
          continue
        // A new project selection invalidates consent for replacing that attempt.
        const previousOwner = state.connections[job.connectionId]
        if (
          previousOwner?.binding?.projectId &&
          previousOwner.binding.projectId !== job.binding?.projectId
        ) {
          recovery.status = 'exhausted'
          recovery.reason = recovery.stoppedReason = 'project_changed'
          recovery.nextAttemptAt = null
          await persist()
          emit({ type: 'job.state', ...jobSummary(job) })
          continue
        }
        const used = new Set([
          job.connectionId,
          ...archivedAttempts(job).map((attempt) => attempt.connectionId),
        ])
        const report = reportCapacity(
          1,
          state.batches[job.batchId].connectionIds,
          job.executionPlan,
          1,
        )
        const persistent = persistentRecoveryChain(job)
        const owner = report.profiles
          .filter(
            (profile) =>
              profile.available > 0 &&
              (!used.has(profile.connectionId) || persistent),
          )
          .map((profile) => state.connections[profile.connectionId])
          .filter(
            (candidate) =>
              candidate.autoRecoveryVersion === 1 &&
              (job.persistentRecoveryVersion !== 1 ||
                candidate.persistentRecoveryVersion === 1) &&
              candidate.binding?.projectId ===
                state.batches[job.batchId].connectionProjects[
                  candidate.connectionId
                ] &&
              (candidate.profileAvailability?.state === 'checking'
                ? Boolean(automaticCheckingDispatch(candidate, job))
                : connectionReady(candidate, job.executionPlan) &&
                  hasDispatchSlot(candidate)),
          )
          .sort(
            (left, right) =>
              Number(used.has(left.connectionId)) -
                Number(used.has(right.connectionId)) ||
              remoteCount(left.connectionId) -
                remoteCount(right.connectionId) ||
              (left.lastAssignedAt ?? 0) - (right.lastAssignedAt ?? 0),
          )[0]
        if (!owner) {
          const profiles = Object.keys(
            state.batches[job.batchId].connectionProjects ?? {},
          ).map((id) => state.connections[id])
          if (
            profiles.length &&
            profiles.every(
              (profile) =>
                profile &&
                ['TOOLS_MODELS_EXHAUSTED', 'TOOLS_MODELS_UNAVAILABLE'].includes(
                  profile.profileAvailability?.reason,
                ),
            )
          ) {
            recovery.status = 'exhausted'
            recovery.reason = 'all_accounts_exhausted'
            recovery.nextAttemptAt = null
            recovery.stoppedReason = 'all_accounts_exhausted'
            await persist()
            emit({ type: 'job.state', ...jobSummary(job) })
            continue
          }
          recovery.reason = 'healthy_owner_unavailable'
          recovery.nextAttemptAt = now + 20_000
          await persist()
          emit({ type: 'job.state', ...jobSummary(job) })
          continue
        }
        let references
        try {
          references = await jobReferences(job)
        } catch {
          recovery.status = 'exhausted'
          recovery.reason = recovery.stoppedReason =
            'reference_file_unavailable'
          recovery.nextAttemptAt = null
          await persist()
          emit({ type: 'job.error', ...jobSummary(job) })
          continue
        }
        await replaceAutomaticAttempt(job, owner, references)
      }
    }
    function automaticDownloadFailure(job) {
      if (!automaticJob(job)) return
      const recovery = job.autoRecovery
      const eligible = [
        'image_url_expired_or_denied',
        'image_download_http_error',
        'image_body_missing',
        'image_url_missing',
        'connection_offline',
        'media_refresh_timeout',
        'media_refresh_interrupted',
        'fetch_failed',
        'TimeoutError',
        'AbortError',
      ].includes(job.error?.code)
      recovery.status =
        eligible && recovery.downloadAttempts < DOWNLOAD_BACKOFF_MS.length
          ? 'backoff'
          : 'exhausted'
      recovery.reason = job.error?.code ?? 'download_failed'
      recovery.downloadNextAt =
        recovery.status === 'backoff'
          ? Date.now() + DOWNLOAD_BACKOFF_MS[recovery.downloadAttempts]
          : null
      recovery.nextAttemptAt = recovery.downloadNextAt
    }
    function archivedOwnedJob(connection, imageJobId, attemptId) {
      const job = state.jobs[imageJobId]
      if (!automaticJob(job)) return null
      const attempt = archivedAttempts(job).find(
        (item) =>
          item.connectionId === connection.connectionId &&
          item.attemptId === attemptId,
      )
      return attempt ? { job, attempt } : null
    }
    function normalizedResult(input) {
      if (
        !input ||
        typeof input.mediaId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.mediaId,
        )
      )
        throw new Error('media_id_invalid')
      const result = {
        mediaId: input.mediaId,
        imageUrl: input.imageUrl
          ? assertImageUrl(input.imageUrl, input.mediaId)
          : null,
      }
      for (const key of ['width', 'height'])
        if (
          Number.isSafeInteger(input[key]) &&
          input[key] > 0 &&
          input[key] <= 100_000
        )
          result[key] = input[key]
      if (MODELS.has(input.model)) result.model = input.model
      return result
    }
    async function handleArchivedReceipt(connection, frame, socket) {
      const owned = archivedOwnedJob(
        connection,
        frame.imageJobId,
        frame.attemptId,
      )
      if (!owned) return false
      const { job, attempt } = owned
      assertReceiptPlan(job, frame)
      if (
        (frame.result || frame.requestHash !== undefined) &&
        frame.requestHash !== job.requestHash
      )
        throw new Error('snapshot_hash_mismatch')
      if (job.deletedAt) {
        if (frame.type === 'job.deleted' || frame.state === 'deleted')
          acknowledgeDeletion(attempt, frame)
        else if (frame.type === 'job.deleteRejected')
          attempt.workerDeletionError = { code: safeCode(frame.error?.code) }
        else sendDeletedJob(attempt, socket, true)
        await persist()
        return true
      }
      if (frame.result) {
        const result = normalizedResult(frame.result)
        if (attempt.result && attempt.result.mediaId !== result.mediaId)
          throw new Error('media_id_changed')
        updateAttemptStats(attempt, frame.attemptStats)
        if (!job.result) {
          // Promote the first exact receipt to the logical winner. Preserve the
          // currently running loser intact, so its late result remains harvestable.
          const recovery = job.autoRecovery,
            canceled = job.cancelRequested
          recovery.attempts = recovery.attempts.filter(
            (item) => item !== attempt,
          )
          recovery.attempts.push(attemptSnapshot(job))
          for (const key of [
            'automaticRetryCount',
            'retryRequestId',
            'previousAttemptId',
            'previousConnectionId',
          ])
            delete job[key]
          Object.assign(job, attempt, {
            autoRecovery: recovery,
            cancelRequested: canceled,
          })
          delete job.result
          delete job.file
          recovery.currentAttemptStats = attempt.attemptStats ?? null
          refreshAutomaticStats(job)
          await acceptResult(
            connection,
            job.imageJobId,
            result,
            socket,
            job.attemptId,
            frame.attemptStats,
          )
          return true
        }
        attempt.result = result
        attempt.state = 'ready'
        delete attempt.error
        refreshAutomaticStats(job)
        await persist()
        send(socket, {
          type: 'result.ack',
          imageJobId: job.imageJobId,
          attemptId: attempt.attemptId,
          ...planFields(job),
        })
        emit({
          type: 'job.alternateResult',
          imageJobId: job.imageJobId,
          attemptId: attempt.attemptId,
          mediaId: result.mediaId,
        })
        return true
      }
      updateAttemptStats(attempt, frame.attemptStats)
      if (!attempt.result) {
        if (
          frame.type === 'job.received' &&
          ['dispatching', 'unknown'].includes(attempt.state)
        )
          attempt.state = 'received'
        if (EXTENSION_STATES.has(frame.state))
          attempt.state = frame.state === 'queued' ? 'received' : frame.state
        if (frame.error) {
          attempt.error = safeError(frame.error)
          if (frame.type === 'job.error')
            attempt.state = ['not-sent', 'rejected'].includes(
              attempt.error.submission,
            )
              ? 'failed'
              : 'unknown'
        }
        await pauseForAttention(attempt)
      }
      refreshAutomaticStats(job)
      await persist()
      if (job.cancelRequested && !attempt.result && remoteActive(attempt)) {
        send(socket, {
          type: 'job.cancel',
          imageJobId: job.imageJobId,
          attemptId: attempt.attemptId,
          ...planFields(job),
        })
      }
      return true
    }
    async function schedule() {
      if (persistenceFailed || stopped || stopping) return
      await recoverAutomatically()
      if (effectivelyPaused()) return
      // Preserve a pre-upgrade durable deadline once. New cadence belongs to each
      // worker and its MAIN pre-POST gate, never to one global queue.
      if (state.generationNotBefore > Date.now()) {
        armCadence()
        return
      }
      const queued = Object.values(state.jobs).filter(
        (job) => job.state === 'queued',
      )
      for (const job of queued) {
        if (
          automaticJob(job) &&
          (job.cancelRequested ||
            state.batches[job.batchId]?.status !== 'prepared')
        )
          continue
        // Historical partial records are not proof of an unsent job. Only fresh
        // coordinator queue entries may acquire an owner or a logical attempt.
        if (
          job.connectionId ||
          job.dispatchedAt ||
          job.attemptId ||
          job.generationRetry
        )
          continue
        let owner = state.connections[job.preferredConnectionId]
        if (
          automaticJob(job) &&
          owner?.binding?.projectId &&
          owner.binding.projectId !==
            state.batches[job.batchId].connectionProjects[owner.connectionId]
        ) {
          job.state = 'failed'
          job.error = { code: 'PROJECT_CHANGED', submission: 'not-sent' }
          job.autoRecovery.stoppedReason = 'project_changed'
          planAutomaticRecovery(job)
          await persist()
          emit({ type: 'job.error', ...jobSummary(job) })
          continue
        }
        let moveReservation = false
        // The queue guards above prove no physical attempt exists. A document
        // repair may rotate its unused admission permit; only an opted-in unsent
        // job can acquire the new authority, never a dispatched/unknown receipt.
        const retireAuthority =
          automaticJob(job) &&
          Boolean(job.recoveryPermitId) &&
          currentRecoveryPermit(owner)?.id !== job.recoveryPermitId
        const dispatchJob = retireAuthority
          ? { ...job, recoveryPermitId: undefined }
          : job
        let recoveryClaim = !dispatchJob.recoveryPermitId
          ? automaticCheckingDispatch(owner, dispatchJob)
          : null
        if (
          !dispatchWithClaimAllowed(owner, dispatchJob, recoveryClaim) &&
          !dispatchJob.recoveryPermitId &&
          !job.connectionId &&
          !job.dispatchedAt &&
          !job.attemptId &&
          !job.generationRetry
        ) {
          const batch = state.batches[job.batchId]
          const report = reportCapacity(
            1,
            batch?.connectionIds ?? null,
            job.executionPlan,
            job.autoRecoveryVersion,
          )
          const alternatives = report.profiles
            .filter(
              (profile) =>
                profile.available > 0 &&
                profile.connectionId !== job.preferredConnectionId,
            )
            .map((profile) => {
              const connection = state.connections[profile.connectionId]
              return {
                connection,
                claim: automaticCheckingDispatch(connection, dispatchJob),
              }
            })
            .filter(
              ({ connection, claim }) =>
                (!automaticJob(job) ||
                  connection.binding?.projectId ===
                    batch.connectionProjects[connection.connectionId]) &&
                (connection.profileAvailability?.state !== 'checking' ||
                  Boolean(claim)) &&
                dispatchWithClaimAllowed(connection, dispatchJob, claim),
            )
            .sort(
              (a, b) =>
                remoteCount(a.connection.connectionId) -
                  remoteCount(b.connection.connectionId) ||
                (a.connection.lastAssignedAt ?? 0) -
                  (b.connection.lastAssignedAt ?? 0),
            )
          if (alternatives[0]) {
            owner = alternatives[0].connection
            recoveryClaim = alternatives[0].claim
            moveReservation = true
          }
        }
        if (
          !dispatchWithClaimAllowed(owner, dispatchJob, recoveryClaim) ||
          (automaticJob(job) && owner.autoRecoveryVersion !== 1)
        )
          continue
        const references = []
        try {
          for (const reference of job.references) {
            const bytes = await readFile(
              join(store.directory, 'references', `${reference.sha256}.bin`),
            )
            if (sha256(bytes) !== reference.sha256)
              throw new Error('reference_hash_mismatch')
            references.push({ ...reference, base64: bytes.toString('base64') })
          }
        } catch {
          job.state = 'failed'
          job.error = {
            code: 'reference_file_unavailable',
            submission: 'not-sent',
          }
          await persist()
          emit({ type: 'job.error', ...jobSummary(job) })
          continue
        }
        // Transfer only a never-dispatched reservation, together with the actual
        // dispatch below. Full profiles must not absorb an entire pending queue.
        if (
          moveReservation &&
          !moveUnsentReservation(job, owner, recoveryClaim, retireAuthority)
        )
          continue
        if (retireAuthority) {
          job.previousRecoveryPermitId = job.recoveryPermitId
          delete job.recoveryPermitId
        }
        if (recoveryClaim) {
          owner.recoveryPermit = recoveryClaim.permit
          job.recoveryPermitId = recoveryClaim.recoveryPermitId
        }
        owner.recoveryPermit = consumeRecoveryPermit(owner, job)
        job.connectionId = owner.connectionId
        job.binding = { ...owner.binding }
        job.attemptId = randomUUID()
        if (automaticJob(job) && owner.persistentRecoveryVersion === 1)
          job.persistentRecoveryVersion = 1
        job.state = 'dispatching'
        job.dispatchedAt = new Date().toISOString()
        owner.lastAssignedAt = Date.now()
        observeRecoveryProgress(job, Date.now())
        await persist()
        if (
          !send(sockets.get(owner.connectionId), {
            type: 'job.submit',
            job: wireJob(job, references),
          })
        ) {
          job.state = 'unknown'
          planAutomaticRecovery(job)
          await persist()
        }
        emit({ type: 'job.state', ...jobSummary(job) })
        // Continue reserving independent slots. Workers space actual Google POSTs.
      }
    }
    async function verifiedResultFile(job) {
      const file = job.file
      if (
        !file ||
        typeof file.imagePath !== 'string' ||
        !['jpg', 'png', 'webp'].includes(file.extension) ||
        !Number.isSafeInteger(file.byteLength) ||
        file.byteLength < 1 ||
        file.byteLength > MAX_IMAGE_BYTES ||
        !/^[a-f0-9]{64}$/.test(file.sha256 ?? '')
      )
        throw new Error('image_file_invalid')
      const path = resolve(file.imagePath)
      if (
        path !==
        resolve(
          store.directory,
          'results',
          `${job.imageJobId}.${file.extension}`,
        )
      )
        throw new Error('image_file_invalid')
      let info
      try {
        info = await lstat(path)
      } catch {
        throw new Error('image_file_unavailable')
      }
      if (
        !info.isFile() ||
        info.size !== file.byteLength ||
        info.size > MAX_IMAGE_BYTES
      )
        throw new Error('image_file_invalid')
      let bytes
      try {
        bytes = await readFile(path)
      } catch {
        throw new Error('image_file_unavailable')
      }
      if (bytes.length !== file.byteLength || sha256(bytes) !== file.sha256)
        throw new Error('image_file_invalid')
      const format = imageFormat(bytes)
      if (format.extension !== file.extension)
        throw new Error('image_file_invalid')
      return { bytes, format }
    }
    async function startDownload(job) {
      if (
        job.deletedAt ||
        !job.result?.imageUrl ||
        downloads.has(job.imageJobId) ||
        job.state === 'ready'
      )
        return
      // La preparación se ejecuta dentro de run; el I/O queda fuera para no
      // bloquear status ni el commit final, que vuelve a entrar en esa cola.
      job.state = 'downloading'
      delete job.error
      await persist()
      emit({ type: 'job.state', ...jobSummary(job) })
      const task = (async () => {
        let file
        try {
          file = await downloader({
            imageJobId: job.imageJobId,
            imageUrl: job.result.imageUrl,
            mediaId: job.result.mediaId,
            directory: store.directory,
          })
        } catch (error) {
          await run(async () => {
            job.state = 'download_failed'
            job.error = {
              code: safeCode(
                error.message === 'fetch failed'
                  ? 'fetch_failed'
                  : error.name === 'TimeoutError'
                    ? 'TimeoutError'
                    : error.message,
              ),
              submission: 'accepted',
            }
            automaticDownloadFailure(job)
            await persist()
            emit({ type: 'job.error', ...jobSummary(job) })
          })
          return
        }
        await run(async () => {
          job.file = file
          job.state = 'ready'
          if (automaticJob(job)) {
            job.autoRecovery.status = 'completed'
            job.autoRecovery.nextAttemptAt = null
            job.autoRecovery.reason = null
          }
          job.completedAt = new Date().toISOString()
          delete job.error
          await persist()
          emit({ type: 'job.ready', ...jobSummary(job), ...file })
        })
      })()
        .catch(() => {
          if (!stopped)
            emit({
              type: 'bridge.error',
              error: { code: 'download_commit_failed' },
            })
        })
        .finally(() => downloads.delete(job.imageJobId))
      downloads.set(job.imageJobId, task)
    }
    async function expireDownloadUrlRequests() {
      const expired = []
      for (const [imageJobId, refresh] of urlRefreshes) {
        if (refresh.expiresAt > Date.now()) continue
        urlRefreshes.delete(imageJobId)
        const job = state.jobs[imageJobId]
        if (job?.state !== 'awaiting_url' || job.deletedAt) continue
        // El worker puede terminar mediaDetail sin enviar error. Este plazo
        // limita sólo la lectura del medio; nunca autoriza otra generación.
        job.state = 'download_failed'
        job.error = { code: 'media_refresh_timeout', submission: 'accepted' }
        automaticDownloadFailure(job)
        expired.push(job)
      }
      if (expired.length === 0) return
      await persist()
      for (const job of expired) emit({ type: 'job.error', ...jobSummary(job) })
    }
    async function requestDownloadUrl(job, socket) {
      if (
        job.deletedAt ||
        job.state === 'ready' ||
        downloads.has(job.imageJobId) ||
        (job.state === 'awaiting_url' &&
          urlRefreshes.get(job.imageJobId)?.socket === socket)
      )
        return
      if (socket?.readyState !== WebSocket.OPEN)
        throw new Error('connection_offline')
      // Un ACK del comando confirma recuperación en curso, no su resultado.
      // El mismo socket sólo recibe una lectura del medio mientras esté viva.
      job.state = 'awaiting_url'
      // La URL ausente o rechazada no vuelve a usarse mientras llega su relevo.
      // El mediaId confirmado sigue siendo el mismo recibo del proveedor.
      job.result.imageUrl = null
      job.urlRefreshRequested = true
      delete job.error
      await persist()
      emit({ type: 'job.state', ...jobSummary(job) })
      if (
        !send(socket, {
          type: 'media.refresh',
          imageJobId: job.imageJobId,
          ...planFields(job),
          attemptId: job.attemptId,
          mediaId: job.result.mediaId,
        })
      ) {
        job.state = 'download_failed'
        job.error = { code: 'connection_offline', submission: 'accepted' }
        automaticDownloadFailure(job)
        await persist()
        emit({ type: 'job.error', ...jobSummary(job) })
        throw new Error('connection_offline')
      }
      urlRefreshes.set(job.imageJobId, {
        socket,
        expiresAt: Date.now() + URL_REFRESH_TIMEOUT_MS,
      })
    }
    async function acceptResult(
      connection,
      imageJobId,
      input,
      socket,
      attemptId,
      attemptStats,
      fromSnapshot = false,
    ) {
      const job = ownedJob(connection, imageJobId, attemptId)
      if (job.deletedAt) {
        sendDeletedJob(job, socket, true)
        return
      }
      if (
        !input ||
        typeof input.mediaId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.mediaId,
        )
      )
        throw new Error('media_id_invalid')
      if (job.result && job.result.mediaId !== input.mediaId)
        throw new Error('media_id_changed')
      const result = {
        mediaId: input.mediaId,
        imageUrl: input.imageUrl
          ? assertImageUrl(input.imageUrl, input.mediaId)
          : null,
      }
      for (const key of ['width', 'height']) {
        if (
          Number.isSafeInteger(input[key]) &&
          input[key] > 0 &&
          input[key] <= 100_000
        )
          result[key] = input[key]
      }
      if (typeof input.model === 'string' && MODELS.has(input.model))
        result.model = input.model
      acknowledgeRetry(job)
      updateAttemptStats(job, attemptStats)
      // El recibo remoto confirma el medio, pero no reemplaza una descarga
      // local ni borra el fallo o la URL descartada durante su recuperación.
      if (
        job.result &&
        (downloads.has(imageJobId) ||
          job.state === 'ready' ||
          (fromSnapshot &&
            (urlRefreshes.has(imageJobId) || job.state === 'download_failed')))
      ) {
        await persist()
        send(socket, {
          type: 'result.ack',
          imageJobId,
          attemptId: job.attemptId,
          ...planFields(job),
        })
        emit({
          type: 'job.result',
          ...jobSummary(job),
          hasDownloadUrl: Boolean(job.result.imageUrl),
        })
        return
      }
      job.result = result
      if (automaticJob(job)) {
        job.autoRecovery.winner ??= {
          connectionId: job.connectionId,
          attemptId: job.attemptId,
          mediaId: result.mediaId,
        }
        job.autoRecovery.status = 'pending'
        job.autoRecovery.nextAttemptAt = null
        job.autoRecovery.reason = null
      }
      const refreshFailed =
        !fromSnapshot &&
        !result.imageUrl &&
        urlRefreshes.get(job.imageJobId)?.socket === socket
      if (refreshFailed) urlRefreshes.delete(job.imageJobId)
      const requestUrlRefresh = !result.imageUrl && !job.urlRefreshRequested
      if (requestUrlRefresh) job.urlRefreshRequested = true
      if (result.imageUrl) {
        delete job.urlRefreshRequested
        urlRefreshes.delete(job.imageJobId)
      }
      if (job.state !== 'ready')
        job.state = refreshFailed
          ? 'download_failed'
          : result.imageUrl
            ? 'downloading'
            : 'awaiting_url'
      if (refreshFailed) {
        job.error = { code: 'image_url_missing', submission: 'accepted' }
        automaticDownloadFailure(job)
      } else delete job.error
      await persist()
      send(socket, {
        type: 'result.ack',
        imageJobId,
        attemptId: job.attemptId,
        ...planFields(job),
      })
      emit({
        type: 'job.result',
        ...jobSummary(job),
        hasDownloadUrl: Boolean(result.imageUrl),
      })
      if (refreshFailed) emit({ type: 'job.error', ...jobSummary(job) })
      else if (requestUrlRefresh) await requestDownloadUrl(job, socket)
      else await startDownload(job)
      await schedule()
    }
    async function handleFrame(socket, frame, origin) {
      if (stopping && !socket.connectionId) throw new Error('bridge_closing')
      if (
        !frame ||
        typeof frame !== 'object' ||
        Array.isArray(frame) ||
        typeof frame.type !== 'string'
      )
        throw new Error('frame_invalid')
      if (!socket.connectionId) {
        if (frame.type === 'discovery.hello')
          return announceDiscovery(socket, frame, origin)
        if (frame.type === 'discovery.link.request')
          return requestDiscoveryLink(socket, frame, origin)
        if (frame.type === 'discovery.goodbye') {
          removeDiscovery(socket)
          socket.close(1000, 'panel closed')
          return
        }
        if (frame.type === 'heartbeat.ack' && socket.discoveryId) return
        if (!validId(frame.installationId))
          throw new Error('installation_id_invalid')
        let connection
        let credential
        if (frame.type === 'auth.pair') {
          if (
            frame.automaticLink !== undefined &&
            !automaticLinkScope(frame.automaticLink)
          )
            throw new Error('automatic_link_invalid')
          const discoveryPair = socket.discoveryId
            ? discoveryPairs.get(socket.discoveryId)
            : null
          const currentCandidate = socket.discoveryId
            ? discoveryList().profiles.find(
                (item) => item.discoveryId === socket.discoveryId,
              )
            : null
          const redemptionIdentity = safeIdentity(frame.identity)
          const matchedDiscovery =
            discoveryPair &&
            discoveryPair.socket === socket &&
            discoveryPair.origin === origin &&
            currentCandidate?.canLink === true &&
            currentCandidate.identity.accountKey === discoveryPair.accountKey &&
            redemptionIdentity.verified &&
            redemptionIdentity.accountKey === discoveryPair.accountKey &&
            sameAutomaticLink(
              discoveryPair.automaticLink,
              discoveries.get(socket.discoveryId)?.automaticLink,
            ) &&
            sameAutomaticLink(
              discoveryPair.automaticLink,
              automaticLinkScope(frame.automaticLink),
            ) &&
            discoveryPair.installationId === frame.installationId &&
            Date.now() < discoveryPair.expiresAt &&
            sameSecret(frame.token, discoveryPair.tokenHash)
          const matchedManual =
            pairing &&
            Date.now() < pairing.expiresAt &&
            sameSecret(frame.token, sha256(pairing.token))
          if (
            (!matchedDiscovery && !matchedManual) ||
            (frame.automaticLink !== undefined && !matchedDiscovery)
          )
            throw new Error('pairing_invalid')
          if (
            frame.automaticLink !== undefined &&
            Object.values(state.connections).some(
              (value) =>
                value.installationId === frame.installationId && value.revoked,
            )
          )
            throw new Error('automatic_link_revoked')
          connection = Object.values(state.connections).find(
            (value) => value.installationId === frame.installationId,
          )
          if (connection && connection.origin !== origin)
            throw new Error('installation_origin_conflict')
          if (!canLink(state.connections, frame.installationId))
            throw new Error('connection_limit_reached')
          if (matchedDiscovery) discoveryPairs.delete(socket.discoveryId)
          else pairing = null
          credential = secret()
          if (!connection) {
            const connectionId = randomUUID()
            connection = { connectionId, installationId: frame.installationId }
            state.connections[connectionId] = connection
          }
          Object.assign(connection, {
            alias:
              typeof frame.alias === 'string'
                ? frame.alias.slice(0, 120)
                : 'Chrome',
            credentialHash: sha256(credential),
            origin,
            revoked: false,
            paused: false,
            binding: null,
          })
          // Reserva durable de la cuenta antes del ACK; la sesión permanece
          // sin preparar hasta recibir identidad/capacidad reconciliadas.
          const previousIdentity = safeIdentity(connection.identity)
          if (
            connection.linkedAccountKey === undefined &&
            previousIdentity.verified
          )
            connection.linkedAccountKey = previousIdentity.accountKey
          if (matchedDiscovery)
            connection.linkedAccountKey = redemptionIdentity.accountKey
          rememberVerifiedIdentity(
            connection,
            redemptionIdentity.verified
              ? redemptionIdentity
              : connection.identity,
          )
          // El commit no conserva la cuenta anterior como identidad vigente:
          // un reinicio antes del primer heartbeat no debe restaurar su nombre.
          connection.identity = safeIdentity(null)
          await persist()
        } else if (frame.type === 'auth.resume') {
          connection = Object.values(state.connections).find(
            (value) =>
              value.installationId === frame.installationId &&
              !value.revoked &&
              value.origin === origin &&
              sameSecret(frame.credential, value.credentialHash),
          )
          if (!connection) throw new Error('credential_invalid')
        } else throw new Error('authentication_required')
        removeDiscovery(socket)
        const previousSocket = sockets.get(connection.connectionId)
        previousSocket?.close(4001, 'connection replaced')
        socket.connectionId = connection.connectionId
        clearTimeout(socket.authTimeout)
        sockets.set(connection.connectionId, socket)
        connection.binding = null
        connection.reconciled = false
        connection.sessionObservedAt = 0
        connection.extensionVersion = null
        connection.capacity = null
        connection.flowTools = null
        connection.generationRetrySupported = false
        connection.autoRecoveryVersion = null
        connection.persistentRecoveryVersion = null
        connection.localDeletionSupported = false
        const previousIdentity = safeIdentity(connection.identity)
        if (!credential) rememberVerifiedIdentity(connection, previousIdentity)
        if (
          connection.linkedAccountKey === undefined &&
          previousIdentity.verified
        )
          connection.linkedAccountKey = previousIdentity.accountKey
        connection.identity = safeIdentity(null)
        connection.profileAvailability = safeAvailability(null)
        send(
          socket,
          credential
            ? {
                type: 'auth.paired',
                credential,
                connectionId: connection.connectionId,
              }
            : { type: 'auth.ready', connectionId: connection.connectionId },
        )
        if (state.paused)
          send(socket, { type: 'queue.pause', paused: true, reason: 'manual' })
        send(socket, {
          type: 'queue.pause',
          paused: providerHeld(),
          reason: 'provider',
        })
        send(socket, { type: 'jobs.reconcile' })
        emit({ type: 'connection.ready', ...connectionSummary(connection) })
        return
      }
      const connection = state.connections[socket.connectionId]
      if (connection.revoked || sockets.get(connection.connectionId) !== socket)
        throw new Error('connection_revoked')
      if (
        [
          'job.received',
          'job.state',
          'job.result',
          'job.error',
          'job.deleted',
          'job.deleteRejected',
        ].includes(frame.type) &&
        (await handleArchivedReceipt(connection, frame, socket))
      ) {
        await schedule()
        return
      }
      if (
        [
          'job.received',
          'job.state',
          'job.result',
          'job.error',
          'job.retryAccepted',
          'job.retryRejected',
        ].includes(frame.type) &&
        validId(frame.imageJobId) &&
        state.jobs[frame.imageJobId]?.deletedAt
      ) {
        sendDeletedJob(
          ownedJob(connection, frame.imageJobId, frame.attemptId),
          socket,
          true,
        )
        return
      }
      if (
        [
          'job.received',
          'job.state',
          'job.result',
          'job.error',
          'job.retryAccepted',
          'job.retryRejected',
          'job.deleted',
          'job.deleteRejected',
        ].includes(frame.type)
      ) {
        const job = state.jobs[frame.imageJobId]
        if (job?.connectionId === connection.connectionId)
          assertReceiptPlan(job, frame)
      }
      switch (frame.type) {
        case 'coordinator.request': {
          if (
            !validId(frame.requestId) ||
            !PANEL_COMMANDS.has(frame.command?.type)
          )
            throw new Error('command_not_allowed')
          const data = await handleCommand(frame.command)
          send(socket, {
            type: 'coordinator.response',
            requestId: frame.requestId,
            data: data ?? { ok: true },
          })
          return
        }
        case 'discovery.list': {
          const event = discoveryList()
          send(socket, {
            ...event,
            requestId: validId(frame.requestId) ? frame.requestId : null,
          })
          return
        }
        case 'discovery.link': {
          const event = linkDiscovery(frame.discoveryId)
          send(socket, {
            ...event,
            requestId: validId(frame.requestId) ? frame.requestId : null,
          })
          return
        }
        case 'heartbeat':
          send(socket, { type: 'heartbeat.ack' })
          return
        case 'heartbeat.ack':
          return
        case 'session.status': {
          const binding = frame.binding
          let executionPlan
          try {
            executionPlan = normalizeExecutionPlan(binding?.executionPlan)
          } catch (error) {
            connection.binding = null
            connection.flowTools = null
            await persist()
            throw error
          }
          if (binding?.ready && !validId(binding.projectId))
            throw new Error('project_id_invalid')
          connection.binding = binding
            ? {
                projectId: validId(binding.projectId)
                  ? binding.projectId
                  : null,
                alias:
                  typeof binding.alias === 'string'
                    ? binding.alias.slice(0, 120)
                    : connection.alias,
                ready: binding.ready === true,
                ...(executionPlan ? { executionPlan } : {}),
              }
            : null
          if (connection.binding && typeof binding?.bindingId === 'string')
            connection.binding.bindingId = binding.bindingId
          connection.flowTools = safeFlowToolsCapability(
            frame.capabilities?.flowTools,
          )
          connection.paused = frame.paused === true
          connection.providerNotBefore =
            Number.isSafeInteger(frame.providerNotBefore) &&
            frame.providerNotBefore >= 0
              ? frame.providerNotBefore
              : 0
          connection.identity = safeIdentity(frame.identity)
          rememberVerifiedIdentity(connection)
          if (
            connection.identity.verified &&
            !identityConflict(state.connections, connection)
          )
            connection.linkedAccountKey = connection.identity.accountKey
          connection.profileAvailability = safeAvailability(
            frame.profileAvailability,
          )
          connection.accountPolicy = safePolicy(frame.accountPolicy)
          connection.capacity = safeCapacity(frame.capacity)
          connection.scheduling = safeScheduling(frame.scheduling)
          const incomingPermit = safeRecoveryPermit(frame.recoveryPermit)
          connection.announcedRecoveryPermitId = incomingPermit?.id ?? null
          connection.recoveryPermit = mergeRecoveryPermit(
            connection.recoveryPermit,
            incomingPermit,
          )
          connection.generationRetrySupported =
            frame.capabilities?.generationRetry === true
          connection.autoRecoveryVersion =
            frame.capabilities?.autoRecoveryVersion === 1 ? 1 : null
          connection.persistentRecoveryVersion =
            connection.autoRecoveryVersion === 1 &&
            frame.capabilities?.persistentRecoveryVersion === 1
              ? 1
              : null
          connection.localDeletionSupported =
            frame.capabilities?.localDeletion === true
          connection.extensionVersion = safeExtensionVersion(
            frame.extensionVersion,
          )
          connection.sessionObservedAt = Date.now()
          connection.generationNotBefore =
            Number.isSafeInteger(frame.generationNotBefore) &&
            frame.generationNotBefore >= 0
              ? frame.generationNotBefore
              : 0
          // Per-profile deadlines are reported for observability, not copied into a global pause.
          connection.sessionRevision = (connection.sessionRevision ?? 0) + 1
          const incident = connection.profileIncident
          if (
            incident &&
            connection.sessionRevision > incident.sessionRevision &&
            Date.now() >= incident.notBefore &&
            ['ready', 'checking'].includes(
              connection.profileAvailability.state,
            ) &&
            connection.profileAvailability.checkingJobId === null &&
            !connection.paused
          )
            delete connection.profileIncident
          await persist()
          await releaseProviderHold(connection)
          if (connection.reconciled)
            for (const job of Object.values(state.jobs))
              if (job.connectionId === connection.connectionId)
                sendDeletedJob(job, socket)
          emit({ type: 'connection.status', ...connectionSummary(connection) })
          await schedule()
          return
        }
        case 'job.deleted': {
          const job = ownedJob(connection, frame.imageJobId, frame.attemptId)
          if (acknowledgeDeletion(job, frame)) {
            await persist()
            emit({ type: 'image.deleted', ...deletedJobSummary(job) })
          }
          return
        }
        case 'job.deleteRejected': {
          const job = ownedJob(connection, frame.imageJobId, frame.attemptId)
          if (
            !job.deletedAt ||
            frame.deletionId !== job.deletionId ||
            frame.requestHash !== job.requestHash
          )
            throw new Error('deletion_identity_mismatch')
          if (!job.workerDeletedAt) {
            job.workerDeletionError = safeCode(frame.error?.code)
            await persist()
            emit({ type: 'image.deleted', ...deletedJobSummary(job) })
          }
          return
        }
        case 'job.retryAccepted': {
          const job = ownedJob(connection, frame.imageJobId, frame.attemptId)
          if (
            !RETRY_ID.test(frame.retryRequestId ?? '') ||
            job.generationRetry?.retryRequestId !== frame.retryRequestId
          )
            throw new Error('retry_request_mismatch')
          if (acknowledgeRetry(job, frame.retryRequestId)) {
            updateAttemptStats(job, frame.attemptStats)
            await persist()
            emit({ type: 'job.state', ...jobSummary(job) })
            if (job.cancelRequested)
              send(socket, {
                type: 'job.cancel',
                imageJobId: job.imageJobId,
                attemptId: job.attemptId,
                ...planFields(job),
              })
          }
          return
        }
        case 'job.retryRejected': {
          const job = state.jobs[frame.imageJobId]
          if (
            !validId(frame.imageJobId) ||
            !job ||
            job.connectionId !== connection.connectionId
          )
            throw new Error('job_not_owned')
          const retry = job.generationRetry
          if (
            !retry ||
            retry.attemptId !== frame.attemptId ||
            retry.retryRequestId !== frame.retryRequestId ||
            retry.previousAttemptId !== frame.previousAttemptId
          )
            throw new Error('retry_request_mismatch')
          if (retry.status !== 'pending') return
          const previous = job.generationRetryHistory?.find(
            (item) => item.retryRequestId === retry.retryRequestId,
          )
          if (!previous) throw new Error('retry_history_missing')
          retry.status = 'rejected'
          retry.rejectedAt = new Date().toISOString()
          retry.error = { code: safeCode(frame.error?.code) }
          job.attemptId = retry.previousAttemptId
          job.state = previous.state
          job.error = previous.error
          job.attentionIncident = previous.attentionIncident ?? null
          retrySentAt.delete(retry.retryRequestId)
          await persist()
          emit({ type: 'job.error', ...jobSummary(job) })
          await schedule()
          return
        }
        case 'job.received': {
          const job = ownedJob(connection, frame.imageJobId, frame.attemptId)
          acknowledgeRetry(job)
          updateAttemptStats(job, frame.attemptStats)
          if (job.state === 'dispatching' || job.state === 'unknown')
            job.state = 'received'
          planAutomaticRecovery(job)
          await persist()
          emit({ type: 'job.state', ...jobSummary(job) })
          return
        }
        case 'job.state': {
          const job = ownedJob(connection, frame.imageJobId, frame.attemptId)
          if (!EXTENSION_STATES.has(frame.state))
            throw new Error('job_state_invalid')
          acknowledgeRetry(job)
          const statsChanged = updateAttemptStats(job, frame.attemptStats)
          if (job.result) {
            if (statsChanged) {
              await persist()
              emit({ type: 'job.state', ...jobSummary(job) })
            }
            return
          }
          // «queued» remoto ya tiene dueño: jamás vuelve a la cola asignable del coordinador.
          job.state = frame.state === 'queued' ? 'received' : frame.state
          if (frame.error) {
            job.error = safeError(frame.error)
            if (automaticJob(job))
              job.autoRecovery.retryEligible =
                (automaticRecoveryEligible(frame.error, frame.attemptStats) &&
                  automaticRecoveryEligible(
                    frame.error,
                    job.autoRecovery.currentAttemptStats,
                  )) ||
                (job.persistentRecoveryVersion === 1 &&
                  connection.persistentRecoveryVersion === 1 &&
                  persistentTemporaryRejection(
                    frame.error,
                    frame.attemptStats,
                  ) &&
                  persistentTemporaryRejection(
                    job.error,
                    job.autoRecovery.currentAttemptStats,
                  ))
          }
          planAutomaticRecovery(job)
          await pauseForAttention(job)
          await persist()
          emit({ type: 'job.state', ...jobSummary(job) })
          await schedule()
          return
        }
        case 'job.result':
          await acceptResult(
            connection,
            frame.imageJobId,
            frame.result,
            socket,
            frame.attemptId,
            frame.attemptStats,
          )
          return
        case 'job.error': {
          const job = ownedJob(connection, frame.imageJobId, frame.attemptId)
          urlRefreshes.delete(job.imageJobId)
          acknowledgeRetry(job)
          updateAttemptStats(job, frame.attemptStats)
          if (job.result) {
            job.error = safeError(frame.error)
            if (!job.file && !downloads.has(job.imageJobId))
              job.state = 'download_failed'
          } else {
            job.error = safeError(frame.error)
            job.state = ['not-sent', 'rejected'].includes(job.error.submission)
              ? 'failed'
              : 'unknown'
          }
          if (automaticJob(job))
            job.autoRecovery.retryEligible =
              (automaticRecoveryEligible(frame.error, frame.attemptStats) &&
                automaticRecoveryEligible(
                  frame.error,
                  job.autoRecovery.currentAttemptStats,
                )) ||
              (job.persistentRecoveryVersion === 1 &&
                connection.persistentRecoveryVersion === 1 &&
                persistentTemporaryRejection(frame.error, frame.attemptStats) &&
                persistentTemporaryRejection(
                  job.error,
                  job.autoRecovery.currentAttemptStats,
                ))
          planAutomaticRecovery(job)
          if (job.result) automaticDownloadFailure(job)
          await pauseForAttention(job)
          await persist()
          emit({ type: 'job.error', ...jobSummary(job) })
          await schedule()
          return
        }
        case 'jobs.snapshot': {
          if (frame.more !== undefined && typeof frame.more !== 'boolean')
            throw new Error('snapshot_invalid')
          if (!Array.isArray(frame.jobs) || frame.jobs.length > 5000)
            throw new Error('snapshot_invalid')
          const internalMigrations = []
          for (const receipt of frame.jobs) {
            if (
              validId(receipt?.imageJobId) &&
              (await handleArchivedReceipt(
                connection,
                { ...receipt, type: 'job.state' },
                socket,
              ))
            )
              continue
            if (
              !validId(receipt?.imageJobId) ||
              state.jobs[receipt.imageJobId]?.connectionId !==
                connection.connectionId
            )
              continue
            const job = state.jobs[receipt.imageJobId]
            if (job.attemptId && receipt.attemptId !== job.attemptId) continue
            if (receipt.requestHash && receipt.requestHash !== job.requestHash)
              throw new Error('snapshot_hash_mismatch')
            assertReceiptPlan(job, receipt)
            if (job.deletedAt) {
              if (receipt.state === 'deleted') acknowledgeDeletion(job, receipt)
              else sendDeletedJob(job, socket, true)
              continue
            }
            if (receipt.state === 'deleted')
              throw new Error('deletion_not_authorized')
            const previousIncident = job.attentionIncident
            const previousError = job.error
            if (receipt.result)
              await acceptResult(
                connection,
                receipt.imageJobId,
                receipt.result,
                socket,
                receipt.attemptId,
                receipt.attemptStats,
                true,
              )
            else if (EXTENSION_STATES.has(receipt.state) && !job.result) {
              acknowledgeRetry(job)
              updateAttemptStats(job, receipt.attemptStats)
              job.state =
                receipt.state === 'queued' ? 'received' : receipt.state
              if (receipt.error) {
                job.error = safeError(receipt.error)
                if (automaticJob(job))
                  job.autoRecovery.retryEligible =
                    (automaticRecoveryEligible(
                      receipt.error,
                      receipt.attemptStats,
                    ) &&
                      automaticRecoveryEligible(
                        receipt.error,
                        job.autoRecovery.currentAttemptStats,
                      )) ||
                    (job.persistentRecoveryVersion === 1 &&
                      connection.persistentRecoveryVersion === 1 &&
                      persistentTemporaryRejection(
                        receipt.error,
                        receipt.attemptStats,
                      ) &&
                      persistentTemporaryRejection(
                        job.error,
                        job.autoRecovery.currentAttemptStats,
                      ))
              }
              planAutomaticRecovery(job)
              internalMigrations.push({ job, previousIncident, previousError })
              await pauseForAttention(job)
            } else if (EXTENSION_STATES.has(receipt.state)) {
              acknowledgeRetry(job)
              updateAttemptStats(job, receipt.attemptStats)
            }
          }
          // Evaluate after every receipt is migrated; snapshot ordering must not
          // leave an obsolete hold when several RPC13 jobs shared this owner.
          let internalHoldReleased = false
          for (const item of internalMigrations)
            internalHoldReleased =
              reconcileInternalErrorHold(
                item.job,
                item.previousIncident,
                item.previousError,
              ) || internalHoldReleased
          if (internalHoldReleased) {
            await persist()
            broadcastProviderHold()
            emit({
              type: 'bridge.paused',
              paused: effectivelyPaused(),
              manualPaused: state.paused,
              reason: 'internal_error_isolated',
              providerHolds: publicHolds(),
            })
          }
          for (const job of Object.values(state.jobs)) {
            if (
              !job.deletedAt &&
              job.connectionId === connection.connectionId &&
              job.cancelRequested &&
              !job.result &&
              !['failed', 'canceled'].includes(job.state)
            ) {
              send(socket, {
                type: 'job.cancel',
                imageJobId: job.imageJobId,
                attemptId: job.attemptId,
                ...planFields(job),
              })
            }
          }
          if (frame.more === true) {
            await persist()
            return
          }
          connection.reconciled = true
          await persist()
          await releaseProviderHold(connection)
          send(socket, { type: 'jobs.reconciled' })
          for (const job of Object.values(state.jobs))
            if (job.connectionId === connection.connectionId) {
              sendPendingRetry(job, socket, true)
              sendDeletedJob(job, socket, true)
            }
          emit({
            type: 'jobs.reconciled',
            connectionId: connection.connectionId,
          })
          await schedule()
          return
        }
        default:
          throw new Error('frame_type_unsupported')
      }
    }
    async function dispatch(command) {
      return run(() => handleCommand(command))
    }
    async function handleCommand(command) {
      if (stopping) throw new Error('bridge_closing')
      if (!command || typeof command.type !== 'string')
        throw new Error('command_invalid')
      await expireDownloadUrlRequests()
      switch (command.type) {
        case 'discovery.list': {
          const event = discoveryList()
          emit(event)
          return event
        }
        case 'discovery.link': {
          const event = linkDiscovery(command.discoveryId)
          emit(event)
          return event
        }
        case 'pairing.new': {
          const event = {
            type: 'bridge.pairing',
            port: actualPort,
            pairingCode: pairingCode(),
          }
          emit(event)
          return event
        }
        case 'status': {
          const event = status()
          emit(event)
          return event
        }
        case 'capacity.check': {
          const event = {
            type: 'capacity.status',
            ...reportCapacity(
              command.requestedCount,
              selectedConnections(command),
              command.executionPlan,
              command.autoRecoveryVersion,
            ),
          }
          emit(event)
          return event
        }
        case 'batch.prepare': {
          const prepared = prepareBatch(
            command.batchId,
            command.requestedCount,
            selectedConnections(command),
            command.executionPlan,
            command.autoRecoveryVersion,
          )
          if (prepared.event) {
            emit(prepared.event)
            return prepared.event
          }
          reserveBatchRecovery(prepared.batch)
          state.batches[command.batchId] = prepared.batch
          await persist()
          const event = {
            type: 'batch.prepared',
            batch: batchSummary(prepared.batch),
          }
          emit(event)
          return event
        }
        case 'batch.cancel': {
          const batch = validId(command.batchId)
            ? state.batches[command.batchId]
            : null
          if (!batch) throw new Error('batch_not_found')
          if (batch.deletedAt) throw new Error('batch_deleted')
          batch.status = 'canceled'
          // Canceling a plan before any job exists must not strand its checking
          // authority. Never release a claim once an intent/receipt was stored,
          // even if that job is now canceled, deleted, failed or unknown.
          if (
            !Object.values(state.jobs).some(
              (job) => job.batchId === batch.batchId,
            )
          ) {
            for (const allocation of batch.allocations) {
              const owner = state.connections[allocation.connectionId]
              const permit = owner?.recoveryPermit
              if (
                allocation.recoveryPermitId &&
                permit?.id === allocation.recoveryPermitId &&
                permit.reservedBatchId === batch.batchId &&
                permit.consumedJobId === null
              ) {
                owner.recoveryPermit = { ...permit, reservedBatchId: null }
              }
            }
          }
          await persist()
          const event = { type: 'batch.canceled', batch: batchSummary(batch) }
          emit(event)
          return event
        }
        case 'image.delete': {
          const job = validId(command.imageJobId)
            ? state.jobs[command.imageJobId]
            : null
          if (!job) throw new Error('job_not_found')
          if (!job.deletedAt) {
            if (!canDeleteJob(job)) throw new Error('job_active')
            markDeleted(job, new Date().toISOString())
            // Commit the fence before deleting bytes: a crash can delay cleanup,
            // but must never forget an admitted generation or recreate its image.
            await persist()
          }
          await cleanupDeletedJob(job)
          sendDeletedJob(job, undefined, true)
          const event = { type: 'image.deleted', ...deletedJobSummary(job) }
          emit(event)
          return event
        }
        case 'batch.delete': {
          const batch = validId(command.batchId)
            ? state.batches[command.batchId]
            : null
          if (!batch) throw new Error('batch_not_found')
          const jobs = Object.values(state.jobs).filter(
            (job) => job.batchId === batch.batchId,
          )
          if (!batch.deletedAt) {
            if (!canDeleteBatch(batch)) throw new Error('batch_active')
            batch.deletedAt = new Date().toISOString()
            batch.deletionId = randomUUID()
            batch.status = 'deleted'
            for (const job of jobs) markDeleted(job, batch.deletedAt)
            await persist()
          }
          for (const job of jobs) await cleanupDeletedJob(job, false)
          await persist()
          for (const job of jobs) sendDeletedJob(job, undefined, true)
          const event = {
            type: 'batch.deleted',
            batchId: batch.batchId,
            imageJobIds: jobs.map((job) => job.imageJobId),
            deletionId: batch.deletionId,
            deletedAt: batch.deletedAt,
            cleanupPending: jobs.some((job) => job.localCleanupPending),
            workerCleanupPending: jobs.some(
              (job) =>
                (job.connectionId && !job.workerDeletedAt) ||
                archivedAttempts(job).some(
                  (attempt) => !attempt.workerDeletedAt,
                ),
            ),
          }
          emit(event)
          return event
        }
        case 'submit': {
          const autoRecoveryVersion = normalizeAutoRecoveryVersion(
            command.autoRecoveryVersion,
          )
          if (
            !Array.isArray(command.jobs) ||
            !command.jobs.length ||
            command.jobs.length > 500
          )
            throw new Error('jobs_invalid')
          const connectionIds = selectedConnections(command)
          const prepared = []
          const seen = new Map()
          for (const input of command.jobs) {
            if (
              validId(input?.imageJobId) &&
              state.jobs[input.imageJobId]?.deletedAt
            )
              throw new Error('job_deleted')
            if (
              validId(input?.batchId) &&
              state.batches[input.batchId]?.deletedAt
            )
              throw new Error('batch_deleted')
            if (
              normalizeAutoRecoveryVersion(input.autoRecoveryVersion) !==
              autoRecoveryVersion
            )
              throw new Error('job_recovery_version_mismatch')
            const entry = normalizeJob(
              input,
              state.jobs[input?.imageJobId] ?? seen.get(input?.imageJobId),
            )
            prepared.push(entry)
            const { job } = entry
            if (autoRecoveryVersion)
              job.autoRecoveryVersion = autoRecoveryVersion
            const previous =
              state.jobs[job.imageJobId] ?? seen.get(job.imageJobId)
            if (
              previous &&
              (previous.autoRecoveryVersion !== autoRecoveryVersion ||
                previous.requestHash !== job.requestHash ||
                previous.batchId !== job.batchId ||
                (input.promptIndex !== undefined &&
                  previous.promptIndex !== input.promptIndex))
            )
              throw new Error('job_id_conflict')
            seen.set(job.imageJobId, job)
          }
          const batchIds = new Set(prepared.map(({ job }) => job.batchId))
          if (batchIds.size !== 1) throw new Error('batch_mixed')
          const batchId = prepared[0].job.batchId
          const executionPlan = prepared[0].job.executionPlan
          if (
            prepared.some(
              ({ job }) =>
                !executionPlansEqual(job.executionPlan, executionPlan),
            )
          )
            throw new Error('batch_execution_plan_mixed')
          const newJobs = [...seen.values()].filter(
            (job) => !Object.hasOwn(state.jobs, job.imageJobId),
          )
          if (
            Object.values(state.jobs).filter((job) => job.state === 'queued')
              .length +
              newJobs.length >
            500
          )
            throw new Error('queue_full')
          let batch = state.batches[batchId]
          if (batch && batch.autoRecoveryVersion !== autoRecoveryVersion)
            throw new Error('batch_recovery_version_mismatch')
          if (batch && !executionPlansEqual(batch.executionPlan, executionPlan))
            throw new Error('batch_execution_plan_conflict')
          if (newJobs.length) {
            if (!batch) {
              const plan = prepareBatch(
                batchId,
                newJobs.length,
                connectionIds,
                executionPlan,
                autoRecoveryVersion,
              )
              if (plan.event) {
                emit(plan.event)
                return plan.event
              }
              batch = plan.batch
            }
            if (batch.status !== 'prepared') throw new Error('batch_canceled')
            if (
              connectionIds &&
              batch.allocations.some(
                (allocation) =>
                  !connectionIds.includes(allocation.connectionId),
              )
            )
              throw new Error('batch_connection_conflict')
            // Clone before staging writes: an invalid page must not consume reservations.
            batch = {
              ...batch,
              allocations: batch.allocations.map((item) => ({ ...item })),
            }
            if (
              newJobs.length >
              batch.allocations.reduce(
                (sum, item) => sum + item.count - item.submitted,
                0,
              )
            )
              throw new Error('batch_size_exceeded')
            const staged = []
            let cursor = batch.nextAllocationIndex ?? 0
            let ordinal = Object.values(state.jobs)
              .filter((job) => job.batchId === batchId)
              .reduce((max, job) => Math.max(max, job.promptIndex ?? 0), 0)
            const indexes = new Set(
              Object.values(state.jobs)
                .filter((job) => job.batchId === batchId)
                .map((job) => job.promptIndex),
            )
            for (const job of newJobs) {
              let allocation
              for (let step = 0; step < batch.allocations.length; step++) {
                const index = (cursor + step) % batch.allocations.length
                if (
                  batch.allocations[index].submitted <
                    batch.allocations[index].count &&
                  executionCompatible(
                    executionPlan,
                    state.connections[batch.allocations[index].connectionId],
                  )
                ) {
                  allocation = batch.allocations[index]
                  cursor = (index + 1) % batch.allocations.length
                  break
                }
              }
              if (!allocation)
                throw new Error(
                  executionPlan
                    ? 'execution_plan_unavailable'
                    : 'batch_size_exceeded',
                )
              const promptIndex = job.promptIndex ?? ++ordinal
              if (
                !Number.isSafeInteger(promptIndex) ||
                promptIndex < 1 ||
                promptIndex > 10000
              )
                throw new Error('prompt_index_invalid')
              if (indexes.has(promptIndex))
                throw new Error('prompt_index_conflict')
              indexes.add(promptIndex)
              ordinal = Math.max(ordinal, promptIndex)
              staged.push({
                ...job,
                ...(autoRecoveryVersion
                  ? {
                      autoRecoveryVersion,
                      automaticRetryCount: 0,
                      autoRecovery: newAutoRecovery(),
                    }
                  : {}),
                ...(allocation.recoveryPermitId &&
                (autoRecoveryVersion !== 1 || allocation.submitted === 0)
                  ? { recoveryPermitId: allocation.recoveryPermitId }
                  : {}),
                promptIndex,
                preferredConnectionId: allocation.connectionId,
                state: 'queued',
                createdAt: new Date().toISOString(),
              })
              allocation.submitted++
            }
            batch.nextAllocationIndex = cursor
            // References may leave harmless orphan files on failure; no job is admitted until every write succeeds.
            const writtenAssets = new Set()
            for (const { job, assets } of prepared) {
              if (Object.hasOwn(state.jobs, job.imageJobId)) continue
              for (const asset of assets)
                if (!writtenAssets.has(asset.hash)) {
                  await writePrivateFile(
                    join(store.directory, 'references', `${asset.hash}.bin`),
                    asset.bytes,
                  )
                  writtenAssets.add(asset.hash)
                }
            }
            reserveBatchRecovery(batch)
            state.batches[batchId] = batch
            for (const job of staged) state.jobs[job.imageJobId] = job
            await persist()
          }
          const event = {
            type: 'jobs.accepted',
            jobs: prepared.map(({ job }) =>
              jobSummary(state.jobs[job.imageJobId]),
            ),
          }
          emit(event)
          await schedule()
          return event
        }
        case 'generation.retry': {
          if (
            !validId(command.imageJobId) ||
            !RETRY_ID.test(command.retryRequestId ?? '') ||
            !RETRY_ID.test(command.expectedAttemptId ?? '') ||
            command.acknowledgeDuplicateRisk !== true
          )
            throw new Error('generation_retry_invalid')
          const job = state.jobs[command.imageJobId]
          if (!job) throw new Error('job_not_found')
          if (automaticJob(job))
            throw new Error('automatic_recovery_policy_owns_retries')
          if (job.deletedAt) throw new Error('job_deleted')
          const reused = Object.values(state.jobs).find((other) =>
            other.generationRetryHistory?.some(
              (item) => item.retryRequestId === command.retryRequestId,
            ),
          )
          if (reused && reused !== job)
            throw new Error('retry_request_conflict')
          const history = job.generationRetryHistory ?? []
          const duplicate = history.find(
            (item) => item.retryRequestId === command.retryRequestId,
          )
          if (duplicate) {
            if (duplicate.attemptId !== command.expectedAttemptId)
              throw new Error('retry_request_conflict')
            sendPendingRetry(job, sockets.get(job.connectionId))
            return {
              type: 'generation.retryAccepted',
              replayed: true,
              job: jobSummary(job),
            }
          }
          if (job.attemptId !== command.expectedAttemptId)
            throw new Error('attempt_mismatch')
          if (history.length >= MAX_GENERATION_RETRIES)
            throw new Error('generation_retry_limit')
          if (
            job.state !== 'unknown' ||
            !isSettledInternalGenerationError(job.error) ||
            job.result ||
            job.cancelRequested ||
            job.generationRetry?.status === 'pending'
          )
            throw new Error('generation_retry_unavailable')
          const owner = state.connections[job.connectionId]
          if (
            !owner ||
            owner.revoked ||
            !owner.reconciled ||
            !sockets.has(owner.connectionId) ||
            !owner.binding?.ready ||
            owner.identity?.verified !== true ||
            identityConflict(state.connections, owner) ||
            owner.binding.projectId !== job.binding?.projectId
          )
            throw new Error('retry_owner_unavailable')
          if (owner.generationRetrySupported !== true)
            throw new Error('retry_owner_upgrade_required')
          if (!executionCompatible(job.executionPlan, owner))
            throw new Error('retry_execution_plan_unavailable')
          const requestedAt = new Date().toISOString()
          const retry = {
            retryRequestId: command.retryRequestId,
            previousAttemptId: job.attemptId,
            attemptId: randomUUID(),
            status: 'pending',
            requestedAt,
          }
          job.generationRetryHistory = [
            ...history,
            {
              retryRequestId: retry.retryRequestId,
              attemptId: job.attemptId,
              state: job.state,
              error: job.error,
              attentionIncident: job.attentionIncident ?? null,
              attemptStats: safeAttemptStats(job.attemptStats),
              requestedAt,
              acknowledgeDuplicateRisk: true,
            },
          ]
          job.generationRetry = retry
          job.attemptId = retry.attemptId
          job.state = 'received'
          job.error = null
          job.attentionIncident = null
          await persist()
          sendPendingRetry(job, sockets.get(job.connectionId), true)
          const event = {
            type: 'generation.retryAccepted',
            replayed: false,
            job: jobSummary(job),
          }
          emit(event)
          return event
        }
        case 'pause':
          if (typeof command.paused !== 'boolean')
            throw new Error('pause_invalid')
          state.paused = command.paused
          await persist()
          for (const socket of sockets.values())
            send(socket, {
              type: 'queue.pause',
              paused: state.paused,
              reason: 'manual',
            })
          emit({
            type: 'bridge.paused',
            paused: effectivelyPaused(),
            manualPaused: state.paused,
            providerHolds: publicHolds(),
          })
          await schedule()
          return
        case 'cancel': {
          const job = state.jobs[command.imageJobId]
          if (!validId(command.imageJobId) || !job)
            throw new Error('job_not_found')
          if (job.deletedAt) throw new Error('job_deleted')
          if (automaticJob(job)) {
            job.cancelRequested = true
            planAutomaticRecovery(job)
            for (const attempt of archivedAttempts(job))
              if (!attempt.result && remoteActive(attempt)) {
                attempt.cancelRequested = true
                send(sockets.get(attempt.connectionId), {
                  type: 'job.cancel',
                  imageJobId: job.imageJobId,
                  attemptId: attempt.attemptId,
                  ...planFields(job),
                })
              }
          }
          if (job.state === 'queued') job.state = 'canceled'
          else if (!job.result && !['failed', 'canceled'].includes(job.state)) {
            job.cancelRequested = true
            send(sockets.get(job.connectionId), {
              type: 'job.cancel',
              imageJobId: job.imageJobId,
              attemptId: job.attemptId,
              ...planFields(job),
            })
          }
          await persist()
          emit({ type: 'job.state', ...jobSummary(job) })
          await schedule()
          return
        }
        case 'revoke': {
          const connection = state.connections[command.connectionId]
          if (!validId(command.connectionId) || !connection)
            throw new Error('connection_invalid')
          connection.revoked = true
          connection.binding = null
          delete connection.credentialHash
          for (const job of Object.values(state.jobs)) {
            if (
              job.connectionId === connection.connectionId &&
              remoteActive(job)
            )
              job.state = 'unknown'
          }
          await persist()
          send(sockets.get(connection.connectionId), {
            type: 'connection.revoked',
          })
          sockets
            .get(connection.connectionId)
            ?.close(4003, 'connection revoked')
          sockets.delete(connection.connectionId)
          emit({
            type: 'connection.revoked',
            connectionId: connection.connectionId,
          })
          return
        }
        case 'preview.read': {
          const job = validId(command.imageJobId)
            ? state.jobs[command.imageJobId]
            : null
          if (job?.deletedAt) throw new Error('job_deleted')
          if (!job?.file || job.state !== 'ready')
            throw new Error('preview_not_ready')
          const { bytes, format } = await verifiedResultFile(job)
          if (bytes.length > 12 * 1024 * 1024)
            throw new Error('preview_file_invalid')
          return {
            type: 'job.preview',
            imageJobId: job.imageJobId,
            mimeType: format.mimeType,
            base64: bytes.toString('base64'),
            sha256: job.file.sha256,
          }
        }
        case 'download': {
          const job = state.jobs[command.imageJobId]
          if (validId(command.imageJobId) && job?.deletedAt)
            throw new Error('job_deleted')
          if (!validId(command.imageJobId) || !job?.result)
            throw new Error('job_result_missing')
          if (job.file) {
            try {
              await verifiedResultFile(job)
              emit({ type: 'job.ready', ...jobSummary(job), ...job.file })
              return
            } catch {
              // The confirmed provider receipt remains authoritative. Repairing
              // a missing or corrupt local file must never generate again.
              job.file = null
              job.state = 'download_failed'
              job.error = {
                code: 'image_file_unavailable',
                submission: 'accepted',
              }
              await persist()
              emit({ type: 'job.error', ...jobSummary(job) })
            }
          }
          if (
            !job.result.imageUrl ||
            job.error?.code === 'image_url_expired_or_denied'
          ) {
            await requestDownloadUrl(job, sockets.get(job.connectionId))
          } else await startDownload(job)
          return
        }
        default:
          throw new Error('command_type_unsupported')
      }
    }
    for (const connection of Object.values(state.connections)) {
      rememberVerifiedIdentity(connection)
      connection.binding = null
      connection.sessionObservedAt = 0
      connection.extensionVersion = null
      connection.generationRetrySupported = false
      connection.autoRecoveryVersion = null
      connection.persistentRecoveryVersion = null
      connection.localDeletionSupported = false
    }
    for (const job of Object.values(state.jobs))
      if (remoteActive(job)) job.state = 'unknown'
    await persist()
    const pendingLocalCleanup = Object.values(state.jobs).filter(
      (job) => job.deletedAt && job.localCleanupPending,
    )
    for (const job of pendingLocalCleanup) await cleanupDeletedJob(job, false)
    if (pendingLocalCleanup.length) await persist()
    const server = createServer((_request, response) => {
      response.writeHead(404)
      response.end()
    })
    const webSockets = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_FRAME_BYTES,
      perMessageDeflate: false,
    })
    startupServer = server
    startupWebSockets = webSockets
    server.on('upgrade', (request, socket, head) => {
      if (
        request.socket.remoteAddress !== '127.0.0.1' ||
        request.headers.host !== `127.0.0.1:${actualPort}` ||
        !ORIGIN.test(request.headers.origin ?? '') ||
        !['/', '/bridge'].includes(request.url)
      ) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      webSockets.handleUpgrade(request, socket, head, (client) =>
        webSockets.emit('connection', client, request),
      )
    })
    webSockets.on('connection', (socket, request) => {
      socket.authTimeout = setTimeout(
        () => socket.close(4003, 'authentication timeout'),
        10_000,
      )
      socket.on('error', () => {})
      socket.on('message', (bytes, binary) => {
        if (binary) {
          socket.close(1003, 'text frames required')
          return
        }
        let requestId = null
        run(async () => {
          const frame = JSON.parse(bytes.toString('utf8'))
          requestId = validId(frame?.requestId) ? frame.requestId : null
          return handleFrame(socket, frame, request.headers.origin)
        }).catch((error) => {
          const code =
            error instanceof SyntaxError
              ? 'frame_invalid'
              : safeCode(error.message)
          send(socket, { type: 'protocol.error', requestId, error: { code } })
          if (
            !socket.connectionId ||
            [
              'connection_revoked',
              'job_not_owned',
              'media_id_changed',
            ].includes(code)
          )
            socket.close(4003, 'protocol rejected')
          emit({
            type: 'bridge.error',
            error: { code },
            connectionId: socket.connectionId ?? null,
          })
        })
      })
      socket.on('close', () => {
        clearTimeout(socket.authTimeout)
        removeDiscovery(socket)
        if (!socket.connectionId) return
        run(async () => {
          for (const [imageJobId, refresh] of urlRefreshes) {
            if (refresh.socket !== socket) continue
            urlRefreshes.delete(imageJobId)
            const job = state.jobs[imageJobId]
            if (job?.state !== 'awaiting_url' || job.deletedAt) continue
            job.state = 'download_failed'
            job.error = { code: 'connection_offline', submission: 'accepted' }
            automaticDownloadFailure(job)
            await persist()
            emit({ type: 'job.error', ...jobSummary(job) })
          }
          if (sockets.get(socket.connectionId) !== socket) return
          sockets.delete(socket.connectionId)
          const connection = state.connections[socket.connectionId]
          connection.binding = null
          for (const job of Object.values(state.jobs)) {
            if (job.connectionId === socket.connectionId && remoteActive(job))
              job.state = 'unknown'
          }
          await persist()
          emit({ type: 'connection.closed', connectionId: socket.connectionId })
          await schedule()
        }).catch(() => {})
      })
    })
    try {
      await new Promise((accept, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject)
          accept()
        })
      })
    } catch (error) {
      await store.close()
      throw error
    }
    actualPort = server.address().port
    const initialCode = pairingCode()
    emit({ type: 'bridge.ready', port: actualPort, pairingCode: initialCode })
    const heartbeat = setInterval(() => {
      run(async () => {
        await expireDownloadUrlRequests()
        await schedule()
      }).catch(() => {})
      const reconcileOwners = new Set()
      for (const job of Object.values(state.jobs))
        if (automaticJob(job) && !job.deletedAt) {
          for (const attempt of [job, ...archivedAttempts(job)])
            if (remoteActive(attempt)) reconcileOwners.add(attempt.connectionId)
        }
      for (const id of reconcileOwners)
        send(sockets.get(id), { type: 'jobs.reconcile' })
      for (const socket of sockets.values()) send(socket, { type: 'heartbeat' })
      for (const job of Object.values(state.jobs))
        sendPendingRetry(job, sockets.get(job.connectionId))
      for (const job of Object.values(state.jobs)) sendDeletedJob(job)
      for (const entry of discoveries.values())
        send(entry.socket, { type: 'heartbeat' })
      discoveryList()
    }, 20_000)
    startupHeartbeat = heartbeat
    heartbeat.unref()
    for (const job of Object.values(state.jobs))
      if (job.state === 'downloading') await run(() => startDownload(job))
    return {
      port: actualPort,
      pairingCode: initialCode,
      dispatch,
      close() {
        if (closePromise) return closePromise
        stopping = true
        clearInterval(heartbeat)
        clearTimeout(cadenceTimer)
        // Pause worker dispatch immediately without converting shutdown into a
        // durable manual pause. A future authenticated bridge announces its gate.
        for (const socket of sockets.values())
          send(socket, {
            type: 'queue.pause',
            paused: true,
            reason: 'provider',
          })
        closePromise = (async () => {
          // Results arriving during drain may start another download. Keep draining
          // until those commits have also finished before releasing the store lock.
          do {
            await operations
            await Promise.allSettled([...downloads.values()])
            await operations
          } while (downloads.size > 0)
          stopped = true
          for (const socket of webSockets.clients) {
            clearTimeout(socket.authTimeout)
            socket.terminate()
          }
          await new Promise((accept) => webSockets.close(accept))
          await new Promise((accept) => server.close(accept))
          await store.close()
        })()
        return closePromise
      },
    }
  } catch (error) {
    clearInterval(startupHeartbeat)
    if (startupWebSockets) {
      for (const socket of startupWebSockets.clients) {
        clearTimeout(socket.authTimeout)
        socket.terminate()
      }
      await new Promise((resolve) => startupWebSockets.close(() => resolve()))
    }
    if (startupServer?.listening)
      await new Promise((resolve) => startupServer.close(() => resolve()))
    await store.close().catch(() => {})
    throw error
  }
}
