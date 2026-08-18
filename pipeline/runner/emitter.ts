import type { PipelineEventPayload } from './events.ts'

export interface PipelineEmitter {
  emit(event: PipelineEventPayload): void
}

// Única escritura a stdout de todo pipeline/ (guard de ADR-0010: nada
// loguea a consola; todo lo que sale del sidecar pasa por acá como NDJSON).
export function createEmitter(jobId: string): PipelineEmitter {
  return {
    emit(event) {
      process.stdout.write(`${JSON.stringify({ ...event, jobId })}\n`)
    },
  }
}
