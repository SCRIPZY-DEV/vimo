import { randomUUID } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { DEFAULT_PIPELINE_CONFIG } from '../../config/pipeline-config.ts'
import { loadPipelineCharacters } from '../../project/characters.ts'
import { readProjectMetadata } from '../../project/metadata.ts'
import { markFlowVideoOutdated } from '../../project/flow-video-outdated.ts'
import {
  isProjectDirectoryName,
  resolveProjectPaths,
  sceneImageFile,
  type ProjectPaths,
} from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { flowSceneRequestRevision } from '../../stages/images/flow-lane.ts'
import { validateImageBytes } from '../image/download.ts'
import {
  flowExecutionPlansEqual,
  normalizeFlowExecutionPlan,
} from './execution-plan.ts'
import { imageFileHash, importFlowImage } from './import-image.ts'
import {
  flowHash,
  readFlowBatch,
  withFlowLock,
  writeFlowFile,
} from './storage.ts'
import type { FlowBatch, FlowSavedRequest } from './types.ts'

const HASH = /^[a-f0-9]{64}$/
const MAX_RECEIPT_BYTES = 64 * 1024 * 1024
const MAX_RESULT_BYTES = 25 * 1024 * 1024
const IMPORT_INTERVAL_MS = 3000

export interface FlowRecoveryImportOptions {
  dataDir: string
  projectsRoot: string
  ffmpegPath: string
  // These callbacks are internal capabilities, not arbitrary bridge commands.
  status(): Promise<unknown>
  readResult(request: FlowSavedRequest): Promise<unknown>
}

