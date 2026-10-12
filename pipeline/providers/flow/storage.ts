import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { FlowBatch } from './types.ts'
import type { FlowToolsExecutionPlan } from '../../types/flow-execution-plan.ts'
import {
  flowExecutionHashInput,
  flowExecutionPlansEqual,
  normalizeFlowExecutionPlan,
} from './execution-plan.ts'

export function flowHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

export function flowIntentDirectory(
  context: PipelineContext,
  scope: string,
): string {
  const runtime = context.job.flowRuntime
  if (!runtime)
    throw new PipelineFailure(
      'flow_not_connected',
      'Flow runtime is unavailable',
    )
  return join(runtime.dataDir, 'vimo-intents', flowHash(scope))
}

// A diferencia del helper histórico, jamás degrada a copyFile sobre el destino:
// agotado un lock conserva el archivo anterior y deja el recibo retomable.
export async function writeFlowFile(
  path: string,
  data: string | Buffer,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(data)
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path)
        if (process.platform !== 'win32') {
          const directory = await open(dirname(path), 'r')
          try {
            await directory.sync()
          } finally {
            await directory.close()
          }
        }
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (
          !['EPERM', 'EBUSY', 'EACCES', 'EEXIST'].includes(code ?? '') ||
          attempt >= 7
        )
          throw error
        await delay(40 * (attempt + 1))
      }
    }
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

async function createLock(path: string): Promise<void> {
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(String(process.pid))
    await file.sync()
  } finally {
    await file.close()
  }
}

