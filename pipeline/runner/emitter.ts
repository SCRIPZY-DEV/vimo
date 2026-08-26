import type { PipelineEventPayload } from './events.ts'

export interface PipelineEmitter {
  emit(event: PipelineEventPayload): void
}

// Única escritura a stdout de todo pipeline/ (guard de ADR-0010: nada
// loguea a consola; todo lo que sale del sidecar pasa por acá como NDJSON).
// Los logs warn/error se espejan además a stderr: Rust los vuelca al log de
// la app (`sidecar stderr: …`), así un fallo que la UI no muestra queda
// igual rastreable en la terminal de `tauri dev`.
export function createEmitter(jobId: string): PipelineEmitter {
  return {
    emit(event) {
      process.stdout.write(`${JSON.stringify({ ...event, jobId })}\n`)
      if (event.type === 'log' && event.level !== 'info')
        process.stderr.write(`[${event.level}] ${event.message}\n`)
    },
  }
}