export interface FlowRecoveryImportStatus {
  instanceId: string
  running: boolean
  pending: number
  imported: number
  failed: number
  lastErrorCode: string | null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(code: string): never {
  throw new PipelineFailure(code, 'Automatic Flow import needs verification')
}

function safeCode(error: unknown): string {
  const code = error instanceof PipelineFailure ? error.code : null
  return code &&
    [
      'flow_result_obsolete',
      'flow_result_invalid',
      'flow_intent_conflict',
      'project_not_found',
      'project_metadata_corrupt',
      'ffmpeg_missing',
      'cancelled',
    ].includes(code)
    ? code
    : 'flow_import_recovery_failed'
}

async function plainDirectory(path: string): Promise<boolean> {
  const info = await lstat(path)
  return info.isDirectory() && !info.isSymbolicLink()
}

async function plainFile(
  path: string,
  maximum = MAX_RECEIPT_BYTES,
): Promise<boolean> {
  const info = await lstat(path)
  return (
    info.isFile() &&
    !info.isSymbolicLink() &&
    info.size > 0 &&
    info.size <= maximum
  )
}

async function safeProject(
  options: FlowRecoveryImportOptions,
  scope: unknown,
): Promise<ProjectPaths | null> {
  if (typeof scope !== 'string' || !scope.startsWith('scenes:')) return null
  const project = scope.slice('scenes:'.length)
  const root = resolve(options.projectsRoot)
  const id = basename(project)
  if (
    !isAbsolute(project) ||
    project !== resolve(project) ||
    dirname(project) !== root ||
    !isProjectDirectoryName(id)
  )
    return null
  if (!(await plainDirectory(project))) return null
  const realRoot = await realpath(root)
  if ((await realpath(project)) !== join(realRoot, id)) return null
  const paths = resolveProjectPaths(project, id)
  if (
    !(await plainDirectory(paths.scenesDirectory)) ||
    !(await plainFile(paths.metadataFile)) ||
    !(await plainFile(paths.scenesFile))
  )
    return null
  return paths
}

async function currentRequest(
  options: FlowRecoveryImportOptions,
  paths: ProjectPaths,
  request: FlowSavedRequest,
): Promise<boolean> {
  if (!(await safeProject(options, `scenes:${paths.root}`))) return false
  const target = Number(request.key)
  if (
    !Number.isSafeInteger(target) ||
    target < 1 ||
    String(target) !== request.key ||
    request.destination !== sceneImageFile(paths, target) ||
    typeof request.revision !== 'string' ||
    !HASH.test(request.revision)
  )
    return false
  try {
    const info = await lstat(request.destination)
    if (!info.isFile() || info.isSymbolicLink()) return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const metadata = await readProjectMetadata(paths)
  if (metadata.id !== basename(paths.root)) return false
  const scene = (await readScenes(paths))?.find(
    (candidate) => candidate.id === target,
  )
  if (!scene) return false
  for (const character of metadata.options.characters ?? []) {
    if (character.mode !== 'photo' || !character.referenceImageFile) continue
    if (
      basename(character.referenceImageFile) !== character.referenceImageFile ||
      !(await plainDirectory(paths.charactersDirectory)) ||
      !(await plainFile(
        join(paths.charactersDirectory, character.referenceImageFile),
        10 * 1024 * 1024,
      ))
    )
      return false
  }
  const characters = await loadPipelineCharacters(
    paths,
    metadata.options.characters,
  )
  return (
    flowSceneRequestRevision(
      scene,
      { ...metadata.options, executionPlan: request.executionPlan },
      characters,
    ) === request.revision
  )
}

function matchingJob(request: FlowSavedRequest, job: unknown): boolean {
  if (!record(job)) return false
  return (
    job.imageJobId === request.imageJobId &&
    job.batchId === request.batchId &&
    job.requestHash === request.requestHash &&
    job.promptIndex === request.promptIndex &&
    job.autoRecoveryVersion === 1 &&
    flowExecutionPlansEqual(job.executionPlan, request.executionPlan)
  )
}

function resultBytes(request: FlowSavedRequest, value: unknown): Buffer {
  if (
    !record(value) ||
    value.type !== 'job.resultFile' ||
    value.imageJobId !== request.imageJobId ||
    value.batchId !== request.batchId ||
    value.requestHash !== request.requestHash ||
    !flowExecutionPlansEqual(value.executionPlan, request.executionPlan) ||
    typeof value.base64 !== 'string' ||
    value.base64.length > Math.ceil(MAX_RESULT_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64)
  )
    fail('flow_result_invalid')
  const bytes = Buffer.from(value.base64, 'base64')
  const image = validateImageBytes(bytes)
  if (
    !image ||
    bytes.length > MAX_RESULT_BYTES ||
    bytes.toString('base64') !== value.base64 ||
    image.mime !== value.mimeType ||
    flowHash(bytes) !== value.sha256
  )
    fail('flow_result_invalid')
  return bytes
}

async function persistBatch(directory: string, batch: FlowBatch) {
  // Same archive-first order as the normal observer: a crash cannot lose a receipt.
  await writeFlowFile(
    join(directory, `${batch.batchId}.json`),
    JSON.stringify(batch),
  )
  await writeFlowFile(join(directory, 'current.json'), JSON.stringify(batch))
}

// One finite sweep. Normal generation owns this same operation.lock for its
// entire observer lifetime; a live lock is skipped, never stolen or retried here.
export async function recoverFlowImports(
  options: FlowRecoveryImportOptions,
  signal: AbortSignal,
): Promise<Omit<FlowRecoveryImportStatus, 'running' | 'instanceId'>> {
  const summary = {
    pending: 0,
    imported: 0,
    failed: 0,
    lastErrorCode: null as string | null,
  }
  if (
    !isAbsolute(options.dataDir) ||
    !isAbsolute(options.projectsRoot) ||
    !isAbsolute(options.ffmpegPath)
  )
    return summary
  const directory = join(options.dataDir, 'vimo-intents')
  let entries
  try {
    if (!(await plainDirectory(directory))) return summary
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return summary
    throw error
  }
  // No keys/token are available: even accidental use of flowCommand would fail closed.
  const context: PipelineContext = {
    job: {
      jobId: 'flow-import-recovery',
      projectsRoot: options.projectsRoot,
      apiKeys: {},
      binaryPaths: { ffmpeg: options.ffmpegPath },
      flowRuntime: { dataDir: options.dataDir, port: 0, token: '' },
    },
    config: DEFAULT_PIPELINE_CONFIG,
    emitter: { emit() {} },
    signal,
  }
  for (const entry of entries) {
    signal.throwIfAborted()
    if (!entry.isDirectory() || !HASH.test(entry.name)) continue
    const intent = join(directory, entry.name)
    let ownsLock = false
    try {
      if (
        !(await plainDirectory(intent)) ||
        !(await plainFile(join(intent, 'current.json')))
      )
        continue
      const hint: unknown = JSON.parse(
        await readFile(join(intent, 'current.json'), 'utf8'),
      )
      // Historical intents are never touched or upgraded by this importer.
      if (
        !record(hint) ||
        hint.autoRecoveryVersion !== 1 ||
        hint.completed === true ||
        typeof hint.scope !== 'string' ||
        flowHash(hint.scope) !== entry.name
      )
        continue
      const paths = await safeProject(options, hint.scope)
      if (!paths) continue
      const scope = hint.scope
      await withFlowLock(
        join(intent, 'operation.lock'),
        async () => {
          ownsLock = true
          signal.throwIfAborted()
          // A canonical archive can be absent after an initial interrupted write;
          // when present it must be a plain file, never a followed symlink.
          if (
            typeof hint.batchId !== 'string' ||
            !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(hint.batchId)
          )
            fail('flow_intent_conflict')
          try {
            if (!(await plainFile(join(intent, `${hint.batchId}.json`))))
              fail('flow_intent_conflict')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
          const batch = await readFlowBatch(context, scope)
          if (
            !batch ||
            batch.autoRecoveryVersion !== 1 ||
            batch.completed ||
            batch.batchId !== hint.batchId ||
            !normalizeFlowExecutionPlan(batch.executionPlan)
          )
            return
          const metadata = await readProjectMetadata(paths)
          if (metadata.flowPaidCompletion?.batchId === batch.batchId) return
          const confirmed = new Set<string>()
          const snapshot = await options.status()
          if (
            !record(snapshot) ||
            snapshot.type !== 'bridge.status' ||
            !Array.isArray(snapshot.jobs)
          )
            fail('flow_result_invalid')
          for (const request of batch.requests) {
            signal.throwIfAborted()
            const matches = snapshot.jobs.filter(
              (job) => record(job) && job.imageJobId === request.imageJobId,
            )
            if (matches.length > 1) fail('flow_result_invalid')
            const job = matches[0]
            if (!job) {
              summary.pending++
              continue
            }
            if (!matchingJob(request, job)) fail('flow_result_invalid')
            if (!record(job) || job.state !== 'ready') {
              summary.pending++
              continue
            }
            try {
              if (!(await currentRequest(options, paths, request)))
                fail('flow_result_obsolete')
              if (
                request.imported === true &&
                typeof request.importedHash === 'string' &&
                HASH.test(request.importedHash) &&
                (await imageFileHash(request.destination!)) ===
                  request.importedHash
              ) {
                confirmed.add(request.imageJobId)
                continue
              }
              const bytes = resultBytes(
                request,
                await options.readResult(request),
              )
              signal.throwIfAborted()
              const importedHash = await importFlowImage(context, {
                destination: request.destination!,
                bytes,
                previousHash: request.previousHash ?? null,
                isCurrent: () => currentRequest(options, paths, request),
              })
              signal.throwIfAborted()
              if (!(await currentRequest(options, paths, request)))
                fail('flow_result_obsolete')
              await markFlowVideoOutdated(paths)
              request.imported = true
              request.importedHash = importedHash
              await persistBatch(intent, batch)
              confirmed.add(request.imageJobId)
              summary.imported++
            } catch (error) {
              signal.throwIfAborted()
              summary.failed++
              summary.lastErrorCode = safeCode(error)
            }
          }
          if (confirmed.size === batch.requests.length) {
            batch.completed = true
            await persistBatch(intent, batch)
          }
        },
        false,
      )
    } catch (error) {
      signal.throwIfAborted()
      // A live normal observer is expected, not an import failure. A malformed
      // receipt/error after acquiring ownership remains visible in the summary.
      if (
        !ownsLock &&
        error instanceof PipelineFailure &&
        error.code === 'flow_intent_conflict'
      )
        continue
      summary.failed++
      summary.lastErrorCode = safeCode(error)
    }
  }
  return summary
}

export function startFlowRecoveryImporter(options: FlowRecoveryImportOptions) {
  const abort = new AbortController()
  let pending: Promise<void> | undefined
  let status: FlowRecoveryImportStatus = {
    instanceId: randomUUID(),
    running: false,
    pending: 0,
    imported: 0,
    failed: 0,
    lastErrorCode: null,
  }
  const wake = () => {
    if (abort.signal.aborted || pending) return
    status = { ...status, running: true }
    pending = recoverFlowImports(options, abort.signal)
      .then((next) => {
        status = {
          instanceId: status.instanceId,
          running: false,
          ...next,
          imported: status.imported + next.imported,
        }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          status = {
            ...status,
            running: false,
            failed: status.failed + 1,
            lastErrorCode: safeCode(error),
          }
      })
      .finally(() => {
        pending = undefined
      })
  }
  const timer = setInterval(wake, IMPORT_INTERVAL_MS)
  timer.unref()
  wake()
  return {
    wake,
    status: () => ({ ...status }),
    async stop() {
      clearInterval(timer)
      abort.abort()
      await pending
    },
  }
}
