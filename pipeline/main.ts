import { createInterface, type Interface } from 'node:readline'

import { resolvePipelineConfig } from './config/pipeline-config.ts'
import type { PipelineContext } from './runner/context.ts'
import { createEmitter } from './runner/emitter.ts'
import { PipelineFailure, toPipelineFailure } from './runner/failure.ts'
import type { PipelineJob } from './runner/job.ts'
import type { JsonValue } from './types/json.ts'

// Entrada del sidecar (ADR-0010): `vimo-pipeline <subcomando>`. La primera
// línea de stdin es el PipelineJob en JSON; las siguientes son mensajes de
// control ({"type":"cancel"} → AbortController). Todo lo que sale por stdout
// es una línea NDJSON emitida por el emitter.

type SubcommandHandler = (context: PipelineContext) => Promise<JsonValue | null>

const SUBCOMMANDS: Record<string, SubcommandHandler> = {
  // Prueba de ida y vuelta del contrato: devuelve el payload recibido.
  // Los subcomandos reales llegan módulo a módulo (AI Music primero).
  async ping(context) {
    return context.job.payload ?? null
  },
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
      if (!job)
        reject(
          new PipelineFailure(
            'invalid_job',
            'stdin closed before a job arrived',
          ),
        )
    })
  })
}

async function main(): Promise<number> {
  const subcommandName = process.argv[2] ?? ''
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
    emitter.emit({ type: 'job-completed', result })
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
    })
    return 1
  } finally {
    // Sin esto stdin mantiene vivo el event loop y el proceso nunca termina.
    lines.close()
    process.stdin.destroy()
  }
}

process.exitCode = await main()
