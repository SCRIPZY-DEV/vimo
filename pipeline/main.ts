import { createInterface, type Interface } from 'node:readline'

import { avatarsSubcommands } from './commands/avatars/subcommands.ts'
import { catalogSubcommands } from './commands/catalog/subcommands.ts'
import { charactersSubcommands } from './commands/characters/subcommands.ts'
import { demoSubcommands } from './commands/demo/subcommands.ts'
import { musicSubcommands } from './commands/music/subcommands.ts'
import { stylesSubcommands } from './commands/styles/subcommands.ts'
import { videosSubcommands } from './commands/videos/subcommands.ts'
import { voicesSubcommands } from './commands/voices/subcommands.ts'
import { resolvePipelineConfig } from './config/pipeline-config.ts'
import { runFlowService } from './providers/flow/service.ts'
import { createEmitter } from './runner/emitter.ts'
import {
  PipelineFailure,
  failureDetails,
  toPipelineFailure,
} from './runner/failure.ts'
import type { PipelineJob } from './runner/job.ts'
import type { SubcommandHandler } from './runner/subcommand.ts'
import type { JsonValue } from './types/json.ts'

// Entrada del sidecar (ADR-0010): `vimo-pipeline <subcomando>`. La primera
// línea de stdin es el PipelineJob en JSON; las siguientes son mensajes de
// control ({"type":"cancel"} → AbortController). Todo lo que sale por stdout
// es una línea NDJSON emitida por el emitter.

// Un dominio = una carpeta en commands/ que exporta su mapa de subcomandos.
const SUBCOMMANDS: Record<string, SubcommandHandler> = {
  // Prueba de ida y vuelta del contrato: devuelve el payload recibido.
  async ping(context) {
    return context.job.payload ?? null
  },
  ...musicSubcommands,
  ...voicesSubcommands,
  ...charactersSubcommands,
  ...avatarsSubcommands,
  ...stylesSubcommands,
  ...catalogSubcommands,
  ...videosSubcommands,
  ...demoSubcommands,
}

function handleControlLine(line: string, abortController: AbortController) {
  try {
    const control = JSON.parse(line) as { type?: string }
    if (control.type === 'cancel') abortController.abort()
  } catch {
    // Línea de control malformada: se ignora; el job sigue corriendo.
  }
}

function readJob(
  lines: Interface,
  abortController: AbortController,
): Promise<PipelineJob> {
  return new Promise((resolve, reject) => {
    let job: PipelineJob | null = null

    lines.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      if (job) {
        handleControlLine(trimmed, abortController)
        return
      }

      try {
        job = JSON.parse(trimmed) as PipelineJob
      } catch {
        reject(
          new PipelineFailure(
            'invalid_job',
            'first stdin line is not valid JSON',
          ),
        )
        return
      }
      resolve(job)
    })

    lines.on('close', () => {
      // stdin cerrado con el job en marcha: la app se cerró o se cayó. Sin
      // nadie que lea los eventos, el job se cancela en vez de seguir como
      // proceso huérfano (Rust no mata al sidecar al salir). Es la misma
      // cancelación cooperativa: un encargo de voz ya enviado espera su recibo.
      if (job) {
        abortController.abort()
        return
      }
      reject(
        new PipelineFailure('invalid_job', 'stdin closed before a job arrived'),
      )
    })
  })
}

async function main(): Promise<number> {
  const subcommandName = process.argv[2] ?? ''
  if (subcommandName === 'flow-service') return runFlowService()

  const abortController = new AbortController()
  const lines = createInterface({ input: process.stdin })

  let job: PipelineJob
  try {
    job = await readJob(lines, abortController)
  } catch (error) {
    const failure = toPipelineFailure(error)
    createEmitter('').emit({
      type: 'job-failed',
      code: failure.code,
      message: failure.message,
    })
    lines.close()
    return 1
  }

  const emitter = createEmitter(job.jobId)
  const handler = SUBCOMMANDS[subcommandName]
  if (!handler) {
    emitter.emit({
      type: 'job-failed',
      code: 'unknown_subcommand',
      message: `unknown subcommand "${subcommandName}"`,
    })
    lines.close()
    process.stdin.destroy()
    return 1
  }

  emitter.emit({ type: 'job-started' })

  try {
    const config = resolvePipelineConfig(job.config)
    const result = await handler({
      job,
      config,
      emitter,
      signal: abortController.signal,
    })
    emitter.emit({
      type: 'job-completed',
      result: (result ?? null) as JsonValue,
    })
    return 0
  } catch (error) {
    if (abortController.signal.aborted) {
      emitter.emit({
        type: 'job-failed',
        code: 'cancelled',
        message: 'job cancelled',
      })
      return 1
    }

    const failure = toPipelineFailure(error)
    emitter.emit({
      type: 'job-failed',
      code: failure.code,
      message: failure.message,
      ...failureDetails(failure),
    })
    return 1
  } finally {
    // Sin esto stdin mantiene vivo el event loop y el proceso nunca termina.
    lines.close()
    process.stdin.destroy()
  }
}

// Resuelve cuando todo lo escrito antes en el stream ya salió por el pipe.
function flushStream(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write('', () => resolve())
  })
}

// Sin top-level await: el bundle del sidecar (Node SEA) es CommonJS.
// Salida forzada: el job ya emitió su evento terminal, así que lo que siga
// vivo es trabajo huérfano (las escenas en cola de un Promise.all que ya
// rechazó, un fetch sin señal, un timer). Antes el proceso esperaba a que
// eso drenara; Rust no recibía Terminated y el proyecto quedaba «con una
// generación en curso» hasta reiniciar la app.
void main().then(async (code) => {
  await Promise.all([flushStream(process.stdout), flushStream(process.stderr)])
  process.exit(code)
})
