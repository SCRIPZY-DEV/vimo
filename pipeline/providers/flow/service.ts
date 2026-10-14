import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { lstat, open } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { isAbsolute, resolve } from 'node:path'
import { createInterface, type Interface } from 'node:readline'

import { createBridge, type FlowBridge } from './vendor/bridge/server.js'
import { readFlowGallery } from './gallery.ts'
import { startFlowRecoveryImporter } from './recovery-import.ts'
import {
  flowCommandExecutionPlan,
  flowExecutionPlansEqual,
  normalizeFlowExecutionPlan,
  supportsFlowToolsCoordinator,
} from './execution-plan.ts'

const MAX_COMMAND_BYTES = 20 * 1024 * 1024
const MAX_STARTUP_BYTES = 64 * 1024
const MAX_RESULT_BYTES = 25 * 1024 * 1024
const RESULT_ID =
  /^(?!__proto__$|constructor$|prototype$)[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/
const SHA256 = /^[a-f0-9]{64}$/
const STARTUP_TIMEOUT_MS = 10_000
const DEFAULT_BRIDGE_PORT = 43127
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/
const SAFE_ERROR_CODE = /^[a-zA-Z0-9_.-]{1,80}$/

interface FlowServiceStartup {
  dataDir: string
  trustedExtensionOrigins: string[]
  bridgePort: number
  projectsRoot?: string
  ffmpegPath?: string
}

interface FlowServiceReply {
  ok: boolean
  result?: unknown
  code?: string
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorCode(error: unknown) {
  if (!objectRecord(error)) return 'flow_service_failed'

  if (typeof error.code === 'string' && SAFE_ERROR_CODE.test(error.code))
    return error.code

  if (typeof error.message === 'string' && SAFE_ERROR_CODE.test(error.message))
    return error.message

  return 'flow_service_failed'
}

function parseStartup(line: string): FlowServiceStartup {
  if (Buffer.byteLength(line) > MAX_STARTUP_BYTES)
    throw new Error('flow_service_startup_invalid')

  const input: unknown = JSON.parse(line)
  if (
    !objectRecord(input) ||
    typeof input.dataDir !== 'string' ||
    !isAbsolute(input.dataDir) ||
    input.dataDir.includes('\0') ||
    input.dataDir.length > 4096
  )
    throw new Error('flow_service_startup_invalid')

  const trustedExtensionOrigins = input.trustedExtensionOrigins ?? []
  if (
    !Array.isArray(trustedExtensionOrigins) ||
    trustedExtensionOrigins.length > 10 ||
    !trustedExtensionOrigins.every(
      (origin): origin is string =>
        typeof origin === 'string' && EXTENSION_ORIGIN.test(origin),
    )
  )
    throw new Error('flow_service_origin_invalid')

  // Solo el proceso nativo aporta esta opción; permite aislar la aceptación
  // con proveedor simulado sin conectar los perfiles reales del usuario.
  const bridgePort = input.bridgePort ?? DEFAULT_BRIDGE_PORT
  if (
    typeof bridgePort !== 'number' ||
    !Number.isInteger(bridgePort) ||
    (bridgePort !== 0 && bridgePort < 1024) ||
    bridgePort > 65535
  )
    throw new Error('flow_service_port_invalid')

  const importPaths = [input.projectsRoot, input.ffmpegPath]
  if (
    importPaths.some((value) => value !== undefined) &&
    !importPaths.every(
      (value) =>
        typeof value === 'string' &&
        isAbsolute(value) &&
        !value.includes('\0') &&
        value.length <= 4096,
    )
  )
    throw new Error('flow_service_startup_invalid')

  return {
    dataDir: input.dataDir,
    trustedExtensionOrigins,
    bridgePort,
    ...(typeof input.projectsRoot === 'string' &&
    typeof input.ffmpegPath === 'string'
      ? { projectsRoot: input.projectsRoot, ffmpegPath: input.ffmpegPath }
      : {}),
  }
}

function readStartup(lines: Interface, shutdown: () => void) {
  return new Promise<FlowServiceStartup>((resolve, reject) => {
    let initialized = false
    const timeout = setTimeout(() => {
      reject(new Error('flow_service_startup_timeout'))
      shutdown()
    }, STARTUP_TIMEOUT_MS)

    lines.on('line', (line) => {
      if (!initialized) {
        initialized = true
        clearTimeout(timeout)
        try {
          resolve(parseStartup(line))
        } catch {
          reject(new Error('flow_service_startup_invalid'))
        }
        return
      }

      // Nunca interpretar comandos del coordinador recibidos por stdin:
      // después de arrancar, este canal solo mantiene y cierra el proceso.
      try {
        const control: unknown = JSON.parse(line)
        if (objectRecord(control) && control.type === 'shutdown') shutdown()
      } catch {
        // Una línea de control inválida no modifica la cola ni los vínculos.
      }
    })
    lines.on('close', () => {
      clearTimeout(timeout)
      if (!initialized) reject(new Error('flow_service_startup_missing'))
      shutdown()
    })
  })
}

function authorized(request: IncomingMessage, token: Buffer, port: number) {
  if (
    request.socket.remoteAddress !== '127.0.0.1' ||
    request.headers.host !== `127.0.0.1:${port}` ||
    request.headers.origin !== undefined
  )
    return false

  const supplied = Buffer.from(request.headers.authorization ?? '')
  return supplied.length === token.length && timingSafeEqual(supplied, token)
}

async function readCommand(request: IncomingMessage) {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_COMMAND_BYTES)
    throw new Error('command_too_large')

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_COMMAND_BYTES) throw new Error('command_too_large')

    chunks.push(bytes)
  }

  let command: unknown
  try {
    command = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('command_invalid')
  }
  if (!objectRecord(command) || typeof command.type !== 'string')
    throw new Error('command_invalid')

  return command
}

