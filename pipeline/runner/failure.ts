// Error de dominio del pipeline: `code` es la clave estable que la UI traduce
// a i18n (mismo patrón { code } de los comandos Rust); `message` es
// diagnóstico para logs, nunca texto user-facing.
export class PipelineFailure extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PipelineFailure'
    this.code = code
  }
}

export function toPipelineFailure(error: unknown): PipelineFailure {
  if (error instanceof PipelineFailure) return error
  if (error instanceof Error)
    return new PipelineFailure('unknown', error.message)

  return new PipelineFailure('unknown', String(error))
}
