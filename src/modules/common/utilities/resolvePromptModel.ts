import type { LlmModelProfile } from '@pipeline/types/llm-models.ts'

// Qué modelo mostrar elegido. Un id guardado que ya no se ofrece (retirado u
// oculto) cae al de la casa en pantalla; el pipeline haría lo mismo con aviso.
// null cuando todavía no hay catálogo (web, o el sidecar no respondió).
export function resolvePromptModel(
  chosen: string | null,
  models: LlmModelProfile[],
  defaultId: string | null,
): string | null {
  if (!defaultId) return null
  if (chosen && models.some((model) => model.id === chosen)) return chosen
  return defaultId
}