function assertResultExecutionPlan(left: unknown, right: unknown): void {
  try {
    if (flowExecutionPlansEqual(left, right)) return
  } catch {
    // Un plan ilegible no convierte un resultado en otro ejecutor.
  }
  throw new Error('flow_result_identity_mismatch')
}

async function assertCommandExecutionCapability(
  bridge: FlowBridge,
  command: Record<string, unknown>,
): Promise<void> {
  const executionPlan = flowCommandExecutionPlan(command)
  if (!executionPlan) return
  const status = await bridge.dispatch({ type: 'status' })
  if (
    !objectRecord(status) ||
    status.type !== 'bridge.status' ||
    !objectRecord(status.capabilities) ||
    !supportsFlowToolsCoordinator(status.capabilities.flowTools)
  )
    throw new Error('flow_tools_coordinator_upgrade_required')
}

async function matchingResultJob(
  bridge: FlowBridge,
  command: Record<string, unknown>,
) {
  const status = await bridge.dispatch({ type: 'status' })
  if (!objectRecord(status) || !Array.isArray(status.jobs))
    throw new Error('flow_result_not_ready')

  const job: unknown = status.jobs.find(
    (candidate: unknown) =>
      objectRecord(candidate) && candidate.imageJobId === command.imageJobId,
  )
  if (
    !objectRecord(job) ||
    job.batchId !== command.batchId ||
    job.requestHash !== command.requestHash
  )
    throw new Error('flow_result_identity_mismatch')

  assertResultExecutionPlan(command.executionPlan, job.executionPlan)
  if (job.state !== 'ready') throw new Error('flow_result_not_ready')

  return job
}

