import type { ApiKeys } from '../config/api-keys.ts'
import type { BinaryPaths } from '../config/binary-paths.ts'
import type { PipelineConfigOverrides } from '../config/pipeline-config.ts'
import type { JsonValue } from '../types/json.ts'

// Contrato de entrada (ADR-0010): Rust arma este JSON y lo escribe como
// primera línea de stdin del sidecar. Las líneas siguientes son mensajes de
// control (hoy solo cancelación).
export interface PipelineJob {
  jobId: string
  // Carpeta del proyecto (contrato ADR-0009); no aplica a todo subcomando.
  projectDir?: string
  config?: PipelineConfigOverrides
  apiKeys: ApiKeys
  binaryPaths: BinaryPaths
  // Datos específicos del subcomando; cada handler valida su forma.
  payload?: JsonValue
}

export interface CancelMessage {
  type: 'cancel'
}
