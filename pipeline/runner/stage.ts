import type { PipelineContext } from './context.ts'
import type { StageId } from './stage-id.ts'

// Contrato de las fases (ADR-0010). El runner genérico que las recorre llega
// con el módulo Create (paso 6 del orden de migración); el contrato se fija
// desde la fundación porque los eventos ya lo referencian.
export interface Stage {
  id: StageId
  // Devuelve true si la fase no aplica para este job.
  skip?(context: PipelineContext): boolean | Promise<boolean>
  run(context: PipelineContext): Promise<void>
}