async function readResult(
  bridge: FlowBridge,
  command: Record<string, unknown>,
  dataDir: string,
  receipts: Map<string, Record<string, unknown>>,
) {
  if (
    typeof command.imageJobId !== 'string' ||
    !RESULT_ID.test(command.imageJobId) ||
    typeof command.batchId !== 'string' ||
    !RESULT_ID.test(command.batchId) ||
    typeof command.requestHash !== 'string' ||
    !SHA256.test(command.requestHash)
  )
    throw new Error('flow_result_identity_invalid')

  const executionPlan = normalizeFlowExecutionPlan(command.executionPlan)
  await matchingResultJob(bridge, command)
  receipts.delete(command.imageJobId)
  // download reutiliza el medio existente. Para un archivo listo, valida su
  // recibo durable y emite job.ready sin realizar una generación nueva.
  await bridge.dispatch({ type: 'download', imageJobId: command.imageJobId })
  const receipt = receipts.get(command.imageJobId)
  if (!receipt) throw new Error('flow_result_not_ready')
  assertResultExecutionPlan(command.executionPlan, receipt.executionPlan)

  if (
    receipt.batchId !== command.batchId ||
    receipt.requestHash !== command.requestHash ||
    typeof receipt.extension !== 'string' ||
    !['jpg', 'png', 'webp'].includes(receipt.extension) ||
    typeof receipt.imagePath !== 'string' ||
    typeof receipt.sha256 !== 'string' ||
    !SHA256.test(receipt.sha256) ||
    typeof receipt.byteLength !== 'number' ||
    !Number.isSafeInteger(receipt.byteLength) ||
    receipt.byteLength < 1 ||
    receipt.byteLength > MAX_RESULT_BYTES ||
    typeof receipt.mimeType !== 'string' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(receipt.mimeType)
  )
    throw new Error('flow_result_receipt_invalid')

  const expectedPath = resolve(
    dataDir,
    'results',
    `${command.imageJobId}.${receipt.extension}`,
  )
  if (resolve(receipt.imagePath) !== expectedPath)
    throw new Error('flow_result_path_invalid')

  const info = await lstat(expectedPath)
  if (!info.isFile() || info.size !== receipt.byteLength)
    throw new Error('flow_result_file_invalid')

  const handle = await open(expectedPath, 'r')
  let bytes: Buffer
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile() ||
      opened.dev !== info.dev ||
      opened.ino !== info.ino ||
      opened.size !== receipt.byteLength
    )
      throw new Error('flow_result_file_invalid')

    bytes = await handle.readFile()
  } finally {
    await handle.close()
  }
  if (
    bytes.length !== receipt.byteLength ||
    createHash('sha256').update(bytes).digest('hex') !== receipt.sha256
  )
    throw new Error('flow_result_hash_mismatch')

  await matchingResultJob(bridge, command)
  return {
    type: 'job.resultFile',
    ...(executionPlan ? { executionPlan } : {}),
    imageJobId: command.imageJobId,
    batchId: command.batchId,
    requestHash: command.requestHash,
    mimeType: receipt.mimeType,
    base64: bytes.toString('base64'),
    sha256: receipt.sha256,
  }
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('flow_service_listen_failed'))
        return
      }
      resolve(address.port)
    })
  })
}

async function closeHttp(server: Server) {
  if (!server.listening) return

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    // Los comandos ya admitidos siguen en la cola durable del puente. Cerrar
    // sockets evita que una petición incompleta mantenga huérfano el proceso.
    server.closeAllConnections()
  })
}

