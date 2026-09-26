import type { LlmConfig } from '../config/pipeline-config.ts'

// Niveles de calidad/costo de LLM: cada tarea pide un tier y la config
// resuelve a qué modelo corresponde (port de los tiers del origen).
export type LlmTier = 'economy' | 'balanced' | 'premium'

export interface LlmRequest {
  systemPrompt: string
  userPrompt: string
  // Fuerza response_format json_object en el proveedor.
  jsonOnly?: boolean
  tier?: LlmTier
  maxOutputTokens?: number
  /** Sobrescritura por tarea; ausente conserva el muestreo histórico. */
  temperature?: number
}

// Contrato strategy de proveedores de texto. Los reintentos y la degradación
// de tier viven en generateText, no en cada proveedor.
export interface LlmProvider {
  name: string
  generate(request: LlmRequest, signal?: AbortSignal): Promise<string>
}

export interface LlmProviderOptions {
  apiKey: string
  config: LlmConfig
}

// Respuesta mínima de un endpoint chat-completions compatible con OpenAI.
export interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
}

export interface ChatCompletionChoice {
  message?: { content?: string | null }
}
