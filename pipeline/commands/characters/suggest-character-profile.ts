import { createDeepInfraProvider } from '../../providers/llm/deepinfra.ts'
import { generateText } from '../../providers/llm/generate.ts'
import {
  AGE_LIMIT,
  CHARACTER_DESIGNER_SYSTEM_PROMPT,
  IDENTITY_PROMPT_LIMIT,
  MIN_IDENTITY_PROMPT_LENGTH,
  NAME_LIMIT,
  ROLE_LIMIT,
  buildCharacterDesignerUserPrompt,
  buildCharacterNotes,
  deterministicFallbackPrompt,
  extractJsonObject,
  stripStyleWords,
} from '../../prompts/character-designer.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  SuggestCharacterProfilePayload,
  SuggestCharacterProfileResult,
} from '../../types/characters.ts'

function textField(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

// Resultado de respaldo: identidad determinística + eco de lo que puso el
// usuario. Nunca deja al usuario sin nada usable.
function fallbackResult(
  input: SuggestCharacterProfilePayload,
): SuggestCharacterProfileResult {
  const result: SuggestCharacterProfileResult = {
    prompt: deterministicFallbackPrompt(input),
  }
  if (input.name?.trim()) result.name = input.name.trim()
  if (input.age?.trim()) result.age = input.age.trim()
  if (input.role?.trim()) result.role = input.role.trim()

  return result
}

/**
 * Redacta la identidad del personaje (neutra de estilo) con el LLM. Va en tier
 * premium a propósito: es el ANCLA de identidad de todo el video, no un texto
 * accesorio. Tolerante como el origen: si el LLM falla, devuelve la identidad
 * determinística en vez de dejar la pantalla sin resultado.
 */
export async function suggestCharacterProfile(
  context: PipelineContext,
): Promise<SuggestCharacterProfileResult> {
  const payload =
    (context.job.payload as SuggestCharacterProfilePayload | undefined) ?? {}

  const notes = buildCharacterNotes(payload)
  const script = (payload.script ?? '').trim()
  // Sin campos y sin guion no hay nada que inferir: ni siquiera hace falta clave.
  if (!notes && !script) return fallbackResult(payload)

  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const provider = createDeepInfraProvider({
    apiKey,
    config: context.config.llm,
  })

  let content: string
  try {
    content = await generateText(
      provider,
      {
        systemPrompt: CHARACTER_DESIGNER_SYSTEM_PROMPT,
        userPrompt: buildCharacterDesignerUserPrompt(payload, notes),
        jsonOnly: true,
        tier: 'premium',
      },
      context.config.llm,
      context.signal,
    )
  } catch (error) {
    // Una cancelación pedida sale como tal; el resto degrada al fallback.
    if (context.signal.aborted) throw error
    return fallbackResult(payload)
  }

  const parsed = extractJsonObject(content)
  const prompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : ''
  if (prompt.length < MIN_IDENTITY_PROMPT_LENGTH) return fallbackResult(payload)

  // Prioridad al valor del LLM (lo que diseñó o infirió), con eco de lo que el
  // usuario ya había puesto como respaldo.
  const result: SuggestCharacterProfileResult = {
    prompt: stripStyleWords(prompt.slice(0, IDENTITY_PROMPT_LIMIT)),
  }
  const name = textField(parsed?.name, NAME_LIMIT) || payload.name?.trim()
  if (name) result.name = name
  const age = textField(parsed?.age, AGE_LIMIT) || payload.age?.trim()
  if (age) result.age = age
  const role = textField(parsed?.role, ROLE_LIMIT) || payload.role?.trim()
  if (role) result.role = role

  return result
}
