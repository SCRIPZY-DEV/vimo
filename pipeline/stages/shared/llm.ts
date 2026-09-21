import { createDeepInfraProvider } from '../../providers/llm/deepinfra.ts'
import { generateText } from '../../providers/llm/generate.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { LlmRequest } from '../../types/llm.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'

// Acceso al LLM para las stages de Create: un provider por job, ligado a la
// config y la señal del contexto (la cadena reintentos/degradación de tier
// vive en generateText).
export interface SceneLlmRequest extends LlmRequest {
  // Catálogo valida el contrato de cada tarea antes de aceptar un modelo.
  validate?(content: string): boolean
  onProgress?(content: string): void
}

export interface SceneLlm {
  generate(request: SceneLlmRequest): Promise<string>
}

export function createSceneLlm(context: PipelineContext): SceneLlm {
  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const provider = createDeepInfraProvider({
    apiKey,
    config: context.config.llm,
  })

  // Sin stageId: hoy lo consume un comando (preview de personaje), no una
  // stage del pipeline.
  const onFailure = createProviderFailureReporter(context.emitter)

  return {
    generate(request) {
      return generateText(provider, request, context.config.llm, {
        signal: context.signal,
        onFailure,
      })
    },
  }
}
