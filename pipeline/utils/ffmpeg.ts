import { spawn } from 'node:child_process'

import { PipelineFailure } from '../runner/failure.ts'

// Único punto de spawn de FFmpeg en todo pipeline/ (guard por grep de
// ADR-0013): la ruta viene SIEMPRE de binaryPaths — una app lanzada desde
// Finder no hereda el PATH, así que nunca se asume `ffmpeg` global.

export interface RunFfmpegOptions {
  signal?: AbortSignal
  // Línea a línea del stderr (o del stdout con -progress pipe:1): el parseo
  // de progreso del render vive en el caller, no acá.
  onStderrLine?(line: string): void
  onStdoutLine?(line: string): void
}

export function requireFfmpegPath(ffmpegPath: string | undefined): string {
  if (!ffmpegPath)
    throw new PipelineFailure(
      'ffmpeg_missing',
      'the job did not include binaryPaths.ffmpeg',
    )
  return ffmpegPath
}

// Corre ffmpeg y resuelve solo con exit 0; cualquier otro código lanza con la
// cola del stderr como diagnóstico. La cancelación mata el proceso.
export async function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  options: RunFfmpegOptions = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    options.signal?.throwIfAborted()

    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {
        // Ya terminó: no hay nada que matar.
      }
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    let stderrTail = ''
    forwardLines(child.stderr, (line) => {
      // Cola acotada para el diagnóstico de un fallo (stderr de ffmpeg es
      // enorme en corridas largas).
      stderrTail = `${stderrTail}\n${line}`.slice(-2000)
      options.onStderrLine?.(line)
    })
    forwardLines(child.stdout, (line) => options.onStdoutLine?.(line))

    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(
        new PipelineFailure(
          'ffmpeg_failed',
          `could not run ffmpeg: ${error.message}`,
        ),
      )
    })

    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort)
      if (options.signal?.aborted) {
        reject(
          new PipelineFailure('cancelled', 'ffmpeg killed by cancellation'),
        )
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new PipelineFailure(
          'ffmpeg_failed',
          `ffmpeg exited with code ${code}: ${stderrTail.trim()}`,
        ),
      )
    })
  })
}

function forwardLines(
  stream: NodeJS.ReadableStream | null,
  onLine: (line: string) => void,
): void {
  if (!stream) return

  let pending = ''
  stream.on('data', (chunk: Buffer) => {
    pending += chunk.toString()
    // ffmpeg separa el progreso con \n y sobreescribe stats con \r.
    const lines = pending.split(/\r\n|\r|\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) onLine(line)
    }
  })
  stream.on('end', () => {
    if (pending.trim()) onLine(pending)
  })
}
