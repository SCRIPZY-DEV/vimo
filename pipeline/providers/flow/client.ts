import { randomInt, randomUUID } from 'node:crypto'
import { flowAutoRecoveryPending } from '../../types/flow-auto-recovery.ts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { FLOW_IMAGE_MODEL } from '../../types/image-provider.ts'
import type { FlowToolsExecutionPlan } from '../../types/flow-execution-plan.ts'
import {
  flowCommandExecutionPlan,
  flowExecutionHashInput,
  flowExecutionParameters,
  flowExecutionPlansEqual,
  normalizeFlowExecutionPlan,
  supportsFlowToolsCoordinator,
} from './execution-plan.ts'
import { decodeImageDataUri, validateImageBytes } from '../image/download.ts'
import {
  assertFreshFlowRegenerationRequest,
  flowHash,
  flowIntentDirectory,
  readFlowBatch,
  withFlowLock,
  writeFlowFile,
} from './storage.ts'
import { flowJobReviewCode } from './job-review.ts'
import type {
  FlowBatch,
  FlowBatchOptions,
  FlowImageRequest,
  FlowJobStatus,
  FlowReference,
  FlowSavedRequest,
  FlowStatus,
} from './types.ts'

const MAX_COMMAND_BYTES = 19 * 1024 * 1024
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024
const MAX_REFERENCE_TOTAL = 12 * 1024 * 1024
const POLL_INTERVAL_MS = 1500
const TRANSPORT_RECOVERY_ATTEMPTS = 3
const DOWNLOAD_RECOVERY_ATTEMPTS = 3
const TERMINAL_STATES = new Set(['failed', 'unknown', 'canceled', 'deleted'])
const IMAGE_RECOVERY_CODES = new Set([
  'flow_download_failed',
  'flow_result_invalid',
  'flow_result_obsolete',
])

interface CommandReply<T> {
  ok: boolean
  result?: T
  code?: string
}
interface PreparedReply {
  batch?: {
    batchId: string
    executionPlan?: FlowToolsExecutionPlan
    autoRecoveryVersion?: 1
  }
  executionPlan?: FlowToolsExecutionPlan
  type: string
  requiredAdditionalProfiles?: number
  deficit?: number
  readyProfiles?: number
}
interface AcceptedReply {
  type: string
  jobs?: FlowJobStatus[]
}
interface PreviewReply {
  executionPlan?: FlowToolsExecutionPlan
  type: string
  imageJobId: string
  batchId: string
  requestHash: string
  base64: string
  mimeType: string
  sha256: string
}

function commandFailureCode(code: string | undefined): string {
  if (
    code &&
    [
      'flow_tools_coordinator_upgrade_required',
      'execution_plan_invalid',
      'seed_invalid',
      'flow_tools_model_or_aspect_invalid',
      'execution_plan_unavailable',
      'retry_execution_plan_unavailable',
    ].includes(code ?? '')
  )
    return code
  if (
    [
      'job_hash_mismatch',
      'batch_id_conflict',
      'batch_execution_plan_mixed',
      'batch_execution_plan_conflict',
      'execution_plan_mismatch',
      'store_execution_plan_invalid',
      'flow_result_identity_mismatch',
    ].includes(code ?? '')
  )
    return 'flow_intent_conflict'
  if (code === 'queue_full') return 'flow_queue_full'
  if (code === 'connection_offline' || code === 'flow_service_unauthorized')
    return 'flow_not_connected'
  if (
    [
      'preview_not_ready',
      'preview_file_invalid',
      'image_file_invalid',
      'flow_result_not_ready',
    ].includes(code ?? '')
  )
    return 'flow_download_failed'
  return 'flow_review_required'
}

