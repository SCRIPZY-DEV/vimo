// Error de dominio del pipeline: `code` es la clave estable que la UI traduce
// a i18n (mismo patrón { code } de los comandos Rust); `message` es
// diagnóstico para logs, nunca texto user-facing.

// Qué proveedor externo falló y con qué status HTTP, cuando se sabe: el log
// de diagnóstico (ADR-0038) los registra junto al código. `httpStatus` solo
// viaja cuando hubo una respuesta HTTP real (nunca un status inventado).
export interface PipelineFailureDetails {
  provider?: string
  httpStatus?: number
}

export class PipelineFailure extends Error {
  readonly code: string
  readonly provider?: string
  readonly httpStatus?: number

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
  }
}
