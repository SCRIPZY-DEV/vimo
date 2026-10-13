// Error de dominio del pipeline: `code` es la clave estable que la UI traduce
// a i18n (mismo patrón { code } de los comandos Rust); `message` es
// diagnóstico para logs, nunca texto user-facing.

// Qué proveedor externo falló y con qué status HTTP, cuando se sabe: el log
// de diagnóstico (ADR-0038) los registra junto al código. `httpStatus` solo
// viaja cuando hubo una respuesta HTTP real (nunca un status inventado).
// `taskId` es el id de la tarea asíncrona del proveedor (DubVoice): con él se
// le puede reclamar al proveedor por un fallo concreto.
export interface PipelineFailureDetails {
  provider?: string
  httpStatus?: number
  taskId?: string
}

export class PipelineFailure extends Error {
  readonly code: string
  readonly provider?: string
  readonly httpStatus?: number
  readonly taskId?: string

  constructor(
    code: string,
    message: string,
    details: PipelineFailureDetails = {},
  ) {
    super(message)
    this.name = 'PipelineFailure'
    this.code = code
    if (details.provider !== undefined) this.provider = details.provider
    if (details.httpStatus !== undefined) this.httpStatus = details.httpStatus
    if (details.taskId !== undefined) this.taskId = details.taskId
  }
}

export function toPipelineFailure(error: unknown): PipelineFailure {
  if (error instanceof PipelineFailure) return error
  if (error instanceof Error)
    return new PipelineFailure('unknown', error.message)

  return new PipelineFailure('unknown', String(error))
}

// Detalles de un fallo para que un wrapper que lanza OTRO fallo a partir de
// él (otro código, otro mensaje) conserve proveedor y status. Sin claves
// `undefined`: el objeto se puede esparcir en un evento tal cual.
export function failureDetails(
  failure: PipelineFailure,
): PipelineFailureDetails {
  return {
    ...(failure.provider !== undefined ? { provider: failure.provider } : {}),
    ...(failure.httpStatus !== undefined
      ? { httpStatus: failure.httpStatus }
      : {}),
    ...(failure.taskId !== undefined ? { taskId: failure.taskId } : {}),
  }
}
