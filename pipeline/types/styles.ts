import type { ImageProviderId } from './image-provider.ts'

// Dominio de los estilos visuales propios («Mi estilo»). Browser-safe: la UI
// consume estos contratos solo con `import type`.

export interface StyleSample {
  file: string
  // Ruta absoluta derivada al listar (jamás persistida): la galería puede
  // moverse de carpeta sin romper nada.
  path: string
  // Cache-buster para la UI (la muestra regenerada conserva el nombre).
  mtimeMs: number
}

export interface CustomStyleSummary {
  id: string
  name: string
  // El estilo ES este system prompt: se manda al LLM que escribe los prompts.
  systemPrompt: string
  // Planos permitidos (vacío = sin restricción declarada).
  shots: string[]
  createdAt: string
  samples: StyleSample[]
}

export interface StylesListResult {
  entries: CustomStyleSummary[]
}

export interface StyleSavePayload {
  id: string
  name: string
  systemPrompt: string
  shots?: string[]
}

export interface StyleSaveResult {
  entry: CustomStyleSummary
}

export interface StyleDeletePayload {
  id: string
}

export interface GenerateStyleSamplesPayload {
  styleId: string
  imageProvider: ImageProviderId
}

export interface GenerateStyleSamplesResult {
  samples: StyleSample[]
}
