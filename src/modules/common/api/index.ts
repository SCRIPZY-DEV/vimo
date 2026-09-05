import { runPipelineJob } from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import type { ListPromptModelsResult } from '@pipeline/types/llm-models.ts'

/**
 * Lo que hablan con el exterior varios módulos a la vez. Hoy: el catálogo de
 * modelos del carril verbatim, que usan tanto Crear (elección por video) como
 * Ajustes (el predeterminado).
 */
export const commonApi = {
  isNative() {
    return isNative()
  },
  async listPromptModels(): Promise<ListPromptModelsResult> {
    return runPipelineJob<ListPromptModelsResult>('list-prompt-models')
  },
}
