import type { PipelineConfig } from '../config/pipeline-config.ts'
import type { PipelineEmitter } from './emitter.ts'
import type { PipelineJob } from './job.ts'

// Estado que recibe todo subcomando o stage: el job, la config ya resuelta
// contra los defaults, el emitter de eventos y la señal de cancelación.
export interface PipelineContext {
  job: PipelineJob
  config: PipelineConfig
  emitter: PipelineEmitter
  signal: AbortSignal
}