// El token solo vive en memoria: header de loopback, nunca URL, evento o error.
export async function flowCommand<T>(
  context: PipelineContext,
  command: object,
  signal = context.signal,
): Promise<T> {
  const runtime = context.job.flowRuntime
  if (
    !runtime ||
    !Number.isInteger(runtime.port) ||
    runtime.port < 1 ||
    runtime.port > 65535 ||
    !runtime.token
  )
    throw new PipelineFailure(
      'flow_not_connected',
      'Flow runtime is unavailable',
    )
  const executionPlan = flowCommandExecutionPlan(command)
  if (executionPlan)
    await verifyFlowExecutionPlan(context, executionPlan, signal)
  const recoverable =
    'type' in command &&
    ['status', 'result.read', 'download'].includes(String(command.type))
  // Consultas y recuperación del mismo archivo son repetibles. Admitir una
  // generación exige primero reconciliar el snapshot con sus IDs durables.
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${runtime.port}/command`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${runtime.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      })
      const reply = (await response.json()) as CommandReply<T>
      if (!response.ok || !reply.ok) {
        throw new PipelineFailure(
          commandFailureCode(reply.code),
          'The Flow bridge could not complete this operation',
        )
      }
      return reply.result as T
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof PipelineFailure) throw error
      if (!recoverable || attempt >= TRANSPORT_RECOVERY_ATTEMPTS)
        throw new PipelineFailure(
          'flow_transport_unknown',
          'Flow transport interrupted; reconcile the saved request before continuing',
        )
      await delay(POLL_INTERVAL_MS * (attempt + 1), undefined, { signal })
    }
  }
}

export async function verifyFlowExecutionPlan(
  context: PipelineContext,
  executionPlan: unknown,
  signal = context.signal,
): Promise<FlowToolsExecutionPlan | undefined> {
  const plan = normalizeFlowExecutionPlan(executionPlan)
  if (!plan) return undefined
  const status = await flowCommand<FlowStatus>(
    context,
    { type: 'status' },
    signal,
  )
  if (
    status.type !== 'bridge.status' ||
    !supportsFlowToolsCoordinator(status.capabilities?.flowTools)
  )
    throw new PipelineFailure(
      'flow_tools_coordinator_upgrade_required',
      'The coordinator does not support this Flow execution plan',
    )
  return plan
}

export function flowReference(
  id: string,
  name: string,
  dataUri: string,
): FlowReference {
  const image = decodeImageDataUri(dataUri, MAX_REFERENCE_BYTES)
  if (!image)
    throw new PipelineFailure(
      'flow_result_invalid',
      'The character reference is invalid',
    )
  return {
    id,
    name: name.slice(0, 160),
    mimeType: image.mime,
    base64: image.bytes.toString('base64'),
    sha256: flowHash(image.bytes),
  }
}

async function persistBatch(
  directory: string,
  batch: FlowBatch,
): Promise<void> {
  // El recibo histórico conserva también aliases y pruebas de importación.
  // Publicarlo primero impide perder un UUID al avanzar el puntero actual.
  await writeFlowFile(
    join(directory, `${batch.batchId}.json`),
    JSON.stringify(batch),
  )
  await writeFlowFile(join(directory, 'current.json'), JSON.stringify(batch))
}

async function createBatch(
  directory: string,
  options: FlowBatchOptions,
  restartRequestId?: string,
): Promise<FlowBatch> {
  const executionPlan = normalizeFlowExecutionPlan(options.executionPlan)
  const batchId = randomUUID()
  // Sólo las intenciones nuevas de Multimagen autorizan sustituciones.
  const autoRecoveryVersion = executionPlan ? (1 as const) : undefined
  const requests: FlowSavedRequest[] = []
  const keys = new Set<string>()
  for (const [index, request] of options.requests.entries()) {
    const { executionPlan: requestedPlan, ...requestFields } = request
    if (
      requestedPlan !== undefined &&
      !flowExecutionPlansEqual(requestedPlan, executionPlan)
    )
      throw new PipelineFailure(
        'flow_intent_conflict',
        'A Flow batch cannot mix execution plans',
      )
    if (
      keys.has(request.key) ||
      !request.prompt.trim() ||
      request.prompt.length > 50_000
    )
      throw new PipelineFailure(
        'invalid_payload',
        'Flow needs unique destinations and valid prompts',
      )
    if (!['16:9', '9:16'].includes(request.aspectRatio))
      throw new PipelineFailure(
        'invalid_payload',
        'Unsupported Flow aspect ratio',
      )
    keys.add(request.key)
    const references = request.references ?? []
    if (references.length > 10)
      throw new PipelineFailure(
        'invalid_payload',
        'Flow accepts up to ten references',
      )
    let referenceBytes = 0
    const savedReferences: FlowSavedRequest['references'] = []
    for (const reference of references) {
      const bytes = Buffer.from(reference.base64, 'base64')
      referenceBytes += bytes.length
      if (
        bytes.length > MAX_REFERENCE_BYTES ||
        referenceBytes > MAX_REFERENCE_TOTAL ||
        flowHash(bytes) !== reference.sha256
      )
        throw new PipelineFailure(
          'flow_result_invalid',
          'Invalid Flow reference bytes',
        )
      // Deduplicación por bytes; el recibo nunca depende de una foto mutable.
      await writeFlowFile(
        join(directory, 'references', reference.sha256),
        bytes,
      )
      savedReferences.push({
        id: reference.id,
        name: reference.name.slice(0, 160),
        mimeType: reference.mimeType,
        sha256: reference.sha256,
      })
    }
    const execution = flowExecutionParameters(executionPlan, () =>
      randomInt(0, 2147483647),
    )
    const prompt = request.prompt.trim()
    const requestHash = flowHash(
      JSON.stringify(
        flowExecutionHashInput({
          prompt,
          model: FLOW_IMAGE_MODEL,
          aspectRatio: request.aspectRatio,
          ...execution,
          references: savedReferences,
        }),
      ),
    )
    requests.push({
      ...requestFields,
      ...(autoRecoveryVersion ? { autoRecoveryVersion } : {}),
      prompt,
      references: savedReferences,
      imageJobId: randomUUID(),
      batchId,
      promptIndex: index + 1,
      model: FLOW_IMAGE_MODEL,
      ...execution,
      requestHash,
    })
  }
  const batch: FlowBatch = {
    ...(autoRecoveryVersion ? { autoRecoveryVersion } : {}),
    ...(executionPlan ? { executionPlan } : {}),
    version: 1,
    scope: options.scope,
    revision: options.revision,
    batchId,
    requests,
    createdAt: new Date().toISOString(),
    ...(restartRequestId ? { restartRequestId } : {}),
    ...(options.explicitRegenerationRequestId
      ? { regenerationRequestIds: [options.explicitRegenerationRequestId] }
      : {}),
  }
  // La intención COMPLETA existe antes de reservar capacidad o enviar un job.
  await persistBatch(directory, batch)
  return batch
}

async function wireRequest(directory: string, request: FlowSavedRequest) {
  const references = []
  for (const reference of request.references) {
    const bytes = await readFile(
      join(directory, 'references', reference.sha256),
    )
    if (flowHash(bytes) !== reference.sha256)
      throw new PipelineFailure(
        'flow_result_invalid',
        'The saved character reference changed',
      )
    references.push({ ...reference, base64: bytes.toString('base64') })
  }
  return {
    ...(request.autoRecoveryVersion
      ? { autoRecoveryVersion: request.autoRecoveryVersion }
      : {}),
    imageJobId: request.imageJobId,
    batchId: request.batchId,
    promptIndex: request.promptIndex,
    model: request.model,
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    seed: request.seed,
    ...(request.executionPlan ? { executionPlan: request.executionPlan } : {}),
    requestHash: request.requestHash,
    references,
  }
}

function assertMatchingExecutionPlan(left: unknown, right: unknown): void {
  try {
    if (flowExecutionPlansEqual(left, right)) return
  } catch {
    // Un recibo incompatible no autoriza reenvío ni recuperación de otro medio.
  }
  throw new PipelineFailure(
    'flow_intent_conflict',
    'The Flow receipt has another execution plan',
  )
}

export function assertReceipt(
  request: FlowSavedRequest,
  status: FlowJobStatus,
): void {
  assertMatchingExecutionPlan(status.executionPlan, request.executionPlan)
  if (
    status.imageJobId !== request.imageJobId ||
    status.batchId !== request.batchId ||
    status.promptIndex !== request.promptIndex ||
    status.requestHash !== request.requestHash ||
    status.autoRecoveryVersion !== request.autoRecoveryVersion
  )
    throw new PipelineFailure(
      'flow_result_invalid',
      'The Flow result does not match the saved intent',
    )
}

export async function readReadyBytes(
  context: PipelineContext,
  request: FlowSavedRequest,
): Promise<Buffer> {
  const preview = await flowCommand<PreviewReply>(context, {
    type: 'result.read',
    ...(request.executionPlan ? { executionPlan: request.executionPlan } : {}),
    imageJobId: request.imageJobId,
    batchId: request.batchId,
    requestHash: request.requestHash,
  })
  assertMatchingExecutionPlan(preview.executionPlan, request.executionPlan)
  if (
    preview.type !== 'job.resultFile' ||
    preview.imageJobId !== request.imageJobId ||
    preview.batchId !== request.batchId ||
    preview.requestHash !== request.requestHash ||
    typeof preview.base64 !== 'string'
  )
    throw new PipelineFailure(
      'flow_result_invalid',
      'Flow returned an invalid image receipt',
    )
  const bytes = Buffer.from(preview.base64, 'base64')
  const image = validateImageBytes(bytes)
  if (
    !image ||
    bytes.length > 25 * 1024 * 1024 ||
    image.mime !== preview.mimeType ||
    flowHash(bytes) !== preview.sha256
  )
    throw new PipelineFailure(
      'flow_result_invalid',
      'Flow image verification failed',
    )
  return bytes
}

async function cancelBatch(
  context: PipelineContext,
  batch: FlowBatch,
): Promise<void> {
  const signal = AbortSignal.timeout(4000)
  // Cancelar la reserva no cancela los jobs admitidos: ambas operaciones.
  await Promise.allSettled([
    flowCommand(
      context,
      { type: 'batch.cancel', batchId: batch.batchId },
      signal,
    ),
    ...batch.requests
      .filter((request) => !request.imported)
      .map((request) =>
        flowCommand(
          context,
          { type: 'cancel', imageJobId: request.imageJobId },
          signal,
        ),
      ),
  ])
}

function restartRequestId(context: PipelineContext): string | undefined {
  const payload = context.job.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return undefined
  if (
    payload.flowRestartRequestId === undefined &&
    payload.flowAcknowledgeDuplicateRisk === undefined
  )
    return undefined
  if (
    typeof payload.flowRestartRequestId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      payload.flowRestartRequestId,
    ) ||
    payload.flowAcknowledgeDuplicateRisk !== true
  )
    throw new PipelineFailure(
      'invalid_payload',
      'Flow restart needs a UUID and explicit acknowledgement',
    )
  return payload.flowRestartRequestId
}

function safeTerminal(job: FlowJobStatus): boolean {
  if (flowAutoRecoveryPending(job)) return false
  if (job.state === 'ready') return true
  if (!['canceled', 'failed'].includes(job.state)) return false
  if (
    job.error?.submission === 'unknown' ||
    job.error?.submission === 'accepted' ||
    job.error?.operationSubmission === 'unknown' ||
    job.error?.operationSubmission === 'accepted'
  )
    return false
  if (
    job.error?.submission === 'not-sent' ||
    job.error?.submission === 'rejected'
  )
    return true
  return job.state === 'canceled' && !job.attemptId
}

export function canRestartFlowBatch(
  batch: FlowBatch,
  snapshot: FlowStatus,
): boolean {
  const remote = new Map(snapshot.jobs.map((job) => [job.imageJobId, job]))
  return batch.requests.every((request) => {
    const job = remote.get(request.imageJobId)
    if (job) {
      assertReceipt(request, job)
      return safeTerminal(job)
    }
    if (snapshot.deletedImageIds?.includes(request.imageJobId))
      return request.imported === true || request.safeTerminal === true
    // La instantánea durable y completa no conoce este ID: nunca fue admitido.
    return true
  })
}

async function prepareRestart(
  context: PipelineContext,
  directory: string,
  existing: FlowBatch,
  options: FlowBatchOptions,
): Promise<FlowBatchOptions> {
  const snapshot = await flowCommand<FlowStatus>(context, { type: 'status' })
  if (
    snapshot.type !== 'bridge.status' ||
    !Array.isArray(snapshot.jobs) ||
    !canRestartFlowBatch(existing, snapshot)
  )
    throw new PipelineFailure(
      'flow_review_required',
      'Active or uncertain Flow attempts cannot be replaced; review the original attempt',
    )
  const remote = new Map(snapshot.jobs.map((job) => [job.imageJobId, job]))
  if (existing.revision === options.revision) {
    for (const request of existing.requests) {
      const job = remote.get(request.imageJobId)
      if (job?.state === 'ready') {
        assertReceipt(request, job)
        if (!(request.imported && (await options.restoreImported?.(request)))) {
          const importedHash = await options.onReady(
            request,
            await readReadyBytes(context, request),
          )
          if (typeof importedHash === 'string')
            request.importedHash = importedHash
        }
        request.imported = true
      }
    }
    await persistBatch(directory, existing)
  }
  const readyKeys = new Set(
    existing.revision === options.revision
      ? existing.requests
          .filter((request) => request.imported)
          .map((request) => request.key)
      : [],
  )
  // La cancelación explícita anterior no pudo liberar una reserva que aún no
  // existía. Cancelar el saldo viejo es seguro y no borra sus recibos.
  if (!snapshot.deletedBatchIds?.includes(existing.batchId))
    await flowCommand(context, {
      type: 'batch.cancel',
      batchId: existing.batchId,
    })
  return {
    ...options,
    requests: options.requests.filter((request) => !readyKeys.has(request.key)),
  }
}

function hasPendingReadyImport(
  batch: FlowBatch,
  snapshot: FlowStatus,
): boolean {
  return batch.requests.some(
    (request) =>
      !request.imported &&
      snapshot.jobs.some(
        (job) => job.imageJobId === request.imageJobId && job.state === 'ready',
      ),
  )
}

async function rememberRegenerationRequest(
  directory: string,
  batch: FlowBatch,
  requestId: string,
): Promise<void> {
  const aliases = batch.regenerationRequestIds ?? []
  if (aliases.includes(requestId)) return
  if (aliases.length >= 1000)
    throw new PipelineFailure(
      'flow_review_required',
      'The saved Flow attempt has too many recovery requests',
    )
  batch.regenerationRequestIds = [...aliases, requestId]
  await persistBatch(directory, batch)
}

// La recuperación se decide antes de borrar/redactar prompts. Una escena nueva
// o editada no puede cambiar la fuente de un intento remoto que sigue pendiente.
export async function recoverPendingFlowRegeneration(
  context: PipelineContext,
  scope: string,
  requestId: string,
  isCurrent: (batch: FlowBatch) => Promise<boolean>,
): Promise<boolean> {
  const directory = flowIntentDirectory(context, scope)
  return withFlowLock(join(directory, 'operation.lock'), async () => {
    const existing = await readFlowBatch(context, scope)
    if (!existing) return false
    if (existing.regenerationRequestIds?.includes(requestId)) {
      if (!(await isCurrent(existing)))
        throw new PipelineFailure(
          'flow_intent_conflict',
          'The regeneration request belongs to another scene revision',
        )
      return true
    }
    await assertFreshFlowRegenerationRequest(context, scope, requestId)
    if (existing.completed) return false
    const snapshot = await flowCommand<FlowStatus>(context, { type: 'status' })
    if (
      snapshot.type !== 'bridge.status' ||
      !Array.isArray(snapshot.jobs) ||
      !Array.isArray(snapshot.batches)
    )
      throw new PipelineFailure(
        'flow_result_invalid',
        'Invalid Flow status response',
      )
    if (
      canRestartFlowBatch(existing, snapshot) &&
      !hasPendingReadyImport(existing, snapshot)
    )
      return false
    if (!(await isCurrent(existing)))
      throw new PipelineFailure(
        'flow_review_required',
        'The selected scene cannot replace a pending Flow attempt',
      )
    await rememberRegenerationRequest(directory, existing, requestId)
    return true
  })
}

// El botón Regenerar ya es una autorización explícita. Un UUID nuevo nunca
// convierte un intento activo o incierto en otro POST: con la misma revisión
// pasa a ser un alias durable para recuperar el intento existente.
async function resolveExplicitRegeneration(
  context: PipelineContext,
  directory: string,
  existing: FlowBatch | null,
  options: FlowBatchOptions,
  requestId: string,
): Promise<FlowBatch> {
  if (existing?.regenerationRequestIds?.includes(requestId)) {
    if (
      existing.revision !== options.revision ||
      !flowExecutionPlansEqual(existing.executionPlan, options.executionPlan)
    )
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The regeneration request belongs to another revision',
      )
    return existing
  }
  await assertFreshFlowRegenerationRequest(context, options.scope, requestId)
  if (!existing) return createBatch(directory, options)

  const snapshot = await flowCommand<FlowStatus>(context, { type: 'status' })
  if (
    snapshot.type !== 'bridge.status' ||
    !Array.isArray(snapshot.jobs) ||
    !Array.isArray(snapshot.batches)
  )
    throw new PipelineFailure(
      'flow_result_invalid',
      'Invalid Flow status response',
    )
  const terminal = canRestartFlowBatch(existing, snapshot)
  const pendingImport = hasPendingReadyImport(existing, snapshot)
  if (
    !terminal ||
    (!existing.completed &&
      existing.revision === options.revision &&
      pendingImport)
  ) {
    // Un reintento terminal no debe registrar un alias si el estado cambió
    // a incierto después del preflight; ese alias impediría reintentar luego.
    if (options.terminalRetry)
      throw new PipelineFailure(
        'flow_review_required',
        'The confirmed retry is no longer terminal; the original receipt was preserved',
      )
    if (
      existing.completed ||
      existing.revision !== options.revision ||
      !flowExecutionPlansEqual(existing.executionPlan, options.executionPlan)
    )
      throw new PipelineFailure(
        'flow_review_required',
        'Active or uncertain Flow attempts cannot be replaced',
      )
    await rememberRegenerationRequest(directory, existing, requestId)
    return existing
  }
  // Una intención terminal no convierte el clic nuevo en recuperación: el
  // usuario está pidiendo otro resultado, incluso para la misma escena.
  if (snapshot.batches.some((batch) => batch.batchId === existing.batchId))
    await flowCommand(context, {
      type: 'batch.cancel',
      batchId: existing.batchId,
    })
  return createBatch(directory, options)
}

export async function generateFlowBatch(
  context: PipelineContext,
  options: FlowBatchOptions,
): Promise<void> {
  const executionPlan = normalizeFlowExecutionPlan(options.executionPlan)
  const directory = flowIntentDirectory(context, options.scope)
  await withFlowLock(join(directory, 'operation.lock'), async () => {
    const existing = await readFlowBatch(context, options.scope)
    const restart = restartRequestId(context)
    const regeneration = options.explicitRegenerationRequestId
    if (
      existing &&
      !regeneration &&
      (!existing.completed ||
        (restart === existing.restartRequestId && restart !== undefined)) &&
      !flowExecutionPlansEqual(existing.executionPlan, executionPlan)
    )
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The saved Flow intent uses another execution plan; it was not replaced',
      )
    if (
      regeneration !== undefined &&
      (typeof regeneration !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          regeneration,
        ) ||
        restart !== undefined)
    )
      throw new PipelineFailure(
        'invalid_payload',
        'Flow regeneration needs one valid request UUID',
      )
    let batch: FlowBatch
    if (regeneration) {
      batch = await resolveExplicitRegeneration(
        context,
        directory,
        existing,
        options,
        regeneration,
      )
    } else if (restart && existing?.restartRequestId === restart) {
      if (existing.revision !== options.revision)
        throw new PipelineFailure(
          'flow_intent_conflict',
          'The restart confirmation belongs to another revision',
        )
      batch = existing
    } else if (existing && !existing.completed) {
      if (restart)
        batch = await createBatch(
          directory,
          await prepareRestart(context, directory, existing, options),
          restart,
        )
      else {
        if (existing.revision !== options.revision) {
          const snapshot = await flowCommand<FlowStatus>(context, {
            type: 'status',
          })
          if (
            snapshot.type !== 'bridge.status' ||
            !Array.isArray(snapshot.jobs)
          )
            throw new PipelineFailure(
              'flow_result_invalid',
              'Invalid Flow status response',
            )
          throw new PipelineFailure(
            canRestartFlowBatch(existing, snapshot)
              ? 'flow_restart_required'
              : 'flow_review_required',
            'The unfinished Flow intent belongs to another selection or revision; it was not replaced',
          )
        }
        batch = existing
      }
    } else {
      if (restart && !existing)
        throw new PipelineFailure(
          'flow_intent_conflict',
          'There is no previous Flow intent to replace',
        )
      batch = await createBatch(directory, options, restart)
    }
    if (batch.requests.length === 0) {
      batch.completed = true
      await persistBatch(directory, batch)
      return
    }
    const completed = new Set<string>()
    const lastState = new Map<string, string>()
    const downloadRecoveries = new Map<
      string,
      { attempts: number; nextAttemptAt: number }
    >()
    // No repetir una importación inválida en cada sondeo. Recuperar el lote
    // permite volver a leer el mismo resultado sin crear otra generación.
    const resultFailures = new Map<
      string,
      { state: string; error: PipelineFailure }
    >()
    const reportedFailures = new Map<string, string>()
    let prepared = false
    let admissionRecoveries = 0
    try {
      for (;;) {
        context.signal.throwIfAborted()
        const snapshot = await flowCommand<FlowStatus>(context, {
          type: 'status',
        })
        if (snapshot.type !== 'bridge.status' || !Array.isArray(snapshot.jobs))
          throw new PipelineFailure(
            'flow_result_invalid',
            'Invalid Flow status response',
          )
        if (
          snapshot.deletedBatchIds?.includes(batch.batchId) ||
          batch.requests.some((request) =>
            snapshot.deletedImageIds?.includes(request.imageJobId),
          )
        )
          throw new PipelineFailure(
            canRestartFlowBatch(batch, snapshot)
              ? 'flow_restart_required'
              : 'flow_review_required',
            'The saved Flow batch was explicitly deleted',
          )
        const remote = new Map(
          snapshot.jobs.map((job) => [job.imageJobId, job]),
        )
        const failures = new Map<string, PipelineFailure>()
        let recoveringDownload = false
        function recordFailure(
          request: FlowSavedRequest,
          error: PipelineFailure,
        ) {
          failures.set(request.imageJobId, error)
          if (reportedFailures.get(request.imageJobId) === error.code) return
          reportedFailures.set(request.imageJobId, error.code)
          options.onFailed?.(request, error.code)
        }
        async function recoverDownload(
          request: FlowSavedRequest,
          state: string,
        ) {
          const previous = downloadRecoveries.get(request.imageJobId)
          if (previous && Date.now() < previous.nextAttemptAt) {
            recoveringDownload = true
            return
          }
          const attempts = (previous?.attempts ?? 0) + 1
          downloadRecoveries.set(request.imageJobId, {
            attempts,
            nextAttemptAt: Date.now() + POLL_INTERVAL_MS * attempts,
          })
          try {
            await flowCommand(context, {
              type: 'download',
              imageJobId: request.imageJobId,
            })
            resultFailures.delete(request.imageJobId)
            recoveringDownload = true
          } catch (error) {
            context.signal.throwIfAborted()
            if (
              !(error instanceof PipelineFailure) ||
              (!IMAGE_RECOVERY_CODES.has(error.code) &&
                error.code !== 'flow_review_required')
            )
              throw error
            resultFailures.set(request.imageJobId, { state, error })
            // Una descarga transitoria se recupera dentro de este mismo job;
            // los demás resultados siguen importándose durante la espera.
            if (
              error.code === 'flow_download_failed' &&
              attempts < DOWNLOAD_RECOVERY_ATTEMPTS
            ) {
              recoveringDownload = true
              return
            }
            // Este comando sólo corresponde al recibo elegido. Su rechazo
            // no impide importar los resultados de las otras solicitudes.
            recordFailure(request, error)
          }
        }
        for (const request of batch.requests) {
          if (completed.has(request.imageJobId)) continue
          const job = remote.get(request.imageJobId)
          if (job) assertReceipt(request, job)
          if (
            job?.state === 'ready' &&
            request.imported &&
            (await options.restoreImported?.(request))
          ) {
            completed.add(request.imageJobId)
            continue
          }
          const automaticWaiting =
            job &&
            TERMINAL_STATES.has(job.state) &&
            flowAutoRecoveryPending(job)
          const state = automaticWaiting
            ? 'recovering'
            : !job || ['received', 'dispatching'].includes(job.state)
              ? 'queued'
              : job.state
          if (lastState.get(request.imageJobId) !== state) {
            lastState.set(request.imageJobId, state)
            if (!TERMINAL_STATES.has(state) && state !== 'download_failed')
              reportedFailures.delete(request.imageJobId)
            options.onState?.(request, state)
          }
          if (!job) continue
          if (automaticWaiting) {
            // El coordinador recupera el recibo o sustituye en otra cuenta;
            // mantener el observador y no pedir al usuario otro clic.
            resultFailures.delete(request.imageJobId)
            continue
          }
          if (safeTerminal(job) && !request.safeTerminal) {
            request.safeTerminal = true
            await persistBatch(directory, batch)
          }
          const previousFailure = resultFailures.get(request.imageJobId)
          if (previousFailure?.state === job.state) {
            if (
              previousFailure.error.code === 'flow_download_failed' &&
              (downloadRecoveries.get(request.imageJobId)?.attempts ?? 0) <
                DOWNLOAD_RECOVERY_ATTEMPTS
            ) {
              await recoverDownload(request, job.state)
            } else recordFailure(request, previousFailure.error)
            continue
          }
          resultFailures.delete(request.imageJobId)
          if (job.state === 'ready') {
            try {
              const bytes = await readReadyBytes(context, request)
              const importedHash = await options.onReady(request, bytes)
              if (typeof importedHash === 'string')
                request.importedHash = importedHash
              request.imported = true
              await persistBatch(directory, batch)
              completed.add(request.imageJobId)
              reportedFailures.delete(request.imageJobId)
            } catch (error) {
              context.signal.throwIfAborted()
              // Una desconexión o un error local de infraestructura interrumpe
              // el observador; no demuestra un fallo de imagen del proveedor.
              if (
                !(error instanceof PipelineFailure) ||
                !IMAGE_RECOVERY_CODES.has(error.code)
              )
                throw error
              if (
                error.code === 'flow_download_failed' &&
                (downloadRecoveries.get(request.imageJobId)?.attempts ?? 0) <
                  DOWNLOAD_RECOVERY_ATTEMPTS
              ) {
                await recoverDownload(request, job.state)
              } else {
                resultFailures.set(request.imageJobId, {
                  state: job.state,
                  error,
                })
                recordFailure(request, error)
              }
            }
          } else if (
            job.state === 'download_failed' ||
            job.state === 'awaiting_url'
          ) {
            const attempts =
              downloadRecoveries.get(request.imageJobId)?.attempts ?? 0
            if (
              attempts === 0 ||
              (job.state === 'download_failed' &&
                attempts < DOWNLOAD_RECOVERY_ATTEMPTS)
            ) {
              await recoverDownload(request, job.state)
            } else if (job.state === 'download_failed')
              recordFailure(
                request,
                new PipelineFailure(
                  'flow_download_failed',
                  'The saved Flow image needs download recovery',
                ),
              )
          } else if (TERMINAL_STATES.has(job.state)) {
            recordFailure(
              request,
              new PipelineFailure(
                flowJobReviewCode(job) ??
                  (safeTerminal(job)
                    ? 'flow_restart_required'
                    : 'flow_review_required'),
                'A Flow image needs explicit review in Extension; no generation was retried',
              ),
            )
          }
        }
        if (completed.size === batch.requests.length) {
          batch.completed = true
          await persistBatch(directory, batch)
          return
        }
        const pending = batch.requests.filter(
          (request) =>
            !completed.has(request.imageJobId) &&
            !failures.has(request.imageJobId),
        )
        // Drenar e importar los hermanos, incluso las siguientes páginas del
        // mismo intento. Un rechazo no cancela todo el lote ni autoriza otro.
        // Si una pausa global impide avanzar la cola, conservarla para la
        // recuperación; todavía recoger los resultados que estén en vuelo.
        const hasWorkInFlight = pending.some((request) => {
          const job = remote.get(request.imageJobId)
          return (
            job !== undefined && !['queued', 'received'].includes(job.state)
          )
        })
        if (
          failures.size > 0 &&
          (pending.length === 0 ||
            (snapshot.paused && !hasWorkInFlight && !recoveringDownload))
        ) {
          // El resumen no debe ocultar un resultado incierto detrás de un
          // rechazo confirmado anterior. Sólo cambia el diagnóstico mostrado.
          const failure =
            [...failures.values()].find(
              (error) => error.code === 'flow_submission_unknown',
            ) ??
            [...failures.values()].find(
              (error) => error.code !== 'flow_restart_required',
            ) ??
            failures.values().next().value
          if (
            failure?.code === 'flow_restart_required' &&
            !canRestartFlowBatch(batch, snapshot)
          )
            throw new PipelineFailure(
              'flow_review_required',
              'The saved Flow batch still has pending receipts; reconcile before replacing it',
            )
          if (failure) throw failure
        }
        const missing = batch.requests.filter(
          (request) => !remote.has(request.imageJobId),
        )
        if (missing.length > 0) {
          if (
            batch.autoRecoveryVersion === 1 &&
            (snapshot.capabilities?.autoRecovery?.version !== 1 ||
              ![2, 4].includes(
                snapshot.capabilities.autoRecovery.maxReplacements,
              ))
          )
            throw new PipelineFailure(
              'flow_tools_coordinator_upgrade_required',
              'The saved automatic recovery policy requires a compatible coordinator',
            )
          if (!prepared) {
            let reservation: PreparedReply
            try {
              reservation = await flowCommand<PreparedReply>(context, {
                type: 'batch.prepare',
                ...(batch.autoRecoveryVersion
                  ? { autoRecoveryVersion: batch.autoRecoveryVersion }
                  : {}),
                batchId: batch.batchId,
                requestedCount: batch.requests.length,
                ...(batch.executionPlan
                  ? { executionPlan: batch.executionPlan }
                  : {}),
              })
            } catch (error) {
              if (
                batch.autoRecoveryVersion === 1 &&
                error instanceof PipelineFailure &&
                error.code === 'flow_transport_unknown' &&
                admissionRecoveries < TRANSPORT_RECOVERY_ATTEMPTS
              ) {
                // Reconcile first; retry only this idempotent reservation with
                // its durable batch ID. No generation request is recreated.
                admissionRecoveries++
                await delay(POLL_INTERVAL_MS * admissionRecoveries, undefined, {
                  signal: context.signal,
                })
                continue
              }
              throw error
            }
            if (reservation.type !== 'batch.prepared') {
              context.emitter.emit({
                type: 'progress',
                percent: 0,
                detail: {
                  phase: 'images',
                  status: 'capacity_required',
                  requestedCount: batch.requests.length,
                  requiredAdditionalProfiles:
                    reservation.requiredAdditionalProfiles ?? 0,
                  deficit: reservation.deficit ?? 0,
                  readyProfiles: reservation.readyProfiles ?? 0,
                },
              })
              throw new PipelineFailure(
                'flow_capacity_required',
                'Connect enough distinct ready accounts for the complete saved batch',
              )
            }
            if (batch.executionPlan) {
              assertMatchingExecutionPlan(
                reservation.batch?.executionPlan,
                batch.executionPlan,
              )
              if (
                reservation.batch?.batchId !== batch.batchId ||
                reservation.batch?.autoRecoveryVersion !==
                  batch.autoRecoveryVersion
              )
                throw new PipelineFailure(
                  'flow_intent_conflict',
                  'The reservation does not match the saved Flow execution plan',
                )
            }
            prepared = true
          }
          const available = Math.max(
            0,
            500 - snapshot.jobs.filter((job) => job.state === 'queued').length,
          )
          const page: object[] = []
          for (const request of missing.slice(0, Math.min(50, available))) {
            const candidate = await wireRequest(directory, request)
            if (
              Buffer.byteLength(
                JSON.stringify({
                  type: 'submit',
                  ...(batch.autoRecoveryVersion
                    ? { autoRecoveryVersion: batch.autoRecoveryVersion }
                    : {}),
                  jobs: [...page, candidate],
                }),
              ) > MAX_COMMAND_BYTES
            ) {
              if (page.length === 0)
                throw new PipelineFailure(
                  'invalid_payload',
                  'Flow references exceed the command size limit',
                )
              break
            }
            page.push(candidate)
          }
          if (page.length > 0) {
            try {
              const accepted = await flowCommand<AcceptedReply>(context, {
                type: 'submit',
                ...(batch.autoRecoveryVersion
                  ? { autoRecoveryVersion: batch.autoRecoveryVersion }
                  : {}),
                jobs: page,
              })
              if (
                accepted.type !== 'jobs.accepted' ||
                !Array.isArray(accepted.jobs) ||
                accepted.jobs.length !== page.length ||
                new Set(accepted.jobs.map((job) => job.imageJobId)).size !==
                  page.length
              )
                throw new PipelineFailure(
                  'flow_result_invalid',
                  'Flow did not return jobs.accepted.jobs',
                )
              for (const job of accepted.jobs) {
                const request = batch.requests.find(
                  (item) => item.imageJobId === job.imageJobId,
                )
                if (!request)
                  throw new PipelineFailure(
                    'flow_result_invalid',
                    'Flow admitted an unexpected image',
                  )
                assertReceipt(request, job)
              }
            } catch (error) {
              if (
                error instanceof PipelineFailure &&
                error.code === 'flow_transport_unknown' &&
                admissionRecoveries < TRANSPORT_RECOVERY_ATTEMPTS
              ) {
                // Un ACK perdido no prueba que falló el envío. El próximo
                // status decide qué IDs faltan; nunca repetir la página a ciegas.
                admissionRecoveries++
              } else if (
                !(error instanceof PipelineFailure) ||
                error.code !== 'flow_queue_full'
              )
                throw error
            }
          }
        }
        await delay(POLL_INTERVAL_MS, undefined, { signal: context.signal })
      }
    } catch (error) {
      if (context.signal.aborted) await cancelBatch(context, batch)
      throw error
    }
  })
}

// Recuperación de previews: conserva prompts redactados e IDs, incluso cuando
// el nuevo proceso usa otro jobId. Nunca vuelve al LLM por una descarga fallida.
export async function savedFlowRequests(
  context: PipelineContext,
  batch: FlowBatch,
): Promise<FlowImageRequest[]> {
  const directory = flowIntentDirectory(context, batch.scope)
  return Promise.all(
    batch.requests.map(async (request) => {
      // Reusar el verificador del envío: las muestras con foto necesitan los
      // mismos bytes también si el usuario autoriza un nuevo lote terminal.
      const { references } = await wireRequest(directory, request)
      return {
        key: request.key,
        prompt: request.prompt,
        aspectRatio: request.aspectRatio,
        references,
        destination: request.destination,
        revision: request.revision,
        previousHash: request.previousHash,
        ...(request.executionPlan
          ? { executionPlan: request.executionPlan }
          : {}),
      }
    }),
  )
}
