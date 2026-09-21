import { createDeepInfraProvider } from '../../providers/llm/deepinfra.ts'
import { generateText } from '../../providers/llm/generate.ts'
import {
  SUGGEST_MUSIC_PROMPT_SYSTEM,
  SUGGESTED_PROMPT_LIMIT,
  buildSuggestMusicPromptUserPrompt,
} from '../../prompts/suggest-music-prompt.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  SuggestMusicPromptPayload,
  SuggestMusicPromptResult,
} from '../../types/music.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'

// Sugiere un prompt de música a partir del guion del video, vía LLM.
export async function suggestMusicPrompt(
  context: PipelineContext,
): Promise<SuggestMusicPromptResult> {
  const payload = context.job.payload as SuggestMusicPromptPayload | undefined
  const script = payload?.script?.trim()
  if (!script)
    throw new PipelineFailure('invalid_payload', 'payload.script is required')

  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const provider = createDeepInfraProvider({
    apiKey,
    config: context.config.llm,
  })
  const content = await generateText(
    provider,
    {
      systemPrompt: SUGGEST_MUSIC_PROMPT_SYSTEM,
      userPrompt: buildSuggestMusicPromptUserPrompt(script),
    },
    context.config.llm,
    {
      signal: context.signal,
      onFailure: createProviderFailureReporter(context.emitter),
    },
  )

  // Post-proceso del origen: sin comillas envolventes ni saltos de línea.
  const prompt = content
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, SUGGESTED_PROMPT_LIMIT)

  return { prompt }
}
