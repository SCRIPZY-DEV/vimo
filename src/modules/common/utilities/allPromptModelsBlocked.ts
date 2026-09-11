import type { LlmModelProfile } from '@pipeline/types/llm-models.ts'

// ¿No queda ningún modelo con el que escribir? Con catálogo vacío no (todavía
// no se sabe): solo cuenta cuando hay modelos y todos están bloqueados.
export function allPromptModelsBlocked(
  models: LlmModelProfile[],
  blockedIds: ReadonlySet<string>,
): boolean {
  return models.length > 0 && models.every((model) => blockedIds.has(model.id))
}
