import {
  DEFAULT_LLM_MODEL_ID,
  offeredModels,
} from '../../providers/llm/model-catalog.ts'
import { VERBATIM_BATCH_SIZE } from '../../stages/scene-prompts/verbatim/verbatim-writer.ts'
import type { ListPromptModelsResult } from '../../types/llm-models.ts'

// El catálogo que ve el selector de Create (port de GET /api/estilos/modelos
// del origen). Sin filtro por clave a propósito: todos los perfiles son
// DeepInfra y Create ya exige esa clave antes de generar — filtrarla acá
// solo escondería la lista sin decir por qué. No gasta nada.
export async function listPromptModels(): Promise<ListPromptModelsResult> {
  return {
    models: offeredModels(),
    defaultId: DEFAULT_LLM_MODEL_ID,
    batchSize: VERBATIM_BATCH_SIZE,
  }
}