async function acquireLock(path: string): Promise<void> {
  try {
    await createLock(path)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  // El mutex de recuperación serializa la observación y retirada del dueño
  // muerto. Sin él, dos recuperadores podrían borrar el lock del nuevo dueño.
  const recovery = `${path}.recovery`
  try {
    await createLock(recovery)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    throw new PipelineFailure(
      'flow_intent_conflict',
      'Flow lock recovery is already owned; no request was sent',
    )
  }
  try {
    let owner: number
    try {
      owner = Number(await readFile(path, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await createLock(path)
      return
    }
    if (!Number.isSafeInteger(owner) || owner <= 0)
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The Flow operation lock is invalid',
      )
    try {
      process.kill(owner, 0)
      throw new PipelineFailure(
        'flow_intent_conflict',
        'This Flow operation is already running',
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
    await unlink(path)
    // Otro proceso puede haber ganado el wx tras retirar el muerto: fallar,
    // nunca volver a borrar un lock que ahora tiene dueño vivo.
    try {
      await createLock(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      throw new PipelineFailure(
        'flow_intent_conflict',
        'Another Flow operation acquired this intent',
      )
    }
  } finally {
    await unlink(recovery)
  }
}

export async function withFlowLock<T>(
  path: string,
  task: () => Promise<T>,
  createParent = true,
): Promise<T> {
  if (createParent) await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await acquireLock(path)
  try {
    return await task()
  } finally {
    await unlink(path)
  }
}

function validBatch(batch: FlowBatch, scope: string): boolean {
  const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
  const hash = /^[a-f0-9]{64}$/
  if (
    !batch ||
    batch.version !== 1 ||
    (batch.autoRecoveryVersion !== undefined &&
      batch.autoRecoveryVersion !== 1) ||
    batch.scope !== scope ||
    typeof batch.revision !== 'string' ||
    typeof batch.batchId !== 'string' ||
    !identifier.test(batch.batchId) ||
    (batch.completed !== undefined && typeof batch.completed !== 'boolean') ||
    (batch.restartRequestId !== undefined &&
      (typeof batch.restartRequestId !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(batch.restartRequestId))) ||
    (batch.regenerationRequestIds !== undefined &&
      (!Array.isArray(batch.regenerationRequestIds) ||
        batch.regenerationRequestIds.length === 0 ||
        batch.regenerationRequestIds.length > 1000 ||
        new Set(batch.regenerationRequestIds).size !==
          batch.regenerationRequestIds.length ||
        batch.regenerationRequestIds.some(
          (id) =>
            typeof id !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              id,
            ),
        ))) ||
    !Array.isArray(batch.requests) ||
    batch.requests.length > 10_000
  )
    return false
  let executionPlan: FlowToolsExecutionPlan | undefined
  try {
    executionPlan = normalizeFlowExecutionPlan(batch.executionPlan)
  } catch {
    return false
  }
  const keys = new Set<string>()
  const imageIds = new Set<string>()
  return batch.requests.every((request, index) => {
    if (
      !request ||
      typeof request.key !== 'string' ||
      keys.has(request.key) ||
      typeof request.imageJobId !== 'string' ||
      !identifier.test(request.imageJobId) ||
      imageIds.has(request.imageJobId) ||
      request.batchId !== batch.batchId ||
      request.autoRecoveryVersion !== batch.autoRecoveryVersion ||
      request.promptIndex !== index + 1 ||
      request.model !== 'HARBOR_SEAL' ||
      !['16:9', '9:16'].includes(request.aspectRatio) ||
      typeof request.prompt !== 'string' ||
      !request.prompt.trim() ||
      request.prompt !== request.prompt.trim() ||
      (executionPlan
        ? request.seed !== null
        : typeof request.seed !== 'number' ||
          !Number.isSafeInteger(request.seed) ||
          request.seed < 0 ||
          request.seed > 2147483647) ||
      !Array.isArray(request.references) ||
      request.references.length > 10 ||
      (request.previousHash != null && !hash.test(request.previousHash)) ||
      (request.imported !== undefined &&
        typeof request.imported !== 'boolean') ||
      (request.safeTerminal !== undefined &&
        typeof request.safeTerminal !== 'boolean') ||
      (batch.completed === true && request.imported !== true)
    )
      return false
    try {
      if (!flowExecutionPlansEqual(request.executionPlan, executionPlan))
        return false
    } catch {
      return false
    }
    keys.add(request.key)
    imageIds.add(request.imageJobId)
    const references = new Set<string>()
    if (
      !request.references.every((reference) => {
        if (
          !reference ||
          typeof reference.id !== 'string' ||
          !identifier.test(reference.id) ||
          references.has(reference.id) ||
          typeof reference.name !== 'string' ||
          reference.name.length > 160 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(
            reference.mimeType,
          ) ||
          !hash.test(reference.sha256)
        )
          return false
        references.add(reference.id)
        return true
      })
    )
      return false
    return (
      request.requestHash ===
      flowHash(JSON.stringify(flowExecutionHashInput(request)))
    )
  })
}

export async function readFlowBatch(
  context: PipelineContext,
  scope: string,
): Promise<FlowBatch | null> {
  const directory = flowIntentDirectory(context, scope)
  try {
    const batch = JSON.parse(
      await readFile(join(directory, 'current.json'), 'utf8'),
    ) as FlowBatch
    if (!validBatch(batch, scope))
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The saved Flow intent is invalid',
      )
    // El archivo histórico se publica primero. Un cierre entre ambos renames
    // no puede borrar un alias que ya quedó durable: unir siempre su evidencia.
    let archived: FlowBatch
    try {
      archived = JSON.parse(
        await readFile(join(directory, `${batch.batchId}.json`), 'utf8'),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return batch
      throw error
    }
    if (
      !validBatch(archived, scope) ||
      archived.batchId !== batch.batchId ||
      archived.revision !== batch.revision ||
      archived.autoRecoveryVersion !== batch.autoRecoveryVersion ||
      !flowExecutionPlansEqual(archived.executionPlan, batch.executionPlan) ||
      archived.requests.length !== batch.requests.length ||
      archived.requests.some(
        (request, index) =>
          request.imageJobId !== batch.requests[index].imageJobId ||
          request.requestHash !== batch.requests[index].requestHash ||
          request.key !== batch.requests[index].key,
      )
    )
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The current Flow intent conflicts with its durable receipt',
      )
    if (archived.regenerationRequestIds) {
      batch.regenerationRequestIds = [
        ...new Set([
          ...(batch.regenerationRequestIds ?? []),
          ...archived.regenerationRequestIds,
        ]),
      ]
      if (!validBatch(batch, scope))
        throw new PipelineFailure(
          'flow_intent_conflict',
          'The saved Flow recovery identifiers are invalid',
        )
    }
    return batch
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Si ya existe un recibo admitido, perder el puntero no autoriza crear
      // otra imagen. Falla cerrado y conserva la evidencia para recuperar.
      const files = await readdir(directory).catch(
        (readError: NodeJS.ErrnoException) => {
          if (readError.code === 'ENOENT') return []
          throw readError
        },
      )
      if (files.some((file) => file.endsWith('.json')))
        throw new PipelineFailure(
          'flow_intent_conflict',
          'The current Flow intent is missing but durable receipts remain',
        )
      return null
    }
    if (error instanceof SyntaxError)
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The saved Flow intent is not readable JSON',
      )
    throw error
  }
}

export async function readPendingFlowBatch(
  context: PipelineContext,
  scope: string,
  revision: string,
  executionPlan?: FlowToolsExecutionPlan,
): Promise<FlowBatch | null> {
  const plan = normalizeFlowExecutionPlan(executionPlan)
  const batch = await readFlowBatch(context, scope)
  const payload = context.job.payload
  const replay =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof payload.flowRestartRequestId === 'string' &&
    payload.flowRestartRequestId === batch?.restartRequestId
  if (
    batch &&
    (!batch.completed || replay) &&
    !flowExecutionPlansEqual(batch.executionPlan, plan)
  )
    throw new PipelineFailure(
      'flow_intent_conflict',
      'The pending Flow intent uses another execution plan; it was not replaced',
    )
  return batch && (!batch.completed || replay) && batch.revision === revision
    ? batch
    : null
}

// Un clic antiguo no se convierte en una nueva generación después de que otro
// lote avance el puntero actual. Los recibos previos siguen siendo evidencia.
export async function assertFreshFlowRegenerationRequest(
  context: PipelineContext,
  scope: string,
  requestId: string,
): Promise<void> {
  const directory = flowIntentDirectory(context, scope)
  const files = await readdir(directory)
  for (const name of files) {
    if (name === 'current.json' || !name.endsWith('.json')) continue
    let batch: FlowBatch
    try {
      batch = JSON.parse(await readFile(join(directory, name), 'utf8'))
    } catch {
      throw new PipelineFailure(
        'flow_intent_conflict',
        'A previous Flow receipt cannot be verified',
      )
    }
    if (!validBatch(batch, scope))
      throw new PipelineFailure(
        'flow_intent_conflict',
        'A previous Flow receipt is invalid',
      )
    if (batch.regenerationRequestIds?.includes(requestId))
      throw new PipelineFailure(
        'flow_intent_conflict',
        'This regeneration request belongs to an earlier saved batch',
      )
  }
}
