import { runPipelineJob } from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import type { ListPromptModelsResult } from '@pipeline/types/llm-models.ts'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type {
  AddLibraryVoicePayload,
  AddLibraryVoiceResult,
} from '@pipeline/types/voices.ts'

// Lo que hablan con el exterior varios módulos a la vez: el catálogo de
// modelos del carril verbatim, que usan tanto Crear (elección por video) como
// Ajustes (el predeterminado); el alta de una voz de la biblioteca pública,
// que se dispara tanto desde Voces como desde el selector de Crear; y el saldo
// de los proveedores de imagen, que muestran Crear, el editor, el modal de
// estilo propio y el modal de personaje.
export const commonApi = {
  isNative() {
    return isNative()
  },
  async listPromptModels(): Promise<ListPromptModelsResult> {
    return runPipelineJob<ListPromptModelsResult>('list-prompt-models')
  },
  async addLibraryVoice(payload: AddLibraryVoicePayload): Promise<string> {
    const result = await runPipelineJob<AddLibraryVoiceResult>(
      'add-library-voice',
      payload,
    )
    return result.voiceId
  },
  async getImageCredits(): Promise<ImageCreditsResult> {
    return runPipelineJob<ImageCreditsResult>('get-image-credits')
  },
}
