import type { PipelineContext } from './context.ts'

// El resultado de cada handler viaja en el `result` del job-completed; debe
// ser JSON serializable (los tipos concretos viven en pipeline/types/).
export type SubcommandHandler = (context: PipelineContext) => Promise<unknown>
