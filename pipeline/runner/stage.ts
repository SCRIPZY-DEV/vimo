import type { PipelineContext } from './context.ts'

// Fases del pipeline completo (ADR-0010). El runner genérico que las recorre
// llega con el módulo Create (paso 6 del orden de migración); el contrato se
// fija desde la fundación porque los eventos ya lo referencian.
export const STAGE_IDS = [
  'voice',
  'transcription',
  'scene-cuts',
  'scene-prompts',
  'images',
  'render',
] as const

export type StageId = (typeof STAGE_IDS)[number]

export interface Stage {
  id: StageId
  // Devuelve true si la fase no aplica para este job.
  skip?(context: PipelineContext): boolean | Promise<boolean>
  run(context: PipelineContext): Promise<void>
}
