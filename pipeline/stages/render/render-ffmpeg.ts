import { PipelineFailure } from '../../runner/failure.ts'
import { runFfmpeg } from '../../utils/ffmpeg.ts'
import {
  STALL_CHECK_MS,
  STALL_GRACE_MS,
  STALL_TIMEOUT_MS,
} from './constants.ts'

// Corrida de FFmpeg para el render: progreso parseado de `-progress pipe:1`
// (debounce 200ms / 2%) + watchdog de estancamiento (port de ejecutarFFmpeg).
// Construida sobre utils/ffmpeg.runFfmpeg — el ÚNICO punto de spawn.

export interface RenderFfmpegOptions {
  // Duración de referencia para convertir out_time en porcentaje.
  totalSeconds?: number
  onProgress?(fraction: number): void
  signal?: AbortSignal
}

export async function runRenderFfmpeg(
  ffmpegPath: string,
  args: string[],
  description: string,
  options: RenderFfmpegOptions = {},
): Promise<void> {
  const withProgress = options.onProgress
    ? ['-progress', 'pipe:1', '-nostats', ...args]
    : args

  // Watchdog: si FFmpeg no emite NINGUNA línea en STALL_TIMEOUT_MS se marca
  // sospecha; si tras la gracia sigue mudo, se aborta con render_stalled.
  // El abort viaja por un controller propio encadenado a la señal del job,
  // así runFfmpeg mata el proceso por el mismo camino que una cancelación.
  const stallController = new AbortController()
  const onJobAbort = () => stallController.abort()
  options.signal?.addEventListener('abort', onJobAbort, { once: true })

  let lastDataAt = Date.now()
  let suspicionSince = 0
  let stalled = false
  const watchdog = setInterval(() => {
    const now = Date.now()
    if (now - lastDataAt <= STALL_TIMEOUT_MS) {
      suspicionSince = 0
      return
    }
    if (suspicionSince === 0) {
      suspicionSince = now
      return
    }
    if (now - suspicionSince >= STALL_GRACE_MS) {
      stalled = true
      stallController.abort()
    }
  }, STALL_CHECK_MS)
  watchdog.unref?.()

  let lastEmitAt = 0
  let lastFraction = 0
  const handleProgressLine = (line: string) => {
    lastDataAt = Date.now()
    suspicionSince = 0
    if (
      !options.onProgress ||
      !options.totalSeconds ||
      options.totalSeconds <= 0
    )
      return

    // `out_time_us=N` (microsegundos) o `out_time_ms=N` (también µs en
    // builds nuevos, pese al nombre).
    const match =
      line.match(/^out_time_us=(\d+)/) || line.match(/^out_time_ms=(\d+)/)
    if (!match) return

    const seconds = parseInt(match[1], 10) / 1_000_000
    const fraction = Math.max(0, Math.min(1, seconds / options.totalSeconds))
    const now = Date.now()
    if (now - lastEmitAt > 200 || fraction - lastFraction >= 0.02) {
      lastEmitAt = now
      lastFraction = fraction
      options.onProgress(fraction)
    }
  }

  try {
    await runFfmpeg(ffmpegPath, withProgress, {
      signal: stallController.signal,
      onStdoutLine: handleProgressLine,
      onStderrLine: () => {
        lastDataAt = Date.now()
        suspicionSince = 0
      },
    })
    options.onProgress?.(1)
  } catch (error) {
    if (stalled)
      throw new PipelineFailure(
        'render_stalled',
        `FFmpeg (${description}) produced no output for ${Math.round(STALL_TIMEOUT_MS / 60000)} minutes and was killed`,
      )
    throw error
  } finally {
    clearInterval(watchdog)
    options.signal?.removeEventListener('abort', onJobAbort)
  }
}
