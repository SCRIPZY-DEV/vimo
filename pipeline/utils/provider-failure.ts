import type { PipelineEmitter } from '../runner/emitter.ts'
import type { ProviderFailureEvent } from '../runner/events.ts'
import type { PipelineFailure } from '../runner/failure.ts'
import type { StageId } from '../runner/stage-id.ts'

// Reporte de fallos de proveedor recuperados (reintentos, fallbacks) hacia el
// evento `provider-failure` (ADR-0038). Los providers no tienen emitter: cada
// uno recibe un callback opcional de este tipo y la stage o el comando lo
// construye con `createProviderFailureReporter`.

// Tope del motivo técnico que viaja en el evento.
export const PROVIDER_FAILURE_DETAIL_LIMIT = 300
// Un fallo sin proveedor conocido (p. ej. un wrapper que no lo copió).
const UNKNOWN_PROVIDER = 'unknown'

export type ProviderFailureReport = Omit<ProviderFailureEvent, 'type'>

export type ProviderFailureReporter = (report: ProviderFailureReport) => void

export function createProviderFailureReporter(
  emitter: PipelineEmitter,
  stageId?: StageId,
): ProviderFailureReporter {
  return (report) => {
    emitter.emit({
      type: 'provider-failure',
      ...(stageId ? { stageId } : {}),
      ...report,
      ...(report.detail
        ? { detail: report.detail.slice(0, PROVIDER_FAILURE_DETAIL_LIMIT) }
        : {}),
    })
  }
}

// Reporte a partir de un PipelineFailure ya clasificado: proveedor, código y
// status salen del fallo; `extra` completa (o pisa) intento, escena, etc.
export function reportFromFailure(
  failure: PipelineFailure,
  extra: Partial<ProviderFailureReport> & { recovered: boolean },
): ProviderFailureReport {
  return {
    provider: failure.provider ?? UNKNOWN_PROVIDER,
    code: failure.code,
    ...(failure.httpStatus !== undefined
      ? { httpStatus: failure.httpStatus }
      : {}),
    detail: failure.message,
    ...extra,
  }
}