/** Proceso privado propiedad de Rust: nunca se conecta al Channel de un job. */
export async function runFlowService(): Promise<number> {
  const lines = createInterface({ input: process.stdin })
  let stopped = false
  let finish: () => void = () => {}
  const untilShutdown = new Promise<void>((resolve) => {
    finish = resolve
  })
  const shutdown = () => {
    stopped = true
    finish()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  let bridge: FlowBridge | undefined
  let server: Server | undefined
  let ready = false
  let exitCode = 0
  let importer: ReturnType<typeof startFlowRecoveryImporter> | undefined
  try {
    const startup = await readStartup(lines, shutdown)
    if (stopped) return 0

    const resultReceipts = new Map<string, Record<string, unknown>>()
    bridge = await createBridge({
      port: startup.bridgePort,
      dataDir: startup.dataDir,
      trustedExtensionOrigins: startup.trustedExtensionOrigins,
      allowExtensionLinkRequests: true,
      allowAutomaticLinks: true,
      // bridge.ready/bridge.pairing contienen secretos. No reenviar eventos
      // al stdout del pipeline ni a logs; la UI consulta comandos autorizados.
      onEvent(event) {
        if (event.type === 'job.ready' && typeof event.imageJobId === 'string')
          resultReceipts.set(event.imageJobId, event)
        if (event.type === 'job.ready') importer?.wake()
      },
    })
    if (stopped) return 0

    const coordinator = bridge
    if (startup.projectsRoot && startup.ffmpegPath) {
      importer = startFlowRecoveryImporter({
        dataDir: startup.dataDir,
        projectsRoot: startup.projectsRoot,
        ffmpegPath: startup.ffmpegPath,
        status: () => coordinator.dispatch({ type: 'status' }),
        readResult: (request) =>
          readResult(
            coordinator,
            {
              imageJobId: request.imageJobId,
              batchId: request.batchId,
              requestHash: request.requestHash,
              executionPlan: request.executionPlan,
            },
            startup.dataDir,
            resultReceipts,
          ),
      })
    }
    const token = randomBytes(32).toString('base64url')
    const authorization = Buffer.from(`Bearer ${token}`)
    let port = 0
    server = createServer(
      {
        maxHeaderSize: 8192,
        requestTimeout: 30_000,
        headersTimeout: 10_000,
        keepAliveTimeout: 5000,
      },
      (request, response) => {
        const reply = (status: number, body: FlowServiceReply) => {
          response.writeHead(status, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            connection: 'close',
          })
          response.end(JSON.stringify(body))
        }
        if (stopped) {
          reply(503, { ok: false, code: 'flow_service_closing' })
          return
        }
        if (!authorized(request, authorization, port)) {
          reply(403, { ok: false, code: 'flow_service_unauthorized' })
          return
        }
        if (request.method !== 'POST' || request.url !== '/command') {
          reply(404, { ok: false, code: 'flow_service_route_invalid' })
          return
        }
        if (
          request.headers['content-type']
            ?.split(';')[0]
            .trim()
            .toLowerCase() !== 'application/json'
        ) {
          reply(415, { ok: false, code: 'flow_service_content_type_invalid' })
          return
        }
        void readCommand(request)
          .then(async (command) => {
            if (stopped) throw new Error('flow_service_closing')
            await assertCommandExecutionCapability(coordinator, command)
            if (stopped) throw new Error('flow_service_closing')

            if (command.type === 'result.read')
              return readResult(
                coordinator,
                command,
                startup.dataDir,
                resultReceipts,
              )

            if (command.type === 'gallery.list') {
              return coordinator.dispatch({ type: 'status' }).then((status) => {
                if (!objectRecord(status) || !Array.isArray(status.batches))
                  throw new Error('flow_gallery_unavailable')
                const batchIds = status.batches.flatMap((batch: unknown) => {
                  if (!objectRecord(batch) || typeof batch.batchId !== 'string')
                    return []
                  return [batch.batchId]
                })
                return readFlowGallery(startup.dataDir, batchIds)
              })
            }

            const result = await coordinator.dispatch(command)
            if (command.type === 'status' && objectRecord(result) && importer)
              return { ...result, nativeImport: importer.status() }
            return result
          })
          .then((result) =>
            reply(200, { ok: true, result: result ?? { ok: true } }),
          )
          .catch((error: unknown) => {
            if (response.destroyed) return

            const code = errorCode(error)
            reply(code === 'command_too_large' ? 413 : 400, {
              ok: false,
              code,
            })
          })
      },
    )
    server.on('clientError', (_error, socket) => socket.destroy())
    server.on('error', shutdown)
    port = await listen(server)
    if (stopped) return 0

    // Única salida privada de arranque. Rust lee esta línea directamente;
    // no se emite como PipelineEvent ni se persiste en ningún archivo.
    process.stdout.write(
      `${JSON.stringify({ type: 'flow-service-ready', port, token, dataDir: startup.dataDir })}\n`,
    )
    ready = true
    await untilShutdown
  } catch (error) {
    exitCode = 1
    if (!ready)
      process.stdout.write(
        `${JSON.stringify({ type: 'flow-service-error', code: errorCode(error) })}\n`,
      )
  } finally {
    stopped = true
    lines.close()
    process.stdin.destroy()
    process.removeListener('SIGINT', shutdown)
    process.removeListener('SIGTERM', shutdown)
    try {
      if (server) await closeHttp(server)
      await importer?.stop()
      await bridge?.close()
    } catch {
      exitCode = 1
    }
  }
  return exitCode
}
