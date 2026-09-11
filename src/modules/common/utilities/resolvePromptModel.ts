import type { LlmModelProfile } from '@pipeline/types/llm-models.ts'

const NO_BLOCKS: ReadonlySet<string> = new Set()

// Qué modelo mostrar elegido. Un id guardado que ya no se ofrece (retirado u
// oculto) cae al de la casa en pantalla; el pipeline haría lo mismo con aviso.
// Un id BLOQUEADO (ADR-0028) cae al primero del catálogo que no lo esté.
// null cuando todavía no hay catálogo (web, o el sidecar no respondió) o
// cuando todos los modelos están bloqueados.
export function resolvePromptModel(
  chosen: string | null,
  models: LlmModelProfile[],
  defaultId: string | null,
  blockedIds: ReadonlySet<string> = NO_BLOCKS,
): string | null {
  if (!defaultId) return null
  if (
    chosen &&
    !blockedIds.has(chosen) &&
    models.some((model) => model.id === chosen)
  )
    return chosen
  if (!blockedIds.has(defaultId)) return defaultId
  return models.find((model) => !blockedIds.has(model.id))?.id ?? null
}
