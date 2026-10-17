import { Channel, invoke } from '@tauri-apps/api/core'
import type {
  PipelineEvent,
  PipelineEventPayload,
} from '@pipeline/runner/events.ts'

/**
 * Único punto de acceso de `src/` a los jobs del sidecar (ADR-0010), el
 * gemelo del fetcher HTTP para el pipeline: spawnea `start_pipeline_job` vía
 * Tauri y recibe los eventos NDJSON del job por un Channel propio — cada job
 * habla solo con su consumidor, sin canal global ni filtrado por jobId.
 * La cadena es la misma: componente → hook → api/ del módulo → acá.
 */

/** Fallo de un job del sidecar: `code` es la clave estable para i18n. */
export class PipelineJobError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PipelineJobError'
    this.code = code
  }
}

/** Job vivo del pipeline: el id para cancelar y el stop del listener. */
export interface PipelineJobHandle {
  jobId: string
  stop: () => void
}

/** El rechazo de un invoke del pipeline también trae `{ code }` (ADR-0011). */
function isCommandError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  )
}

/**
 * Código estable del error, si lo trae (PipelineJobError o rechazo del
 * invoke). Cada módulo lo mapea a su clave i18n en su propio catálogo.
 */
export function pipelineErrorCode(error: unknown): string | null {
  if (!isCommandError(error)) return null
  return error.code
}

/**
 * Lanza un job del sidecar y entrega sus eventos. El Channel viaja dentro del
 * propio invoke y existe antes de que el sidecar arranque: los eventos
 * tempranos quedan encolados en el canal, no hace falta bufferizarlos acá.
 */
export async function startPipelineJob(
  subcommand: string,
  payload: unknown,
  onEvent: (event: PipelineEventPayload) => void,
): Promise<PipelineJobHandle> {
  const channel = new Channel<PipelineEvent>()
  channel.onmessage = onEvent

  const jobId = await invoke<string>('start_pipeline_job', {
    subcommand,
    payload,
    onEvent: channel,
  })

  return {
    jobId,
    stop() {
      channel.onmessage = () => {}
    },
  }
}

/**
 * Job con semántica request/response: resuelve con el result del job-completed.
 * `onEvent` recibe lo que el job emite mientras corre (su avance), para quien
 * quiere el resultado como promesa y además mostrar el progreso. La promesa
 * siempre se cierra: si el proceso del sidecar muere sin evento final, Rust
 * manda un job-failed (`sidecar_exited`, o `cancelled` si se pidió cancelar).
 */
export function runPipelineJob<TResult>(
  subcommand: string,
  payload?: unknown,
  onEvent?: (event: PipelineEventPayload) => void,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    let stop: (() => void) | null = null
    let finished = false
    const finish = (settle: () => void) => {
      finished = true
      settle()
      stop?.()
      stop = null
    }

    startPipelineJob(subcommand, payload, (event) => {
      if (finished) return
      if (event.type === 'job-completed') {
        finish(() => resolve(event.result as TResult))
        return
      }
      if (event.type === 'job-failed') {
        finish(() => reject(new PipelineJobError(event.code, event.message)))
        return
      }
      onEvent?.(event)
    }).then((job) => {
      // Un job muy rápido pudo completarse antes de que el invoke resuelva.
      if (finished) {
        job.stop()
        return
      }
      stop = job.stop
    }, reject)
  })
}
